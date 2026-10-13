import {inngest} from "@/lib/jobs/client";
import {inferText, isDailyQuotaExhausted} from "@/lib/ai/infer";
import {modelConfigured} from "@/lib/ai/models";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {eventDay} from "@/lib/jobs/steps";
import {labEnabled} from "@/lib/lab/owner";
import {ARXIV_GAP} from "@/lib/lab/papers/config";
import {assembleDay} from "@/lib/lab/papers/day";
import {parseLabDigest} from "@/lib/lab/papers/digest";
import {fetchArxivMetadata, fetchHfDays, fetchTrackListing, loadSeenIds, TRACKS_IN_ORDER} from "@/lib/lab/papers/job";
import {buildLabDigestPrompt} from "@/lib/lab/papers/prompts";
import {saveLabDay, saveLabDigest} from "@/lib/lab/papers/store";
import type {ArxivListing} from "@/lib/lab/papers/arxiv";

// The lab's papers feed (lib/lab/papers): every weekday morning, the new papers of each track
// from arXiv and Hugging Face's daily list, and one model call over them for a cited digest.
// Four arXiv requests three seconds apart (its etiquette), two Hugging Face requests, and the
// one call — skipped, never retried, when the day's model quota is spent. `concurrency 1`: two
// runs would write the same day twice.
export const refreshLabPapers = inngest.createFunction(
    { id: JOBS.labPapers.id, triggers: triggersOf(JOBS.labPapers), concurrency: [{ limit: 1 }] },
    async ({ event, step }) => {
        const today = eventDay(event.ts);

        if (!labEnabled()) {
            const message = 'Skipped — LAB_OWNER_EMAILS is not set, so nobody reads the lab';
            await step.run('record-job-run', async () => recordJobRun(JOBS.labPapers.id, message));
            return {success: false, message};
        }

        const seen = await step.run('load-seen-ids', async () => loadSeenIds(today));
        const hf = await step.run('fetch-hf', async () => fetchHfDays(today));

        const listings: Partial<Record<string, ArxivListing>> = {};
        for (const [i, track] of TRACKS_IN_ORDER.entries()) {
            if (i > 0) await step.sleep(`arxiv-gap-${track}`, ARXIV_GAP);
            listings[track] = await step.run(`fetch-arxiv-${track}`, async () => fetchTrackListing(track));
        }
        const listed = TRACKS_IN_ORDER.flatMap((track) => {
            const listing = listings[track];
            return listing?.status === 'ok' ? listing.entries : [];
        });
        const known = new Set(listed.map((entry) => entry.id));
        const missing = hf.papers.filter((paper) => !known.has(paper.id)).map((paper) => paper.id);
        await step.sleep('arxiv-gap-ids', ARXIV_GAP);
        const metadata = await step.run('fetch-arxiv-ids', async () => fetchArxivMetadata(missing));

        const day = assembleDay({
            today,
            arxiv: listed,
            hf: hf.papers,
            metadata: metadata.status === 'ok' ? metadata.entries : [],
            seenIds: new Set(seen),
        });
        const feedNotes = [
            ...TRACKS_IN_ORDER.flatMap((track) => (listings[track]?.status === 'error' ? [`arXiv ${track}: ${(listings[track] as {message: string}).message}`] : [])),
            ...(metadata.status === 'error' ? [`arXiv ids: ${metadata.message}`] : []),
            ...hf.errors.map((e) => `HF ${e}`),
        ];
        const notes = feedNotes.length > 0 ? ` (${feedNotes.join('; ')})` : '';

        if (day.papers.length === 0) {
            const message = `Skipped — no new papers for ${today} among ${day.counts.listed} arXiv rows and ${day.counts.hf} Hugging Face rows${notes}`;
            await step.run('record-job-run', async () => recordJobRun(JOBS.labPapers.id, message));
            return {success: false, message};
        }

        await step.run('save-day', async () => saveLabDay(day));

        let digestNote = 'no model key, so no digest';
        if (modelConfigured()) {
            try {
                const response = await inferText(step, {task: 'labDigest', stepId: `lab-digest-${today}`, prompt: buildLabDigestPrompt(day.papers)});
                const digest = parseLabDigest(response.text, day.papers.length);
                if (digest) {
                    await step.run('save-digest', async () => saveLabDigest(today, digest, response.model));
                    digestNote = `${digest.bullets.length} digest points`;
                } else {
                    digestNote = 'the digest did not parse, so the papers stand alone';
                }
            } catch (error) {
                if (!isDailyQuotaExhausted(error)) throw error;
                digestNote = 'digest skipped: the daily model quota is spent';
            }
        }

        const message = `Wrote ${day.papers.length} papers for ${today}: ${day.counts.novel} new among ${day.counts.listed} arXiv rows and ${day.counts.hf} Hugging Face rows — ${digestNote}${notes}`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.labPapers.id, message));
        return {success: true, message};
    },
);
