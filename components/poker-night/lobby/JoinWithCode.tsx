'use client';

import {useId, useState, type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {LOBBY_COPY, POKER_NIGHT_COPY} from "@/lib/learn/copy/poker-night";
import {normalizeCode} from "@/lib/poker-night/code";
import {tablePath} from "@/lib/poker-night/links";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import TextField from "@/components/primitives/TextField";

// A code read out loud or sent in a message: typed in any case, with spaces or dashes, and opened
// as /play/CODE (lib/poker-night/code.normalizeCode). Nothing is looked up here: an unknown code
// is the table page's own not-found.

const JoinWithCode = () => {
    const router = useRouter();
    const id = useId();
    const [raw, setRaw] = useState('');
    const [invalid, setInvalid] = useState(false);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const code = normalizeCode(raw);
        if (!code) {
            setInvalid(true);
            return;
        }
        router.push(tablePath(code));
    };

    return (
        <Panel as="form" onSubmit={submit} id="poker-night-join" aria-labelledby="poker-night-join-heading" className="flex flex-col"
               data-join-with-code="">
            <SectionHeading id="poker-night-join-heading">{POKER_NIGHT_COPY.joinHeading}</SectionHeading>
            <p className="text-sm leading-relaxed text-fg-soft">{LOBBY_COPY.joinLead}</p>
            <div className="mt-4 space-y-1.5">
                <MicroLabel as="label" htmlFor={`${id}-code`}>{POKER_NIGHT_COPY.codeLabel}</MicroLabel>
                <div className="flex gap-2">
                    <TextField id={`${id}-code`} value={raw} placeholder={POKER_NIGHT_COPY.codePlaceholder} maxLength={16}
                               className="h-11 min-w-0 flex-1 uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal" autoComplete="off" autoCapitalize="characters"
                               spellCheck={false} enterKeyHint="go" aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined}
                               onChange={(e) => {
                                   setRaw(e.target.value);
                                   setInvalid(false);
                               }}/>
                    <ActionButton type="submit" variant="secondary" size="md" className="h-11 shrink-0">{POKER_NIGHT_COPY.join}</ActionButton>
                </div>
                {invalid && <p id={`${id}-error`} role="alert" className="text-xs text-negative">{POKER_NIGHT_COPY.codeInvalid}</p>}
            </div>
        </Panel>
    );
};

export default JoinWithCode;
