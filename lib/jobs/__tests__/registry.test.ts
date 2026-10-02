import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {JOB_LIST, JOBS, triggersOf} from '@/lib/jobs/registry';

// scripts/trigger.mjs keeps its own name → event table (it runs under plain Node); read as text.
const triggerEvents = (): Record<string, string> => {
    const source = readFileSync(path.resolve(__dirname, '../../../scripts/trigger.mjs'), 'utf8');
    const body = source.match(/const EVENTS = \{([\s\S]*?)\n\};/)?.[1] ?? '';
    return Object.fromEntries([...body.matchAll(/^\s*'?([\w-]+)'?:\s*'([^']+)',?\s*$/gm)].map((m) => [m[1], m[2]]));
};

describe('job registry', () => {
    // Inngest keys runs and memoized steps on the function id, and a job fires only on these
    // exact names: a rename here is an outage, so the table is pinned.
    it('keeps every id, event and cron exactly as deployed', () => {
        expect(JOB_LIST.map((job) => [job.id, job.event, ...job.crons])).toEqual([
            ['sign-up-email', 'app/user.created'],
            ['daily-brain-update', 'app/update.news.brain', 'TZ=America/New_York 30 7 * * *'],
            ['daily-news-summary', 'app/send.daily.news', 'TZ=America/New_York 0 12 * * *'],
            ['daily-account-snapshots', 'app/record.daily.snapshots', 'TZ=America/New_York 10 16 * * 1-5'],
            ['ai-navigator-weekly', 'app/run.ai.navigator', 'TZ=America/New_York 0 10 * * 1'],
            ['ai-navigator-bootstrap', 'app/bootstrap.ai.navigator'],
            ['claude-second-opinion', 'app/generate.second.opinion'],
            ['refresh-topic-feeds', 'app/refresh.topic.feeds', 'TZ=America/New_York 0 */3 * * *'],
            ['generate-topic-briefs', 'app/generate.topic.briefs', 'TZ=America/New_York 0 8 * * *'],
            ['refresh-topic-on-demand', 'topic/refresh.requested'],
            ['fill-first-run-topics', 'topic/first-run.requested'],
            ['strategies-daily', 'app/run.strategies', 'TZ=America/New_York 35 9 * * 1-5', 'TZ=America/New_York 30 10 * * 1-5'],
            ['daily-account-income', 'app/credit.account.income', 'TZ=America/New_York 5 0 * * *'],
            ['generate-market-briefing', 'app/generate.market.briefing', 'TZ=America/New_York 50 7 * * *'],
        ]);
    });

    it('gives every job its own id and its own event', () => {
        expect(new Set(JOB_LIST.map((job) => job.id)).size).toBe(JOB_LIST.length);
        expect(new Set(JOB_LIST.map((job) => job.event)).size).toBe(JOB_LIST.length);
    });

    it('hands Inngest the event first, then the crons in order', () => {
        expect(triggersOf(JOBS.strategies)).toEqual([
            {event: 'app/run.strategies'},
            {cron: 'TZ=America/New_York 35 9 * * 1-5'},
            {cron: 'TZ=America/New_York 30 10 * * 1-5'},
        ]);
        expect(triggersOf(JOBS.signUpEmail)).toEqual([{event: 'app/user.created'}]);
    });

    it('gives every job but the welcome email a status-strip row', () => {
        expect(JOB_LIST.filter((job) => job.health === null).map((job) => job.id)).toEqual(['sign-up-email']);
        for (const job of JOB_LIST) {
            if (job.health) expect(job.health.staleAfterHours).toBeGreaterThan(0);
        }
    });
});

describe('scripts/trigger.mjs', () => {
    const events = triggerEvents();

    it('fires only events a registered job listens for', () => {
        expect(Object.keys(events).length).toBeGreaterThan(0);
        const known = new Set(JOB_LIST.map((job) => job.event));
        for (const [name, event] of Object.entries(events)) expect(known.has(event), name).toBe(true);
    });

    it("names each job by the registry's trigger name, and covers every scheduled job", () => {
        for (const job of JOB_LIST) {
            if ('trigger' in job && job.trigger) expect(events[job.trigger], job.id).toBe(job.event);
            if (job.crons.length > 0) expect('trigger' in job && job.trigger, job.id).toBeTruthy();
        }
    });
});
