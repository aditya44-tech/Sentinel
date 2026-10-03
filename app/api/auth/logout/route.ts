import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const POST = handle(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
});
