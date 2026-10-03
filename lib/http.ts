import { NextResponse } from 'next/server';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export class BadRequest extends HttpError { constructor(m = 'Bad request') { super(400, m); } }
export class StorageUnavailable extends HttpError { constructor(m = 'Database unavailable') { super(503, m); } }

export function handle(fn: (req: Request, ctx: any) => Promise<Response>) {
  return async (req: Request, ctx: any) => {
    try {
      const method = req.method;
      if (['POST', 'PATCH', 'PUT'].includes(method)) {
        const ct = req.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          throw new BadRequest('Content-Type must be application/json');
        }
      }
      return await fn(req, ctx);
    } catch (e: any) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error('[api] unhandled', e);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
  };
}
