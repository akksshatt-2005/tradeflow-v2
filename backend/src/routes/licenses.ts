import { Router, Response } from 'express';
import prisma from '../prisma.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';

const router = Router();

export function generateLicenseKey(prefix = 'TF'): string {
  const year = new Date().getFullYear();
  const chunk = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${year}-${chunk()}-${chunk()}-${chunk()}`;
}

/**
 * GET /api/licenses/current
 * Returns the current active license for the company scoped in x-company-id
 */
router.get('/current', requireAuth, requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;

  try {
    const license = await prisma.license.findFirst({
      where: { companyId },
      orderBy: { expiresAt: 'desc' }
    });

    if (!license) {
      res.json({
        hasLicense: false,
        message: 'No license registered for this company.'
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

    let computedStatus = license.status;
    if (isHardExpired) computedStatus = 'EXPIRED';
    else if (inGracePeriod) computedStatus = 'GRACE';
    else if (now <= expiry) computedStatus = 'ACTIVE';

    res.json({
      hasLicense: true,
      license: {
        id: license.id,
        licenseKey: license.licenseKey,
        registeredEmail: license.registeredEmail,
        planType: license.planType,
        status: computedStatus,
        maxUsers: license.maxUsers,
        gracePeriodDays: license.gracePeriodDays,
        issuedAt: license.issuedAt,
        activatedAt: license.activatedAt,
        expiresAt: license.expiresAt,
        daysRemaining,
        inGracePeriod,
        isHardExpired
      }
    });
  } catch (err: any) {
    console.error('Failed to get current license:', err);
    res.status(500).json({ error: 'Failed to retrieve license information.' });
  }
});

/**
 * POST /api/licenses/activate
 * Activates a provided license key for the company
 */
router.post('/activate', requireAuth, requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { licenseKey } = req.body;

  if (!licenseKey || typeof licenseKey !== 'string') {
    res.status(400).json({ error: 'Valid licenseKey string is required.' });
    return;
  }

  const cleanKey = licenseKey.trim().toUpperCase();

  try {
    const existing = await prisma.license.findUnique({
      where: { licenseKey: cleanKey }
    });

    if (!existing) {
      res.status(404).json({ error: 'Invalid license key. Please check and try again.' });
      return;
    }

    if (existing.status === 'SUSPENDED') {
      res.status(403).json({ error: 'This license has been suspended. Please contact TradeFlow support.' });
      return;
    }

    if (existing.companyId && existing.companyId !== companyId) {
      res.status(409).json({ error: 'This license key is already activated by another company.' });
      return;
    }

    const now = new Date();
    if (new Date(existing.expiresAt) <= now) {
      res.status(400).json({ error: 'This license key has already expired.' });
      return;
    }

    const updated = await prisma.license.update({
      where: { id: existing.id },
      data: {
        companyId,
        status: 'ACTIVE',
        activatedAt: existing.activatedAt || now
      }
    });

    res.json({
      message: 'License activated successfully!',
      license: updated
    });
  } catch (err: any) {
    console.error('Failed to activate license:', err);
    res.status(500).json({ error: 'Could not activate license. Please try again.' });
  }
});

/**
 * POST /api/licenses/admin/generate
 * Super-Admin endpoint to generate a new license key
 */
router.post('/admin/generate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { registeredEmail, planType = 'WHOLESALE', durationDays = 365, maxUsers = 5, notes } = req.body;

  if (!registeredEmail || typeof registeredEmail !== 'string') {
    res.status(400).json({ error: 'registeredEmail is required.' });
    return;
  }

  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(durationDays || 365));

    const key = generateLicenseKey();

    const license = await prisma.license.create({
      data: {
        licenseKey: key,
        registeredEmail: registeredEmail.trim().toLowerCase(),
        planType: String(planType).toUpperCase(),
        status: 'PENDING',
        maxUsers: Number(maxUsers) || 5,
        gracePeriodDays: 7,
        expiresAt,
        notes: notes ? String(notes).trim() : null
      }
    });

    res.status(201).json({
      message: 'License key created successfully',
      license
    });
  } catch (err: any) {
    console.error('Failed to generate license:', err);
    res.status(500).json({ error: 'Could not generate license key.' });
  }
});

/**
 * GET /api/licenses/admin/list
 * Super-Admin endpoint to view all system licenses
 */
router.get('/admin/list', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const licenses = await prisma.license.findMany({
      include: {
        company: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            gstin: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ licenses });
  } catch (err: any) {
    console.error('Failed to list licenses:', err);
    res.status(500).json({ error: 'Could not load licenses list.' });
  }
});

/**
 * PATCH /api/licenses/admin/:id/extend
 * Super-Admin endpoint to extend license validity by N days
 */
router.patch('/admin/:id/extend', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { additionalDays = 365 } = req.body;

  try {
    const existing = await prisma.license.findUnique({
      where: { id }
    });

    if (!existing) {
      res.status(404).json({ error: 'License not found.' });
      return;
    }

    const currentExpiry = new Date(existing.expiresAt);
    const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
    baseDate.setDate(baseDate.getDate() + Number(additionalDays || 365));

    const updated = await prisma.license.update({
      where: { id },
      data: {
        expiresAt: baseDate,
        status: 'ACTIVE'
      }
    });

    res.json({
      message: `License extended by ${additionalDays} days successfully.`,
      license: updated
    });
  } catch (err: any) {
    console.error('Failed to extend license:', err);
    res.status(500).json({ error: 'Could not extend license.' });
  }
});

export default router;
