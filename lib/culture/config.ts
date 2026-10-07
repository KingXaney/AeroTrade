// Knobs for the culture brain. Import-free and client-safe: the /culture legend prints every
// figure from here, and a moved constant moves the text and the tests with it.

import type {CultureSource} from "@/lib/culture/types";

// --- The daily sweep: what each source costs, whatever the catalog's size ---

// Wikipedia pageview requests per Inngest step (one request per brand), spaced this far apart.
export const WIKIPEDIA_CHUNK = 25;
export const WIKIPEDIA_REQUEST_GAP_MS = 100;
// A daily run asks for this many days back, so a late or failed day heals on the next run.
export const WIKIPEDIA_DAILY_LOOKBACK_DAYS = 10;
// The pageviews API's first day.
export const WIKI_DATA_START = '2015-07-01';
// The backfill reaches this far back: the backtest's five result years plus the warm-up the
// attention features need before the first decision.
export const CULTURE_BACKFILL_YEARS = 6.5;
// Brands per backfill step (one request per article title, the whole range at once).
export const BACKFILL_CHUNK = 10;

// Apple publishes the US charts at this size; the two charts are two keyless requests a day.
export const APP_STORE_CHART_SIZE = 100;

// YouTube's most-popular chart: fifty videos for one quota unit. Per-brand searches cost a
// hundred units each and are off unless CULTURE_YOUTUBE_SEARCH_PER_DAY says otherwise.
export const YOUTUBE_CHART_SIZE = 50;

// Posts read per youth subreddit per day (Reddit allows a hundred requests a minute).
export const CULTURE_SUBREDDIT_POST_LIMIT = 25;

// Google News: fixed queries, never one per brand; the items kept after matching.
export const CULTURE_NEWS_QUERY_CHUNK = 5;
export const CULTURE_NEWS_ITEM_CAP = 120;

// An item's stored body, and the cut of it the model is shown.
export const CULTURE_ITEM_BODY_CHARS = 1500;
export const CULTURE_QUEUE_BODY_CHARS = 600;

// --- The model's budget: fixed, never a function of the catalog ---

// Items per model call, and calls per day. On Gemini's free tier the day's twenty calls are
// shared by every job, so this brain spends three of them, first thing in the morning.
export const CULTURE_EXTRACTION_BATCH_SIZE = 20;
export const CULTURE_MAX_EXTRACTION_CALLS_PER_DAY = 3;
// What an item the model never read folds at, through its alias matches alone.
export const FALLBACK_IMPORTANCE = 0.2;
// Brands the model may tag per item, and brand names it may suggest per item.
export const CULTURE_MAX_BRANDS_PER_ITEM = 6;
export const CULTURE_MAX_NEW_BRANDS_PER_ITEM = 3;

// --- Attention folds: a series becomes mentions ---

// A Wikipedia day's surprise: the last week's mean views against the brand's own median over
// the three months before it, needing this many baseline days. A tripling folds at full
// importance; at or below the baseline nothing folds.
export const WIKI_RECENT_DAYS = 7;
export const WIKI_BASELINE_DAYS = 90;
export const WIKI_MIN_BASELINE_DAYS = 28;
export const ATTENTION_FULL_LOG_RATIO = Math.log(3);
// An App Store day's surprise: today's chart score (101 − rank) against the median of the
// previous three months (absent = 0); a fifty-place climb folds at full importance.
export const APPSTORE_BASELINE_DAYS = 90;
export const APPSTORE_FULL_CLIMB = 50;
export const WIKI_RELEVANCE = 1;
export const APPSTORE_RELEVANCE = 0.8;
// The series window the attention-fold step reads.
export const ATTENTION_FOLD_LOOKBACK_DAYS = 100;

// Every fold's importance is scaled by its source before the decay maths sees it: behaviour
// (what people look up, install, post) leads the press, so news is evidence more than signal.
export const SOURCE_FOLD_WEIGHTS: Record<CultureSource, number> = {
    wikipedia: 1,
    appstore: 0.8,
    reddit: 0.6,
    youtube: 0.5,
    social: 0.5,
    news: 0.2,
};

// --- The suggestions queue: names the model met that the catalog lacks ---

export const CULTURE_SUGGESTION_CAP = 200;
export const CULTURE_SUGGESTION_SAMPLES = 3;
export const CULTURE_SUGGESTION_NAME_CHARS = 40;

// The identity every keyless request carries (Wikimedia asks for a contact).
export const cultureUserAgent = (contact: string): string => `AeroTrade/1.0 (culture brain; contact ${contact})`;
