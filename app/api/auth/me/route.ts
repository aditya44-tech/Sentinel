import { NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/http';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const session = await getSession();
  if (!session) throw new HttpError(401, 'Not authenticated');
  return NextResponse.json({ role: session.role, id: session.id });
});
