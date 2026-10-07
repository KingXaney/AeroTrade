'use client';

// The dock's emote button (key E) and what it opens (P6): three tabs — React (twelve faces that
// rise over the viewer's plate), Say (sixteen phrases in a bubble) and Throw (ten things, then who
// gets it: the other seated players). The Throw tab is not offered while the host keeps throwables
// off, and the picker says so. A pick sends at once and closes the picker; the buttons grey out for
// the 1.2-second cooldown the room keeps (emote-client.sendEmoteNow). Seated players only: a watcher
// has no button. A popover over the dock, so the table stays in sight; it closes when the viewer's
// turn comes round, so nothing stands over the action bar.

import {useId, useState} from "react";
import {ChevronLeft, SmilePlus} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {iconButton} from "@/components/primitives/iconButton";
import {latestPickerRequest, sendEmoteNow, useCoolingDown, useEmotePickerRequest} from "@/components/poker-night/emote-client";
import {focusTableOnClose, MiniAvatar, PlayerName} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {EMOTE_COPY} from "@/lib/learn/copy/poker-night";
import {PHRASE_IDS, REACTION_IDS, reactionGlyph, THROW_IDS, throwGlyph, type EmoteInput, type ThrowId} from "@/lib/poker-night/emotes";
import {ROOM_KEY_SHORTCUTS} from "@/lib/poker-night/keys";
import {myTurnKey} from "@/lib/poker-night/overlays";
import {cn} from "@/lib/utils";

type Tab = 'react' | 'say' | 'throw';

const CELL = 'inline-flex items-center justify-center rounded-[var(--control-radius)] transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40';

type Ui = {open: boolean; tab: Tab; aim: ThrowId | null; requestSeen: number; turnSeen: number | null; closedByTurn: boolean};

const EmotePicker = () => {
    const room = useRoom();
    const id = useId();
    const view = room.view;
    const cooling = useCoolingDown();
    const request = useEmotePickerRequest();
    const turnKey = myTurnKey(view);
    const [ui, setUi] = useState<Ui>(() => ({open: false, tab: 'react', aim: null, requestSeen: latestPickerRequest(), turnSeen: turnKey, closedByTurn: false}));

    // Worked out during render (as TableOverlays does): the E key opens it, the viewer's turn closes it.
    let next = ui;
    if (request && request.id > next.requestSeen) next = {...next, requestSeen: request.id, open: true, closedByTurn: false};
    if (turnKey !== next.turnSeen) next = {...next, turnSeen: turnKey, ...(turnKey !== null && next.open ? {open: false, aim: null, closedByTurn: true} : {})};
    if (next !== ui) setUi(next);

    if (!view || view.me.seat === null) return null;
    const throwables = room.table.settings.throwables;
    const tabs: Tab[] = throwables ? ['react', 'say', 'throw'] : ['react', 'say'];
    const tab: Tab = tabs.includes(ui.tab) ? ui.tab : 'react';
    const targets = room.table.seats.flatMap((s) => (s && s.pid !== view.me.pid ? [{pid: s.pid, person: room.table.people[s.pid]}] : []));

    const setOpen = (open: boolean) => setUi((prev) => ({...prev, open, aim: open ? prev.aim : null, closedByTurn: false}));
    const send = (input: EmoteInput) => {
        setUi((prev) => ({...prev, open: false, aim: null}));
        void sendEmoteNow(room.sendEmote, input);
    };

    return (
        <Popover open={ui.open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className={cn(iconButton, 'chrome-surface size-11 shrink-0 rounded-full text-fg-soft')} aria-label={EMOTE_COPY.open}
                        title={EMOTE_COPY.open} aria-keyshortcuts={ROOM_KEY_SHORTCUTS.emotes} data-pn-emotes-open="">
                    <SmilePlus className="size-5" aria-hidden="true"/>
                </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-[min(20rem,calc(100vw-1.5rem))] gap-2 p-2 text-fg" data-pn-emote-picker=""
                            onCloseAutoFocus={focusTableOnClose(ui.closedByTurn)}>
                <div role="tablist" aria-label={EMOTE_COPY.tabsLabel} className={cn('grid gap-1 rounded-lg bg-surface-2/60 p-1', throwables ? 'grid-cols-3' : 'grid-cols-2')}>
                    {tabs.map((t) => {
                        const on = t === tab;
                        return (
                            <button key={t} type="button" role="tab" id={`${id}-tab-${t}`} aria-selected={on} aria-controls={`${id}-panel`} tabIndex={on ? 0 : -1}
                                    className={cn('control-type min-h-11 rounded-md px-1 text-xs transition-colors', on ? 'bg-brand text-on-brand' : 'text-fg-soft hover:bg-surface-3 hover:text-fg')}
                                    onClick={() => setUi((prev) => ({...prev, tab: t, aim: null}))}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                                        e.preventDefault();
                                        const to = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
                                        setUi((prev) => ({...prev, tab: to, aim: null}));
                                        document.getElementById(`${id}-tab-${to}`)?.focus();
                                    }}
                                    data-emote-tab={t}>
                                {EMOTE_COPY.tabs[t]}
                            </button>
                        );
                    })}
                </div>

                <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} className="max-h-[min(22rem,50dvh)] overflow-y-auto overscroll-contain">
                    {tab === 'react' && (
                        <div className="grid grid-cols-6 gap-1">
                            {REACTION_IDS.map((item) => (
                                <button key={item} type="button" className={cn(CELL, 'size-11 text-2xl leading-none')} disabled={cooling}
                                        aria-label={EMOTE_COPY.reactions[item]} title={EMOTE_COPY.reactions[item]}
                                        onClick={() => send({kind: 'react', item})} data-emote-react={item}>
                                    <span aria-hidden="true">{reactionGlyph(item)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {tab === 'say' && (
                        <div className="grid grid-cols-2 gap-1">
                            {PHRASE_IDS.map((item) => (
                                <button key={item} type="button" className={cn(CELL, 'min-h-11 justify-start border border-line-strong/25 px-2.5 text-left text-xs text-fg-soft hover:text-fg')}
                                        disabled={cooling} onClick={() => send({kind: 'say', item})} data-emote-say={item}>
                                    {EMOTE_COPY.phrases[item]}
                                </button>
                            ))}
                        </div>
                    )}
                    {tab === 'throw' && ui.aim === null && (
                        <div className="grid grid-cols-5 gap-1">
                            {THROW_IDS.map((item) => (
                                <button key={item} type="button" className={cn(CELL, 'size-11 text-2xl leading-none')} disabled={cooling}
                                        aria-label={EMOTE_COPY.throwables[item].label} title={EMOTE_COPY.throwables[item].label}
                                        onClick={() => setUi((prev) => ({...prev, aim: item}))} data-emote-throw={item}>
                                    <span aria-hidden="true">{throwGlyph(item)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {tab === 'throw' && ui.aim !== null && (
                        <div className="space-y-1.5" data-emote-aim={ui.aim}>
                            <div className="flex items-center gap-2">
                                <button type="button" className={cn(iconButton, 'size-11')} aria-label={EMOTE_COPY.back} title={EMOTE_COPY.back}
                                        onClick={() => setUi((prev) => ({...prev, aim: null}))}>
                                    <ChevronLeft className="size-5" aria-hidden="true"/>
                                </button>
                                <span aria-hidden="true" className="text-2xl leading-none">{throwGlyph(ui.aim)}</span>
                                <p className="min-w-0 flex-1 text-xs text-fg-soft">{EMOTE_COPY.pickTarget(ui.aim)}</p>
                            </div>
                            {targets.length === 0 ? (
                                <p className="px-1 text-xs text-fg-muted">{EMOTE_COPY.noTargets}</p>
                            ) : (
                                <ul className="grid grid-cols-2 gap-1">
                                    {targets.map(({pid, person}) => (
                                        <li key={pid}>
                                            <button type="button" className={cn(CELL, 'min-h-11 w-full justify-start gap-2 border border-line-strong/25 px-2 text-left text-xs text-fg')}
                                                    disabled={cooling} aria-label={EMOTE_COPY.throwItemAt(ui.aim!, person?.name ?? '')}
                                                    onClick={() => send({kind: 'throw', item: ui.aim!, to: pid})} data-emote-target={pid}>
                                                <MiniAvatar avatar={person?.avatar ?? null}/>
                                                <PlayerName name={person?.name ?? ''}/>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
                {!throwables && <p className="px-1 text-[11px] text-fg-muted" data-emote-off="">{EMOTE_COPY.off}</p>}
            </PopoverContent>
        </Popover>
    );
};

export default EmotePicker;
