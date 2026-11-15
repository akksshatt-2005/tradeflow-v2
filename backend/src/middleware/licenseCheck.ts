import { Response, NextFunction } from 'express';
import { CompanyScopedRequest } from './company.js';
import prisma from '../prisma.js';

export interface LicensedRequest extends CompanyScopedRequest {
  license?: {
    id: string;
    licenseKey: string;
    planType: string;
    status: string;
    expiresAt: Date;
    daysRemaining: number;
    inGracePeriod: boolean;
  };
}

/**
 * License Verification Middleware
 * Ensures the company has an active, non-expired license.
 * If expired within gracePeriodDays (default 7), sets inGracePeriod = true.
 * If expired beyond gracePeriodDays, blocks mutating operations with HTTP 403 (LICENSE_EXPIRED).
 */
export async function requireActiveLicense(
  req: LicensedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const companyId = req.company?.id;

  if (!companyId) {
    res.status(400).json({ error: 'Company scope required for license verification.' });
    return;
  }

  try {
    const license = await prisma.license.findFirst({
      where: {
        companyId,
        status: {
          in: ['ACTIVE', 'GRACE']
        }
      },
      orderBy: {
        expiresAt: 'desc'
      }
    });

    if (!license) {
      res.status(403).json({
        code: 'LICENSE_MISSING',
        error: 'No active license found for this company. Please activate a license in Settings.'
      });
      return;
    }

    const now = new Date();
    const expiry = new Date(license.expiresAt);
    const msRemaining = expiry.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    const graceMs = (license.gracePeriodDays || 7) * 24 * 60 * 60 * 1000;
    const graceEnd = new Date(expiry.getTime() + graceMs);
    const inGracePeriod = now > expiry && now <= graceEnd;
    const isHardExpired = now > graceEnd;

    if (isHardExpired) {
      // Automatically update DB status to EXPIRED
      if (license.status !== 'EXPIRED') {
        await prisma.license.update({
          where: { id: license.id },
          data: { status: 'EXPIRED' }
        }).catch(() => {});
      }

      res.status(403).json({
        code: 'LICENSE_EXPIRED',
        error: `Your TradeFlow license expired on ${expiry.toISOString().split('T')[0]}. Read-only mode active: you can view reports and invoices, but creating new records is disabled. Please renew your license.`,
        expiresAt: license.expiresAt,
        licenseKey: license.licenseKey
      });
      return;
    }

    if (inGracePeriod && license.status !== 'GRACE') {
      await prisma.license.update({
        where: { id: license.id },
        data: { status: 'GRACE' }
      }).catch(() => {});
    }

    req.license = {
      id: license.id,
      licenseKey: license.licenseKey,
      planType: license.planType,
      status: inGracePeriod ? 'GRACE' : 'ACTIVE',
      expiresAt: license.expiresAt,
      daysRemaining,
      inGracePeriod
    };

    next();
  } catch (err: any) {
    console.error('License check error:', err);
    // Don't crash the entire request pipeline if db had a transient blip, proceed
    next();
  }
}
