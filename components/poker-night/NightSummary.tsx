'use client';

// The end of the night, which a closed table's page shows to everyone who opens its link: the
// table, the date (in the reader's own time zone, so it is read in the browser), how many hands and
// how long; the final counts, everyone who sat by net — Chips in, Finished with, Net with its sign;
// Copy summary (the box to copy from by hand when the clipboard is blocked); "Start another table"
// for an account, the account nudge for a guest; and the footer: play chips only, and the check
// that every chip is accounted for. Awards join it in P7. An unframed scroll of Panels.

import {useState, useSyncExternalStore} from "react";
import Link from "next/link";
import {Copy} from "lucide-react";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {TextArea} from "@/components/primitives/TextField";
import {copyText, MiniAvatar, PlayerName} from "@/components/poker-night/overlay-kit";
import {BANK_COPY, OVERLAY_COPY, SUMMARY_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {nightDate, summaryText, type NightSummaryView} from "@/lib/poker-night/summary";
import {cn} from "@/lib/utils";

export type NightSummaryProps = {
    summary: NightSummaryView;
    signedIn: boolean; // "Start another table" for an account, the account nudge for a guest
};

const noSubscribe = () => () => {};

const NightSummary = ({summary, signedIn}: NightSummaryProps) => {
    // The date in the reader's time zone: none in the server's render, the browser's after.
    const date = useSyncExternalStore(noSubscribe, () => nightDate(summary.endedAt), () => null);
    const [note, setNote] = useState<'copied' | 'blocked' | null>(null);
    const text = summaryText(summary, date ?? nightDate(summary.endedAt, 'UTC'));
    const counted = summary.standings.reduce((sum, s) => sum + s.finished, 0);

    const copy = async () => setNote(await copyText(text));

    return (
        <main className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]"
              data-night-summary="" aria-labelledby="night-summary-heading">
            <Panel pad={5} className="space-y-1">
                <h1 id="night-summary-heading" className="heading-type text-2xl text-fg">{SUMMARY_COPY.heading}</h1>
                <p className="text-sm text-fg-soft" data-user-text="">{date ? SUMMARY_COPY.when(summary.table, date) : summary.table}</p>
                <p className="text-sm text-fg-muted">{SUMMARY_COPY.length(summary.hands, summary.minutes)}</p>
            </Panel>

            {summary.standings.length > 0 && (
                <Panel pad={4} aria-labelledby="night-summary-standings">
                    <SectionHeading id="night-summary-standings" spacing="sm">{SUMMARY_COPY.standings}</SectionHeading>
                    <table className="w-full table-fixed border-collapse text-sm" data-standings="">
                        <thead>
                            <tr className="text-left">
                                <th scope="col" className="w-10 pb-2 font-normal"><MicroLabel>{OVERLAY_COPY.place}</MicroLabel></th>
                                <th scope="col" className="pb-2 font-normal"><MicroLabel>{SUMMARY_COPY.columns.player}</MicroLabel></th>
                                <th scope="col" className="hidden pb-2 text-right font-normal sm:table-cell"><MicroLabel>{SUMMARY_COPY.columns.chipsIn}</MicroLabel></th>
                                <th scope="col" className="hidden pb-2 text-right font-normal sm:table-cell"><MicroLabel>{SUMMARY_COPY.columns.finished}</MicroLabel></th>
                                <th scope="col" className="w-24 pb-2 text-right font-normal"><MicroLabel>{SUMMARY_COPY.columns.net}</MicroLabel></th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.standings.map((s) => (
                                <tr key={s.pid} className={cn('border-t border-line-strong/15 align-middle', s.me && 'bg-brand-strong/5')} data-standing={s.pid}>
                                    <td className="py-2 font-mono tabular-nums text-fg-muted">{TABLE_COPY.chips(s.place)}</td>
                                    <th scope="row" className="py-2 pr-2 text-left font-normal">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <MiniAvatar avatar={s.avatar}/>
                                            <span className="min-w-0">
                                                <PlayerName name={s.name} className="block text-fg"/>
                                                {s.me && <Badge tone="brand" className="mt-0.5">{TABLE_COPY.you}</Badge>}
                                                {s.removed && <span className="block text-[11px] text-fg-muted">{SUMMARY_COPY.removed}</span>}
                                            </span>
                                        </span>
                                    </th>
                                    <td className="hidden py-2 text-right font-mono tabular-nums text-fg-soft sm:table-cell">{TABLE_COPY.chips(s.chipsIn)}</td>
                                    <td className="hidden py-2 text-right font-mono tabular-nums text-fg-soft sm:table-cell">{TABLE_COPY.chips(s.finished)}</td>
                                    <td className={cn('py-2 text-right font-mono tabular-nums', s.net > 0 ? 'text-positive' : s.net < 0 ? 'text-negative' : 'text-fg-soft')}
                                        data-net={s.net}>
                                        {BANK_COPY.net(s.net)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>
            )}

            <Panel pad={4} className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    <ActionButton size="md" className="inline-flex min-h-11 items-center gap-2" onClick={() => void copy()} data-copy-summary="">
                        <Copy className="size-4" aria-hidden="true"/>
                        {SUMMARY_COPY.copy}
                    </ActionButton>
                    {signedIn && (
                        <Link href="/poker-night" className={actionButton({variant: 'secondary', size: 'md', className: 'inline-flex min-h-11 items-center'})}
                              data-start-another="">
                            {SUMMARY_COPY.again}
                        </Link>
                    )}
                </div>
                {note && (
                    <p role="status" className={note === 'copied' ? 'text-xs text-positive' : 'text-xs text-warning'}>
                        {note === 'copied' ? SUMMARY_COPY.copied : SUMMARY_COPY.blocked}
                    </p>
                )}
                {note === 'blocked' && (
                    <TextArea readOnly value={text} rows={Math.min(12, summary.standings.length + 4)} aria-label={SUMMARY_COPY.copy}
                              className="w-full text-xs text-fg-soft" onFocus={(e) => e.currentTarget.select()}/>
                )}
                {!signedIn && (
                    <p className="text-xs text-fg-muted" data-guest-nudge="">
                        {SUMMARY_COPY.guestNudge}{' '}
                        <Link href="/sign-up" className="text-brand hover:underline">{SUMMARY_COPY.guestNudgeLink}</Link>
                    </p>
                )}
            </Panel>

            <footer className="space-y-1 px-1 text-xs text-fg-muted">
                <p>{SUMMARY_COPY.footer}</p>
                <p data-summary-check="">{BANK_COPY.check(counted, summary.broughtIn, 0)}</p>
            </footer>
        </main>
    );
};

export default NightSummary;
