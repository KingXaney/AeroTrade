// Copy for the limits panel on /brain?view=system (components/limits/LimitsPanel): what the
// tracker shows about every outside service the app calls that meters it. Every sentence
// describes a count or a published cap and is held to the 'copy' tier; the panel never says
// the app is within a limit, only what was recorded.

import type {LimitKind, LimitProvider} from "@/lib/limits/registry";
import type {LimitState} from "@/lib/limits/view";

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const LIMIT_KIND_LABELS: Record<LimitKind, string> = {
    quota: 'quota',
    rate: 'rate limit',
    auth: 'key refused',
    outage: 'outage',
};

export const LIMIT_STATE_LABELS: Record<LimitState, string> = {
    'clear': 'no hit recorded',
    'hit-week': 'hit this week',
    'hit-today': 'hit today',
};

export const LIMITS_COPY = {
    heading: 'Limits',
    lead: 'Every outside service the app calls that meters it, with the cap it publishes and what the app plans to spend. A row lights when a job or a request ran into the cap — a quota spent, a rate, a key refused, an outage — as caught in the code; a service that fails silently records nothing.',
    columns: {provider: 'service', cap: 'published cap', planned: 'planned use', hits: 'hits', last: 'last hit'},
    capAsOf: (date: string): string => `as published ${date}`,
    hits: (today: number, week: number): string => `${plural(today, 'hit', 'hits')} today · ${plural(week, 'hit', 'hits')} in 7 days`,
    lastHit: (kind: LimitKind, ago: string, job: string | null): string => `${LIMIT_KIND_LABELS[kind]} · ${ago}${job ? ` · ${job}` : ''}`,
    noHit: 'no hit recorded in 7 days',
    plannedNone: 'on demand, not scheduled',
    jobsLine: (jobs: readonly string[]): string => (jobs.length > 0 ? `called by ${jobs.join(', ')}` : 'called on a request, not by a job'),
    docs: 'docs',
    dashboard: 'its dashboard',
    dashboardsNote: "Inngest's and Vercel's own counters are read on their dashboards; the app cannot read them.",
    vercelDashboard: 'https://vercel.com/dashboard/usage',
    retention: (days: number): string => `Hits are kept ${days} days.`,
    summary: (hitToday: number, hitWeek: number, total: number): string =>
        hitToday > 0 ? `${plural(hitToday, 'service', 'services')} hit today, ${hitWeek} this week, of ${total} tracked`
            : hitWeek > 0 ? `${plural(hitWeek, 'service', 'services')} hit this week, of ${total} tracked`
                : `no hit recorded this week across ${total} services`,
} as const;

// The provider's row as the panel prints its first line: label and what it is used for.
export const providerLine = (provider: Pick<LimitProvider, 'label' | 'uses'>): string => `${provider.label} — ${provider.uses}`;
