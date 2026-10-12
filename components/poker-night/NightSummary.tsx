'use client';

// The end of the night, which a closed table's page shows to everyone who opens its link: the
// table, the date (in the reader's own time zone, so it is read in the browser), how many hands and
// how long; the final counts, everyone who sat by net — Chips in, Finished with, Net with its sign;
// the night's awards (P7), each card with every winner on a tie and the figure it was won with;
// Copy summary (the box to copy from by hand when the clipboard is blocked) and, on a phone, Share;
// "Start another table" for an account, the account nudge for a guest, and Home ("Back to
// AeroTrade", "/") for everyone — never a link a guest is bounced to sign in from; and the footer: play chips only, and the check
// that every chip is accounted for. An unframed scroll of Panels. A night with awards opens with a
// little celebration — confetti and the award cards stepping in — that both motion guards show
// in place (the confetti unseen), drawn the same on every screen from the table's code.

import type {CSSProperties} from "react";
import {useState, useSyncExternalStore} from "react";
import Link from "next/link";
import {Copy, Share2} from "lucide-react";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import {TextArea} from "@/components/primitives/TextField";
import {copyText, MiniAvatar, PlayerName, useCanShare} from "@/components/poker-night/overlay-kit";
import {HomeLink} from "@/components/poker-night/HomeLink";
import {BANK_COPY, OVERLAY_COPY, SUMMARY_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {awardGlyph, celebrationBits} from "@/lib/poker-night/awards";
import {nightDate, summaryText, type AwardView, type NightSummaryView} from "@/lib/poker-night/summary";
import {cn} from "@/lib/utils";

export type NightSummaryProps = {
    summary: NightSummaryView;
    signedIn: boolean; // "Start another table" for an account, the account nudge for a guest
};

// The confetti's colours: the palette's own, as the big win's (WinnerReveal).
const BITS = ['bg-brand', 'bg-warning', 'bg-positive', 'bg-negative', 'bg-secondary-tint', 'bg-fg'] as const;
// Each award card steps in this many motion-token units after the one before it.
const AWARD_STEP = 1.2;

// One burst from under the heading, in a fixed layer that clips it.
const Celebration = ({seed}: {seed: string}) => (
    <div className="pn-celebration" aria-hidden="true" data-celebration="">
        <div className="pn-confetti-field" style={{left: '50%', top: '7rem'}}>
            {celebrationBits(seed).map((bit) => (
                <span key={bit.key} className={cn('pn-confetti-bit pn-confetti', BITS[bit.key % BITS.length])}
                      style={{'--pn-x': `${bit.x}px`, '--pn-y': `${bit.y}px`, '--pn-rot': `${bit.rot}deg`, '--pn-wait': `${bit.wait}ms`} as CSSProperties}/>
            ))}
        </div>
    </div>
);

const AwardCard = ({award, step}: {award: AwardView; step: number}) => (
    <RowCard as="li" tone={award.winners.some((w) => w.me) ? 'selected' : 'plain'} className="pn-award-in flex items-start gap-3 px-3 py-3"
             style={{'--pn-at': (step * AWARD_STEP).toFixed(2)} as CSSProperties} data-award={award.id} data-award-value={award.value}>
        <span className="pn-award-glyph bg-brand/10" aria-hidden="true">{awardGlyph(award.id)}</span>
        <div className="min-w-0 flex-1 space-y-1">
            <h3><MicroLabel tone="soft">{SUMMARY_COPY.awards[award.id]}</MicroLabel></h3>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {award.winners.map((w) => (
                    <li key={w.pid} className="flex min-w-0 items-center gap-1.5" data-award-winner={w.pid}>
                        <MiniAvatar avatar={w.avatar}/>
                        <PlayerName name={w.name} className="text-sm text-fg"/>
                        {w.me && <Badge tone="brand">{TABLE_COPY.you}</Badge>}
                    </li>
                ))}
            </ul>
            <p className="font-mono text-xs tabular-nums text-fg-soft">{SUMMARY_COPY.awardFigure(award.id, award.value)}</p>
        </div>
    </RowCard>
);

const noSubscribe = () => () => {};

const NightSummary = ({summary, signedIn}: NightSummaryProps) => {
    // The date in the reader's time zone: none in the server's render, the browser's after.
    const date = useSyncExternalStore(noSubscribe, () => nightDate(summary.endedAt), () => null);
    const [note, setNote] = useState<'copied' | 'blocked' | null>(null);
    const text = summaryText(summary, date ?? nightDate(summary.endedAt, 'UTC'));
    const counted = summary.standings.reduce((sum, s) => sum + s.finished, 0);

    const copy = async () => setNote(await copyText(text));
    // navigator.share, on phones: the same text as the copy. A closed share sheet is no error.
    const canShare = useCanShare();
    const share = async () => {
        try {
            await navigator.share({title: SUMMARY_COPY.shareTitle(summary.table), text});
        } catch {
            // Cancelled, or the browser refused: the copy is still there.
        }
    };

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

            {summary.awards.length > 0 && (
                <Panel pad={4} aria-labelledby="night-summary-awards" data-night-awards="">
                    <SectionHeading id="night-summary-awards" spacing="sm">{SUMMARY_COPY.awardsHeading}</SectionHeading>
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {summary.awards.map((award, i) => <AwardCard key={award.id} award={award} step={i}/>)}
                    </ul>
                </Panel>
            )}

            <Panel pad={4} className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    <ActionButton size="md" className="inline-flex min-h-11 items-center gap-2" onClick={() => void copy()} data-copy-summary="">
                        <Copy className="size-4" aria-hidden="true"/>
                        {SUMMARY_COPY.copy}
                    </ActionButton>
                    {canShare && (
                        <ActionButton variant="secondary" size="md" className="inline-flex min-h-11 items-center gap-2" onClick={() => void share()} data-share-summary="">
                            <Share2 className="size-4" aria-hidden="true"/>
                            {SUMMARY_COPY.share}
                        </ActionButton>
                    )}
                    {signedIn && (
                        <Link href="/poker-night" className={actionButton({variant: 'secondary', size: 'md', className: 'inline-flex min-h-11 items-center'})}
                              data-start-another="">
                            {SUMMARY_COPY.again}
                        </Link>
                    )}
                    {/* Home for everyone: "/" is the landing page for a guest, never the sign-in. */}
                    <HomeLink className={actionButton({variant: 'secondary', size: 'md', className: 'inline-flex min-h-11 items-center'})} data-summary-home="">
                        {SUMMARY_COPY.home}
                    </HomeLink>
                </div>
                {note && (
                    <p role="status" className={note === 'copied' ? 'text-xs text-positive' : 'text-xs text-warning'}>
                        {note === 'copied' ? SUMMARY_COPY.copied : SUMMARY_COPY.blocked}
                    </p>
                )}
                {note === 'blocked' && (
                    <TextArea readOnly value={text} rows={Math.min(12, summary.standings.length + summary.awards.length + 4)} aria-label={SUMMARY_COPY.copy}
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
            {summary.awards.length > 0 && <Celebration seed={summary.code}/>}
        </main>
    );
};

export default NightSummary;
