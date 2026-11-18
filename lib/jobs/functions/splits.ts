import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {chunk} from "@/lib/jobs/steps";
import {describeSplitRun} from "@/lib/trading/splits";
import {applyStoredSplits, detectSplits, heldSymbols, rebaseBarsFor, splitDetectionEnabled, symbolsWithOutstandingSplits} from "@/lib/trading/splits-store";

// Stock splits, weekdays 09:40 ET, ten minutes after the open a split takes effect at: every
// held symbol is checked with Yahoo, a symbol with a split to apply has its price history
// rebuilt on the new basis, and every account holding it is brought up to date in one guarded
// write each (lib/trading/splits-store.ts; the rules are lib/trading/splits.ts). The 16:10
// snapshot job checks again, for the holdings whose quote sits far from their last close.
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

        const stale = await step.run('outstanding-splits', symbolsWithOutstandingSplits);
        if (stale.length > 0 && detection) await step.run('rebase-bars', async () => rebaseBarsFor(stale));
        const {applied, skipped} = await step.run('apply-splits', async () => applyStoredSplits());

        const summary = describeSplitRun({checked, unanswered, detection, applied, skipped});
        await step.run('record-job-run', async () => recordJobRun(JOBS.stockSplits.id, summary));
        return {success: true, message: summary};
    },
)
