import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import { generateAccessToken, verifyAccessToken } from '../utils/tokens.js';

const router = Router();

const SUPERADMIN_USER = process.env.SUPERADMIN_USERNAME || 'superadmin';
const SUPERADMIN_PASS = process.env.SUPERADMIN_PASSWORD || 'AdminTradeFlow@2026';

/**
 * SuperAdmin Verification Middleware
 * Only allows requests holding a token with role: 'superadmin'
 */
export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'SuperAdmin authentication required.' });
    return;
  }

  const token = authHeader.substring(7).trim();
  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'superadmin') {
      res.status(403).json({ error: 'Access forbidden: SuperAdmin privileges required.' });
      return;
    }
    req.user = payload;
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'SuperAdmin session expired or invalid.' });
  }
}

/**
 * POST /api/licenses/superadmin/login
 * Standalone Master SuperAdmin Authentication
 */
router.post('/superadmin/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  if (username.trim() === SUPERADMIN_USER && password === SUPERADMIN_PASS) {
    const token = generateAccessToken({
      userId: 'master-superadmin-id',
      username: SUPERADMIN_USER,
      role: 'superadmin'
    });

    res.json({
      success: true,
      token,
      user: {
        username: SUPERADMIN_USER,
        role: 'superadmin'
      }
    });
  } else {
    res.status(401).json({ error: 'Invalid SuperAdmin ID or password.' });
  }
});

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
 * Super-Admin endpoint to generate a new license key AND provision vendor login credentials (ID & Password)
 */
router.post('/admin/generate', requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {
    username,
    password,
    registeredEmail,
    planType = 'WHOLESALE',
    durationDays,
    expiresAt: customExpiry,
    companyId,
    maxUsers = 5,
    notes
  } = req.body;

  const targetEmail = (registeredEmail || username || '').trim().toLowerCase();
  if (!targetEmail) {
    res.status(400).json({ error: 'Client Email or Username is required.' });
    return;
  }

  try {
    let createdUser: { id: string; username: string } | null = null;
    let initialPassword = password;

    // If username and password provided (or username only), provision vendor user account
    if (username && typeof username === 'string') {
      const normalizedUsername = username.trim().toLowerCase();
      if (normalizedUsername.length < 3) {
        res.status(400).json({ error: 'Vendor username must be at least 3 characters long.' });
        return;
      }

      if (!initialPassword || initialPassword.length < 6) {
        // Auto-generate strong initial password if not specified
        initialPassword = `Pharma@${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const existingUser = await prisma.user.findUnique({
        where: { username: normalizedUsername }
      });

      if (existingUser) {
        createdUser = { id: existingUser.id, username: existingUser.username };
      } else {
        const passwordHash = await bcrypt.hash(initialPassword, 10);
        const newUser = await prisma.user.create({
          data: {
            username: normalizedUsername,
            passwordHash
          }
        });
        createdUser = { id: newUser.id, username: newUser.username };
      }
    }

    let finalExpiry: Date;
    if (customExpiry) {
      finalExpiry = new Date(customExpiry);
      if (isNaN(finalExpiry.getTime())) {
        res.status(400).json({ error: 'Invalid custom expiry date format.' });
        return;
      }
    } else {
      finalExpiry = new Date();
      finalExpiry.setDate(finalExpiry.getDate() + Number(durationDays || 365));
    }

    const key = generateLicenseKey();

    const license = await prisma.license.create({
      data: {
        licenseKey: key,
        registeredEmail: targetEmail,
        companyId: companyId ? String(companyId).trim() : null,
        planType: String(planType).toUpperCase(),
        status: companyId ? 'ACTIVE' : 'PENDING',
        activatedAt: companyId ? new Date() : null,
        maxUsers: Number(maxUsers) || 5,
        gracePeriodDays: 7,
        expiresAt: finalExpiry,
        notes: notes ? String(notes).trim() : (createdUser ? `Vendor Login: ${createdUser.username}` : null)
      }
    });

    res.status(201).json({
      message: 'License & Vendor Login account created successfully!',
      license,
      credentials: createdUser ? {
        username: createdUser.username,
        password: initialPassword,
        licenseKey: key,
        expiresAt: finalExpiry,
        planType: license.planType
      } : null
    });
  } catch (err: any) {
    console.error('Failed to generate license and vendor account:', err);
    res.status(500).json({ error: 'Could not generate license key.' });
  }
});

/**
 * GET /api/licenses/admin/list
 * Super-Admin endpoint to view all system licenses
 */
router.get('/admin/list', requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
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

    // Compute live days remaining & status for each
    const now = new Date();
    const formatted = licenses.map(lic => {
      const expiry = new Date(lic.expiresAt);
      const msRemaining = expiry.getTime() - now.getTime();
      const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
      const graceMs = (lic.gracePeriodDays || 7) * 24 * 60 * 60 * 1000;
      const graceEnd = new Date(expiry.getTime() + graceMs);

      let effectiveStatus = lic.status;
      if (lic.status !== 'SUSPENDED') {
        if (now > graceEnd) effectiveStatus = 'EXPIRED';
        else if (now > expiry) effectiveStatus = 'GRACE';
        else effectiveStatus = 'ACTIVE';
      }

      return {
        ...lic,
        daysRemaining,
        effectiveStatus
      };
    });

    res.json({ licenses: formatted });
  } catch (err: any) {
    console.error('Failed to list licenses:', err);
    res.status(500).json({ error: 'Could not load licenses list.' });
  }
});

/**
 * PATCH /api/licenses/admin/:id/extend
 * Super-Admin endpoint to extend license validity by N days
 */
router.patch('/admin/:id/extend', requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
        status: existing.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'
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

/**
 * PATCH /api/licenses/admin/:id/expiry
 * Super-Admin endpoint to set an exact expiry date and time
 */
router.patch('/admin/:id/expiry', requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { expiresAt } = req.body;

  if (!expiresAt) {
    res.status(400).json({ error: 'expiresAt datetime is required.' });
    return;
  }

  const parsedDate = new Date(expiresAt);
  if (isNaN(parsedDate.getTime())) {
    res.status(400).json({ error: 'Invalid date format.' });
    return;
  }

  try {
    const updated = await prisma.license.update({
      where: { id },
      data: {
        expiresAt: parsedDate,
        status: parsedDate > new Date() ? 'ACTIVE' : 'EXPIRED'
      }
    });

    res.json({
      message: 'License expiry date and time updated successfully.',
      license: updated
    });
  } catch (err: any) {
    console.error('Failed to update expiry:', err);
    res.status(500).json({ error: 'Could not update expiry date.' });
  }
});

/**
 * PATCH /api/licenses/admin/:id/status
 * Super-Admin endpoint to Activate or Deactivate (Suspend) a license
 */
router.patch('/admin/:id/status', requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body; // 'ACTIVE' or 'SUSPENDED'

  if (!status || !['ACTIVE', 'SUSPENDED'].includes(status)) {
    res.status(400).json({ error: 'Status must be ACTIVE or SUSPENDED.' });
    return;
  }

  try {
    const existing = await prisma.license.findUnique({
      where: { id }
    });

    if (!existing) {
      res.status(404).json({ error: 'License not found.' });
      return;
    }

    const updated = await prisma.license.update({
      where: { id },
      data: {
        status
      }
    });

    res.json({
      message: status === 'ACTIVE' ? 'License activated successfully.' : 'License deactivated / suspended.',
      license: updated
    });
  } catch (err: any) {
    console.error('Failed to update status:', err);
    res.status(500).json({ error: 'Could not update license status.' });
  }
});

/**
 * DELETE /api/licenses/admin/:id
 * Super-Admin endpoint to permanently delete/revoke a license
 */
router.delete('/admin/:id', requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    await prisma.license.delete({
      where: { id }
    });

    res.json({ message: 'License deleted successfully.' });
  } catch (err: any) {
    console.error('Failed to delete license:', err);
    res.status(500).json({ error: 'Could not delete license.' });
  }
});

export default router;
