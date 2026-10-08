'use client';

import {useState} from "react";
import Link from "next/link";
import {toast} from "sonner";
import {closePokerNight} from "@/lib/actions/poker-night.actions";
import {LOBBY_COPY, POKER_NIGHT_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {modeLine, type LobbyTable} from "@/lib/poker-night/lobby";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import TextField from "@/components/primitives/TextField";

// The tables the reader hosts that are still open (lib/poker-night/lobby.shapeLobby; the page draws
// this only when there is one): each with the way back in, its link to copy, and ending the night
// from here — the host's 'end' through closePokerNight, after a confirmation, since it closes the
// table for everyone once any hand in play finishes.

// What a row says under it after Copy link: copied, or the clipboard refused (the link in a box).
type Note = {code: string; kind: 'copied' | 'blocked'; text: string};

const OpenTables = ({tables}: {tables: LobbyTable[]}) => {
    const [note, setNote] = useState<Note | null>(null);
    const [ending, setEnding] = useState<LobbyTable | null>(null);

    const copy = async (table: LobbyTable) => {
        try {
            await navigator.clipboard.writeText(table.shareUrl);
            setNote({code: table.code, kind: 'copied', text: LOBBY_COPY.copied});
        } catch {
            setNote({code: table.code, kind: 'blocked', text: LOBBY_COPY.blocked});
        }
    };

    // A toast, not a row note: a table with no hand in play closes at once and leaves the list.
    const end = async (table: LobbyTable) => {
        try {
            const result = await closePokerNight(table.code);
            if (result.success) toast.success(result.message ?? LOBBY_COPY.ended);
            else toast.error(result.message ?? LOBBY_COPY.unreachable);
        } catch {
            toast.error(LOBBY_COPY.unreachable);
        }
    };

    return (
        <Panel id="poker-night-open" aria-labelledby="poker-night-open-heading" data-open-tables="">
            <SectionHeading id="poker-night-open-heading">{POKER_NIGHT_COPY.openHeading}</SectionHeading>
            <ul className="space-y-2">
                {tables.map((table) => {
                    const shown = TABLE_COPY.name(table.name, table.code);
                    const mine = note?.code === table.code ? note : null;
                    return (
                        <RowCard as="li" key={table.code} className="space-y-2" data-open-table={table.code}>
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-fg"><bdi>{shown}</bdi></p>
                                    <p className="text-xs text-fg-muted">{POKER_NIGHT_COPY.openRow(modeLine(table), table.seated, table.seats, table.hands)}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Link href={table.href} className={actionButton({variant: 'primary', size: 'sm'})}>{POKER_NIGHT_COPY.open}</Link>
                                    <ActionButton variant="secondary" onClick={() => void copy(table)} data-copy-link={table.code}>
                                        {LOBBY_COPY.copyLink}
                                    </ActionButton>
                                    <ActionButton variant="danger" onClick={() => setEnding(table)} data-end-table={table.code}>
                                        {LOBBY_COPY.end}
                                    </ActionButton>
                                </div>
                            </div>
                            {mine && (
                                <div className="space-y-1.5">
                                    <p role="status" className="text-xs text-fg-soft">{mine.text}</p>
                                    {/* The clipboard refused: the link in a box to copy by hand. */}
                                    {mine.kind === 'blocked' && (
                                        <TextField readOnly value={table.shareUrl} aria-label={LOBBY_COPY.copyLink} className="w-full text-xs"
                                                   onFocus={(e) => e.currentTarget.select()}/>
                                    )}
                                </div>
                            )}
                        </RowCard>
                    );
                })}
            </ul>
            <ConfirmDialog
                open={ending !== null}
                onOpenChange={(open) => {
                    if (!open) setEnding(null);
                }}
                title={ending ? LOBBY_COPY.endTitle(TABLE_COPY.name(ending.name, ending.code)) : ''}
                description={LOBBY_COPY.endBody}
                confirmLabel={LOBBY_COPY.end}
                destructive
                onConfirm={async () => {
                    if (ending) await end(ending);
                }}
            />
        </Panel>
    );
};

export default OpenTables;
