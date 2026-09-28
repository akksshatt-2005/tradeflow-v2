import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import prisma from '../prisma.js';

export interface CompanyScopedRequest extends AuthenticatedRequest {
  company?: {
    id: string;
    name: string;
    role: string;
  };
}

/**
 * Company Membership Verification Middleware (Phase 0 Task 4)
 * Reads x-company-id header and confirms user is authorized member.
 */
export async function requireCompany(req: CompanyScopedRequest, res: Response, next: NextFunction): Promise<void> {
  const companyId = (req.headers['x-company-id'] as string)?.trim();
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!companyId) {
    res.status(400).json({ error: 'Missing x-company-id header. Please select an active company.' });
    return;
  }

  try {
    const userCompany = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      },
      include: {
        company: true
      }
    });

    if (!userCompany) {
      res.status(403).json({ error: 'Access denied. You are not a member of this company.' });
      return;
    }

    req.company = {
      id: userCompany.company.id,
      name: userCompany.company.name,
      role: userCompany.role
    };

    next();
  } catch (error: any) {
    console.error('Company middleware verification error:', error);
    res.status(500).json({ error: 'Failed to verify company membership' });
  }
}
