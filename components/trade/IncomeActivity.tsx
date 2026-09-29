import {formatPrice} from "@/lib/utils";
import MicroLabel from "@/components/primitives/MicroLabel";
import EmptyState from "@/components/primitives/EmptyState";
import type {IncomeActivity as Activity} from "@/lib/trading/income";

// What the account earned without trading: interest on idle cash and dividends on holdings.
// Interest is one line a month — it is credited every calendar day, and thirty near-identical
// rows would be the same noise as a column that never changes. Dividends are listed one by one.

const monthLabel = (month: string): string =>
    new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'});

const pct = (apy: number | null): string => (apy === null ? '' : `${(apy * 100).toFixed(2)}% APY`);

const IncomeActivity = ({activity}: {activity: Activity}) => {
    if (activity.interestByMonth.length === 0 && activity.dividends.length === 0) {
        return (
            <EmptyState
                icon="savings"
                title="No income yet"
                description="Idle cash earns interest at the 13-week T-bill rate, credited each night. A dividend is paid five days after a holding goes ex-dividend."
            />
        );
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            <div data-testid="income-interest">
                <MicroLabel as="div" className="mb-2">Interest on cash</MicroLabel>
                <ul className="divide-y divide-line-strong/15">
                    {activity.interestByMonth.map((m) => (
                        <li key={m.month} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                            <span className="text-fg">{monthLabel(m.month)}</span>
                            <span className="font-mono text-[11px] text-fg-muted">{m.days} day{m.days === 1 ? '' : 's'}{m.averageApy !== null ? ` · ${pct(m.averageApy)}` : ''}</span>
                            <span className="font-mono text-positive">+{formatPrice(m.amount)}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div data-testid="income-dividends">
                <MicroLabel as="div" className="mb-2">Dividends</MicroLabel>
                {activity.dividends.length === 0 ? (
                    <p className="text-sm text-fg-muted py-2">None yet — a holding pays after its ex-dividend date.</p>
                ) : (
                    <ul className="divide-y divide-line-strong/15">
                        {activity.dividends.map((d) => (
                            <li key={`${d.date}-${d.symbol}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                                <span className="font-mono font-semibold text-fg">{d.symbol}</span>
                                <span className="font-mono text-[11px] text-fg-muted">
                                    {d.quantity !== null && d.perShare !== null ? `${d.quantity} × ${formatPrice(d.perShare)} · ` : ''}paid {d.date}
                                </span>
                                <span className="font-mono text-positive">+{formatPrice(d.amount)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default IncomeActivity;
