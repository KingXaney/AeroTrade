import Link from "next/link";
import {LOBBY_COPY, POKER_NIGHT_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import type {LobbyNight} from "@/lib/poker-night/lobby";
import {actionButton} from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";

// The reader's latest nights as their account kept them (PokerResult): hands played and net
// chips, whose sign is in the text, so colour is never the only cue. A night still running says so;
// one whose room is still kept links to its table, which shows the summary once it has closed.
// Drawn only when there is one.

const RecentNights = ({nights}: {nights: LobbyNight[]}) => (
    <Panel id="poker-night-recent" aria-labelledby="poker-night-recent-heading" data-recent-nights="">
        <SectionHeading id="poker-night-recent-heading">{POKER_NIGHT_COPY.recentHeading}</SectionHeading>
        <ul className="space-y-2">
            {nights.map((night) => (
                <RowCard as="li" key={night.code} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-recent-night={night.code}>
                    <div className="min-w-0">
                        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                            <bdi className="truncate">{TABLE_COPY.name(night.name, night.code)}</bdi>
                            {!night.finished && <Badge tone="brand">{POKER_NIGHT_COPY.recentOpen}</Badge>}
                        </p>
                        <p className="font-mono text-xs text-fg-muted" data-net={night.net}>{POKER_NIGHT_COPY.recentRow(night.hands, night.net)}</p>
                    </div>
                    {night.href && (
                        <Link href={night.href} className={actionButton({variant: 'secondary', size: 'sm'})}>
                            {night.finished ? LOBBY_COPY.summary : POKER_NIGHT_COPY.open}
                        </Link>
                    )}
                </RowCard>
            ))}
        </ul>
    </Panel>
);

export default RecentNights;
