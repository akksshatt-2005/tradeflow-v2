import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tradeflow-secret-access-token-key-2026';
const ACCESS_TOKEN_EXPIRY = '15m'; // Rule B2: Access JWT valid 15 minutes
const REFRESH_TOKEN_DAYS = 7;

export interface TokenPayload {
  userId: string;
  username: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt
    }
  });

  return rawToken;
}

export async function rotateRefreshToken(rawToken: string): Promise<{ userId: string; username: string; newAccessToken: string; newRefreshToken: string } | null> {
  const tokenHash = hashToken(rawToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!existing) {
    return null;
  }

  // Delete used token (rotation - Rule B2)
  await prisma.refreshToken.delete({
    where: { id: existing.id }
  });

  // Check expiration
  if (existing.expiresAt < new Date()) {
    return null;
  }

  // Issue new access + refresh token
  const newAccessToken = generateAccessToken({ userId: existing.user.id, username: existing.user.username });
  const newRefreshToken = await createRefreshToken(existing.user.id);

  return {
    userId: existing.user.id,
    username: existing.user.username,
    newAccessToken,
    newRefreshToken
  };
}

export async function revokeUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { userId }
  });
}

export async function revokeSingleToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.deleteMany({
    where: { tokenHash }
  });
}
