import Link from "next/link";
import {POKER_NIGHT_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {modeLine, type FriendTable} from "@/lib/poker-night/lobby";
import {actionButton} from "@/components/primitives/ActionButton";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";

// Open tables an accepted friend chose to show to friends (showToFriends, off unless the host
// turns it on), each with its game, its host's name at the table and the way in. Drawn only when there is one.

const FriendsTables = ({tables}: {tables: FriendTable[]}) => (
    <Panel id="poker-night-friends" aria-labelledby="poker-night-friends-heading" data-friends-tables="">
        <SectionHeading id="poker-night-friends-heading" spacing="sm">{POKER_NIGHT_COPY.friendsHeading}</SectionHeading>
        <p className="mb-3 text-xs text-fg-muted">{POKER_NIGHT_COPY.friendsLead}</p>
        <ul className="space-y-2">
            {tables.map((table) => (
                <RowCard as="li" key={table.code} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-friend-table={table.code}>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg"><bdi>{TABLE_COPY.name(table.name, table.code)}</bdi></p>
                        <p className="text-xs text-fg-muted">{POKER_NIGHT_COPY.friendsRow(modeLine(table), table.host, table.seated, table.seats)}</p>
                    </div>
                    <Link href={table.href} className={actionButton({variant: 'secondary', size: 'sm'})}>{POKER_NIGHT_COPY.open}</Link>
                </RowCard>
            ))}
        </ul>
    </Panel>
);

export default FriendsTables;
