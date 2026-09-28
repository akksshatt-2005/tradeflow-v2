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
import prisma from './prisma.js';

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

// Phase 1 Database Tables Self-Healing Bootstrap
async function ensureTables() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "items" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "sku" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "generic_name" TEXT,
        "manufacturer" TEXT,
        "hsn_code" TEXT NOT NULL DEFAULT '3004',
        "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 12.0,
        "unit" TEXT NOT NULL DEFAULT 'STRIP',
        "conversion_factor" INTEGER NOT NULL DEFAULT 1,
        "min_stock_level" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "items_company_id_sku_key" UNIQUE ("company_id", "sku")
      );
      CREATE INDEX IF NOT EXISTS "items_company_id_name_idx" ON "items"("company_id", "name");

      CREATE TABLE IF NOT EXISTS "batches" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "item_id" TEXT NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
        "batch_number" TEXT NOT NULL,
        "expiry_date" TIMESTAMP(3) NOT NULL,
        "mrp" DECIMAL(10,2) NOT NULL,
        "ptr" DECIMAL(10,2) NOT NULL,
        "pts" DECIMAL(10,2) NOT NULL,
        "current_stock" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "batches_company_id_item_id_batch_number_key" UNIQUE ("company_id", "item_id", "batch_number")
      );
      CREATE INDEX IF NOT EXISTS "batches_company_id_expiry_date_idx" ON "batches"("company_id", "expiry_date");

      CREATE TABLE IF NOT EXISTS "parties" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "phone" TEXT,
        "email" TEXT,
        "address" TEXT,
        "gstin" TEXT,
        "drug_license_no" TEXT,
        "dl_expiry_date" TIMESTAMP(3),
        "is_cash" BOOLEAN NOT NULL DEFAULT false,
        "credit_limit" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
        "outstanding_balance" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "parties_company_id_name_type_key" UNIQUE ("company_id", "name", "type")
      );
      CREATE INDEX IF NOT EXISTS "parties_company_id_type_idx" ON "parties"("company_id", "type");

      CREATE TABLE IF NOT EXISTS "stock_ledger" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "item_id" TEXT NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
        "batch_id" TEXT NOT NULL REFERENCES "batches"("id") ON DELETE CASCADE,
        "entry_type" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL,
        "unit_price" DECIMAL(10,2) NOT NULL,
        "reference_id" TEXT,
        "notes" TEXT,
        "created_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "stock_ledger_company_id_item_id_idx" ON "stock_ledger"("company_id", "item_id");
      CREATE INDEX IF NOT EXISTS "stock_ledger_company_id_batch_id_idx" ON "stock_ledger"("company_id", "batch_id");
    `);
    console.log('✅ Phase 1 database tables verified & ready.');
  } catch (err: any) {
    console.error('⚠️ Notice verifying Phase 1 tables:', err.message);
  }
}

if (process.env.NODE_ENV !== 'test_runner') {
  app.listen(PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Trade Flow v2 Backend Active on port ${PORT}`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`💚 Health: http://localhost:${PORT}/health`);
    console.log(`🕒 Server Time (IST): ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    console.log(`======================================================\n`);
    await ensureTables();
  });
}

export default app;
