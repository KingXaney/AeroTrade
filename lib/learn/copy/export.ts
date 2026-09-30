// Copy for the CSV export link beside a strategy page's live trade log
// (app/(root)/strategies/[slug]/page.tsx → /api/strategies/[slug]/export). The link's label and
// the title that says what the file holds. The test holds both to the 'copy' tier of
// lib/learn/banned.ts. Import-free.

export const EXPORT_COPY = {
    label: 'Export CSV',
    strategyTitle: (name: string): string => `Every live fill of ${name} since its account opened, one row per fill, as a CSV file`,
} as const;
