import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/http';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth';
import { cleanId } from '@/lib/store';

export const dynamic = 'force-dynamic';

const limits = new Map<string, { count: number; resetAt: number }>();

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
    const expected = process.env.MENTOR_PASSWORD ?? '';
    const given = String(body.password ?? '');
    const ok =
      expected.length > 0 &&
      given.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
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
