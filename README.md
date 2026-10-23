# E.C Commutator — React app

GST billing, production and inventory for a commutator manufacturer. Rebuilt in React from
`EC-Commutator-App-Notes-Main-App-Only.md`. Plain JavaScript, Vite, data kept in `localStorage`
(key `booksmith10`, same shape as the notes: `{ biz: [...], cur }`).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static files in dist/
npm run check    # compares the §9 demo figures with the notes
```

In the app: **Manage → Load E.C Commutators demo data**, then **Reports → Guide check**.

## What's in it

Invoices (INV-/BILL-, CGST+SGST or IGST, LR number), Inventory (derived stock, moving-average
cost, editable BOM), Production, Purchases, Expenses, Returns & rejects, Customers & suppliers,
Banking (bank / cash / GPay), Ledgers with PDF statements, Reports (overview, monthly chart,
daybook, balance sheet, trial balance), Cash & GPay people (view + pins), firm/person business
rules, JSON export/import, PDF import for invoices and purchases (see `docs/pdf-import.md`), a save toaster, and optional Firebase sign-in with cloud sync.

See `DEPLOY.md` for GitHub Pages + Firebase setup and `npm test` / `npm run test:e2e` for tests.

## Layout

- `src/lib/calc.js` — GST (`taxOf`), stock and costing (`valuation`), balances, report numbers (`calc`)
- `src/lib/model.js` — business shape, default items and BOM, `fixBiz` migration
- `src/lib/store.jsx` — state + localStorage persistence; `src/toast.jsx` — save toasts
- `src/lib/reports.js`, `pdf.js`, `backup.js`, `rules.js` — statements, reports, PDF, import/export, business rules
- `src/lib/sync.js`, `firebase.js`, `src/cloud.jsx` — cloud sync (merge, offline, conflicts) and sign-in
- `src/lib/seed.js` — §9 demo data and expected figures
- `src/tabs/*` — one file per tab

## Domain rules kept from the notes

Persons: BILL-, no GST, cash/GPay. Firms: INV-, 18% GST, bank only. Stock and reports are
always computed from the arrays, never stored.

## Note on the BOM

The notes don't give the bill of materials. The default one in `model.js` is a placeholder; its
copper quantity is calibrated so the demo reproduces the guide's profit and closing stock.
Edit the real BOM under Inventory → BOM.
