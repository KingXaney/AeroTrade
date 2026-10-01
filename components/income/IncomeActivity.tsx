import {formatPrice} from "@/lib/format";
import MicroLabel from "@/components/primitives/MicroLabel";
import EmptyState from "@/components/primitives/EmptyState";
import {
    INCOME_COPY,
    dividendReceipt,
    dividendSummary,
    interestReceipt,
    interestSummary,
    missedLine,
    monthLabel,
    rateMovedNote,
} from "@/lib/learn/copy/income";
import type {IncomeView} from "@/lib/income/accrual";

// What the account earned without trading: interest on idle cash and dividends on holdings.
// Interest is one line a month — it is credited every calendar day, and thirty near-identical
// rows would be the same noise as a column that never changes. Dividends are listed one by one.
// Each row's summary is the number; opening it shows the receipt that produces that number.
// Ex-dates a fill missed by one day are stated once, below both lists, and only when there are any.

const ROW = 'flex items-baseline justify-between gap-3 py-2 text-sm cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden';
const RECEIPT = 'font-mono text-[11px] text-fg-muted leading-relaxed pb-2';

const IncomeActivity = ({activity}: {activity: IncomeView}) => {
    if (activity.interestByMonth.length === 0 && activity.dividends.length === 0) {
        return <EmptyState icon="savings" title={INCOME_COPY.emptyTitle} description={INCOME_COPY.emptyDescription} />;
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
                <div data-testid="income-interest">
                    <MicroLabel as="div" className="mb-2">{INCOME_COPY.interestHeading}</MicroLabel>
                    <ul className="divide-y divide-line-strong/15">
                        {activity.interestByMonth.map((m) => {
                            const note = rateMovedNote(m);
                            return (
                                <li key={m.month} data-income-month={m.month}>
                                    <details data-income-receipt>
                                        <summary className={ROW}>
                                            <span className="text-fg">{monthLabel(m.month)}</span>
                                            <span className="font-mono text-[11px] text-fg-muted">{interestSummary(m)}</span>
                                            <span className="font-mono text-positive">+{formatPrice(m.amount)}</span>
                                        </summary>
                                        <p className={RECEIPT}>{interestReceipt(m)}</p>
                                        {note && <p className={RECEIPT}>{note}</p>}
                                    </details>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <div data-testid="income-dividends">
                    <MicroLabel as="div" className="mb-2">{INCOME_COPY.dividendsHeading}</MicroLabel>
                    {activity.dividends.length === 0 ? (
                        <p className="text-sm text-fg-muted py-2">{INCOME_COPY.noDividends}</p>
                    ) : (
                        <ul className="divide-y divide-line-strong/15">
                            {activity.dividends.map((d) => {
                                const cells = (
                                    <>
                                        <span className="font-mono font-semibold text-fg">{d.symbol}</span>
                                        <span className="font-mono text-[11px] text-fg-muted">{dividendSummary(d)}</span>
                                        <span className="font-mono text-positive">+{formatPrice(d.amount)}</span>
                                    </>
                                );
                                return (
                                    <li key={`${d.date}-${d.symbol}`} data-income-dividend={d.symbol}>
                                        {d.receipt ? (
                                            <details data-income-receipt>
                                                <summary className={ROW}>{cells}</summary>
                                                <p className={RECEIPT}>{dividendReceipt(d.receipt)}</p>
                                            </details>
                                        ) : (
                                            <div className={ROW.replace(' cursor-pointer', '')}>{cells}</div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
            {activity.missed.length > 0 && (
                <div data-testid="income-missed" className="font-mono text-[11px] text-fg-muted">
                    <MicroLabel as="div" className="mb-1">{INCOME_COPY.missedHeading}</MicroLabel>
                    {activity.missed.map((m) => (
                        <p key={`${m.exDate}-${m.symbol}-${m.kind}`} className="leading-relaxed">{missedLine(m)}</p>
                    ))}
                </div>
            )}
        </div>
    );
};

export default IncomeActivity;
