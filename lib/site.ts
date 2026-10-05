// The product's name and its one public address. Import-free, so the email layout, the job
// registry and the scripts can all read it.
//
// Production email links come from PRODUCTION_URL, not from an environment variable: Vercel's
// sensitive variables cannot be read back, so a stale BETTER_AUTH_URL (the project's first
// domain, say) would go on printing in every email unseen. Everywhere else (local dev, the QA
// harness, a preview build) the app's own BETTER_AUTH_URL still names the address it runs at.

export const SITE_NAME = 'AeroTrade';
export const PRODUCTION_URL = 'https://aerotrading.vercel.app';

// process.env, or a test's own: only VERCEL_ENV and BETTER_AUTH_URL are read.
type SiteEnv = Readonly<Record<string, string | undefined>>;

export const siteUrl = (env: SiteEnv = process.env): string => {
    if (env.VERCEL_ENV === 'production') return PRODUCTION_URL;
    return (env.BETTER_AUTH_URL ?? '').trim().replace(/\/+$/, '') || 'http://localhost:3000';
};

// A Vercel preview build (one per pushed branch) shares the production database and mailer, and
// the Inngest integration syncs each one into a branch environment of its own. So a preview
// schedules no cron and sends no email: only production and a local dev server do.
export const isPreviewBuild = (env: SiteEnv = process.env): boolean => env.VERCEL_ENV === 'preview';
