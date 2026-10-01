-- PharmaFlow v2 Database Schema (Supabase / PostgreSQL)

-- 1. Heartbeat Table (Rule F4)
-- Used for keeping Supabase active and preventing free-tier pausing
CREATE TABLE IF NOT EXISTS heartbeat (
  id INT PRIMARY KEY DEFAULT 1,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_name TEXT DEFAULT 'pharmaflow-backend',
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT single_row_heartbeat CHECK (id = 1)
);

-- 2. Idempotency Table (Rule F3)
-- Prevents duplicate billing and stock transactions during network retries/wake-ups
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  endpoint VARCHAR(255) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status_code INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- 3. Customers & Patients Directory
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  doctor_name VARCHAR(255),
  doctor_reg_no VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Medicine Master Directory
CREATE TABLE IF NOT EXISTS medicines (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  dosage_form VARCHAR(50) NOT NULL,
  manufacturer VARCHAR(255) NOT NULL,
  rack_location VARCHAR(50) DEFAULT 'R1-S1',
  hsn_code VARCHAR(20) DEFAULT '3004',
  gst_rate NUMERIC(5,2) DEFAULT 5.00,
  reorder_level INT DEFAULT 20,
  is_prescription_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_medicines_generic ON medicines(generic_name);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);

-- 5. Medicine Batches (Batch Tracking, Expiry & Stock Levels)
CREATE TABLE IF NOT EXISTS medicine_batches (
  id SERIAL PRIMARY KEY,
  medicine_id INT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  expiry_date DATE NOT NULL,
  mfg_date DATE,
  mrp NUMERIC(10,2) NOT NULL,
  purchase_price NUMERIC(10,2) NOT NULL,
  selling_price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  pack_size VARCHAR(50) DEFAULT '10 Tablets/Strip',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_batch_per_med UNIQUE (medicine_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_expiry ON medicine_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_medicine_id ON medicine_batches(medicine_id);

-- 6. Invoices / Billing Header
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INT REFERENCES customers(id),
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  doctor_name VARCHAR(255),
  subtotal NUMERIC(10,2) NOT NULL,
  discount_amount NUMERIC(10,2) DEFAULT 0.00,
  tax_amount NUMERIC(10,2) DEFAULT 0.00,
  net_total NUMERIC(10,2) NOT NULL,
  payment_mode VARCHAR(50) DEFAULT 'Cash',
  payment_status VARCHAR(50) DEFAULT 'Paid',
  idempotency_key VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_name);

-- 7. Invoice Line Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  medicine_id INT NOT NULL REFERENCES medicines(id),
  batch_id INT NOT NULL REFERENCES medicine_batches(id),
  medicine_name VARCHAR(255) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  expiry_date DATE NOT NULL,
  quantity INT NOT NULL,
  unit_mrp NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  gst_rate NUMERIC(5,2) DEFAULT 5.00,
  gst_amount NUMERIC(10,2) DEFAULT 0.00,
  total_price NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- 8. Stock Audit & Inventory Movement Ledger
CREATE TABLE IF NOT EXISTS stock_transactions (
  id SERIAL PRIMARY KEY,
  transaction_type VARCHAR(50) NOT NULL, -- 'INWARD_PURCHASE', 'SALE_INVOICE', 'RETURN', 'ADJUSTMENT'
  medicine_id INT NOT NULL REFERENCES medicines(id),
  batch_id INT REFERENCES medicine_batches(id),
  quantity INT NOT NULL,
  reference_id VARCHAR(100),
  idempotency_key VARCHAR(255),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_tx_medicine ON stock_transactions(medicine_id);
