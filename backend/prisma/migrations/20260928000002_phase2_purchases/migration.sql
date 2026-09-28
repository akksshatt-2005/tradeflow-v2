-- CreateTable purchases
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
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
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable purchase_items
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "free_quantity" INTEGER NOT NULL DEFAULT 0,
    "purchase_rate" DECIMAL(10,2) NOT NULL,
    "mrp" DECIMAL(10,2) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "taxable_value" DECIMAL(10,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 12.0,
    "gst_amount" DECIMAL(10,2) NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "purchases_company_id_supplier_id_invoice_number_key" ON "purchases"("company_id", "supplier_id", "invoice_number");
CREATE INDEX "purchases_company_id_purchase_date_idx" ON "purchases"("company_id", "purchase_date");
CREATE INDEX "purchases_company_id_status_idx" ON "purchases"("company_id", "status");

CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");
CREATE INDEX "purchase_items_item_id_idx" ON "purchase_items"("item_id");
CREATE INDEX "purchase_items_batch_id_idx" ON "purchase_items"("batch_id");

-- AddForeignKeys
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
