'use client';

// The table's top bar, 48 px and the iPhone's safe area: the table's name and code and how the
// table is reaching this browser, and what the host has set in motion (paused, or pausing or ending
// after the hand in play, which still plays on), then the drawers — Invite, Bank, Host (the host's, with a dot
// while rebuy requests wait), and the menu with the hand log, My look and the viewer's own seat
// (sit out next hand, deal me in, I'm back, take a seat, leave the table). Every target is at
// least 44 px; a phone shows the same buttons with the name cut short.

import {Coins, Crown, Hourglass, LogOut, Menu, ScrollText, Smile, UserPlus, Armchair, Pause, Play} from "lucide-react";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {iconButton} from "@/components/primitives/iconButton";
import type {DrawerKind} from "@/components/poker-night/overlay-requests";
import {useRoom} from "@/components/poker-night/room-controller";
import {HOST_COPY, INVITE_COPY, OVERLAY_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {handLive, ownSeat, waitingRequests, type SeatChoice} from "@/lib/poker-night/overlays";
import {cn} from "@/lib/utils";

type Props = {
    onOpen: (drawer: DrawerKind) => void;
    onSeatChoice: (choice: SeatChoice) => void;
    onTakeSeat: () => void;
    onLeave: () => void;
};

const ICON = cn(iconButton, 'relative size-11 shrink-0');

const SEAT_LABEL: Record<SeatChoice, string> = {'sit-out': TABLE_COPY.sitOut, 'deal-me-in': TABLE_COPY.dealMeIn, back: TABLE_COPY.back};

const TopBar = ({onOpen, onSeatChoice, onTakeSeat, onLeave}: Props) => {
    const room = useRoom();
    const table = room.table;
    const name = TABLE_COPY.name(table.settings.name, room.code);
    const joined = room.view !== null;
    const own = room.view ? ownSeat(room.view) : null;
    const waiting = waitingRequests(table, room.me);
    const connection = TABLE_COPY.connection[room.mode === 'realtime' ? 'live' : room.mode];
    // While a hand plays on, a pause or the night's end waits for it: the bar says "after this hand".
    const live = handLive(table);
    const status = table.status === 'closed' ? null
        : table.closing ? 'closing'
            : table.status === 'paused' ? (live ? 'pausing' : 'paused') : null;

    return (
        <header
            className="chrome-surface fixed inset-x-0 top-0 z-30 flex items-center gap-1 rounded-none pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)]"
            data-pn-topbar="" data-pn-connection={room.mode}>
            <div className="flex h-12 min-w-0 flex-1 items-center gap-2">
                <div className="min-w-0">
                    <p className="truncate font-heading text-sm leading-tight text-fg" data-user-text="">{name}</p>
                    <p className="flex items-center gap-1.5 text-[11px] leading-tight text-fg-muted">
                        <span className="font-mono tracking-wider" aria-label={OVERLAY_COPY.code(room.code)}>{INVITE_COPY.codeGrouped(room.code)}</span>
                        {joined && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1" role="status" title={connection}>
                                    <span aria-hidden="true"
                                          className={cn('size-1.5 rounded-full', room.mode === 'reconnecting' ? 'bg-warning' : 'bg-positive')}/>
                                    <span className="sr-only sm:not-sr-only">{connection}</span>
                                </span>
                            </>
                        )}
                        {status && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span className={cn('inline-flex min-w-0 items-center gap-1', status === 'paused' ? 'text-warning' : 'text-fg-soft')}
                                      role="status" title={TABLE_COPY[status]} data-pn-table-status={status}>
                                    {status === 'paused' ? <Pause className="size-3 shrink-0" aria-hidden="true"/> : <Hourglass className="size-3 shrink-0" aria-hidden="true"/>}
                                    <span className="sr-only truncate sm:not-sr-only">{TABLE_COPY[status]}</span>
                                </span>
                            </>
                        )}
                    </p>
                </div>
            </div>

            <nav aria-label={TABLE_COPY.menu} className="flex shrink-0 items-center">
                <button type="button" className={ICON} aria-label={TABLE_COPY.invite} title={TABLE_COPY.invite} onClick={() => onOpen('invite')} data-open="invite">
                    <UserPlus className="size-5" aria-hidden="true"/>
                </button>
                <button type="button" className={ICON} aria-label={TABLE_COPY.bank} title={TABLE_COPY.bank} onClick={() => onOpen('bank')} data-open="bank">
                    <Coins className="size-5" aria-hidden="true"/>
                </button>
                {room.me?.isHost && (
                    <button type="button" className={ICON} title={TABLE_COPY.host} onClick={() => onOpen('host')} data-open="host"
                            aria-label={waiting > 0 ? `${TABLE_COPY.host}, ${HOST_COPY.requests(waiting)}` : TABLE_COPY.host}>
                        <Crown className="size-5" aria-hidden="true"/>
                        {waiting > 0 && <span aria-hidden="true" className="absolute right-2 top-2 size-2.5 rounded-full bg-warning outline-2 outline-chrome" data-requests-dot=""/>}
                    </button>
                )}
                {joined && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button type="button" className={ICON} aria-label={TABLE_COPY.menu} title={TABLE_COPY.menu} data-open="menu">
                                <Menu className="size-5" aria-hidden="true"/>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60 text-fg">
                            <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => onOpen('log')} data-menu="log">
                                <ScrollText className="size-4" aria-hidden="true"/>{TABLE_COPY.log}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => onOpen('look')} data-menu="look">
                                <Smile className="size-4" aria-hidden="true"/>{OVERLAY_COPY.myLook}
                            </DropdownMenuItem>
                            {own && (own.choice || own.canTakeSeat || own.canLeave) && <DropdownMenuSeparator/>}
                            {own?.choice && (
                                <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => onSeatChoice(own.choice!)} data-menu={own.choice}>
                                    {own.choice === 'sit-out' ? <Pause className="size-4" aria-hidden="true"/> : <Play className="size-4" aria-hidden="true"/>}
                                    {SEAT_LABEL[own.choice]}
                                </DropdownMenuItem>
                            )}
                            {own?.canTakeSeat && (
                                <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={onTakeSeat} data-menu="take-seat">
                                    <Armchair className="size-4" aria-hidden="true"/>{OVERLAY_COPY.takeSeat}
                                </DropdownMenuItem>
                            )}
                            {own?.canLeave && (
                                <DropdownMenuItem variant="destructive" className="min-h-11 gap-3 px-3 text-sm" onSelect={onLeave} data-menu="leave">
                                    <LogOut className="size-4" aria-hidden="true"/>{TABLE_COPY.leaveTable}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </nav>
        </header>
    );
};

export default TopBar;
