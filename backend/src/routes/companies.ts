import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import prisma from '../prisma.js';

const router = Router();

/**
 * GET /companies/mine
 * Returns all companies the authenticated user belongs to
 */
router.get('/mine', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;

  try {
    const userCompanies = await prisma.userCompany.findMany({
      where: { userId },
      include: {
        company: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const companies = userCompanies.map(uc => ({
      id: uc.company.id,
      name: uc.company.name,
      role: uc.role,
      createdAt: uc.company.createdAt
    }));

    res.status(200).json({ companies });
  } catch (error: any) {
    console.error('Error fetching user companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

/**
 * POST /companies
 * Creates a new company; the creator becomes the owner (Phase 0 Task 3)
 */
router.post('/', requireAuth, idempotencyMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Company name must be at least 2 characters long' });
    return;
  }

  const trimmedName = name.trim();

  try {
    const company = await prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          name: trimmedName
        }
      });

      await tx.userCompany.create({
        data: {
          userId,
          companyId: newCompany.id,
          role: 'owner'
        }
      });

      return newCompany;
    });

    res.status(201).json({
      company: {
        id: company.id,
        name: company.name,
        role: 'owner',
        createdAt: company.createdAt
      },
      message: 'Company created successfully'
    });
  } catch (error: any) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

export default router;
