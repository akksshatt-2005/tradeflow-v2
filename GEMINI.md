# Pharmacy ERP Design & Code Standards

## Frontend Design Guidelines (Anti-AI Slop)
- **Design Philosophy:** Dense, compact, high-contrast Medical/Pharmacy ERP system.
- **Banned AI Tropes:**
  - DO NOT use generic purple-to-indigo gradients (`from-purple-* to-indigo-*`).
  - DO NOT use decorative 3-card centered hero layouts or fake floating badges (`✨ AI-powered`).
  - DO NOT use excessive `rounded-3xl` or heavy drop shadows on data tables or inputs.
  - DO NOT use unfunctional glassmorphism or pulsing status indicators.
- **Enforced Standards:**
  - Adhere strictly to the design tokens in `frontend/src/index.css` (`--bg-page: #f8fafc`, `--border-light: #e2e8f0`, `--brand-teal: #0f766e`).
  - Tables and forms must be compact, dense, and optimized for rapid keyboard data entry.
  - Numerical inputs must suppress browser spin-buttons and align numbers properly.
  - Printable documents (like Tax Invoices) must follow A4 ERP borders and continuous vertical lines.

