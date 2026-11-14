import prisma from '../prisma.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 10;

export interface RateLimitCheck {
  isLocked: boolean;
  minutesRemaining: number;
  failedAttempts: number;
}

/**
 * Check if the username + IP is locked (Rule B4)
 */
export async function checkLoginRateLimit(username: string, ipAddress: string): Promise<RateLimitCheck> {
  const normalizedUsername = username.trim().toLowerCase();
  const attempt = await prisma.loginAttempt.findUnique({
    where: {
      username_ipAddress: {
        username: normalizedUsername,
        ipAddress
      }
    }
  });

  if (!attempt) {
    return { isLocked: false, minutesRemaining: 0, failedAttempts: 0 };
  }

  const now = new Date();

  // If locked
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    const msRemaining = attempt.lockedUntil.getTime() - now.getTime();
    const minutesRemaining = Math.max(1, Math.ceil(msRemaining / (60 * 1000)));
    return {
      isLocked: true,
      minutesRemaining,
      failedAttempts: attempt.failedAttempts
    };
  }

  // If lockout expired, reset
  if (attempt.lockedUntil && attempt.lockedUntil <= now) {
    await prisma.loginAttempt.delete({
      where: { id: attempt.id }
    });
    return { isLocked: false, minutesRemaining: 0, failedAttempts: 0 };
  }

  return {
    isLocked: false,
    minutesRemaining: 0,
    failedAttempts: attempt.failedAttempts
  };
}

/**
 * Record a failed login attempt (Rule B4)
 */
export async function recordFailedLogin(username: string, ipAddress: string): Promise<{ isLocked: boolean; minutesRemaining: number; failedAttempts: number }> {
  const normalizedUsername = username.trim().toLowerCase();
  const now = new Date();

  const attempt = await prisma.loginAttempt.findUnique({
    where: {
      username_ipAddress: {
        username: normalizedUsername,
        ipAddress
      }
    }
  });

  if (!attempt) {
    await prisma.loginAttempt.create({
      data: {
        username: normalizedUsername,
        ipAddress,
        failedAttempts: 1,
        lastAttemptAt: now
      }
    });
    return { isLocked: false, minutesRemaining: 0, failedAttempts: 1 };
  }

  const newAttempts = attempt.failedAttempts + 1;
  let lockedUntil: Date | null = null;

  if (newAttempts >= MAX_ATTEMPTS) {
    lockedUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
  }

  await prisma.loginAttempt.update({
    where: { id: attempt.id },
    data: {
      failedAttempts: newAttempts,
      lockedUntil,
      lastAttemptAt: now
    }
  });

  const isLocked = newAttempts >= MAX_ATTEMPTS;
  return {
    isLocked,
    minutesRemaining: isLocked ? LOCKOUT_MINUTES : 0,
    failedAttempts: newAttempts
  };
}

/**
 * Clear rate limit on successful login
 */
export async function resetLoginRateLimit(username: string, ipAddress: string): Promise<void> {
  const normalizedUsername = username.trim().toLowerCase();
  try {
    await prisma.loginAttempt.delete({
      where: {
        username_ipAddress: {
          username: normalizedUsername,
          ipAddress
        }
      }
    });
  } catch (_) {
    // Record might not exist if first login succeeded
  }
}

/**
 * Sliding window IP rate limiter for general API routes (Step 7: Network Shield / Anti-DDoS)
 * Limits requests per IP to prevent scraping, brute-force, and resource exhaustion.
 */
interface IpBucket {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, IpBucket>();

// Periodic cleanup every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of ipBuckets.entries()) {
    if (now > bucket.resetAt) {
      ipBuckets.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

export function createApiRateLimiter(windowMs: number = 60 * 1000, maxRequests: number = 300) {
  return (req: any, res: any, next: any) => {
    // Exclude healthcheck probes from rate limiting
    if (req.path === '/' || req.path === '/health' || req.path === '/api/health') {
      return next();
    }

    const ip = (req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').toString();
    const now = Date.now();
    const bucket = ipBuckets.get(ip);

    if (!bucket || now > bucket.resetAt) {
      ipBuckets.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSec.toString());
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
        retryAfter: retryAfterSec
      });
    }

    next();
  };
}

