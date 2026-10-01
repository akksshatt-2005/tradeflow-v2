-- CreateTable items
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable batches
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "mrp" DECIMAL(10,2) NOT NULL,
    "ptr" DECIMAL(10,2) NOT NULL,
    "pts" DECIMAL(10,2) NOT NULL,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable parties
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable stock_ledger
CREATE TABLE "stock_ledger" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "reference_id" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "items_company_id_sku_key" ON "items"("company_id", "sku");
CREATE INDEX "items_company_id_name_idx" ON "items"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "batches_company_id_item_id_batch_number_key" ON "batches"("company_id", "item_id", "batch_number");
CREATE INDEX "batches_company_id_expiry_date_idx" ON "batches"("company_id", "expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "parties_company_id_name_type_key" ON "parties"("company_id", "name", "type");
CREATE INDEX "parties_company_id_type_idx" ON "parties"("company_id", "type");

-- CreateIndex
CREATE INDEX "stock_ledger_company_id_item_id_idx" ON "stock_ledger"("company_id", "item_id");
CREATE INDEX "stock_ledger_company_id_batch_id_idx" ON "stock_ledger"("company_id", "batch_id");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "batches" ADD CONSTRAINT "batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
