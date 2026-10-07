// Knobs for the culture brain. Import-free and client-safe: the /culture legend prints every
// figure from here, and a moved constant moves the text and the tests with it.

import type {CultureSource, Listing} from "@/lib/culture/types";
import type {AllocatorRails} from "@/lib/navigator/config";
import type {MomentumMix} from "@/lib/navigator/scoring";

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

// --- The pickers: two profiles over one feature set, one shared account each ---

// Owner of every culture paper account. Never 'global' (SuggestionSet's owner) and never the
// strategies' sentinel: the strategies leaderboard loops its own catalog and must not find these.
export const CULTURE_OWNER_ID = 'system:culture';
export const CULTURE_STARTING_BALANCE = 100_000;
// Bump when the features, the scores, the rails or the simulator change meaning: the stored
// backtest is rebuilt on the next weekly run.
export const CULTURE_ENGINE_VERSION = '1';

// The tradable universe: distinct listed owners, US listings first, then NYSE/Nasdaq ADRs,
// then over-the-counter ADRs, cut here; each one's quote is checked weekly in bursts.
export const MAX_UNIVERSE_TICKERS = 150;
export const CULTURE_QUOTE_CHUNK = 25;
// Ten years of daily bars, so the backtest can cover five years after its warm-up.
export const CULTURE_BACKFILL_CALENDAR_DAYS = 2300;
// Bars older than this never reach a decision, live or simulated.
export const LIVE_LOOKBACK_CALENDAR_DAYS = 420;
export const MIN_PRICE_BARS = 126;
// Over-the-counter ADRs are verified live but never simulated: a quote check cannot be replayed.
export const BACKTEST_LISTINGS: readonly Listing[] = ['us', 'adr'];

// Picker features from the stored series (lib/culture/picker-features.ts).
// Surprise: the last four weeks' mean views against the brand's own median over the six
// months before them.
export const ATTENTION_RECENT_DAYS = 28;
export const ATTENTION_BASELINE_DAYS = 180;
export const ATTENTION_MIN_RECENT_POINTS = 14;
export const ATTENTION_MIN_BASELINE_POINTS = 90;
// Trend: the slope of log views over the last three months.
export const TREND_DAYS = 90;
export const TREND_MIN_POINTS = 60;
// Persistence: consecutive weeks a brand's mean views stayed above the median of the six
// months before each week, counted back from the latest week, capped.
export const PERSISTENCE_CAP_WEEKS = 26;
export const PERSISTENCE_MIN_WEEK_POINTS = 3;
// Press coverage: a brand's share of the catalog's news mentions over the last four weeks.
export const PRESS_WINDOW_DAYS = 28;
// Since the last earnings report: the mean views since it against the six months before it.
export const SINCE_REPORT_MIN_POINTS = 5;
// App rank: 1 at number one, 0 at this rank and beyond, from the latest chart day in a week.
export const APP_RANK_FLOOR = 200;
export const APP_RANK_RECENT_DAYS = 7;
// A ticker's brands are weighed by their attention baselines, no one brand past this share;
// its slow attention is the sum of its heaviest brands.
export const BRAND_SHARE_CAP = 0.5;
export const ATTENTION_TOP_BRANDS = 3;

// Price terms, as the Navigator ranks them.
export const CULTURE_MOMENTUM_MIX: MomentumMix = {r126: 0.5, r252: 0.3, r63: 0.2};
export const CULTURE_VOLATILITY_HAIRCUT = 0.8;
export const CULTURE_TOP_QUINTILE_FRACTION = 0.2;

export const CULTURE_TERMS = [
    'momentumLong', 'attentionAnomaly', 'attentionTrend', 'attentionPersistence', 'quietAttention',
    'categoryShare', 'attentionSinceReport', 'attentionSlow', 'thesis', 'sentimentSlow', 'appRank',
] as const;
export type CultureTerm = (typeof CULTURE_TERMS)[number];

// What a run has data for; a term whose feed is absent is zeroed and the rest renormalised, so
// a backtest on attention and price and a live run score on one scale.
export const CULTURE_FEEDS = ['price', 'wikipedia', 'mentions', 'press', 'appstore', 'earnings'] as const;
export type CultureFeed = (typeof CULTURE_FEEDS)[number];
export const TERM_FEEDS: Record<CultureTerm, readonly CultureFeed[]> = {
    momentumLong: ['price'],
    attentionAnomaly: ['wikipedia'],
    attentionTrend: ['wikipedia'],
    attentionPersistence: ['wikipedia'],
    quietAttention: ['wikipedia', 'press'],
    categoryShare: ['wikipedia'],
    attentionSinceReport: ['wikipedia', 'earnings'],
    attentionSlow: ['mentions'],
    thesis: ['mentions'],
    sentimentSlow: ['mentions'],
    appRank: ['appstore'],
};

export const PROFILE_IDS = ['spike', 'quiet', 'price'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export type PickerProfile = {
    id: ProfileId;
    label: string;
    // The shared paper account it trades; null for a backtest-only control.
    accountName: string | null;
    weights: Record<CultureTerm, number>;
};

// Spike follows attention that has just jumped: the obvious signal, kept as the control a
// reader can watch. Quiet follows attention that has lasted, that the press has not caught up
// with, that built since the last report, and that is taking share inside its category — the
// terms the market is slowest on. Price only is the backtest's baseline. Each sums to one.
export const CULTURE_PROFILES: Record<ProfileId, PickerProfile> = {
    spike: {
        id: 'spike',
        label: 'Spike',
        accountName: 'Culture Brain · Spike',
        weights: {
            momentumLong: 0.40, attentionAnomaly: 0.20, attentionTrend: 0.10, attentionSlow: 0.10, thesis: 0.10,
            sentimentSlow: 0.05, appRank: 0.05, attentionPersistence: 0, quietAttention: 0, categoryShare: 0, attentionSinceReport: 0,
        },
    },
    quiet: {
        id: 'quiet',
        label: 'Quiet',
        accountName: 'Culture Brain · Quiet',
        weights: {
            momentumLong: 0.35, attentionPersistence: 0.15, quietAttention: 0.15, categoryShare: 0.10, attentionSinceReport: 0.05,
            attentionSlow: 0.05, thesis: 0.10, sentimentSlow: 0.05, attentionAnomaly: 0, attentionTrend: 0, appRank: 0,
        },
    },
    price: {
        id: 'price',
        label: 'Price only',
        accountName: null,
        weights: {
            momentumLong: 1, attentionAnomaly: 0, attentionTrend: 0, attentionPersistence: 0, quietAttention: 0, categoryShare: 0,
            attentionSinceReport: 0, attentionSlow: 0, thesis: 0, sentimentSlow: 0, appRank: 0,
        },
    },
};

export const LIVE_PROFILES: readonly ProfileId[] = ['spike', 'quiet'];

// The rails both live pickers trade under, through the Navigator's own allocator: ten names at
// most fifteen percent each over a five-percent cash floor, so the cap binds only under seven
// picks; a thirty-percent hard stop, since mid caps already carry the volatility haircut.
export const CULTURE_RAILS: AllocatorRails = {
    maxPositions: 10,
    maxPositionWeight: 0.15,
    minCashWeight: 0.05,
    maxTradesPerWeek: 4,
    minHoldingTradingDays: 21,
    rebalanceBand: 0.05,
    entryScoreThreshold: 0.15,
    exitScoreThreshold: 0,
    hardStopDrawdown: 0.30,
};

// The backtest: five years of weekly decisions after a warm-up of daily bars.
export const SIM_RESULT_WEEKS = 260;
export const SIM_WARMUP_BARS = 260;
// The weekly rationale call's narratives, and the reasons a decision item keeps.
export const RATIONALE_NARRATIVES = 5;
export const REASONS_PER_ITEM = 6;
