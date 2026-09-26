import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Short, URL-friendly, unambiguous invite code. */
export function inviteCode() {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  const buf = randomBytes(10);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export async function hashPin(pin: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string) {
  const [algo, saltHex, keyHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}
