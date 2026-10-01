-- CreateTable: Invoices
CREATE TABLE IF NOT EXISTS "invoices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "party_id" TEXT,
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
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Invoice Items
CREATE TABLE IF NOT EXISTS "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
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
    "total_amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_company_id_invoice_number_key" ON "invoices"("company_id", "invoice_number");
CREATE INDEX IF NOT EXISTS "invoices_company_id_invoice_date_idx" ON "invoices"("company_id", "invoice_date");
CREATE INDEX IF NOT EXISTS "invoices_company_id_status_idx" ON "invoices"("company_id", "status");
CREATE INDEX IF NOT EXISTS "invoices_company_id_party_id_idx" ON "invoices"("company_id", "party_id");

CREATE INDEX IF NOT EXISTS "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_items_item_id_idx" ON "invoice_items"("item_id");
CREATE INDEX IF NOT EXISTS "invoice_items_batch_id_idx" ON "invoice_items"("batch_id");

-- Foreign Keys
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
