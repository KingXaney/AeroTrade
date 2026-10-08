'use client';

// The invite: the game the table deals next ("Game: PLO"), the table link to copy (with the box to
// copy it from by hand when the clipboard is blocked), Share on a phone (its words naming the game), the code in two groups for reading aloud, and a QR code a phone camera
// opens. It opens by itself for the host who just started the table (?invite=1), and holds the
// host's "Deal the first hand" until the first deal, ready once two players sit.

import {lazy, Suspense, useId, useState} from "react";
import {toast} from "sonner";
import {Copy, QrCode as QrIcon, Share2} from "lucide-react";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import TextField from "@/components/primitives/TextField";
import {copyText, Drawer, useCanShare, useNarrow} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {INVITE_COPY, MODE_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {inviteDeal} from "@/lib/poker-night/overlays";
import {nextModeOf} from "@/lib/poker-night/variants";

const QrCode = lazy(() => import("@/components/poker-night/QrCode"));

type Props = {open: boolean; onOpenChange: (open: boolean) => void; toTable: boolean; onDealt: () => void};

const InviteSheet = ({open, onOpenChange, toTable, onDealt}: Props) => {
    const room = useRoom();
    const id = useId();
    const narrow = useNarrow();
    const canShare = useCanShare();
    const [note, setNote] = useState<'copied' | 'blocked' | null>(null);
    // The QR code shows at once on a wide screen, behind a button on a phone (which shares instead).
    const [qrChoice, setQrChoice] = useState<boolean | null>(null);
    const [dealing, setDealing] = useState(false);
    const showQr = qrChoice ?? !narrow;
    const table = room.table;
    const name = TABLE_COPY.name(table.settings.name, room.code);
    const deal = inviteDeal(table, room.me);
    const game = nextModeOf(room.config);
    const spoken = MODE_COPY.spokenLabel(game.variant, game.boards);

    const copy = async () => {
        const result = await copyText(room.shareUrl);
        setNote(result);
        if (result === 'blocked') document.getElementById(`${id}-link`)?.focus();
    };

    const share = async () => {
        try {
            await navigator.share({title: INVITE_COPY.shareTitle(name), text: INVITE_COPY.shareText(name, spoken), url: room.shareUrl});
        } catch {
            // Closed without sharing, or refused: the link is still in the box.
        }
    };

    const start = async () => {
        if (dealing) return;
        setDealing(true);
        const r = await room.send({type: 'host', op: {op: 'start'}});
        setDealing(false);
        if (r.ok) onDealt();
        else toast.error(r.message);
    };

    return (
        <Drawer open={open} onOpenChange={onOpenChange} title={INVITE_COPY.heading} toTable={toTable} data-pn-drawer="invite">
            <p className="text-sm font-medium text-fg" title={spoken} data-invite-mode={game.variant}>{INVITE_COPY.mode(MODE_COPY.label(game.variant, game.boards))}</p>
            <p className="text-sm leading-relaxed text-fg-soft">{INVITE_COPY.lead}</p>
            <Panel pad={4} className="space-y-3" aria-labelledby={`${id}-link-label`}>
                <MicroLabel as="label" id={`${id}-link-label`} htmlFor={`${id}-link`}>{INVITE_COPY.linkLabel}</MicroLabel>
                <TextField id={`${id}-link`} readOnly value={room.shareUrl} data-share-link="" className="h-11 w-full text-xs"
                           onFocus={(e) => e.currentTarget.select()}/>
                <div className="flex flex-wrap gap-2">
                    <ActionButton size="md" className="inline-flex min-h-11 items-center gap-2" onClick={() => void copy()} data-copy-link="">
                        <Copy className="size-4" aria-hidden="true"/>
                        {INVITE_COPY.copy}
                    </ActionButton>
                    {canShare && (
                        <ActionButton variant="secondary" size="md" className="inline-flex min-h-11 items-center gap-2" onClick={() => void share()}>
                            <Share2 className="size-4" aria-hidden="true"/>
                            {INVITE_COPY.share}
                        </ActionButton>
                    )}
                </div>
                {note && (
                    <p role="status" className={note === 'copied' ? 'text-xs text-positive' : 'text-xs text-warning'}>
                        {note === 'copied' ? INVITE_COPY.copied : INVITE_COPY.blocked}
                    </p>
                )}
            </Panel>

            <Panel pad={4} className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                    <MicroLabel>{INVITE_COPY.codeLabel}</MicroLabel>
                    <span className="font-mono text-2xl tracking-[0.2em] text-fg" data-table-code="">{INVITE_COPY.codeGrouped(room.code)}</span>
                </div>
                {showQr ? (
                    <div className="flex flex-col items-center gap-2">
                        <Suspense fallback={<div className="size-44 animate-pulse rounded-lg bg-surface-3 sm:size-48" aria-hidden="true"/>}>
                            <QrCode value={room.shareUrl}/>
                        </Suspense>
                        <p className="text-center text-xs text-fg-muted">{INVITE_COPY.qrCaption}</p>
                        {narrow && (
                            <ActionButton variant="secondary" size="sm" className="min-h-11" onClick={() => setQrChoice(false)}>
                                {INVITE_COPY.qrHide}
                            </ActionButton>
                        )}
                    </div>
                ) : (
                    <ActionButton variant="secondary" size="md" className="inline-flex min-h-11 items-center gap-2" onClick={() => setQrChoice(true)}>
                        <QrIcon className="size-4" aria-hidden="true"/>
                        {INVITE_COPY.qrShow}
                    </ActionButton>
                )}
            </Panel>

            {deal.show && (
                <Panel pad={4} className="space-y-2">
                    <ActionButton variant="strong" size="block" glow className="min-h-12" disabled={!deal.ready || dealing} aria-busy={dealing}
                                  onClick={() => void start()} data-deal-first="">
                        {INVITE_COPY.deal}
                    </ActionButton>
                    {!deal.ready && <p className="text-xs text-fg-muted">{INVITE_COPY.needTwo}</p>}
                </Panel>
            )}
        </Drawer>
    );
};

export default InviteSheet;
