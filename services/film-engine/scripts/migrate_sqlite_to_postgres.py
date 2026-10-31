# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Copy a stopped SQLite engine database to an empty PostgreSQL engine schema."""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import storage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite-path", required=True, help="Path to the existing Film Engine SQLite database")
    args = parser.parse_args()
    if not os.environ.get("CINEMESH_ENGINE_DATABASE_URL"):
        parser.error("Set CINEMESH_ENGINE_DATABASE_URL to the PostgreSQL target; credentials must remain in the environment")

    storage.init_db()
    counts = storage.migrate_sqlite_to_postgres(args.sqlite_path)
    print("SQLite engine data imported into the configured PostgreSQL schema:")
    for table, count in counts.items():
        print(f"  {table}: {count} rows")


if __name__ == "__main__":
    main()
