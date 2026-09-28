import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import companyRoutes from './routes/companies.js';
import itemRoutes from './routes/items.js';
import partyRoutes from './routes/parties.js';
import inventoryRoutes from './routes/inventory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5001;

// Rule B7: Exact origins from ALLOWED_ORIGINS env var. No wildcards.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173,https://tradeflow-v2-frontend.vercel.app')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile, curl, cron-job) without Origin header
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-company-id', 'Idempotency-Key', 'x-idempotency-key', 'x-heartbeat-key'],
  exposedHeaders: ['X-Idempotency-Key', 'X-Idempotent-Replay']
}));

app.use(express.json());

// Rule D2: GET / returns JSON identifying the service
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'trade-flow-api',
    status: 'running',
    version: process.env.RENDER_GIT_COMMIT || 'local-dev',
    docs: '/health'
  });
});

// Mount Routes (supporting both root and /api prefixes)
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/companies', companyRoutes);
app.use('/items', itemRoutes);
app.use('/parties', partyRoutes);
app.use('/inventory', inventoryRoutes);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/inventory', inventoryRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: `Cannot ${req.method} ${req.url}`
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

if (process.env.NODE_ENV !== 'test_runner') {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Trade Flow v2 Backend Active on port ${PORT}`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`💚 Health: http://localhost:${PORT}/health`);
    console.log(`🕒 Server Time (IST): ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    console.log(`======================================================\n`);
  });
}

export default app;
