---
name: avoid-ai-design
description: Audit and rewrite frontend UI to remove generic AI design patterns ("AI slop"), both first-order defaults (purple gradients, universal Inter, centered hero over three cards, untouched shadcn) and second-order "tasteful AI" ones (cream with terracotta, near-black with acid green, all-caps mono chrome, one accented headline word, decorative 01/02/03). Use when asked to "de-slop a UI", "make a design look less AI-generated", "audit a page or component for AI design tells", or keep a multi-page site on one design system.
---

# Avoid AI Design: Audit & Rewrite

You are reviewing frontend code to find patterns that make a UI look AI-generated ("AI slop"), then rewriting it around an intentional, domain-specific design direction.

## The Two Orders of AI Defaults

1. **First-Order Defaults (The Generic AI Median):**
   - Purple-to-indigo or violet gradients (`bg-gradient-to-r from-purple-* to-indigo-*`)
   - Centered hero section directly above three identical icon cards
   - Floating pill badges with sparkle emojis (`✨ Powered by AI`)
   - Indiscriminate use of `rounded-2xl` / `rounded-3xl` and heavy drop shadows on every card
   - Reflexive glassmorphism (`backdrop-blur-md bg-white/10`)
   - Universal unconfigured font defaults (`Inter` on everything)

2. **Second-Order Defaults (The "Tasteful" AI Counter-Median):**
   - Warm cream background with terracotta or sage accents
   - Near-black background with acid-green neon accents
   - All-caps monospace metadata headers on every single element
   - Highlighting exactly one arbitrary word in a headline in a different color
   - Decorative index steps (`01 / 02 / 03`) that don't represent a true sequential workflow
   - Pulsing green status dots on non-live elements

---

## 4-Phase Audit & De-Slop Workflow

### Phase 1: Detect & Classify
Scan the requested components or files and categorize findings:
- **P0 (Critical Slop):** Purple gradients, generic 3-card hero, unconfigured template styling.
- **P1 (Subtle AI Clichés):** Cliché color schemes (cream/terracotta or black/acid-green), mono chrome everywhere, fake status pills, single-word color highlights.
- **P2 (Craft & Polish):** Overly uniform spacing, missing active/focus states, generic placeholder copy.

### Phase 2: Anchor to Reality (Domain First)
Never replace AI defaults with another AI default.
- **Ask what the subject is made of:** For a Medical / Pharmacy ERP system, UI must prioritize high-density data tables, clear numerical alignment, rapid keyboard entry, high contrast, and clean tabular borders over decorative fluff.
- **Reference existing design tokens:** In this project, anchor all UI directly to the tokens defined in `frontend/src/index.css` (`--bg-page`, `--border-light`, `--brand-teal`, `--primary`, `--text-main`).

### Phase 3: Execute the Rewrite
1. **Typography:** Match functional requirements (e.g. tabular numbers in monospace, legible system sans for dense data).
2. **Layouts:** Use asymmetrical, data-dense, or editorial layouts tailored to actual tasks (e.g., POS scanning bar, split batch tables).
3. **Purge Fake Polish:** Remove unneeded backdrop blurs, glow effects, or decorative step numbering.
4. **Colors:** Use high-contrast, functional palettes (success, warning, error, primary action).

### Phase 4: Output Format
When asked to audit or de-slop:
1. **Diagnosis:** Explain why the current code reads as generic or AI-generated.
2. **Intentional Direction:** Define the domain-specific design philosophy (e.g., "Dense Clinical ERP").
3. **Refactored Code:** Provide clean, production-ready React / Tailwind / CSS implementation adhering to the design direction.

