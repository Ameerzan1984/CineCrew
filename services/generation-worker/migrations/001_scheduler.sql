-- CineMesh generation scheduling. Apply once to a dedicated PostgreSQL database.
CREATE TABLE generation_resources (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  provider text NOT NULL,
  capabilities text[] NOT NULL CHECK (cardinality(capabilities) > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  max_concurrency integer NOT NULL CHECK (max_concurrency > 0),
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (id, owner_id)
);
CREATE TABLE generation_grants (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  budget_micros bigint NOT NULL CHECK (budget_micros > 0),
  spent_micros bigint NOT NULL DEFAULT 0 CHECK (spent_micros >= 0),
  reserved_micros bigint NOT NULL DEFAULT 0 CHECK (reserved_micros >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (resource_id, owner_id) REFERENCES generation_resources(id, owner_id),
  UNIQUE (project_id, resource_id)
);
CREATE TABLE generation_jobs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  shot_id text NOT NULL,
  request_key text NOT NULL,
  capability text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  estimated_micros bigint NOT NULL CHECK (estimated_micros > 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','uncertain','completed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  grant_id uuid REFERENCES generation_grants(id),
  provider_request_key uuid NOT NULL UNIQUE,
  result_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, request_key)
);
CREATE INDEX generation_jobs_claim ON generation_jobs(project_id, status, available_at, created_at);
CREATE TABLE generation_ledger (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL UNIQUE REFERENCES generation_jobs(id),
  grant_id uuid NOT NULL REFERENCES generation_grants(id),
  actual_micros bigint NOT NULL CHECK (actual_micros >= 0),
  currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
