# 🏥 TradeFlow v2 — Multi-Company Pharma ERP & POS System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.0-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**TradeFlow v2** is a production-grade, multi-tenant Enterprise Resource Planning (ERP) and Point of Sale (POS) system engineered specifically for retail pharmacies, pharmaceutical distributors, and multi-branch healthcare outlets. 

Built with **TypeScript, React 18, Node.js, Express, PostgreSQL, and Prisma**, it solves core domain challenges in the Indian healthcare supply chain: **Drug License (DL 20B/21B) compliance, Indian GST (CGST/SGST/IGST) calculations, FEFO (First-Expiry-First-Out) batch management, split-pack unit conversions (Strips + Loose Tablets), and immutable double-entry stock ledger auditing.**

---

## 🚀 Live Deployments

- 🌐 **Frontend (Vercel):** [tradeflow-v2-frontend.vercel.app](https://tradeflow-v2-frontend.vercel.app)
- ⚙️ **Backend API (Render):** [tradeflow-v2-1.onrender.com](https://tradeflow-v2-1.onrender.com)

---

## ✨ Key Engineering Highlights & Features

### 1. ⚡ High-Speed Retail POS Billing Terminal
- **Keyboard-First Design:** Optimized for rapid counter checkout with shortcuts (`[F1]` Doctor Selection, `[F2]` Patient / Complete Sale, `[F3]` Live Product Search, `[Ctrl+Enter]` Save & Print).
- **Strips + Loose Tablets Calculator:** Supports simultaneous billing of full strips (`STRI`) and individual loose units (`TAB.`) with automatic per-tablet price prorating based on medicine conversion factors.
- **Smart 10% Scheme Engine:** Automatically applies promotional discounts on bills exceeding ₹500 with instant manual override and reset capabilities.
- **Dual Invoicing Modes:** 
  - **Tax Invoice (GST):** Detailed HSN, CGST, SGST, IGST breakup.
  - **Retail Cash Memo (Non-GST):** Exempted / zero-tax retail receipts.
- **Instant Printable Slips:** Thermal and A4 voucher templates with pharmacy header, DL 20B/21B numbers, prescribing doctor MCI registration, and signature blocks.

### 2. 📦 Intelligent FEFO & Near-Expiry Batch Management
- **Automated FEFO Picking:** Dynamically auto-suggests batches with the earliest expiry dates to minimize pharmacy stock obsolescence.
- **Negative Stock Billing Support:** High-throughput counter checkout mode (similar to Marg ERP / Tally Prime) allowing billing even when physical stock arrival precedes inward data entry.
- **Live Expiry Health Badges:** Visual indicators classifying batches into **Valid**, **Expiring in < 90 Days**, and **Expired**.

### 3. 🔄 Comprehensive Credit Notes (CN) & Patient Returns Engine
- **Multi-Item Patient Returns:** Allows multi-medicine customer return slips with instant cash/credit refunds.
- **Supplier Credit Notes (`/credit-notes`):** Complete management module to create, modify (`PUT /api/purchase-returns/:id`), and cancel (`DELETE /api/purchase-returns/:id`) supplier returns.
- **Atomic Stock Restoration:** Deleting or altering a return atomically restores batch quantities in PostgreSQL, logs audit records, and reverses ledger balances in a single ACID transaction.

### 4. 🏢 Strict Multi-Tenancy & Company Isolation
- **Row-Level Tenant Isolation:** Every request is securely scoped by `companyId` verified via JWT and middleware.
- **Smart GSTIN Onboarding:** Automated firm legal name and trade name parsing during new company registration.
- **Supplier & Client Ledgers:** Tracks accounts payable/receivable, credit limits, opening balances, and real-time outstanding balance calculation.

### 5. 🔒 Reliability, Auditability & Performance
- **Immutable Stock Ledger:** Every single inventory movement (`PURCHASE`, `SALE`, `PURCHASE_RETURN`, `PATIENT_RETURN`, `ADJUSTMENT`) writes an immutable double-entry ledger entry.
- **Idempotency Keys:** Prevents duplicate financial transactions and double-billing on network retries.
- **React Error Boundaries:** Resilient client-side error boundaries prevent application crashes, offering immediate graceful fallback and reload options.
- **Automated DB Backup & Restore:** Built-in CLI scripts for encrypted snapshot backups and point-in-time recovery.

---

## 🛠️ Architecture & Tech Stack

```mermaid
flowchart TD
    Client["React 18 + Vite SPA (TypeScript)"] -->|REST API / JWT Session| Gateway["Express.js API Gateway"]
    
    subgraph Security ["Security & Isolation Layer"]
        Gateway --> Auth["JWT & Multi-Company Tenant Scoping"]
        Auth --> RateLimit["Rate Limiting & Idempotency Keys"]
    end
    
    subgraph BusinessEngine ["Pharma Core Business Logic"]
        RateLimit --> POS["POS Retail Billing Terminal"]
        RateLimit --> Purchases["Purchases & Inward Module"]
        RateLimit --> FEFO["FEFO & Batch Expiry Engine"]
        RateLimit --> Ledger["Immutable Double-Entry Stock Ledger"]
        RateLimit --> Returns["Credit Notes (CN) & Returns Engine"]
    end
    
    POS --> Prisma["Prisma ORM Client"]
    Purchases --> Prisma
    FEFO --> Prisma
    Ledger --> Prisma
    Returns --> Prisma
    
    Prisma --> DB[("PostgreSQL Database")]
```

| Layer | Technology | Key Libraries |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite | `lucide-react`, `xlsx`, `canvas-confetti`, Vanilla CSS Design System |
| **Backend** | Node.js, Express, TypeScript | `prisma`, `jsonwebtoken`, `bcryptjs`, `cors`, `helmet`, `dotenv` |
| **Database** | PostgreSQL 15+ | Prisma Schema with relational migrations & indexes |
| **Hosting** | Vercel (Frontend), Render (Backend), Supabase / Neon (PostgreSQL) | GitHub Actions Continuous Deployment |

---

## 📁 Repository Structure

```
├── backend/
│   ├── prisma/
│   │   ├── migrations/          # Version-controlled SQL database migrations
│   │   └── schema.prisma        # Database schema (Models, Relations, Enums)
│   ├── src/
│   │   ├── middleware/          # Auth, Company tenant scoping, Idempotency
│   │   ├── routes/              # REST Endpoints (Sales, Purchases, Items, Batches, CNs)
│   │   ├── scripts/             # Backup, Restore, Company Cleanup CLI tools
│   │   ├── utils/               # SKU generator, Rate limiters, Token helpers
│   │   └── server.ts            # Express server bootstrap & health checks
│   └── tsconfig.json
├── frontend/
│   ├── public/                  # Static assets & logos
│   ├── src/
│   │   ├── api/                 # Axios-like typed API client with company scoping
│   │   ├── components/          # Reusable UI (Modals, ErrorBoundary, Return Slips)
│   │   ├── context/             # AuthContext (User session, Active company state)
│   │   ├── pages/               # POSBilling, Sales, Purchases, CreditNotes, Medicines
│   │   ├── index.css            # Dark/Light pharma design system tokens
│   │   └── main.tsx             # React DOM entry point
│   └── vite.config.ts
├── DEPLOYMENT.md                # Cloud deployment guide (Render, Vercel, Supabase)
├── package.json                 # Monorepo workspace configuration
└── README.md                    # Project documentation
```

---

## 🚦 Getting Started Locally

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v15.0 or higher (or cloud connection like Neon/Supabase)
- **npm** or **pnpm**

### 1. Clone the Repository
```bash
git clone https://github.com/akksshatt-2005/tradeflow-v2.git
cd tradeflow-v2
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables

**Backend (`backend/.env`):**
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/tradeflow_v2?schema=public"
JWT_SECRET="your-super-secret-jwt-key"
CORS_ORIGIN="http://localhost:5173"
```

**Frontend (`frontend/.env`):**
```env
VITE_API_URL="http://localhost:5000"
```

### 4. Run Database Migrations
```bash
npm run prisma:migrate
```

### 5. Start Full-Stack Development Servers
```bash
npm run dev
```
- Frontend will be live at: `http://localhost:5173`
- Backend API will run at: `http://localhost:5000`

---

## 📊 Core API Endpoints

| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user & issue JWT session |
| `GET` | `/api/companies` | List all companies accessible to the user |
| `GET` | `/api/items` | List medicine catalog with active batch stock |
| `POST` | `/api/invoices` | Create a new retail POS / Tax invoice |
| `GET` | `/api/invoices/next-number` | Get next auto-incremented invoice number |
| `POST` | `/api/purchases` | Record supplier purchase inward & update batches |
| `GET` | `/api/purchase-returns` | Fetch all Credit Notes (CNs) & supplier returns |
| `PUT` | `/api/purchase-returns/:id` | Modify an existing CN with live stock recalculation |
| `DELETE` | `/api/purchase-returns/:id` | Cancel CN with atomic stock restoration |
| `POST` | `/api/patient-returns` | Process multi-medicine patient return & refund |

---

## 👨‍💻 Author

**Akshat Srivastava**
- Computer Science & Engineering
- GitHub: [@akksshatt-2005](https://github.com/akksshatt-2005)
- Repository: [tradeflow-v2](https://github.com/akksshatt-2005/tradeflow-v2)

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
