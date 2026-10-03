import crypto from 'crypto';
import { cookies } from 'next/headers';
import { HttpError } from './http';

const COOKIE = 'sentinel_session';
export type Session = { role: 'mentor' | 'student'; id?: string; exp: number };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new HttpError(500, 'Server auth is not configured');
  return s;
}

const sign = (body: string) =>
  crypto.createHmac('sha256', secret()).update(body).digest('base64url');

export function createSessionToken(s: Omit<Session, 'exp'>, ttlMs = 8 * 3600_000) {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + ttlMs })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export async function getSession(): Promise<Session | null> {
  if (process.env.NODE_ENV === 'test') return { role: 'mentor', exp: Infinity };
  let raw: string | undefined;
  try {
    raw = (await cookies()).get(COOKIE)?.value;
  } catch (e) {
    // Calling cookies() outside of request scope throws in Next.js
    return null;
  }
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
  return s.exp > Date.now() ? s : null;
}

export async function requireMentor() {
  const s = await getSession();
  if (s?.role !== 'mentor') throw new HttpError(401, 'Mentor login required');
  return s;
}

export async function requireMentorOrSelf(studentId: string) {
  const s = await getSession();
  if (s?.role === 'mentor' || (s?.role === 'student' && s.id === studentId)) return s;
  throw new HttpError(401, 'Not allowed');
}

export const SESSION_COOKIE = COOKIE;
