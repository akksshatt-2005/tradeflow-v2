-- PharmaFlow v2 Seed Data (Standard Pharmacy Inventory & Sample Customers)

-- Initial Heartbeat Record
INSERT INTO heartbeat (id, last_seen, service_name, metadata)
VALUES (1, NOW(), 'pharmaflow-backend', '{"version": "2.0.0", "status": "active"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET last_seen = NOW();

-- Customers / Patients
INSERT INTO customers (name, phone, email, doctor_name, doctor_reg_no) VALUES
('Rahul Sharma', '9876543210', 'rahul.sharma@example.com', 'Dr. Arvind Mehra', 'MCI-48291'),
('Priya Verma', '9811223344', 'priya.v@example.com', 'Dr. Sunita Rao', 'MCI-19283'),
('Amit Patel', '9922334455', 'amit.patel@example.com', 'Dr. R. K. Gupta', 'MCI-99214'),
('Sunita Devi', '9733445566', 'sunita.d@example.com', 'Dr. Arvind Mehra', 'MCI-48291'),
('Vikram Malhotra', '9655443322', 'vikram.m@example.com', 'Dr. Rajesh Nair', 'MCI-77312');

-- Medicines
INSERT INTO medicines (id, name, generic_name, category, dosage_form, manufacturer, rack_location, hsn_code, gst_rate, reorder_level, is_prescription_required) VALUES
(1, 'Dolo 650 Tablet', 'Paracetamol (650mg)', 'Analgesic & Antipyretic', 'Tablet', 'Micro Labs Ltd', 'R1-A1', '30049060', 12.00, 50, false),
(2, 'Augmentin 625 Duo Tablet', 'Amoxicillin (500mg) + Clavulanic Acid (125mg)', 'Antibiotic', 'Tablet', 'GlaxoSmithKline', 'R1-A2', '30041010', 12.00, 30, true),
(3, 'Pan 40 Tablet', 'Pantoprazole (40mg)', 'Gastrointestinal / Antacid', 'Tablet', 'Alkem Laboratories', 'R2-B1', '30049099', 12.00, 40, false),
(4, 'Azithral 500 Tablet', 'Azithromycin (500mg)', 'Antibiotic', 'Tablet', 'Alembic Pharmaceuticals', 'R1-A3', '30042099', 12.00, 25, true),
(5, 'Glycomet-GP 1 Tablet', 'Glimepiride (1mg) + Metformin (500mg)', 'Anti-Diabetic', 'Tablet', 'USV Pvt Ltd', 'R3-C1', '30049099', 12.00, 35, true),
(6, 'Telma 40 Tablet', 'Telmisartan (40mg)', 'Cardiovascular / Hypertension', 'Tablet', 'Glenmark Pharmaceuticals', 'R3-C2', '30049099', 12.00, 30, true),
(7, 'Montair-LC Tablet', 'Montelukast (10mg) + Levocetirizine (5mg)', 'Respiratory / Antiallergic', 'Tablet', 'Cipla Ltd', 'R2-B2', '30049099', 12.00, 40, false),
(8, 'Allegra 120mg Tablet', 'Fexofenadine (120mg)', 'Antiallergic', 'Tablet', 'Sanofi India Ltd', 'R2-B3', '30049099', 12.00, 20, false),
(9, 'Becosules Z Capsules', 'Vitamin B-Complex with Vitamin C & Zinc', 'Vitamins & Supplements', 'Capsule', 'Pfizer Ltd', 'R4-D1', '30045020', 18.00, 50, false),
(10, 'Ascoril D Plus Syrup 100ml', 'Dextromethorphan + Phenylephrine + Chlorpheniramine', 'Cough & Cold', 'Syrup', 'Glenmark Pharmaceuticals', 'R5-E1', '30049099', 12.00, 20, false),
(11, 'Shelcal 500 Tablet', 'Calcium (500mg) + Vitamin D3 (250 IU)', 'Vitamins & Supplements', 'Tablet', 'Torrent Pharmaceuticals', 'R4-D2', '30045020', 18.00, 40, false),
(12, 'Combiflam Tablet', 'Ibuprofen (400mg) + Paracetamol (325mg)', 'Analgesic & Anti-inflammatory', 'Tablet', 'Sanofi India Ltd', 'R1-A4', '30049060', 12.00, 60, false);

-- Adjust sequence for medicines
SELECT setval(pg_get_serial_sequence('medicines', 'id'), (SELECT MAX(id) FROM medicines));

-- Medicine Batches
INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, mfg_date, mrp, purchase_price, selling_price, quantity, pack_size) VALUES
(1, 'DLO-2601', '2027-08-31', '2026-01-15', 33.50, 22.00, 30.00, 240, '15 Tablets/Strip'),
(1, 'DLO-2598', '2026-11-30', '2025-10-10', 31.00, 20.50, 28.00, 60, '15 Tablets/Strip'),
(2, 'AUG-7721', '2027-05-31', '2025-11-20', 215.00, 160.00, 195.00, 85, '10 Tablets/Strip'),
(3, 'PAN-4410', '2027-12-31', '2026-02-01', 158.00, 110.00, 142.00, 150, '15 Tablets/Strip'),
(3, 'PAN-4390', '2026-10-31', '2025-08-15', 150.00, 105.00, 135.00, 25, '15 Tablets/Strip'),
(4, 'AZI-9920', '2027-09-30', '2026-01-05', 132.00, 92.00, 120.00, 90, '5 Tablets/Strip'),
(5, 'GLY-1102', '2027-04-30', '2025-12-10', 118.00, 80.00, 105.00, 110, '15 Tablets/Strip'),
(6, 'TEL-5541', '2027-10-31', '2026-01-22', 198.00, 140.00, 180.00, 95, '15 Tablets/Strip'),
(7, 'MON-3321', '2027-07-31', '2026-02-14', 185.00, 130.00, 168.00, 120, '10 Tablets/Strip'),
(8, 'ALL-8812', '2027-06-30', '2025-12-05', 210.00, 155.00, 190.00, 65, '10 Tablets/Strip'),
(9, 'BEC-1099', '2027-11-30', '2026-01-10', 48.00, 32.00, 45.00, 200, '20 Capsules/Strip'),
(10, 'ASC-4432', '2027-03-31', '2025-09-18', 125.00, 85.00, 115.00, 45, '100ml Bottle'),
(11, 'SHE-6651', '2027-12-31', '2026-02-20', 142.00, 98.00, 130.00, 130, '15 Tablets/Strip'),
(12, 'COM-0021', '2027-08-31', '2026-01-01', 45.00, 30.00, 40.00, 180, '20 Tablets/Strip');

-- Stock Transactions Initial Ledger
INSERT INTO stock_transactions (transaction_type, medicine_id, batch_id, quantity, reference_id, reason) VALUES
('INWARD_PURCHASE', 1, 1, 240, 'PO-2026-001', 'Initial Opening Stock Entry'),
('INWARD_PURCHASE', 2, 3, 85, 'PO-2026-001', 'Initial Opening Stock Entry'),
('INWARD_PURCHASE', 3, 4, 150, 'PO-2026-001', 'Initial Opening Stock Entry');
