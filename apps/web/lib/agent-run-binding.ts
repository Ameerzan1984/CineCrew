type RunBinding = { film_id: string; created_by: string; model: string; provider: string };

export function matchesAgentRunBinding(row: RunBinding | undefined, filmId: string, userId: string, model: string, provider: string) {
  return !!row && row.film_id.toLowerCase() === filmId.toLowerCase() && row.created_by === userId && row.model === model && row.provider === provider;
}
