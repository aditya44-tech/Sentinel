import test from 'node:test';
import assert from 'node:assert';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import * as store from '../lib/store';
import { BadRequest } from '../lib/http';

test('store tests', async (t) => {
  let mongod: MongoMemoryServer;

  t.before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
  });

  t.after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
    delete process.env.MONGODB_URI;
  });

  await t.test('cleanId validations', () => {
    assert.throws(() => store.cleanId({ $ne: null }), BadRequest);
    assert.throws(() => store.cleanId('a/b'), BadRequest);
    assert.throws(() => store.cleanId(''), BadRequest);
    assert.strictEqual(store.cleanId('valid-id'), 'valid-id');
  });

  await t.test('upsertStudents size limit', async () => {
    const largeList = Array.from({ length: 501 }, (_, i) => ({ studentId: `S${i}` }));
    await assert.rejects(store.upsertStudents(largeList), BadRequest);
  });

  await t.test('listStudents seeds once', async () => {
    const students = await store.listStudents();
    assert.ok(students.length > 0, 'should seed demo students');
    
    await store.resetAll();
    const afterReset = await store.listStudents();
    assert.strictEqual(afterReset.length, 0, 'should be empty after reset');
    
    // Simulate cold start
    // @ts-ignore
    delete globalThis.__sentinelDb;
    const afterColdStart = await store.listStudents();
    assert.strictEqual(afterColdStart.length, 0, 'should remain empty after simulated cold start');
  });
});
