'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {createPokerNight} from "@/lib/actions/poker-night.actions";
import {LOBBY_COPY, POKER_NIGHT_COPY, POKER_NIGHT_ERRORS} from "@/lib/learn/copy/poker-night";
import {DEFAULT_CONFIG} from "@/lib/poker-night/config";
import {invitePath} from "@/lib/poker-night/lobby";
import ActionButton from "@/components/primitives/ActionButton";
import Disclosure from "@/components/primitives/Disclosure";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import CreateTableForm from "@/components/poker-night/lobby/CreateTableForm";

// Where a night starts: "Start a table" opens one with the defaults in one tap and takes the host
// straight to it with the invite open; "Set it up first" holds the form for a table set up before
// anyone sits down. At the open-table cap the button gives way to the sentence that says so.

type Props = {
    // The host's name at the table: the form's default table name ("Ana's poker night").
    hostName: string;
    canCreate: boolean;
};

const QuickStart = ({hostName, canCreate}: Props) => {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const start = () => {
        setError(null);
        startTransition(async () => {
            try {
                const result = await createPokerNight({});
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
                    <ActionButton variant="strong" size="block" glow onClick={start} disabled={pending} aria-busy={pending} data-quick-start="">
                        {pending ? POKER_NIGHT_COPY.starting : POKER_NIGHT_COPY.quickStart}
                    </ActionButton>
                    <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                        {POKER_NIGHT_COPY.quickStartHint(DEFAULT_CONFIG.smallBlind, DEFAULT_CONFIG.bigBlind, DEFAULT_CONFIG.buyInMax, DEFAULT_CONFIG.seats)}
                    </p>
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
