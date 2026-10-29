import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
import { cookies } from "next/headers";
import { database } from "./db";
import { localHttpOrigin } from "./origin";
const cookieName = "cinemesh_session";
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(password, salt, 64) as Buffer).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, encoded] = stored.split(":");
  if (!salt || !encoded || !/^[a-f0-9]{128}$/.test(encoded)) return false;
  return timingSafeEqual(await derive(password, salt, 64) as Buffer, Buffer.from(encoded, "hex"));
}
function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await database().query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [tokenHash(token), userId]);
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production" && !localHttpOrigin(), sameSite: "strict", path: "/", maxAge: 604800 });
}
export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await database().query("SELECT u.id,u.email,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()", [tokenHash(token)]);
  return result.rows[0] ?? null;
}
export async function deleteSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await database().query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
  jar.delete(cookieName);
}
