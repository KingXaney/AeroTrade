import {getEasternDateString} from "@/lib/dates";
import {formatPrice} from "@/lib/format";
import {BROKER_COPY} from "@/lib/learn/copy/broker";
import type {BrokerView} from "@/lib/broker/view";
import BrokerControls from "@/components/broker/BrokerControls";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import RowCard from "@/components/primitives/RowCard";
import StatTile from "@/components/primitives/StatTile";

// Settings › Broker, the owner's Alpaca link (docs/specs/2026-10-24-alpaca-broker-link.md): the
// connection as the server's environment allows it, the mirrored account and its controls, the
// two accounts' weights side by side, the last syncs and Alpaca's own recent orders. Inside the
// settings Panel, so its parts are rows, never panels.

const weight = (value: number): string => `${(value * 100).toFixed(1)}%`;

const amountOf = (order: {notional?: number | null; qty?: number | null}): string =>
    typeof order.notional === 'number' ? formatPrice(order.notional) : typeof order.qty === 'number' ? `${order.qty} sh` : '—';

const BrokerSettings = ({view}: {view: BrokerView}) => {
    const {connection} = view;
    const connected = connection.state === 'connected';
    return (
        <div className="space-y-6" data-broker>
            <p className="text-sm text-fg-soft leading-relaxed">{BROKER_COPY.lead}</p>

            <section className="space-y-3" data-broker-connection={connection.state}>
                <div className="flex flex-wrap items-center gap-2">
                    <MicroLabel as="p">{BROKER_COPY.connectionHeading}</MicroLabel>
                    <Badge tone={connection.mode === 'live' ? 'warning' : 'brand'} data-broker-mode={connection.mode}>
                        {connection.mode === 'live' ? BROKER_COPY.liveBadge : BROKER_COPY.paperBadge}
                    </Badge>
                    {connection.state === 'connected' && <span className="font-mono text-xs text-fg-muted" data-broker-account-line>{BROKER_COPY.accountLine(connection.last4, connection.status)}</span>}
                </div>
                {connection.state === 'no-keys' && <p className="text-sm text-fg-muted">{BROKER_COPY.noKeys}</p>}
                {connection.state === 'live-locked' && <p className="text-sm text-warning">{BROKER_COPY.liveLocked}</p>}
                {connection.state === 'unreachable' && <p className="text-sm text-warning">{BROKER_COPY.unreachable(connection.message)}</p>}
                {connection.state === 'connected' && (
                    <>
                        {connection.mode === 'live' && <p className="text-sm text-warning">{BROKER_COPY.liveWarning}</p>}
                        <div className="grid grid-cols-3 gap-4 max-w-lg">
                            <StatTile label={BROKER_COPY.equity} value={formatPrice(connection.equity)} />
                            <StatTile label={BROKER_COPY.cash} value={formatPrice(connection.cash)} />
                            <StatTile label={BROKER_COPY.buyingPower} value={formatPrice(connection.buyingPower)} />
                        </div>
                    </>
                )}
            </section>

            <section className="space-y-3" data-broker-link-section>
                <MicroLabel as="p">{BROKER_COPY.linkHeading}</MicroLabel>
                <p className="text-sm text-fg-soft">{BROKER_COPY.linkLead}</p>
                {view.link && (
                    <p className="text-sm text-fg" data-broker-linked={view.link.status}>
                        {BROKER_COPY.linkedLine(view.link.sourceName ?? BROKER_COPY.noteSourceMissing, view.link.since)}
                        {view.link.status === 'paused' && <span className="block text-xs text-warning">{BROKER_COPY.pausedLine}</span>}
                    </p>
                )}
                <BrokerControls accounts={view.accounts} link={view.link && {sourceAccountId: view.link.sourceAccountId, status: view.link.status}} connected={connected} />
                <p className="text-xs text-fg-muted">{BROKER_COPY.schedule}</p>
            </section>

            {view.comparison.length > 0 && (
                <section className="space-y-2" data-broker-comparison>
                    <MicroLabel as="p">{BROKER_COPY.comparisonHeading}</MicroLabel>
                    <table className="w-full max-w-md text-sm font-mono">
                        <thead>
                            <tr className="text-left text-fg-muted text-xs">
                                <th className="py-1 font-normal">{BROKER_COPY.symbolColumn}</th>
                                <th className="py-1 font-normal text-right">{BROKER_COPY.paperColumn}</th>
                                <th className="py-1 font-normal text-right">{BROKER_COPY.alpacaColumn}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {view.comparison.map((row) => (
                                <tr key={row.symbol} className="border-t border-line-strong/20" data-broker-weight={row.symbol}>
                                    <td className="py-1 text-fg">{row.symbol}</td>
                                    <td className="py-1 text-right text-fg-soft">{weight(row.paper)}</td>
                                    <td className="py-1 text-right text-fg-soft">{weight(row.alpaca)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <section className="space-y-2" data-broker-syncs>
                <MicroLabel as="p">{BROKER_COPY.syncsHeading}</MicroLabel>
                {view.syncs.length === 0 ? <p className="text-sm text-fg-muted">{BROKER_COPY.noSyncs}</p> : view.syncs.map((sync) => (
                    <RowCard key={sync.at} data-broker-sync-row={sync.kind}>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-fg-muted">
                            <span>{sync.day}</span>
                            {sync.kind === 'preview' && <Badge tone="warning">{BROKER_COPY.previewBadge}</Badge>}
                            {sync.kind === 'skipped' && <Badge tone="neutral">{BROKER_COPY.skippedBadge}</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-fg">{sync.summary}</p>
                        {sync.orders.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-[11px] font-mono text-fg-soft">
                                {sync.orders.map((order) => (
                                    <li key={order.clientOrderId} data-broker-order={`${order.side}:${order.symbol}`}>
                                        {order.side} {order.symbol} {amountOf(order)} · {order.reason}
                                        {order.status && <span className="text-fg-muted"> · {order.status}</span>}
                                        {order.error && <span className="text-negative"> · {order.error}</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {sync.skipped.length > 0 && (
                            <p className="mt-1 text-[11px] font-mono text-fg-muted" data-broker-skipped>
                                {sync.skipped.map((skip) => `${skip.symbol}: ${BROKER_COPY.skipReason[skip.reason as keyof typeof BROKER_COPY.skipReason] ?? skip.reason}`).join(' · ')}
                            </p>
                        )}
                    </RowCard>
                ))}
            </section>

            {connected && (
                <section className="space-y-2" data-broker-orders>
                    <MicroLabel as="p">{BROKER_COPY.ordersHeading}</MicroLabel>
                    {view.orders.length === 0 ? <p className="text-sm text-fg-muted">{BROKER_COPY.noOrders}</p> : (
                        <ul className="space-y-0.5 text-[11px] font-mono text-fg-soft">
                            {view.orders.map((order) => (
                                <li key={order.id} data-broker-alpaca-order={order.status}>
                                    {order.submittedAt ? getEasternDateString(new Date(order.submittedAt)) : ''} · {order.side} {order.symbol} {amountOf(order)} · {order.status}
                                    {order.filledAvgPrice !== null && ` @ ${formatPrice(order.filledAvgPrice)}`}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            <p className="label-type text-[length:var(--label-size)] text-fg-muted">{BROKER_COPY.disclaimer}</p>
        </div>
    );
};

export default BrokerSettings;
