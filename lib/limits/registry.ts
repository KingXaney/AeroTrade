// The outside services the app calls that meter it — every provider with a quota, a rate or a
// budget the app can run into — as one import-free registry: what the app uses each for, the cap
// as the provider publishes it (a sentence with its window, dated), where the cap is documented,
// and what the app plans to spend on it a day at most, from the jobs' own constants. The tracker
// (lib/limits/record.ts) files a hit against one of these ids, and the panel
// (components/limits/LimitsPanel) prints a row per id whether it was hit or not.
//
// A cap written here is the provider's published figure on the day noted, never a measurement:
// the panel says "as published", and a changed plan or tier changes the sentence, not the code
// that counts hits.

// How long a recorded hit is kept (the model's TTL index reads it).
export const LIMIT_RETENTION_DAYS = 45;

export const LIMIT_PROVIDER_IDS = [
    'gemini', 'anthropic', 'finnhub', 'yahoo', 'stooq', 'tiingo', 'wikipedia', 'app-store', 'reddit', 'youtube',
    'google-news', 'sec', 'arxiv', 'huggingface', 'mailer', 'inngest',
] as const;

export type LimitProviderId = (typeof LIMIT_PROVIDER_IDS)[number];

export type LimitKind = 'quota' | 'rate' | 'auth' | 'outage';

export type LimitProvider = {
    id: LimitProviderId;
    label: string;
    // What the app calls it for, in one clause.
    uses: string;
    // The published cap with its window, and the day it was read.
    cap: string;
    capAsOf: string;
    docsUrl: string;
    // The app's own planned use a day at most, from the jobs' constants; null when the app's
    // use is not scheduled (a reader's click, a cache miss).
    planned: string | null;
    // The jobs (lib/jobs/registry ids) that call it; [] for request-path reads.
    jobs: readonly string[];
    // Where its counters live when the app cannot read them: the provider's own dashboard.
    dashboardUrl?: string;
};

export const LIMIT_PROVIDERS: readonly LimitProvider[] = [
    {
        id: 'gemini', label: 'Gemini', uses: 'every model call: extraction, briefs, the digest, rationales, the lab digest, the chat',
        cap: 'free tier: 20 requests a day per model (gemini-2.5-flash-lite), 15 a minute; a billed project lifts the daily cap', capAsOf: '2026-10-12',
        docsUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
        planned: 'about 14–16 calls a weekday before the chat: culture ≤3 (+2 Mon/Tue), brain ≤8, briefing 1, topic briefs ≤20 (stop on quota), digest 1 per reader, lab 1',
        jobs: ['culture-brain-update', 'culture-brain-weekly', 'daily-brain-update', 'generate-market-briefing', 'generate-topic-briefs', 'daily-news-summary', 'lab-daily-papers', 'ai-navigator-weekly', 'ai-navigator-bootstrap', 'sign-up-email'],
        dashboardUrl: 'https://aistudio.google.com/usage',
    },
    {
        id: 'anthropic', label: 'Anthropic', uses: 'the model calls when AI_TIER is basic or pro, and the Second Opinion',
        cap: 'per-organisation requests and tokens a minute by usage tier (tier 1: 50 requests a minute); a monthly spend limit', capAsOf: '2026-10-12',
        docsUrl: 'https://docs.anthropic.com/en/api/rate-limits', planned: null, jobs: ['claude-second-opinion'],
        dashboardUrl: 'https://console.anthropic.com/settings/limits',
    },
    {
        id: 'finnhub', label: 'Finnhub', uses: 'live quotes, company profiles and financials, symbol search, company news, the earnings calendar',
        cap: 'free plan: 60 API calls a minute, 30 a second', capAsOf: '2026-10-12',
        docsUrl: 'https://finnhub.io/docs/api/rate-limit',
        planned: 'the quant strategies and the culture pickers quote their universes in chunks of 25 with a pause; every fill and the trade desk quote once',
        jobs: ['strategies-daily', 'culture-brain-weekly', 'ai-navigator-weekly', 'ai-navigator-bootstrap', 'culture-follow-bootstrap', 'daily-news-summary'],
    },
    {
        id: 'yahoo', label: 'Yahoo Finance', uses: 'daily bars, dividends, the T-bill rate and the SPY total-return index (the chart endpoint, unofficial)',
        cap: 'no published limit; the chart endpoint answers 429 under a burst (the events parameter drew one)', capAsOf: '2026-10-12',
        docsUrl: 'https://query1.finance.yahoo.com/', planned: 'one chart read per symbol per job run; a full history only on a backfill',
        jobs: ['strategies-daily', 'daily-account-income', 'culture-brain-weekly', 'daily-account-snapshots'],
    },
    {
        id: 'stooq', label: 'Stooq', uses: 'daily bars when Yahoo fails (the fallback)',
        cap: 'no published limit; the CSV endpoint blocks an address after a burst and then answers an empty file', capAsOf: '2026-09-21',
        docsUrl: 'https://stooq.com/', planned: 'only on a Yahoo miss', jobs: ['strategies-daily', 'daily-account-income'],
    },
    {
        id: 'tiingo', label: 'Tiingo', uses: "SPY's history for the momentum terrain",
        cap: 'free plan: 50 requests an hour, 1,000 a day, 500 unique symbols a month', capAsOf: '2026-10-06',
        docsUrl: 'https://www.tiingo.com/about/pricing', planned: 'one read of SPY an hour at most (cached by Next for an hour)', jobs: [],
    },
    {
        id: 'wikipedia', label: 'Wikipedia', uses: "every catalog brand's daily pageviews (the REST pageviews API)",
        cap: 'an identified bot (a User-Agent with a contact) may send 200 requests a minute, an unidentified client 10, at most three at once; a refusal names its wait', capAsOf: '2026-10-24',
        docsUrl: 'https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits', planned: 'one request per title a day (about 280), one every 350 ms; a brand without its history asks the whole window in that one request; the backfill on demand', jobs: ['culture-brain-update', 'culture-wikipedia-backfill'],
    },
    {
        id: 'app-store', label: 'App Store', uses: "the US free and paid charts (Apple's RSS marketing feed)",
        cap: 'no published limit', capAsOf: '2026-10-07', docsUrl: 'https://rss.marketingtools.apple.com/', planned: 'two reads a day', jobs: ['culture-brain-update'],
    },
    {
        id: 'reddit', label: 'Reddit', uses: 'posts from the youth subreddits and the news feed (OAuth, a script app)',
        cap: '100 queries a minute per OAuth client, averaged over ten minutes', capAsOf: '2026-10-12',
        docsUrl: 'https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki', planned: 'one listing per subreddit a day for the culture brain; the news feed per reader request, cached', jobs: ['culture-brain-update', 'daily-news-summary'],
    },
    {
        id: 'youtube', label: 'YouTube', uses: 'the most-popular chart and per-brand searches (the Data API)',
        cap: '10,000 units a day per project: a chart read costs 1, a search 100', capAsOf: '2026-10-12',
        docsUrl: 'https://developers.google.com/youtube/v3/getting-started#quota', planned: 'one chart read a day plus CULTURE_YOUTUBE_SEARCH_PER_DAY searches (100 units each)', jobs: ['culture-brain-update'],
        dashboardUrl: 'https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas',
    },
    {
        id: 'google-news', label: 'Google News', uses: 'the news feed and the topics (the RSS search feed)',
        cap: 'no published limit; a burst is answered with a consent page or a 429', capAsOf: '2026-09-25',
        docsUrl: 'https://news.google.com/rss', planned: 'one search per topic every three hours, cached by Next', jobs: ['refresh-topic-feeds', 'refresh-topic-on-demand', 'fill-first-run-topics', 'daily-news-summary'],
    },
    {
        id: 'sec', label: 'SEC EDGAR', uses: "the reader's symbols' recent filings",
        cap: 'fair-access policy: at most 10 requests a second with a declared User-Agent; over it the address is blocked for ten minutes', capAsOf: '2026-09-17',
        docsUrl: 'https://www.sec.gov/os/accessing-edgar-data', planned: 'sequential reads per symbol, cached by Next', jobs: ['daily-news-summary'],
    },
    {
        id: 'arxiv', label: 'arXiv', uses: "the lab's daily listings per track and the id lookups",
        cap: 'the API asks for one request every three seconds; a burst is answered 429 or 503', capAsOf: '2026-10-12',
        docsUrl: 'https://info.arxiv.org/help/api/tou.html', planned: 'four reads a weekday, three seconds apart', jobs: ['lab-daily-papers'],
    },
    {
        id: 'huggingface', label: 'Hugging Face', uses: "the lab's daily papers lists",
        cap: 'no published limit for the daily papers endpoint', capAsOf: '2026-10-12',
        docsUrl: 'https://huggingface.co/docs/hub/api', planned: 'two reads a weekday', jobs: ['lab-daily-papers'],
    },
    {
        id: 'mailer', label: 'Mailer (Gmail SMTP)', uses: 'the daily brief, the welcome and the reset emails',
        cap: 'a Gmail account sends to at most 500 recipients a day over SMTP; Workspace accounts 2,000', capAsOf: '2026-10-05',
        docsUrl: 'https://support.google.com/mail/answer/22839', planned: 'one brief per opted-in reader a day, plus sign-ups and resets', jobs: ['daily-news-summary', 'sign-up-email'],
    },
    {
        id: 'inngest', label: 'Inngest', uses: 'every background job and its steps',
        cap: 'free plan: 50,000 step runs a month, 5 concurrent steps, a 7-day event history', capAsOf: '2026-10-12',
        docsUrl: 'https://www.inngest.com/pricing', planned: 'about 10,000–14,000 step runs a month after the culture brain', jobs: [],
        dashboardUrl: 'https://app.inngest.com/',
    },
];

export const limitProvider = (id: LimitProviderId): LimitProvider => LIMIT_PROVIDERS.find((p) => p.id === id) as LimitProvider;

export const isLimitProviderId = (value: unknown): value is LimitProviderId => typeof value === 'string' && (LIMIT_PROVIDER_IDS as readonly string[]).includes(value);
