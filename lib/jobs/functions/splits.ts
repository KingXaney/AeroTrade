import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {chunk} from "@/lib/jobs/steps";
import {describeSplitRun} from "@/lib/trading/splits";
import {applyStoredSplits, detectSplits, heldSymbols, rebaseBarsFor, splitDetectionEnabled, symbolsToRebase} from "@/lib/trading/splits-store";

// Stock splits, weekdays 09:40 ET, ten minutes after the open a split takes effect at: every
// held symbol is checked with Yahoo, a symbol with a split to apply has its price history
// rebuilt on the new basis, and every account holding it is brought up to date in one guarded
// write each (lib/trading/splits-store.ts; the rules are lib/trading/splits.ts). It is not the
// only line: a fill of a held symbol checks for a split first (the strategies trade at 09:35,
// and a reader may sell at 09:31), and the 16:10 snapshot job applies whatever is still
// outstanding before it values anything.
const SPLIT_SYMBOL_CHUNK = 15;   // one Yahoo call a symbol at its polite spacing: about half a minute a step

export const applyStockSplits = inngest.createFunction(
    {
        id: JOBS.stockSplits.id,
        concurrency: [{limit: 1}],
        triggers: triggersOf(JOBS.stockSplits),
    },
    async ({step}) => {
        const detection = splitDetectionEnabled();
        let checked = 0;
        const unanswered: string[] = [];
        if (detection) {
            const symbols = await step.run('held-symbols', heldSymbols);
            const chunks = chunk(symbols, SPLIT_SYMBOL_CHUNK);
            for (let i = 0; i < chunks.length; i += 1) {
                const part = await step.run(`detect-splits-${i}`, async () => detectSplits(chunks[i]));
                checked += part.checked;
                unanswered.push(...part.unanswered);
            }
        }

        // The bars first, the holdings second: a stored close is what a page falls back on and
        // what a fill is checked against, and it must be in the shares the holding will be in.
        const stale = detection ? await step.run('outstanding-splits', symbolsToRebase) : [];
        if (stale.length > 0) await step.run('rebase-bars', async () => rebaseBarsFor(stale));
        const {applied, skipped, unsettled} = await step.run('apply-splits', async () => applyStoredSplits());

        const summary = describeSplitRun({checked, unanswered, detection, applied, skipped, unsettled});
        await step.run('record-job-run', async () => recordJobRun(JOBS.stockSplits.id, summary));
        return {success: true, message: summary};
    },
)
