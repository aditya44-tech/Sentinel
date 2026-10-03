import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const isMongo = store.usingMongo();
  try {
    const students = await store.listStudents();
    return NextResponse.json({
      mode: isMongo ? 'mongo' : 'memory',
      connected: true,
      students: students.length,
    });
  } catch (e: any) {
    if (e.status === 503) {
      return NextResponse.json({ mode: isMongo ? 'mongo' : 'memory', connected: false, students: 0 }, { status: 503 });
    }
    throw e;
  }
});
