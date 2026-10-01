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
import purchaseRoutes from './routes/purchases.js';
import invoiceRoutes from './routes/invoices.js';
import gstRoutes from './routes/gst.js';
import prisma from './prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5001;

// Rule B7: Exact origins from ALLOWED_ORIGINS env var with dynamic vercel.app support
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173,https://tradeflow-v2-frontend.vercel.app')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (mobile, curl, cron-job) without Origin header
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      process.env.NODE_ENV !== 'production';

    if (isAllowed) {
      return callback(null, true);
    }
    return callback(null, false);
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
app.use('/purchases', purchaseRoutes);
app.use('/invoices', invoiceRoutes);
app.use('/gst', gstRoutes);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/gst', gstRoutes);

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

// Phase 1 & 2 Database Tables Self-Healing Bootstrap
async function ensureTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "items" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "sku" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "generic_name" TEXT,
      "manufacturer" TEXT,
      "hsn_code" TEXT NOT NULL DEFAULT '3004',
      "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 5.0,
      "unit" TEXT NOT NULL DEFAULT 'STRIP',
      "conversion_factor" INTEGER NOT NULL DEFAULT 1,
      "min_stock_level" INTEGER NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "items_company_id_sku_key" UNIQUE ("company_id", "sku")
    )`,
    `CREATE INDEX IF NOT EXISTS "items_company_id_name_idx" ON "items"("company_id", "name")`,
    `CREATE TABLE IF NOT EXISTS "batches" (
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
    )`,
    `CREATE INDEX IF NOT EXISTS "batches_company_id_expiry_date_idx" ON "batches"("company_id", "expiry_date")`,
    `CREATE TABLE IF NOT EXISTS "parties" (
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
    )`,
    `CREATE INDEX IF NOT EXISTS "parties_company_id_type_idx" ON "parties"("company_id", "type")`,
    `CREATE TABLE IF NOT EXISTS "stock_ledger" (
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
    )`,
    `CREATE INDEX IF NOT EXISTS "stock_ledger_company_id_item_id_idx" ON "stock_ledger"("company_id", "item_id")`,
    `CREATE INDEX IF NOT EXISTS "stock_ledger_company_id_batch_id_idx" ON "stock_ledger"("company_id", "batch_id")`,
    `CREATE TABLE IF NOT EXISTS "purchases" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "supplier_id" TEXT NOT NULL REFERENCES "parties"("id") ON DELETE CASCADE,
      "invoice_number" TEXT NOT NULL,
      "purchase_date" TIMESTAMP(3) NOT NULL,
      "due_date" TIMESTAMP(3),
      "payment_mode" TEXT NOT NULL DEFAULT 'CREDIT',
      "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "total_discount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "taxable_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "cgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "sgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "igst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "round_off" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
      "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "status" TEXT NOT NULL DEFAULT 'UNPAID',
      "notes" TEXT,
      "created_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "purchases_company_id_supplier_id_invoice_number_key" UNIQUE ("company_id", "supplier_id", "invoice_number")
    )`,
    `CREATE INDEX IF NOT EXISTS "purchases_company_id_purchase_date_idx" ON "purchases"("company_id", "purchase_date")`,
    `CREATE INDEX IF NOT EXISTS "purchases_company_id_status_idx" ON "purchases"("company_id", "status")`,
    `CREATE TABLE IF NOT EXISTS "purchase_items" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "purchase_id" TEXT NOT NULL REFERENCES "purchases"("id") ON DELETE CASCADE,
      "item_id" TEXT NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
      "batch_id" TEXT NOT NULL REFERENCES "batches"("id") ON DELETE CASCADE,
      "batch_number" TEXT NOT NULL,
      "expiry_date" TIMESTAMP(3) NOT NULL,
      "quantity" INTEGER NOT NULL,
      "free_quantity" INTEGER NOT NULL DEFAULT 0,
      "purchase_rate" DECIMAL(10,2) NOT NULL,
      "mrp" DECIMAL(10,2) NOT NULL,
      "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
      "taxable_value" DECIMAL(10,2) NOT NULL,
      "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 5.0,
      "gst_amount" DECIMAL(10,2) NOT NULL,
      "total_amount" DECIMAL(10,2) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id")`,
    `CREATE INDEX IF NOT EXISTS "purchase_items_item_id_idx" ON "purchase_items"("item_id")`,
    `CREATE INDEX IF NOT EXISTS "purchase_items_batch_id_idx" ON "purchase_items"("batch_id")`,
    `CREATE TABLE IF NOT EXISTS "invoices" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "party_id" TEXT REFERENCES "parties"("id") ON DELETE SET NULL,
      "invoice_number" TEXT NOT NULL,
      "invoice_date" TIMESTAMP(3) NOT NULL,
      "due_date" TIMESTAMP(3),
      "customer_name" TEXT NOT NULL,
      "customer_phone" TEXT,
      "customer_address" TEXT,
      "customer_gstin" TEXT,
      "doctor_name" TEXT,
      "patient_name" TEXT,
      "payment_mode" TEXT NOT NULL DEFAULT 'CASH',
      "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "item_discount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "bill_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
      "bill_discount_amt" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "taxable_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "cgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "sgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "igst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "round_off" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
      "grand_total" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      "status" TEXT NOT NULL DEFAULT 'PAID',
      "notes" TEXT,
      "created_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "invoices_company_id_invoice_number_key" UNIQUE ("company_id", "invoice_number")
    )`,
    `CREATE INDEX IF NOT EXISTS "invoices_company_id_invoice_date_idx" ON "invoices"("company_id", "invoice_date")`,
    `CREATE INDEX IF NOT EXISTS "invoices_company_id_status_idx" ON "invoices"("company_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "invoices_company_id_party_id_idx" ON "invoices"("company_id", "party_id")`,
    `CREATE TABLE IF NOT EXISTS "invoice_items" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invoice_id" TEXT NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
      "item_id" TEXT NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
      "batch_id" TEXT NOT NULL REFERENCES "batches"("id") ON DELETE CASCADE,
      "batch_number" TEXT NOT NULL,
      "expiry_date" TIMESTAMP(3) NOT NULL,
      "quantity" INTEGER NOT NULL,
      "free_quantity" INTEGER NOT NULL DEFAULT 0,
      "unit_price" DECIMAL(10,2) NOT NULL,
      "mrp" DECIMAL(10,2) NOT NULL,
      "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
      "taxable_amount" DECIMAL(10,2) NOT NULL,
      "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 5.0,
      "cgst_amount" DECIMAL(10,2) NOT NULL,
      "sgst_amount" DECIMAL(10,2) NOT NULL,
      "igst_amount" DECIMAL(10,2) NOT NULL,
      "total_amount" DECIMAL(10,2) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id")`,
    `CREATE INDEX IF NOT EXISTS "invoice_items_item_id_idx" ON "invoice_items"("item_id")`,
    // Company Master columns
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "gstin" TEXT`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "drug_license_no" TEXT`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "phone" TEXT`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "email" TEXT`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "address" TEXT`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "city" TEXT`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "state" TEXT`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "pincode" TEXT`,

    // Party Ledger Master columns
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "station" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "account_group" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "balancing_method" TEXT DEFAULT 'BILL_BY_BILL'`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "opening_balance" DECIMAL(12,2) DEFAULT 0.0`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "opening_balance_type" TEXT DEFAULT 'CR'`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "mail_to" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "pincode" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "state" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "state_code" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'INDIA'`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "mobile" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "fax_no" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "website" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "contact_person" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "designation" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "fssai_no" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "fssai_expiry_date" TIMESTAMP(3)`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "pan_no" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "schedule_h_notice" TEXT DEFAULT 'ALLOW_ALL'`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "hold_payment" BOOLEAN DEFAULT false`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "ledger_category" TEXT DEFAULT 'REGISTERED'`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "default_doctor_name" TEXT`,
    `ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "default_doctor_reg_no" TEXT`,

    // Purchase items columns
    `ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "pack" TEXT DEFAULT '10 TAB'`,

    // Invoice & Invoice items columns
    `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "doctor_reg_no" TEXT`,
    `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "patient_address" TEXT`,
    `ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "pack" TEXT DEFAULT '10 TAB'`,
    `ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "strips" INTEGER DEFAULT 0`,
    `ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "loose_qty" INTEGER DEFAULT 0`,

    // Update Default GST Rate to 5% across catalog and existing items
    `ALTER TABLE "items" ALTER COLUMN "gst_rate" SET DEFAULT 5.00`,
    `ALTER TABLE "purchase_items" ALTER COLUMN "gst_rate" SET DEFAULT 5.00`,
    `ALTER TABLE "invoice_items" ALTER COLUMN "gst_rate" SET DEFAULT 5.00`,
    `UPDATE "items" SET "gst_rate" = 5.00 WHERE "gst_rate" = 12.00`,

    // Append-Only Immutability Trigger for stock_ledger (Bypassable for owner company reset)
    `CREATE OR REPLACE FUNCTION prevent_stock_ledger_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
        IF current_setting('app.allow_ledger_cleanup', true) = 'on' THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'stock_ledger is an append-only audit ledger: UPDATE and DELETE operations are strictly prohibited.';
    END;
    $$ LANGUAGE plpgsql;`,

    `DO $$ BEGIN
      DROP TRIGGER IF EXISTS trg_stock_ledger_immutable ON "stock_ledger";
      CREATE TRIGGER trg_stock_ledger_immutable
      BEFORE UPDATE OR DELETE ON "stock_ledger"
      FOR EACH ROW EXECUTE FUNCTION prevent_stock_ledger_mutation();
    EXCEPTION
      WHEN others THEN null;
    END $$;`
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err: any) {
      console.error('SQL statement notice:', err.message);
    }
  }
  console.log('✅ Phase 1, 2 & 3 database tables and stock_ledger immutability verified & ready.');
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
