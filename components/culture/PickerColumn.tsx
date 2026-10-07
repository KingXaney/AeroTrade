import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import AccountSummary from "@/components/trading/portfolio/AccountSummary";
import HoldingsTable from "@/components/trading/portfolio/HoldingsTable";
import TradeHistory from "@/components/trading/portfolio/TradeHistory";
import CultureRecord from "@/components/culture/CultureRecord";
import FillReplay from "@/components/culture/FillReplay";
import PicksPanel from "@/components/culture/PicksPanel";
import type {PickerView} from "@/lib/culture/page-store";
import {pickPerfMode} from "@/lib/strategies/views";
import type {PaperTradeRecord} from "@/lib/trading/types";
import {CULTURE_PICKS_COPY} from "@/lib/learn/copy/culture";

// One picker, top to bottom: what it follows, its account, its record against SPY, its latest
// decision, its holdings and its trade log. The pickers view lays two of these side by side so
// the same panels of each can be read across; nothing here says which is ahead.
const PickerColumn = ({picker}: {picker: PickerView}) => {
    const replayFor = (trade: PaperTradeRecord) => {
        const replay = picker.fillReplays[trade.id];
        return replay ? <FillReplay replay={replay} /> : null;
    };
    return (
        <section className="space-y-4 min-w-0" data-picker={picker.id} aria-label={`${picker.label} picker`}>
            <Panel pad={4}>
                <SectionHeading spacing="none">{picker.label}</SectionHeading>
                <p className="text-sm text-fg-soft mt-2" data-picker-lead>{CULTURE_PICKS_COPY.profileLead(picker.label, picker.follows)}</p>
                <MicroLabel as="p" className="mt-2">{CULTURE_PICKS_COPY.accountLine(picker.accountName, picker.state?.launchDate ?? null)}</MicroLabel>
            </Panel>

            {picker.analytics && <AccountSummary portfolio={picker.analytics.summary} income={picker.analytics.income} definitions />}

            <CultureRecord
                id={picker.id}
                name={picker.accountName}
                live={picker.live}
                simulated={picker.simulated ? {
                    series: picker.simulated.series,
                    stats: picker.simulated.stats,
                    from: picker.simulated.from,
                    to: picker.simulated.to,
                    closeFills: picker.simulated.closeFills,
                } : null}
                initialMode={pickPerfMode(picker.live?.series.length ?? 0, picker.simulated?.series.length ?? 0)}
            />

            <Panel id={`culture-decision-${picker.id}`}>
                <SectionHeading>{CULTURE_PICKS_COPY.decisionsHeading}</SectionHeading>
                <PicksPanel decision={picker.decision} />
            </Panel>

            <Panel id={`culture-holdings-${picker.id}`}>
                <SectionHeading>{CULTURE_PICKS_COPY.holdingsHeading}</SectionHeading>
                <HoldingsTable
                    positions={picker.analytics?.summary.positions ?? []}
                    emptyText={picker.analytics ? CULTURE_PICKS_COPY.holdingsEmpty : CULTURE_PICKS_COPY.holdingsNotStarted}
                    showUnpricedNote={false}
                />
            </Panel>

            <Panel id={`culture-trades-${picker.id}`}>
                <div className="flex items-center justify-between gap-3 mb-4">
                    <SectionHeading spacing="none">{CULTURE_PICKS_COPY.tradesHeading}</SectionHeading>
                    <MicroLabel>{picker.analytics ? `${picker.analytics.tradeCount} fill${picker.analytics.tradeCount === 1 ? '' : 's'}` : ''}</MicroLabel>
                </div>
                {picker.trades.length === 0
                    ? <p className="text-sm text-fg-muted p-4">{CULTURE_PICKS_COPY.tradesEmpty}</p>
                    : <TradeHistory trades={picker.trades} totalCount={picker.analytics?.tradeCount} detail={replayFor} />}
            </Panel>
        </section>
    );
};

export default PickerColumn;
