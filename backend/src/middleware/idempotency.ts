import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../prisma.js';

/**
 * Idempotency Middleware (Rule F3)
 * Guarantees that retried mutations do not duplicate records.
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // CRITICAL: Never apply idempotency caching to PUT/PATCH/DELETE — only POST creates.
  // PUT requests (invoice edits) with the same idempotency key would otherwise replay
  // the first edit's response on every subsequent edit, causing all changes to revert.
  if (req.method !== 'POST') {
    return next();
  }

  const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body?.idempotency_key) as string | undefined;

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return next();
  }

  const sanitizedKey = idempotencyKey.trim();
  const endpoint = `${req.method} ${req.baseUrl || ''}${req.path || req.url}`;
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');

  try {
    const cached = await prisma.idempotencyKey.findUnique({
      where: { key: sanitizedKey }
    });

    if (cached) {
      console.log(`[Idempotency HIT] Returning cached response for key: ${sanitizedKey} (${endpoint})`);
      res.setHeader('X-Idempotent-Replay', 'true');
      res.setHeader('X-Idempotency-Key', sanitizedKey);
      res.status(cached.statusCode).json(cached.responseBody);
      return;
    }

    // Intercept res.json to capture response on successful completion
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        // Fire-and-forget with proper error logging – must NOT block the response
        setImmediate(() => {
          prisma.idempotencyKey.upsert({
            where: { key: sanitizedKey },
            create: {
              key: sanitizedKey,
              endpoint,
              requestHash,
              statusCode: res.statusCode,
              responseBody: body,
              expiresAt
            },
            update: {}
          }).catch((err: any) => {
            console.error(`[Idempotency Error] Failed to persist key ${sanitizedKey}:`, err.message);
          });
        });
      }
      res.setHeader('X-Idempotency-Key', sanitizedKey);
      return originalJson(body);
    };

    next();
  } catch (err: any) {
    console.warn(`[Idempotency Warning] DB query failed, proceeding without cache:`, err.message);
    next();
  }
}

export default idempotencyMiddleware;
