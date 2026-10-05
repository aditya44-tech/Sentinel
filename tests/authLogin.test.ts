/**
 * tests/authLogin.test.ts
 *
 * Regression tests for POST /api/auth/login (mentor branch).
 * Run with: npm test
 *
 * Background: `.env*` is gitignored, so a fresh deployment ships without
 * MENTOR_PASSWORD. The route used to turn that into a 401 "Invalid
 * credentials", which made a server misconfiguration look like a typo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// createSessionToken() refuses to sign without a usable secret.
process.env.SESSION_SECRET ||= 'test_secret_value_1234567890';

const PASSWORD = 'correct-horse-battery';

async function postLogin(body: Record<string, unknown>) {
  const { POST } = await import('../app/api/auth/login/route.ts');
  const res = await POST(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    {}
  );
  const data = await res.json().catch(() => null);
  return { status: res.status, data, cookie: res.headers.get('set-cookie') };
}

test('mentor login succeeds with the configured password', async () => {
  process.env.MENTOR_PASSWORD = PASSWORD;
  const { status, data, cookie } = await postLogin({ role: 'mentor', password: PASSWORD });
  assert.equal(status, 200);
  assert.equal(data?.ok, true);
  assert.equal(data?.role, 'mentor');
  assert.match(cookie ?? '', /sentinel_session=/);
});

test('mentor login rejects a wrong password with 401', async () => {
  process.env.MENTOR_PASSWORD = PASSWORD;
  const { status, data } = await postLogin({ role: 'mentor', password: 'wrong-password' });
  assert.equal(status, 401);
  assert.equal(data?.error, 'Invalid credentials');
});

test('missing MENTOR_PASSWORD reports misconfiguration instead of bad credentials', async () => {
  const saved = process.env.MENTOR_PASSWORD;
  process.env.MENTOR_PASSWORD = '';
  try {
    const { status, data } = await postLogin({ role: 'mentor', password: PASSWORD });
    assert.equal(status, 503);
    assert.match(data?.error ?? '', /MENTOR_PASSWORD/);
    assert.notEqual(data?.error, 'Invalid credentials');
  } finally {
    if (saved) process.env.MENTOR_PASSWORD = saved;
    else delete process.env.MENTOR_PASSWORD;
  }
});
