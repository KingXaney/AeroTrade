'use client';

// The table's top bar, 48 px and the iPhone's safe area: Home first ("Back to AeroTrade", a full
// page load of "/" — straight there for a visitor or a watcher, through the leave dialog for a
// seated player), the table's name and code and how the table is reaching this browser (the word
// shown even on a phone while it is reconnecting), and what the host has set in motion (paused, or
// pausing or ending after the hand in play, which still plays on), then the drawers — Invite, Bank
// and Host (each with a dot for the host while requests for chips wait: the bank is where they are
// answered), and the menu with the hand log, the Hands guide (also the H key), My look and the
// viewer's own seat (sit out next hand, deal me in, I'm back, take a seat, "Leave after this hand" —
// or "Stay at the table" once chosen — and Leave: "Leave now" mid-hand). Home carries a dot while the
// viewer leaves after the hand in play. The status line keeps the code on one line and never runs under the
// buttons: what it adds is cut short first, and on a phone while reconnecting the code steps aside
// (the Invite sheet has it) so the warning reads whole.
// Every target is at least 44 px; a phone shows the same buttons with the name cut short. My look
// (P5) also has its own button beside the menu from 640 px, one tap from the table: the avatar
// builder and the personal look (on a phone it is the menu's, which keeps the name room to read).

import {Coins, Crown, DoorOpen, Hourglass, House, LogOut, Menu, ScrollText, Smile, UserPlus, Armchair, Pause, Play, Palette} from "lucide-react";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {iconButton} from "@/components/primitives/iconButton";
import {HomeLink} from "@/components/poker-night/HomeLink";
import type {DrawerKind} from "@/components/poker-night/overlay-requests";
import {useRoom} from "@/components/poker-night/room-controller";
import {BookOpen, Keyboard} from "lucide-react";
import {openShortcuts} from "@/components/poker-night/emote-client";
import {HANDS_COPY, SHORTCUTS_COPY} from "@/lib/learn/copy/poker-night";
import {ROOM_KEY_SHORTCUTS} from "@/lib/poker-night/keys";
import {HOST_COPY, INVITE_COPY, OVERLAY_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {handLive, homeAsks, ownSeat, waitingRequests, type SeatChoice} from "@/lib/poker-night/overlays";
import {cn} from "@/lib/utils";

type Props = {
    onOpen: (drawer: DrawerKind) => void;
    onSeatChoice: (choice: SeatChoice) => void;
    onTakeSeat: () => void;
    onLeave: () => void;
    onLeaveAfter: (on: boolean) => void; // "Leave after this hand", and Stay
    onHome: () => void; // a seated player's Home: the leave dialog, then "/"
};

const ICON = cn(iconButton, 'relative size-11 shrink-0');

const SEAT_LABEL: Record<SeatChoice, string> = {'sit-out': TABLE_COPY.sitOut, 'deal-me-in': TABLE_COPY.dealMeIn, back: TABLE_COPY.back};

const TopBar = ({onOpen, onSeatChoice, onTakeSeat, onLeave, onLeaveAfter, onHome}: Props) => {
    const room = useRoom();
    const table = room.table;
    const name = TABLE_COPY.name(table.settings.name, room.code);
    const joined = room.view !== null;
    const own = room.view ? ownSeat(room.view) : null;
    const waiting = waitingRequests(table, room.me);
    const connection = TABLE_COPY.connection[room.mode === 'realtime' ? 'live' : room.mode];
    const connectionNote = TABLE_COPY.connectionNote[room.mode === 'realtime' ? 'live' : room.mode];
    // While a hand plays on, a pause or the night's end waits for it: the bar says "after this hand".
    const live = handLive(table);
    const reconnecting = room.mode === 'reconnecting';
    const status = table.status === 'closed' ? null
        : table.closing ? 'closing'
            : table.status === 'paused' ? (live ? 'pausing' : 'paused') : null;

    return (
        <header
            className="chrome-surface fixed inset-x-0 top-0 z-30 flex items-center gap-1 rounded-none pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)]"
            data-pn-topbar="" data-pn-connection={room.mode}>
            {/* Home: a full page load of "/" (the app's Home for an account, the landing page for a guest),
                so the table's connection, wake lock and sounds end with the page; a seated player is asked first. */}
            {homeAsks(room.view) ? (
                <button type="button" className={cn(ICON, '-ml-2')} aria-label={own?.leaveAfter === 'set' ? `${TABLE_COPY.home}, ${TABLE_COPY.leavingAfter}` : TABLE_COPY.home}
                        title={TABLE_COPY.home} onClick={onHome} data-open="home">
                    <House className="size-5" aria-hidden="true"/>
                    {own?.leaveAfter === 'set' && <span aria-hidden="true" className="absolute right-2 top-2 size-2.5 rounded-full bg-warning outline-2 outline-chrome" data-pn-leaving-dot=""/>}
                </button>
            ) : (
                <HomeLink className={cn(ICON, '-ml-2')} aria-label={TABLE_COPY.home} title={TABLE_COPY.home} data-open="home">
                    <House className="size-5" aria-hidden="true"/>
                </HomeLink>
            )}
            <div className="flex h-12 min-w-0 flex-1 items-center gap-2">
                <div className="min-w-0">
                    <p className="truncate font-heading text-sm leading-tight text-fg" data-user-text="">{name}</p>
                    <p className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] leading-tight text-fg-muted" data-pn-status-line="">
                        <span className={cn('shrink-0 whitespace-nowrap font-mono tracking-wider', reconnecting && 'max-sm:hidden')} aria-label={OVERLAY_COPY.code(room.code)}
                              data-pn-code="">
                            {INVITE_COPY.codeGrouped(room.code)}
                        </span>
                        {joined && (
                            <>
                                <span aria-hidden="true" className={cn(reconnecting && 'max-sm:hidden')}>·</span>
                                <span className="inline-flex shrink-0 items-center gap-1" role="status" title={connectionNote}>
                                    <span aria-hidden="true"
                                          className={cn('size-1.5 rounded-full', room.mode === 'reconnecting' ? 'bg-warning' : 'bg-positive')}/>
                                    <span className={room.mode === 'reconnecting' ? 'text-warning' : 'sr-only sm:not-sr-only'} data-pn-connection-word="">{connection}</span>
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
                <button type="button" className={ICON} title={TABLE_COPY.bank} onClick={() => onOpen('bank')} data-open="bank"
                        aria-label={waiting > 0 ? `${TABLE_COPY.bank}, ${HOST_COPY.requests(waiting)}` : TABLE_COPY.bank}>
                    <Coins className="size-5" aria-hidden="true"/>
                    {waiting > 0 && <span aria-hidden="true" className="absolute right-2 top-2 size-2.5 rounded-full bg-warning outline-2 outline-chrome" data-bank-requests-dot=""/>}
                </button>
                {room.me?.isHost && (
                    <button type="button" className={ICON} title={TABLE_COPY.host} onClick={() => onOpen('host')} data-open="host"
                            aria-label={waiting > 0 ? `${TABLE_COPY.host}, ${HOST_COPY.requests(waiting)}` : TABLE_COPY.host}>
                        <Crown className="size-5" aria-hidden="true"/>
                        {waiting > 0 && <span aria-hidden="true" className="absolute right-2 top-2 size-2.5 rounded-full bg-warning outline-2 outline-chrome" data-requests-dot=""/>}
                    </button>
                )}
                {joined && (
                    <button type="button" className={cn(ICON, 'hidden sm:inline-flex')} aria-label={OVERLAY_COPY.myLook} title={OVERLAY_COPY.myLook} onClick={() => onOpen('look')} data-open="look">
                        <Palette className="size-5" aria-hidden="true"/>
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
                            {/* P2: the hand rankings and the game (HandsDrawer; also the H key). */}
                            <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => onOpen('hands')} data-menu="hands" aria-keyshortcuts={ROOM_KEY_SHORTCUTS.hands}>
                                <BookOpen className="size-4" aria-hidden="true"/>{HANDS_COPY.menu}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => onOpen('look')} data-menu="look">
                                <Smile className="size-4" aria-hidden="true"/>{OVERLAY_COPY.myLook}
                            </DropdownMenuItem>
                            {/* P6: every key the table answers (ShortcutsDialog; also the ? key). */}
                            <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={openShortcuts} data-menu="shortcuts" aria-keyshortcuts={ROOM_KEY_SHORTCUTS.shortcuts}>
                                <Keyboard className="size-4" aria-hidden="true"/>{SHORTCUTS_COPY.open}
                            </DropdownMenuItem>
                            {own && (own.choice || own.canTakeSeat || own.canLeave || own.leaveAfter) && <DropdownMenuSeparator/>}
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
                            {/* Leave after this hand: one tap, no dialog (Stay takes it back). */}
                            {own?.leaveAfter === 'offer' && (
                                <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => onLeaveAfter(true)} data-menu="leave-after">
                                    <DoorOpen className="size-4" aria-hidden="true"/>{TABLE_COPY.leaveAfter}
                                </DropdownMenuItem>
                            )}
                            {own?.leaveAfter === 'set' && (
                                <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => onLeaveAfter(false)} data-menu="stay">
                                    <Armchair className="size-4" aria-hidden="true"/>{TABLE_COPY.stayAtTable}
                                </DropdownMenuItem>
                            )}
                            {own?.canLeave && (
                                <DropdownMenuItem variant="destructive" className="min-h-11 gap-3 px-3 text-sm" onSelect={onLeave} data-menu="leave">
                                    <LogOut className="size-4" aria-hidden="true"/>{own.dealtIn ? TABLE_COPY.leaveNow : TABLE_COPY.leaveTable}
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
