import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';

const router = Router();

/**
 * GET /health
 * Rule D2: Returns status, service name, and version (commit SHA from RENDER_GIT_COMMIT)
 */
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'trade-flow-api',
    version: process.env.RENDER_GIT_COMMIT || 'local-dev',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/db
 * Rule D2: Runs SELECT 1 and reports milliseconds latency
 */
router.get('/db', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    res.status(200).json({
      status: 'ok',
      database: 'connected',
      latencyMs,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      latencyMs,
      error: err.message
    });
  }
});

/**
 * GET & POST /health/heartbeat
 * Rule F4: Protected by HEARTBEAT_KEY. Upserts heartbeat table with last_seen = NOW()
 */
async function handleHeartbeat(req: Request, res: Response) {
  const configuredKey = process.env.HEARTBEAT_KEY;
  const providedKey = req.headers['x-heartbeat-key'] || req.query.key;

  if (!configuredKey) {
    res.status(500).json({
      status: 'error',
      message: 'Server configuration error: HEARTBEAT_KEY is not defined in environment variables'
    });
    return;
  }

  if (!providedKey || providedKey !== configuredKey) {
    res.status(401).json({
      status: 'error',
      message: 'Unauthorized: Invalid or missing HEARTBEAT_KEY header/parameter'
    });
    return;
  }

  try {
    const heartbeat = await prisma.heartbeat.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        lastSeen: new Date(),
        serviceName: 'tradeflow-backend',
        metadata: {
          ip: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'] || 'cron-job',
          uptime: process.uptime()
        }
      },
      update: {
        lastSeen: new Date(),
        metadata: {
          ip: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'] || 'cron-job',
          uptime: process.uptime()
        }
      }
    });

    res.status(200).json({
      status: 'ok',
      message: 'Supabase heartbeat write successful. Inactivity counter reset.',
      lastSeen: heartbeat.lastSeen,
      service: heartbeat.serviceName,
      timestampIST: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to record heartbeat into database',
      error: error.message
    });
  }
}

router.get('/heartbeat', handleHeartbeat);
router.post('/heartbeat', handleHeartbeat);

export default router;
