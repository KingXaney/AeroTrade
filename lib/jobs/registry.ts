// The one list of scheduled and event-driven jobs. Import-free: scripts can load it with Node's
// type stripping, and the function wrappers (lib/jobs/functions/*), the senders, the status
// strip (lib/jobs/health.ts) and scripts/trigger.mjs's test all read it.
//
// NEVER rename an id, event or cron here: Inngest keys a function's runs and memoized steps
// on its id, and a renamed event or cron silently stops the job from firing.

type JobDefinition = {
    // The Inngest function id, and the JobRun key its completion stamp is written under.
    id: string;
    // The event that fires it (every job has one: crons included, so it can be fired by hand).
    event: string;
    // Cron triggers, in the order the function lists them after its event.
    crons: readonly string[];
    // `npm run trigger -- <name>` for the jobs scripts/trigger.mjs can fire without user data.
    trigger?: string;
    // The status strip's row, for a job that stamps a JobRun: its label, its cadence as people
    // read it, and how long after the last stamp it counts as stale (Infinity: on demand).
    health: {label: string; schedule: string; staleAfterHours: number} | null;
};

const ON_DEMAND = Number.POSITIVE_INFINITY;

export const JOBS = {
    signUpEmail: {
        id: 'sign-up-email',
        event: 'app/user.created',
        crons: [],
        health: null,
    },
    newsBrain: {
        id: 'daily-brain-update',
        event: 'app/update.news.brain',
        crons: ['TZ=America/New_York 30 7 * * *'],
        trigger: 'brain',
        health: {label: 'Brain update', schedule: 'daily 07:30 ET', staleAfterHours: 30},
    },
    newsDigest: {
        id: 'daily-news-summary',
        event: 'app/send.daily.news',
        crons: ['TZ=America/New_York 0 12 * * *'],
        trigger: 'news',
        health: {label: 'News email', schedule: 'daily 12:00 ET', staleAfterHours: 30},
    },
    // Weekdays only, so Monday morning is ~66h after Friday's run.
    snapshots: {
        id: 'daily-account-snapshots',
        event: 'app/record.daily.snapshots',
        crons: ['TZ=America/New_York 10 16 * * 1-5'],
        trigger: 'snapshots',
        health: {label: 'Account snapshots', schedule: 'weekdays 16:10 ET', staleAfterHours: 80},
    },
    navigatorWeekly: {
        id: 'ai-navigator-weekly',
        event: 'app/run.ai.navigator',
        crons: ['TZ=America/New_York 0 10 * * 1'],
        trigger: 'navigator',
        health: {label: 'AI navigator (weekly)', schedule: 'Mondays 10:00 ET', staleAfterHours: 8 * 24},
    },
    navigatorBootstrap: {
        id: 'ai-navigator-bootstrap',
        event: 'app/bootstrap.ai.navigator',
        crons: [],
        health: {label: 'AI run (manual/enroll)', schedule: 'on demand', staleAfterHours: ON_DEMAND},
    },
    secondOpinion: {
        id: 'claude-second-opinion',
        event: 'app/generate.second.opinion',
        crons: [],
        health: {label: 'Claude second opinion', schedule: 'on demand', staleAfterHours: ON_DEMAND},
    },
    topicFeeds: {
        id: 'refresh-topic-feeds',
        event: 'app/refresh.topic.feeds',
        crons: ['TZ=America/New_York 0 */3 * * *'],
        trigger: 'topics',
        health: {label: 'Topic feeds', schedule: 'every 3h', staleAfterHours: 7},
    },
    topicBriefs: {
        id: 'generate-topic-briefs',
        event: 'app/generate.topic.briefs',
        crons: ['TZ=America/New_York 0 8 * * *'],
        trigger: 'briefs',
        health: {label: 'Topic briefs', schedule: 'daily 08:00 ET', staleAfterHours: 30},
    },
    topicOnDemand: {
        id: 'refresh-topic-on-demand',
        event: 'topic/refresh.requested',
        crons: [],
        trigger: 'topic',
        health: {label: 'Topic refresh (manual)', schedule: 'on demand', staleAfterHours: ON_DEMAND},
    },
    topicFirstRun: {
        id: 'fill-first-run-topics',
        event: 'topic/first-run.requested',
        crons: [],
        health: {label: 'New topics (first fill)', schedule: 'on demand', staleAfterHours: ON_DEMAND},
    },
    // Weekdays only, so a Monday-morning view is ~72h after Friday's run. The 10:30 cron is the
    // retry for provider lag: a successful 09:35 run leaves every claim taken.
    strategies: {
        id: 'strategies-daily',
        event: 'app/run.strategies',
        crons: ['TZ=America/New_York 35 9 * * 1-5', 'TZ=America/New_York 30 10 * * 1-5'],
        trigger: 'strategies',
        health: {label: 'Quant strategies', schedule: 'weekdays 09:35 ET', staleAfterHours: 80},
    },
    // Every day including weekends; its message names any account it could not credit.
    income: {
        id: 'daily-account-income',
        event: 'app/credit.account.income',
        crons: ['TZ=America/New_York 5 0 * * *'],
        trigger: 'income',
        health: {label: 'Interest & dividends', schedule: 'daily 00:05 ET', staleAfterHours: 30},
    },
    // Twenty minutes after the brain update, whose tagged articles it reads; before the topic
    // briefs at 08:00, so the three model jobs never run at once on the free tier.
    marketBriefing: {
        id: 'generate-market-briefing',
        event: 'app/generate.market.briefing',
        crons: ['TZ=America/New_York 50 7 * * *'],
        trigger: 'briefing',
        health: {label: 'Market briefing', schedule: 'daily 07:50 ET', staleAfterHours: 30},
    },
} as const satisfies Record<string, JobDefinition>;

// In declaration order — the status strip's row order.
export const JOB_LIST: readonly JobDefinition[] = Object.values(JOBS);

// A function's triggers: its event, then its crons, as Inngest is handed them. Generic so the
// event name stays a literal type: Inngest types `event.data` from it.
export const triggersOf = <J extends JobDefinition>(job: J): [{event: J['event']}, ...{cron: J['crons'][number]}[]] =>
    [{event: job.event}, ...job.crons.map((cron) => ({cron}))];
