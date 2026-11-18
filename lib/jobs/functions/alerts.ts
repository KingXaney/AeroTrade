import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {eventDay} from "@/lib/jobs/steps";
import {errorLine, jobOfFunctionId, overdueJobs} from "@/lib/jobs/alerts";
import {claimAlerts, recordJobFailure, releaseAlerts} from "@/lib/jobs/alerts-store";
import {getAllJobHealth} from "@/lib/jobs/health";
import {sendJobAlertEmail} from "@/lib/email/send";
import {formatEasternTimestamp, formatTimeAgoMs} from "@/lib/format";
import {labOwnerEmails} from "@/lib/lab/owner";
import {JOB_ALERT_COPY} from "@/lib/learn/copy/email";
import {isPreviewBuild} from "@/lib/site";

const FAILED_EVENT = 'inngest/function.failed';

// Sends one alert and answers whether it went. A mail that cannot be sent (no mailer here,
// nobody on the owner list, a refused send) gives the day's claims back instead of throwing:
// an alert that retried itself into a failure would only raise the event it is listening for.
const mailOwners = async (jobIds: readonly string[], day: string, mail: Omit<Parameters<typeof sendJobAlertEmail>[0], 'to'>): Promise<boolean> => {
    try {
        const sent = await sendJobAlertEmail({to: labOwnerEmails(), ...mail});
        if (!sent) await releaseAlerts(jobIds, day);
        return sent;
    } catch (error) {
        console.error('A job alert could not be mailed:', error);
        await releaseAlerts(jobIds, day).catch(() => undefined);
        return false;
    }
};

// The owner's alert. Two triggers, one function:
//   - Inngest's own failure event, raised when any function has used its retries: the job's
//     error is written on its row (the status strip shows it until the job next completes a
//     run) and the owner is mailed, once per job per ET day.
//   - the daily check (09:00 ET, or fired by hand): every job overdue on its stamp, in one mail.
//     A job that never fires raises no failure event; this is what catches it.
// A preview build does neither: it shares production's rows and mailer (lib/site.ts). The
// rules are lib/jobs/alerts.ts; its sentences JOB_ALERT_COPY.
export const watchJobs = inngest.createFunction(
    {
        id: JOBS.jobAlerts.id,
        retries: 1,
        triggers: [...triggersOf(JOBS.jobAlerts), {event: FAILED_EVENT}],
    },
    async ({event: typed, step}) => {
        if (isPreviewBuild()) return {success: true, message: 'Preview build: no alert'};
        // Inngest types the event from the registry's trigger alone; the failure event arrives
        // on the same handler with its own name and payload (FailureEventPayload).
        const event = typed as unknown as {name: string; ts?: number; data?: unknown};
        const today = eventDay(event.ts);

        if (event.name === FAILED_EVENT) {
            const data = (event.data ?? {}) as {function_id?: unknown; error?: {message?: unknown}};
            const job = jobOfFunctionId(typeof data.function_id === 'string' ? data.function_id : '');
            // Not one of ours, or this function itself: nothing to say, and nothing to loop on.
            if (!job || job.id === JOBS.jobAlerts.id) return {success: true, message: 'Ignored: not a registered job'};
            const error = errorLine(data.error?.message);
            const failedAt = typeof event.ts === 'number' ? event.ts : Date.now();
            await step.run('record-failure', async () => recordJobFailure(job.id, error));

            const claimed = await step.run('claim-alert', async () => claimAlerts([job.id], today));
            if (claimed.length === 0) return {success: true, message: `${job.id} failed; the owner was already mailed about it today`};
            const sent = await step.run('mail-owners', async () => {
                const health = (await getAllJobHealth()).find((row) => row.jobId === job.id);
                const label = job.health?.label ?? job.id;
                return mailOwners(claimed, today, {
                    subject: JOB_ALERT_COPY.failed.subject(label),
                    preheader: JOB_ALERT_COPY.failed.preheader(label),
                    headline: JOB_ALERT_COPY.failed.hero(label),
                    lines: [
                        JOB_ALERT_COPY.failed.body(job.health?.schedule ?? 'on demand', formatEasternTimestamp(failedAt)),
                        JOB_ALERT_COPY.failed.lastGood(health?.lastRunAt ? formatTimeAgoMs(health.lastRunAt) : null),
                    ],
                    error,
                });
            });
            return {success: true, message: `${job.id} failed; ${sent ? 'the owner was mailed' : 'no mail was sent'}`};
        }

        // The daily check.
        const overdue = await step.run('overdue-jobs', async () => overdueJobs(await getAllJobHealth(), Date.now())
            // This job watches the others; it cannot report itself.
            .filter((job) => job.jobId !== JOBS.jobAlerts.id)
            .map((job) => ({jobId: job.jobId, label: job.label, schedule: job.schedule, lastRunAt: job.lastRunAt})));
        const claimed = overdue.length === 0 ? [] : await step.run('claim-alerts', async () => claimAlerts(overdue.map((job) => job.jobId), today));
        const fresh = overdue.filter((job) => claimed.includes(job.jobId));
        const sent = fresh.length === 0 ? false : await step.run('mail-owners', async () => mailOwners(claimed, today, {
            subject: JOB_ALERT_COPY.overdue.subject(fresh.length),
            preheader: JOB_ALERT_COPY.overdue.preheader,
            headline: JOB_ALERT_COPY.overdue.hero(fresh.length),
            lines: [
                JOB_ALERT_COPY.overdue.body,
                ...fresh.map((job) => JOB_ALERT_COPY.overdue.row(job.label, job.schedule, job.lastRunAt === null ? 'never' : formatTimeAgoMs(job.lastRunAt))),
            ],
        }));

        const summary = overdue.length === 0
            ? 'No job is overdue'
            : `${overdue.length} job(s) overdue: ${overdue.map((job) => job.label).join(', ')}; ${sent ? 'the owner was mailed' : fresh.length === 0 ? 'already mailed today' : 'no mail was sent'}`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.jobAlerts.id, summary));
        return {success: true, message: summary};
    },
)
