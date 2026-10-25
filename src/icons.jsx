// Small stroke icons (24px grid), inherit colour from the parent.
const P = {
  dash: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  inv: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  stk: 'M3 8l9-5 9 5-9 5zM3 8v8l9 5 9-5V8M12 13v8',
  pro: 'M4 20V10l5 3V9l5 3V6l6 3v11zM8 20v-4M13 20v-4',
  pur: 'M5 7h14l-1 12H6zM9 7a3 3 0 016 0',
  exp: 'M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5S10 10 12 10.5s4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5',
  ret: 'M9 7L4 12l5 5M4 12h10a6 6 0 010 12',
  rep: 'M5 20V10M12 20V4M19 20v-7',
  par: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 100-5M21 19c0-2.2-1.4-4-3.5-4.7',
  led: 'M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2zM9 9h6M9 13h6',
  cg: 'M3 7h18v12H3zM3 11h18M16 15h2',
  bank: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5',
  moon: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z',
  sync: 'M20 11a8 8 0 00-14-4M4 4v4h4M4 13a8 8 0 0014 4M20 20v-4h-4',
  down: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  up: 'M12 20V8M7 13l5-5 5 5M5 4h14',
  warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  tax: 'M6 18L18 6M8 8h.01M16 16h.01',
}
export const Icon = ({ n }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={P[n] || P.dash} />
  </svg>
)
