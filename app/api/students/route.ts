import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import * as store from '@/lib/store';
import { requireMentor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireMentor();
  return NextResponse.json(await store.listStudents());
});

export const POST = handle(async (req) => {
  await requireMentor();
  const body = await req.json();
  return NextResponse.json({ ok: true, count: await store.upsertStudents(body) });
});

export const DELETE = handle(async () => {
  await requireMentor();
  await store.resetAll();
  return NextResponse.json({ ok: true });
});
