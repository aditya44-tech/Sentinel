import test from 'node:test';
import assert from 'node:assert';
import { checkBannedWords, isRateLimited, isDemoMode } from '../lib/smsLogic.ts';

test('SMS Logic Unit Tests', async (t) => {
  await t.test('checkBannedWords detects banned words', () => {
    assert.strictEqual(checkBannedWords('You are at risk of dropout!'), true);
    assert.strictEqual(checkBannedWords('This message contains risk'), true);
    assert.strictEqual(checkBannedWords('Please attend your session tomorrow'), false);
    assert.strictEqual(checkBannedWords('Your mentor wants to check in with you'), false);
  });

  await t.test('isRateLimited: no log entries means not rate limited', () => {
    assert.strictEqual(isRateLimited([]), false);
    assert.strictEqual(isRateLimited(null as any), false);
  });

  await t.test('isRateLimited: SMS sent within 24 hours is rate limited', () => {
    const log = [{ channel: 'SMS', date: new Date().toISOString() }];
    assert.strictEqual(isRateLimited(log), true);
  });

  await t.test('isRateLimited: SMS sent over 24 hours ago is not rate limited', () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const log = [{ channel: 'SMS', date: yesterday }];
    assert.strictEqual(isRateLimited(log), false);
  });

  await t.test('isRateLimited: only SMS channel matters, call log does not count', () => {
    const log = [{ channel: 'Call', date: new Date().toISOString() }];
    assert.strictEqual(isRateLimited(log), false);
  });

  await t.test('isDemoMode: missing API key returns demo mode', () => {
    assert.strictEqual(isDemoMode(undefined, 'device123'), true);
  });

  await t.test('isDemoMode: missing device ID returns demo mode', () => {
    assert.strictEqual(isDemoMode('key123', undefined), true);
  });

  await t.test('isDemoMode: both present means live mode', () => {
    assert.strictEqual(isDemoMode('key123', 'device123'), false);
  });
});
