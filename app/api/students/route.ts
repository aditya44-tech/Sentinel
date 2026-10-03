import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  return NextResponse.json(await store.listStudents());
});

export const POST = handle(async (req) => {
  const body = await req.json();
  return NextResponse.json({ ok: true, count: await store.upsertStudents(body) });
});

export const DELETE = handle(async () => {
  await store.resetAll();
  return NextResponse.json({ ok: true });
});
