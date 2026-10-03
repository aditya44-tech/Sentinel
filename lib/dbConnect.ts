import mongoose from 'mongoose';

const g = globalThis as any;
const cache = g.__mongooseCache ?? (g.__mongooseCache = { conn: null as typeof mongoose | null, promise: null as Promise<typeof mongoose> | null });

export async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  if (cache.conn) return cache.conn;
  cache.promise ??= mongoose.connect(uri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 5,
  });
  try { cache.conn = await cache.promise; }
  catch (e) { cache.promise = null; console.error('[db] connect failed', e); throw e; }
  return cache.conn;
}

export function isDbConnected() {
  return Boolean(process.env.MONGODB_URI);
}
