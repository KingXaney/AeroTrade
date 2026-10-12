'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {createPokerNight} from "@/lib/actions/poker-night.actions";
import {LOBBY_COPY, MODE_COPY, POKER_NIGHT_COPY, POKER_NIGHT_ERRORS} from "@/lib/learn/copy/poker-night";
import {DEFAULT_CONFIG} from "@/lib/poker-night/config";
import {GAME_CHOICES, invitePath} from "@/lib/poker-night/lobby";
import type {Variant} from "@/lib/poker-night/types";
import ActionButton from "@/components/primitives/ActionButton";
import Disclosure from "@/components/primitives/Disclosure";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import CreateTableForm from "@/components/poker-night/lobby/CreateTableForm";
import {cn} from "@/lib/utils";

// Where a night starts: "Start a table" opens one with the defaults — Texas hold'em — in one tap and
// takes the host straight to it with the invite open; under it, one tap for each other game this
// deploy deals ("Start PLO"), the same defaults otherwise; "Set it up first" holds the form for a
// table set up before anyone sits down. At the open-table cap the buttons give way to the sentence
// that says so. data-quick-start names each button's game.

type Props = {
    // The host's name at the table: the form's default table name ("Ana's poker night").
    hostName: string;
    canCreate: boolean;
};

// Each other game's one-tap button.
const QUICK_LABEL: Record<Exclude<Variant, 'holdem'>, string> = {plo: POKER_NIGHT_COPY.quickPlo, 'triple-t': POKER_NIGHT_COPY.quickTripleT};
const others = GAME_CHOICES.filter((variant): variant is Exclude<Variant, 'holdem'> => variant !== 'holdem');

const QuickStart = ({hostName, canCreate}: Props) => {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [starting, setStarting] = useState<Variant | null>(null);
    const start = (variant: Variant) => {
        setError(null);
        setStarting(variant);
        startTransition(async () => {
            try {
                const result = await createPokerNight(variant === DEFAULT_CONFIG.variant ? {} : {config: {variant}});
                if (result.success) router.push(invitePath(result.code));
                else setError(result.message);
            } catch {
                setError(LOBBY_COPY.unreachable);
            }
        });
    };

    return (
        <Panel id="poker-night-start" aria-labelledby="poker-night-start-heading" className="flex flex-col" data-poker-night-start="">
            <SectionHeading id="poker-night-start-heading">{LOBBY_COPY.startHeading}</SectionHeading>
            {canCreate ? (
                <>
                    <ActionButton variant="strong" size="block" glow onClick={() => start(DEFAULT_CONFIG.variant)} disabled={pending}
                                  aria-busy={pending && starting === DEFAULT_CONFIG.variant} data-quick-start={DEFAULT_CONFIG.variant}>
                        {pending && starting === DEFAULT_CONFIG.variant ? POKER_NIGHT_COPY.starting : POKER_NIGHT_COPY.quickStart}
                    </ActionButton>
                    <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                        {POKER_NIGHT_COPY.quickStartHint(MODE_COPY.short[DEFAULT_CONFIG.variant], DEFAULT_CONFIG.smallBlind, DEFAULT_CONFIG.bigBlind, DEFAULT_CONFIG.buyInMax, DEFAULT_CONFIG.seats)}
                    </p>
                    {others.length > 0 && (
                        <div className={cn('mt-3 grid gap-2', others.length > 1 && 'grid-cols-2')} data-quick-others="">
                            {others.map((variant) => (
                                <ActionButton key={variant} variant="secondary" size="md" className="min-h-11 w-full" onClick={() => start(variant)} disabled={pending}
                                              aria-busy={pending && starting === variant} title={MODE_COPY.spoken[variant]} data-quick-start={variant}>
                                    {pending && starting === variant ? POKER_NIGHT_COPY.starting : QUICK_LABEL[variant]}
                                </ActionButton>
                            ))}
                        </div>
                    )}
                    {error && <p role="alert" className="mt-2 text-xs text-negative" data-start-error="">{error}</p>}
                    <Disclosure summary={POKER_NIGHT_COPY.setUp} className="mt-4" data-poker-night-setup="">
                        <CreateTableForm hostName={hostName}/>
                    </Disclosure>
                </>
            ) : (
                <p className="text-sm text-fg-soft" data-host-cap="">{POKER_NIGHT_ERRORS.host_cap}</p>
            )}
        </Panel>
    );
};

export default QuickStart;
