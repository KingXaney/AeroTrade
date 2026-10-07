'use client';

import {useId, useState, useSyncExternalStore, useTransition} from "react";
import {savePokerNightProfile} from "@/lib/actions/poker-night.actions";
import {AVATAR_COPY, JOIN_COPY, LOBBY_COPY} from "@/lib/learn/copy/poker-night";
import {badgeGlyph, encodeAvatar, faceGlyph, resolveAvatar, rollAvatar} from "@/lib/poker-night/avatar";
import {ME_STORAGE_KEY, readStoredMe, storedDiffers, type LobbyProfile} from "@/lib/poker-night/lobby";
import {NAME_INPUT_MAX} from "@/lib/poker-night/input";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import TextField from "@/components/primitives/TextField";
import {cn} from "@/lib/utils";

// My look (P3): the name and the look an account sits down with at every table it joins from now
// on, saved to its preferences (savePokerNightProfile). The look is rolled, never typed; a blank
// name sits as the look's face. A browser that joined a table as a guest keeps that name and look
// (localStorage, lib/poker-night/lobby.ME_STORAGE_KEY); when it differs from the account's, "Save
// to my account" takes it over. The builder, card backs and the rest of the look are P5's.

// The browser's kept look, read through the store React subscribes to: nothing on the server,
// the stored text in the browser (a string, so the snapshot is stable), and a change in another
// tab arrives as a 'storage' event.
const subscribe = (onChange: () => void) => {
    window.addEventListener('storage', onChange);
    return () => window.removeEventListener('storage', onChange);
};
const readKept = (): string | null => {
    try {
        return window.localStorage.getItem(ME_STORAGE_KEY);
    } catch {
        return null;
    }
};
const nothingOnServer = (): string | null => null;

// The look as a disc: the face, and the badge at its shoulder. Its colour and frame come with the
// looks (P5); the face's name is the picture's label.
export const LookDisc = ({avatar, size = 'lg'}: {avatar: string; size?: 'sm' | 'lg'}) => {
    const spec = resolveAvatar(avatar);
    const badge = badgeGlyph(spec.badge);
    return (
        <span role="img" aria-label={JOIN_COPY.lookLabel(AVATAR_COPY.faces[spec.face])} data-avatar={avatar}
              className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 ring-1 ring-line-strong/40',
                  size === 'lg' ? 'size-16 text-4xl' : 'size-9 text-xl')}>
            <span aria-hidden="true">{faceGlyph(spec.face)}</span>
            {badge && <span aria-hidden="true" className={cn('absolute -right-1 -top-1', size === 'lg' ? 'text-lg' : 'text-xs')}>{badge}</span>}
        </span>
    );
};

const MyLookPanel = ({profile}: {profile: LobbyProfile}) => {
    const id = useId();
    const [name, setName] = useState(profile.name);
    const [avatar, setAvatar] = useState(profile.avatar);
    const [status, setStatus] = useState<{ok: boolean; text: string} | null>(null);
    const [pending, startTransition] = useTransition();
    const kept = readStoredMe(useSyncExternalStore(subscribe, readKept, nothingOnServer));
    const offerKept = storedDiffers(kept, profile);
    const face = AVATAR_COPY.faces[resolveAvatar(avatar).face];

    const save = (next: {name: string; avatar: string}) => {
        setStatus(null);
        startTransition(async () => {
            try {
                const result = await savePokerNightProfile(next);
                if (result.success) {
                    setName(next.name);
                    setAvatar(next.avatar);
                }
                setStatus({ok: result.success, text: result.message ?? (result.success ? LOBBY_COPY.saved : LOBBY_COPY.unreachable)});
            } catch {
                setStatus({ok: false, text: LOBBY_COPY.unreachable});
            }
        });
    };

    return (
        <Panel id="poker-night-look" aria-labelledby="poker-night-look-heading" data-my-look="">
            <SectionHeading id="poker-night-look-heading" spacing="sm">{LOBBY_COPY.lookHeading}</SectionHeading>
            <p className="mb-4 text-xs leading-relaxed text-fg-muted">{LOBBY_COPY.lookLead}</p>
            <form
                className="space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    save({name, avatar});
                }}
            >
                <div className="flex items-center gap-4">
                    <LookDisc avatar={avatar}/>
                    <ActionButton variant="secondary" size="md" className="min-h-11" data-roll-look=""
                                  onClick={() => setAvatar(encodeAvatar(rollAvatar(Math.random)))}>
                        {JOIN_COPY.roll}
                    </ActionButton>
                </div>
                <div className="space-y-1.5">
                    <MicroLabel as="label" htmlFor={`${id}-name`}>{JOIN_COPY.nameLabel}</MicroLabel>
                    <TextField id={`${id}-name`} font="body" className="h-11 w-full" value={name} maxLength={NAME_INPUT_MAX}
                               placeholder={JOIN_COPY.namePlaceholder} autoComplete="nickname" aria-describedby={`${id}-name-rule`}
                               onChange={(e) => setName(e.target.value)} data-field="look-name"/>
                    <p id={`${id}-name-rule`} className="text-[11px] text-fg-muted">
                        {name.trim() === '' ? JOIN_COPY.blankName(face) : JOIN_COPY.nameRule}
                    </p>
                </div>
                <ActionButton type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending} data-save-look="">
                    {pending ? LOBBY_COPY.saving : LOBBY_COPY.save}
                </ActionButton>
                {status && (
                    <p role={status.ok ? 'status' : 'alert'} className={status.ok ? 'text-xs text-fg-soft' : 'text-xs text-negative'}>{status.text}</p>
                )}
            </form>
            {offerKept && kept && (
                <RowCard className="mt-4 flex flex-wrap items-center gap-3" data-kept-look="">
                    {kept.avatar && <LookDisc avatar={kept.avatar} size="sm"/>}
                    <div className="min-w-0 flex-1">
                        <MicroLabel as="p">{LOBBY_COPY.fromBrowserHeading}</MicroLabel>
                        <p className="text-xs text-fg-soft">{LOBBY_COPY.fromBrowser(kept.name)}</p>
                    </div>
                    <ActionButton variant="secondary" disabled={pending} data-save-kept=""
                                  onClick={() => save({name: kept.name ?? name, avatar: kept.avatar ?? avatar})}>
                        {LOBBY_COPY.saveToAccount}
                    </ActionButton>
                </RowCard>
            )}
        </Panel>
    );
};

export default MyLookPanel;
