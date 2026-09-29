-- Add missing columns to parties table
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "station" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "account_group" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "balancing_method" TEXT NOT NULL DEFAULT 'BILL_BY_BILL';
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "opening_balance" DECIMAL(12,2) NOT NULL DEFAULT 0.0;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "opening_balance_type" TEXT NOT NULL DEFAULT 'CR';
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "mail_to" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "pincode" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "state_code" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'INDIA';
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "mobile" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "fax_no" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "contact_person" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "designation" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "fssai_no" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "fssai_expiry_date" TIMESTAMP(3);
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "pan_no" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "schedule_h_notice" TEXT NOT NULL DEFAULT 'ALLOW_ALL';
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "hold_payment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "ledger_category" TEXT NOT NULL DEFAULT 'REGISTERED';
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "default_doctor_name" TEXT;
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "default_doctor_reg_no" TEXT;

-- Add pack column to purchase_items
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "pack" TEXT DEFAULT '10 TAB';

-- Add missing columns to invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "doctor_reg_no" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "patient_address" TEXT;

-- Add missing columns to invoice_items
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "pack" TEXT DEFAULT '10 TAB';
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "strips" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "loose_qty" INTEGER NOT NULL DEFAULT 0;

-- Enforce Immutability on stock_ledger table via PostgreSQL Trigger
CREATE OR REPLACE FUNCTION prevent_stock_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'stock_ledger is an append-only audit ledger: UPDATE and DELETE operations are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_ledger_immutable ON "stock_ledger";
CREATE TRIGGER trg_stock_ledger_immutable
BEFORE UPDATE OR DELETE ON "stock_ledger"
FOR EACH ROW EXECUTE FUNCTION prevent_stock_ledger_mutation();
