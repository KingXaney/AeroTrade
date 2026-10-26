import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {eventDay} from "@/lib/jobs/steps";
import {listActiveBrokerLinks, recordBrokerSync} from "@/lib/broker/store";
import {syncBrokerLink} from "@/lib/broker/sync";
import {BROKER_COPY} from "@/lib/learn/copy/broker";

// The Alpaca mirror's weekday sync (lib/broker): every active link, one step each — orders only
// while Alpaca's market is open, a preview otherwise — each sync recorded on its link, the run's
// line stamped for the status strip. The day comes from the event, never the wall.
export const syncBrokerMirror = inngest.createFunction(
    { id: JOBS.brokerSync.id, triggers: triggersOf(JOBS.brokerSync), concurrency: [{ limit: 1 }] },
    async ({ event, step }) => {
        const day = eventDay(event.ts);
        const links = await step.run('load-links', listActiveBrokerLinks);
        const lines: string[] = [];
        for (const link of links) {
            const summary = await step.run(`sync-${link.userId}`, async () => {
                const outcome = await syncBrokerLink(link, {execute: true, day});
                await recordBrokerSync(link.userId, {...outcome, day, at: new Date()});
                return outcome.summary;
            });
            lines.push(summary);
        }
        const message = BROKER_COPY.jobLine(links.length, lines);
        await step.run('record-job-run', async () => recordJobRun(JOBS.brokerSync.id, message));
        return {success: true, message};
    },
);
