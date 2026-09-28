import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma.js';
import { generateAccessToken, createRefreshToken, rotateRefreshToken, revokeSingleToken } from '../utils/tokens.js';
import { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } from '../utils/rateLimiter.js';

const router = Router();
const BCRYPT_ROUNDS = 10;

/**
 * POST /auth/signup
 * Rule B3: Username trimmed and lowercased (min 3 chars). Password min 8 chars (exact, no trimming).
 */
router.post('/signup', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'Username is required' });
    return;
  }

  const normalizedUsername = username.trim().toLowerCase();

  if (normalizedUsername.length < 3) {
    res.status(400).json({ error: 'Username must be at least 3 characters long' });
    return;
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long' });
    return;
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { username: normalizedUsername }
    });

    if (existing) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        passwordHash
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, username: user.username });
    const refreshToken = await createRefreshToken(user.id);

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username
      },
      accessToken,
      refreshToken,
      companies: []
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

/**
 * POST /auth/login
 * Rule B3, B4, B5, A5: Rate limited, returns user + companies in 1 call
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const ipAddress = (req.ip || req.socket.remoteAddress || '127.0.0.1').toString();

  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const normalizedUsername = username.trim().toLowerCase();

  try {
    // 1. Check Rate Limit (Rule B4)
    const rateLimit = await checkLoginRateLimit(normalizedUsername, ipAddress);
    if (rateLimit.isLocked) {
      res.status(429).json({
        error: `Too many failed login attempts. Account locked. Please try again in ${rateLimit.minutesRemaining} minute${rateLimit.minutesRemaining > 1 ? 's' : ''}.`,
        minutesRemaining: rateLimit.minutesRemaining
      });
      return;
    }

    // 2. Find User
    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      include: {
        userCompanies: {
          include: {
            company: true
          }
        }
      }
    });

    if (!user) {
      const lockResult = await recordFailedLogin(normalizedUsername, ipAddress);
      if (lockResult.isLocked) {
        res.status(429).json({
          error: `Too many failed login attempts. Account locked. Please try again in ${lockResult.minutesRemaining} minutes.`,
          minutesRemaining: lockResult.minutesRemaining
        });
        return;
      }
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    // 3. Exact Password Comparison (Rule B3 - NO trimming or variants)
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      const lockResult = await recordFailedLogin(normalizedUsername, ipAddress);
      if (lockResult.isLocked) {
        res.status(429).json({
          error: `Too many failed login attempts. Account locked. Please try again in ${lockResult.minutesRemaining} minutes.`,
          minutesRemaining: lockResult.minutesRemaining
        });
        return;
      }
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    // 4. Reset rate limit on success
    await resetLoginRateLimit(normalizedUsername, ipAddress);

    // 5. Generate Tokens
    const accessToken = generateAccessToken({ userId: user.id, username: user.username });
    const refreshToken = await createRefreshToken(user.id);

    // 6. Map companies (Rule A5 - single hop response)
    const companies = user.userCompanies.map(uc => ({
      id: uc.company.id,
      name: uc.company.name,
      role: uc.role,
      createdAt: uc.company.createdAt
    }));

    res.status(200).json({
      user: {
        id: user.id,
        username: user.username
      },
      accessToken,
      refreshToken,
      companies
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

/**
 * POST /auth/refresh
 * Rule B2: Rotates refresh token, returns new access & refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken || typeof refreshToken !== 'string') {
    res.status(400).json({ error: 'Refresh token is required' });
    return;
  }

  try {
    const result = await rotateRefreshToken(refreshToken);

    if (!result) {
      res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' });
      return;
    }

    res.status(200).json({
      accessToken: result.newAccessToken,
      refreshToken: result.newRefreshToken,
      user: {
        id: result.userId,
        username: result.username
      }
    });
  } catch (error: any) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * POST /auth/logout
 * Rule B2: Revokes the supplied refresh token
 */
router.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (refreshToken && typeof refreshToken === 'string') {
    try {
      await revokeSingleToken(refreshToken);
    } catch (_) {}
  }

  res.status(200).json({ message: 'Logged out successfully' });
});

export default router;
