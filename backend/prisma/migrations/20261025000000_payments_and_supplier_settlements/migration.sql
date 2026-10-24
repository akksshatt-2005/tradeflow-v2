-- Migration: Create payments and supplier_settlements tables

-- CreateTable: payments
CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "purchase_id" TEXT,
    "invoice_id" TEXT,
    "voucher_no" TEXT NOT NULL,
    "payment_type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_mode" TEXT NOT NULL DEFAULT 'CASH',
    "reference_no" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: supplier_settlements
CREATE TABLE IF NOT EXISTS "supplier_settlements" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "settlement_number" TEXT NOT NULL,
    "manufacturer" TEXT,
    "supplier_id" TEXT,
    "period_start_date" TIMESTAMP(3) NOT NULL,
    "period_end_date" TIMESTAMP(3) NOT NULL,
    "gross_sold_units" INTEGER NOT NULL DEFAULT 0,
    "returned_units" INTEGER NOT NULL DEFAULT 0,
    "net_sold_units" INTEGER NOT NULL DEFAULT 0,
    "gross_payable_cost" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "return_deduction" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "net_payable_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "retail_sales_value" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "realized_margin" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "payment_mode" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "payment_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SETTLED',
    "settlement_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item_details" JSONB,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "payments_company_id_party_id_idx" ON "payments"("company_id", "party_id");
CREATE INDEX IF NOT EXISTS "payments_company_id_payment_date_idx" ON "payments"("company_id", "payment_date");
CREATE INDEX IF NOT EXISTS "payments_company_id_purchase_id_idx" ON "payments"("company_id", "purchase_id");
CREATE INDEX IF NOT EXISTS "payments_company_id_invoice_id_idx" ON "payments"("company_id", "invoice_id");

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_settlements_company_id_settlement_number_key" ON "supplier_settlements"("company_id", "settlement_number");
CREATE INDEX IF NOT EXISTS "supplier_settlements_company_id_settlement_date_idx" ON "supplier_settlements"("company_id", "settlement_date");
CREATE INDEX IF NOT EXISTS "supplier_settlements_company_id_manufacturer_idx" ON "supplier_settlements"("company_id", "manufacturer");
CREATE INDEX IF NOT EXISTS "supplier_settlements_company_id_supplier_id_idx" ON "supplier_settlements"("company_id", "supplier_id");

-- ForeignKeys
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_company_id_fkey') THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_party_id_fkey') THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_purchase_id_fkey') THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_invoice_id_fkey') THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_created_by_fkey') THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_settlements_company_id_fkey') THEN
        ALTER TABLE "supplier_settlements" ADD CONSTRAINT "supplier_settlements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_settlements_supplier_id_fkey') THEN
        ALTER TABLE "supplier_settlements" ADD CONSTRAINT "supplier_settlements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_settlements_created_by_fkey') THEN
        ALTER TABLE "supplier_settlements" ADD CONSTRAINT "supplier_settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE IF EXISTS "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "supplier_settlements" ENABLE ROW LEVEL SECURITY;
