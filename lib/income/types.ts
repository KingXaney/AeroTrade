// What an account has earned from interest and dividends, as the pages read it.

// What an account has earned from sitting still: interest on idle cash and dividends on
// holdings (lib/income/accrual.ts). `apy` is today's rate on cash; null before any rate
// has been fetched.
export type AccountIncomeSummary = {
    interest: number;
    dividends: number;
    apy: number | null;
    through: string | null;
};
