import { NextResponse } from 'next/server';
import { handle, BadRequest } from '@/lib/http';
import * as store from '@/lib/store';
import { requireMentor } from '@/lib/auth';
import { checkBannedWords, isRateLimited, isDemoMode } from '@/lib/smsLogic';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  await requireMentor();
  const { studentId, recipient, message, templateId, force } = await req.json();

  if (!studentId || !recipient || !message) {
    throw new BadRequest('Missing required fields');
  }

  // Banned word check
  if (checkBannedWords(message)) {
    throw new BadRequest('Message contains a banned word (e.g. risk, dropout, failing).');
  }

  const student = await store.getStudent(studentId);
  if (!student) throw new BadRequest('Student not found');

  // Rate limit: 1 SMS per 24 hours per student, unless forced
  if (!force && isRateLimited(student.contactLog ?? [])) {
    return NextResponse.json({ error: 'Rate limit exceeded: 1 SMS per 24 hours', code: 'RATE_LIMIT' }, { status: 429 });
  }

  const apiKey = process.env.TEXTBEE_API_KEY;
  const deviceId = process.env.TEXTBEE_DEVICE_ID;
  const isDemo = isDemoMode(apiKey, deviceId);
  
  let providerStatus = isDemo ? 'demo' : 'success';

  if (!isDemo) {
    try {
      const res = await fetch(`https://api.textbee.dev/api/v1/gateway/devices/${deviceId}/sendSMS`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ recipients: [recipient], message }),
      });

      if (!res.ok) {
        if (res.status === 401) throw new Error('TextBee API Key invalid');
        if (res.status === 429) throw new Error('TextBee Rate Limit exceeded');
        throw new Error(`TextBee API error: ${res.status}`);
      }
    } catch (e: any) {
      // Return 500 but structured so client doesn't crash
      return NextResponse.json({ error: e.message || 'Failed to send SMS' }, { status: 500 });
    }
  }

  // Log contact
  const logEntry = {
    date: new Date().toISOString(),
    channel: 'SMS',
    personContacted: templateId === 'parent' ? 'Parent' : 'Student',
    outcome: isDemo ? 'SMS sent (demo)' : 'SMS sent',
    note: `Template: ${templateId || 'custom'}. Message: "${message}"`,
    loggedBy: 'Mentor',
  };

  await store.patchStudent(studentId, { contactLog: [logEntry] });

  return NextResponse.json({ ok: true, status: providerStatus });
});
