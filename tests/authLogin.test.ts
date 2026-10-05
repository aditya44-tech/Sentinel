/**
 * tests/authLogin.test.ts
 *
 * Regression tests for POST /api/auth/login (mentor branch).
 * Run with: npm test
 *
 * Background: `.env*` is gitignored, so a fresh deployment ships without
 * MENTOR_PASSWORD. The password used to be read from env, which made every
 * deployed login fail as "Invalid credentials". It is now baked into the
 * route, and these tests pin that behavior so it cannot regress.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// createSessionToken() prefers SESSION_SECRET when set; the route itself must
// not depend on it either way (lib/auth has a baked-in fallback).
process.env.SESSION_SECRET ||= 'test_secret_value_1234567890';

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

test('mentor login succeeds with the baked-in password sentinel123', async () => {
  const { status, data, cookie } = await postLogin({ role: 'mentor', password: 'sentinel123' });
  assert.equal(status, 200);
  assert.equal(data?.ok, true);
  assert.equal(data?.role, 'mentor');
  assert.match(cookie ?? '', /sentinel_session=/);
});

test('mentor login rejects a wrong password with 401', async () => {
  const { status, data } = await postLogin({ role: 'mentor', password: 'wrong-password' });
  assert.equal(status, 401);
  assert.equal(data?.error, 'Invalid credentials');
});

test('password check does not depend on env vars (deployed without config)', async () => {
  const savedPassword = process.env.MENTOR_PASSWORD;
  const savedSecret = process.env.SESSION_SECRET;
  delete process.env.MENTOR_PASSWORD;
  delete process.env.SESSION_SECRET;
  try {
    const ok = await postLogin({ role: 'mentor', password: 'sentinel123' });
    assert.equal(ok.status, 200);
    assert.match(ok.cookie ?? '', /sentinel_session=/);

    const bad = await postLogin({ role: 'mentor', password: 'nope' });
    assert.equal(bad.status, 401);
  } finally {
    if (savedPassword !== undefined) process.env.MENTOR_PASSWORD = savedPassword;
    if (savedSecret !== undefined) process.env.SESSION_SECRET = savedSecret;
  }
});
