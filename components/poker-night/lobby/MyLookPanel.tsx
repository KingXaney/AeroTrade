'use client';

import {useId, useState, useSyncExternalStore, useTransition} from "react";
import {savePokerNightProfile} from "@/lib/actions/poker-night.actions";
import {AVATAR_COPY, JOIN_COPY, LOBBY_COPY, LOOKS_COPY} from "@/lib/learn/copy/poker-night";
import {resolveAvatar} from "@/lib/poker-night/avatar";
import {storedDiffers, type LobbyProfile} from "@/lib/poker-night/lobby";
import {NAME_INPUT_MAX} from "@/lib/poker-night/input";
import {scenePatch, type TableLook} from "@/lib/poker-night/looks";
import {afterAccountSave, effectiveLook, lookDiffers, ME_STORAGE_KEY, parseStoredMe, type PersonalLook} from "@/lib/poker-night/personal";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import TextField from "@/components/primitives/TextField";
import AvatarBuilder from "@/components/poker-night/AvatarBuilder";
import AvatarDisc from "@/components/poker-night/AvatarDisc";
import LookPicker from "@/components/poker-night/LookPicker";
import PersonalLookControls from "@/components/poker-night/PersonalLookControls";

// My look: what an account brings to every table it joins from now on, saved to its preferences
// (savePokerNightProfile) with one Save — the name and the avatar everyone sees (the full builder),
// the personal look only the reader sees (card back and face, suits, chips, sound and the rest:
// lib/poker-night/personal), and the scene and felt the reader's new tables open with. A blank name
// sits as the look's face. A save is mirrored into this browser (localStorage,
// lib/poker-night/personal.ME_STORAGE_KEY): the name and the avatar, and this browser's own look
// cleared, since the account holds it now — so the next table here opens as saved, and a later save
// from another device reaches it too.
//
// The table never calls a server action, so what a reader changes there stays in that browser; when
// it differs from the account's, "Save to my account" takes it over. The colours are LOOKS_CSS's,
// which the lobby page injects.

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

// What was saved, into this browser too: the name and the avatar, and none of the browser's own
// look, so the table here opens as the account does (personal.afterAccountSave).
const mirror = (saved: {name: string; avatar: string}) => {
    try {
        window.localStorage.setItem(ME_STORAGE_KEY, afterAccountSave(readKept(), saved));
    } catch {
        // Nothing kept here: the account still has it.
    }
};

type Draft = {name: string; avatar: string; look: PersonalLook; table: TableLook};

const MyLookPanel = ({profile}: {profile: LobbyProfile}) => {
    const id = useId();
    const [draft, setDraft] = useState<Draft>({name: profile.name, avatar: profile.avatar, look: profile.look, table: profile.table});
    const [status, setStatus] = useState<{ok: boolean; text: string} | null>(null);
    const [pending, startTransition] = useTransition();
    const kept = parseStoredMe(useSyncExternalStore(subscribe, readKept, nothingOnServer));
    const keptLook = effectiveLook(kept, profile.look);
    const offerKept = storedDiffers(kept, profile) || lookDiffers(kept.look, profile.look);
    const face = AVATAR_COPY.faces[resolveAvatar(draft.avatar).face];

    const edit = (patch: Partial<Draft>) => {
        setStatus(null);
        setDraft((prev) => ({...prev, ...patch}));
    };

    const save = (next: Draft) => {
        setStatus(null);
        startTransition(async () => {
            try {
                const result = await savePokerNightProfile(next);
                if (result.success) {
                    setDraft(next);
                    mirror(next);
                }
                setStatus({ok: result.success, text: result.message ?? (result.success ? LOBBY_COPY.saved : LOBBY_COPY.unreachable)});
            } catch {
                setStatus({ok: false, text: LOBBY_COPY.unreachable});
            }
        });
    };

    return (
        <Panel id="poker-night-look" aria-labelledby="poker-night-look-heading" className="lg:col-span-2" data-my-look="">
            <SectionHeading id="poker-night-look-heading" spacing="sm">{LOBBY_COPY.lookHeading}</SectionHeading>
            <p className="mb-4 text-xs leading-relaxed text-fg-muted">{LOBBY_COPY.lookLead}</p>
            <form
                className="space-y-6"
                onSubmit={(event) => {
                    event.preventDefault();
                    save(draft);
                }}
            >
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                        <AvatarBuilder value={draft.avatar} onChange={(avatar) => edit({avatar})} disabled={pending}/>
                        <div className="space-y-1.5">
                            <MicroLabel as="label" htmlFor={`${id}-name`}>{JOIN_COPY.nameLabel}</MicroLabel>
                            <TextField id={`${id}-name`} font="body" className="h-11 w-full" value={draft.name} maxLength={NAME_INPUT_MAX}
                                       placeholder={JOIN_COPY.namePlaceholder} autoComplete="nickname" aria-describedby={`${id}-name-rule`}
                                       onChange={(e) => edit({name: e.target.value})} data-field="look-name"/>
                            <p id={`${id}-name-rule`} className="text-[11px] text-fg-muted">
                                {draft.name.trim() === '' ? JOIN_COPY.blankName(face) : JOIN_COPY.nameRule}
                            </p>
                        </div>
                        <div className="space-y-2 border-t border-line-strong/15 pt-4" data-pn-default-table="">
                            <SectionHeading as="h3" size="xs" spacing="none">{LOOKS_COPY.tablesHeading}</SectionHeading>
                            <p className="text-xs leading-relaxed text-fg-muted">{LOOKS_COPY.tablesLead}</p>
                            <LookPicker look={draft.table} disabled={pending}
                                        onScene={(scene) => edit({table: scenePatch(scene)})}
                                        onFelt={(felt) => edit({table: {...draft.table, felt}})}/>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <SectionHeading as="h3" size="xs" spacing="none">{LOOKS_COPY.personalHeading}</SectionHeading>
                        <p className="text-xs leading-relaxed text-fg-muted">{LOOKS_COPY.personalLead}</p>
                        <PersonalLookControls look={draft.look} disabled={pending} onChange={(patch) => edit({look: {...draft.look, ...patch}})}/>
                    </div>
                </div>
                <div className="space-y-2">
                    <ActionButton type="submit" variant="primary" size="md" className="min-h-11" disabled={pending} aria-busy={pending} data-save-look="">
                        {pending ? LOBBY_COPY.saving : LOBBY_COPY.save}
                    </ActionButton>
                    {status && (
                        <p role={status.ok ? 'status' : 'alert'} className={status.ok ? 'text-xs text-fg-soft' : 'text-xs text-negative'}>{status.text}</p>
                    )}
                </div>
            </form>
            {offerKept && (
                <RowCard className="mt-4 flex flex-wrap items-center gap-3" data-kept-look="">
                    {kept.avatar && <AvatarDisc avatar={kept.avatar} size={36}/>}
                    <div className="min-w-0 flex-1">
                        <MicroLabel as="p">{LOBBY_COPY.fromBrowserHeading}</MicroLabel>
                        <p className="text-xs text-fg-soft">{LOBBY_COPY.fromBrowser(kept.name)}</p>
                    </div>
                    <ActionButton variant="secondary" disabled={pending} data-save-kept=""
                                  onClick={() => save({...draft, name: kept.name ?? draft.name, avatar: kept.avatar ?? draft.avatar, look: keptLook})}>
                        {LOBBY_COPY.saveToAccount}
                    </ActionButton>
                </RowCard>
            )}
        </Panel>
    );
};

export default MyLookPanel;
