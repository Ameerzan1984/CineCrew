export function isCineMeshAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = new Set((process.env.CINEMESH_ADMIN_EMAILS ?? "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean));
  return allowed.has(email.trim().toLowerCase());
}
