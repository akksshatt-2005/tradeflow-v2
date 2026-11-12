# Frontend Design Audit & Anti-AI Slop Guidelines
**Project:** Trade Flow v2 — Pharmacy ERP & Medical Billing System  
**Audit Date:** November 9, 2026  
**Status:** Audit Complete — Remediation Plan Ready  

---

## 1. Executive Summary

This audit evaluates the frontend codebase against the **Pharma ERP Design Standards** ([`GEMINI.md`](./GEMINI.md)) and the **Avoid AI Design** framework. 

### Core Design Philosophy
A pharmacy billing and inventory system is high-throughput, mission-critical enterprise software. It must prioritize:
* **High Information Density:** Dense data grids, readable typography, and compact spacing.
* **Keyboard-First Ergonomics:** Rapid item scanning, quick lot selection, and predictable form navigation.
* **High Contrast & Reliability:** Clean neutral backgrounds, crisp 1px borders, and zero decorative motion or distractions.
* **Domain Authenticity:** Healthcare slate, surgical blue, and clinical teal palettes—avoiding generic SaaS marketing gradients or playful AI sparkle emojis.

---

## 2. Identified AI Design Tells (Categorized)

### 🚨 P0: Critical Tells (First-Order AI Tropes)
These are immediate giveaways of unrefined, template-generated frontend code.

| File | Line(s) | Current Pattern | Issue |
| :--- | :--- | :--- | :--- |
| [`frontend/src/pages/Dashboard.tsx`](./frontend/src/pages/Dashboard.tsx) | 1550 | `linear-gradient(135deg, #4338ca 0%, #6366f1 100%)` | Generic purple-to-indigo gradient on the Supplier Return submit button. Breaks healthcare theme. |
| [`frontend/src/pages/Dashboard.tsx`](./frontend/src/pages/Dashboard.tsx) | 952 | `linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.2) 100%)` | Indigo-tinted action card with `border: '2px solid #6366f1'` standing out incoherently against the clinical slate theme. |

---

### ⚠️ P1: Moderate Tells (Second-Order AI Tropes & Decorative Fluff)
These patterns add visual clutter, reduce credibility, or mimic consumer landing pages.

| File | Line(s) | Current Pattern | Issue |
| :--- | :--- | :--- | :--- |
| [`frontend/src/pages/SelectCompany.tsx`](./frontend/src/pages/SelectCompany.tsx) | 409–411, 630 | `<Sparkles size={15} color="#0284c7" />` + `⚡ Instant GSTIN Autofill` | Sparkles and lightning emojis make a government API lookup look like an experimental AI gimmick. |
| [`frontend/src/pages/NewPurchase.tsx`](./frontend/src/pages/NewPurchase.tsx) | 1586 | `<Sparkles size={10} /> Auto-Save` | Sparkles on a background draft saver. |
| [`frontend/src/pages/NewPurchase.tsx`](./frontend/src/pages/NewPurchase.tsx) | 2173 | `<Sparkles size={11} /> Will Auto-Catalog to Master` | Sparkles icon on inventory master cataloging. |
| [`frontend/src/pages/Dashboard.tsx`](./frontend/src/pages/Dashboard.tsx) | 916–964 | `transform: 'translateY(-3px)'` + `boxShadow: '0 8px 20px rgba(13, 148, 136, 0.25)'` | SaaS landing page "card lift" effect with colored neon drop shadows. Unfit for an ERP workstation. |
| [`frontend/src/pages/Dashboard.tsx`](./frontend/src/pages/Dashboard.tsx) | 758–852 | `linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)` | Subtle vertical gradients on metric summary cards wash out numerical contrast. |
| Multiple Modals | Various | `borderRadius: '16px'` | Bubbly oversized modal corners. Enterprise ERP standard is `6px`–`8px`. |

---

## 3. Before vs. After Code Remediation

### Item 1: Action Cards in Dashboard (`Dashboard.tsx`)
#### ❌ Before (Decorative AI Slop)
```tsx
// Floating animation, colored neon glow, 2px colored border
<div
  className="card"
  style={{
    cursor: 'pointer',
    padding: '20px',
    borderRadius: '12px',
    border: '2px solid #0d9488',
    background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(13, 148, 136, 0.2) 100%)',
    boxShadow: '0 4px 14px rgba(13, 148, 136, 0.15)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
  }}
  onMouseEnter={e => {
    e.currentTarget.style.transform = 'translateY(-3px)';
    e.currentTarget.style.boxShadow = '0 8px 20px rgba(13, 148, 136, 0.25)';
  }}
  onMouseLeave={e => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = '0 4px 14px rgba(13, 148, 136, 0.15)';
  }}
>
```

#### ✅ After (Crisp, High-Density ERP)
```tsx
// Flat surface, 1px neutral border, subtle border-color hover transition
<div
  className="card"
  style={{
    cursor: 'pointer',
    padding: '16px 18px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    transition: 'border-color 0.12s ease'
  }}
  onMouseEnter={e => {
    e.currentTarget.style.borderColor = '#0f766e';
  }}
  onMouseLeave={e => {
    e.currentTarget.style.borderColor = '#cbd5e1';
  }}
>
```

---

### Item 2: GSTIN Autofill Banner (`SelectCompany.tsx`)
#### ❌ Before (Emoji + Sparkle Tell)
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
  <Sparkles size={15} color="#0284c7" />
  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0369a1' }}>
    ⚡ Instant GSTIN Autofill (Optional)
  </span>
</div>
```

#### ✅ After (Functional Enterprise Label)
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
  <Building2 size={15} color="#0284c7" />
  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
    GSTIN Portal Lookup (Optional)
  </span>
</div>
```

---

### Item 3: Supplier Return Submit Button (`Dashboard.tsx`)
#### ❌ Before (Indigo Gradient)
```tsx
background: (suppReturnItems.length === 0 || !selectedSupplierId) 
  ? '#94a3b8' 
  : 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)'
```

#### ✅ After (Consistent Brand Teal)
```tsx
background: (suppReturnItems.length === 0 || !selectedSupplierId) 
  ? '#94a3b8' 
  : '#0f766e'
```

---

### Item 4: Modal Border Radiuses
#### ❌ Before
```tsx
// MultiPatientReturnModal.tsx, NewPurchase.tsx, Settlements.tsx
borderRadius: '16px'
```

#### ✅ After
```tsx
// Aligned with --radius-lg design token
borderRadius: '8px'
```

---

## 4. Design System Tokens Enforcement

All components must source their styles strictly from the theme tokens in [`frontend/src/index.css`](./frontend/src/index.css):

```css
:root {
  /* Surfaces */
  --bg-page: #f8fafc;        /* App background */
  --bg-card: #ffffff;        /* Surface background */
  --bg-subtle: #f1f5f9;      /* Table alternate & secondary */
  
  /* Borders */
  --border-light: #e2e8f0;   /* Standard table & input border */
  --border-medium: #cbd5e1;  /* Focus & active card border */
  --border-focus: #0284c7;   /* Selected input border */

  /* Palette */
  --brand-teal: #0f766e;     /* Primary pharmacy brand action */
  --primary: #0284c7;        /* System primary accent */
  --primary-hover: #0369a1;  /* Primary hover state */
  --success: #16a34a;        /* Completed / In Stock */
  --warning: #d97706;        /* Near Expiry / Partial */
  --danger: #dc2626;         /* Expired / Due / Cancelled */

  /* Geometry & Elevation */
  --radius-sm: 4px;          /* Badges and pills */
  --radius-md: 6px;          /* Inputs and buttons */
  --radius-lg: 8px;          /* Cards and dialog modals */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}
```

---

## 5. Ongoing Quality Checklist

For any upcoming UI feature or refactoring:
- [ ] No `linear-gradient` used for background actions or metric cards.
- [ ] No `Sparkles` icons used for non-generative features (auto-save, API lookup, cataloging).
- [ ] No `translateY(-3px)` or glowing drop shadows on card hovers.
- [ ] Modals and cards constrained to `8px` (`--radius-lg`) border radius.
- [ ] Tables use dense padding (`6px 10px` or `8px 12px`) with mono alignment for all numeric figures.
- [ ] Browser spin-buttons suppressed on all numeric inputs.

