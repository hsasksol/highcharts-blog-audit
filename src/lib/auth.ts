import { SignJWT, jwtVerify } from "jose";

export const COOKIE = "hc_session";
export const SESSION_HOURS = 8;

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set (32+ random bytes)");
  return new TextEncoder().encode(s);
}

export async function signSession(username: string): Promise<string> {
  return new SignJWT({ u: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

/** Returns the username when the token is valid, otherwise null. Safe to call in the Edge proxy. */
export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.u === "string" ? payload.u : null;
  } catch {
    return null;
  }
}

/** Constant-time string compare via SHA-256 digests (works in Node and Edge). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function cookieHeader(token: string, maxAge: number): string {
  const prod = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${prod ? "; Secure" : ""}`;
}
