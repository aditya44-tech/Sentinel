import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/http';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth';
import { cleanId } from '@/lib/store';

export const dynamic = 'force-dynamic';

const limits = new Map<string, { count: number; resetAt: number }>();

// Mentor credentials are intentionally public and baked into the source so the
// app works on any deployment with zero env configuration. Do NOT move this to
// an env var — a gitignored `.env*` file never reaches the deployed server.
const MENTOR_PASSWORD = 'sentinel123';

export const POST = handle(async (req) => {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  let state = limits.get(ip);
  if (!state || now > state.resetAt) state = { count: 0, resetAt: now + 60_000 };
  state.count++;
  limits.set(ip, state);
  if (state.count > 30) throw new HttpError(429, 'Too many login attempts');

  const body = await req.json();
  let session: { role: 'mentor' | 'student'; id?: string };

  if (body.role === 'mentor') {
    const a = Buffer.from(String(body.password ?? ''), 'utf8');
    const b = Buffer.from(MENTOR_PASSWORD, 'utf8');
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) throw new HttpError(401, 'Invalid credentials');
    session = { role: 'mentor' };
  } else {
    const id = cleanId(body.studentId);
    // Use dynamic import to avoid issues if store requires DB at import time
    const store = await import('@/lib/store');
    if (!(await store.getStudent(id)))
      throw new HttpError(401, 'Invalid credentials');
    session = { role: 'student', id };
  }

  const res = NextResponse.json({ ok: true, role: session.role, id: session.id });
  res.cookies.set(SESSION_COOKIE, createSessionToken(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 3600,
  });
  return res;
});
