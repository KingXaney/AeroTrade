'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {toast} from "sonner";
import {enrollAiNavigator, pauseAiNavigator, resumeAiNavigator, runAiNavigatorNow, unenrollAiNavigator} from "@/lib/actions/navigator.actions";
import {PAPER_STARTING_BALANCE, STARTING_BALANCE_RANGE, resolveStartingBalance} from "@/lib/trading/starting-balance";
import {runWithToast} from "@/lib/action-toast";
import type {ActionResult} from '@/lib/actions/types';
import type {NavigatorStatus} from '@/lib/navigator/types';
import Panel from '@/components/primitives/Panel';
import ActionButton from '@/components/primitives/ActionButton';
import TextField from '@/components/primitives/TextField';

// Enrollment + kill switch for the AI-managed paper account.
const NavigatorCard = ({status}: {status: NavigatorStatus}) => {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [confirmingUnenroll, setConfirmingUnenroll] = useState(false);
    const [startBalance, setStartBalance] = useState(String(PAPER_STARTING_BALANCE));

    const balanceNum = startBalance === '' ? 0 : parseInt(startBalance, 10);
    const balanceValid = resolveStartingBalance(balanceNum) !== null;

    const run = async (action: () => Promise<ActionResult>) => {
        if (busy) return;
        setBusy(true);
        try {
            if (await runWithToast(action, toast, {success: 'Done', error: 'Something went wrong'})) {
                router.refresh();
            }
        } finally {
            setBusy(false);
            setConfirmingUnenroll(false);
        }
    };

    return (
        <Panel as="div">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-brand">smart_toy</span>
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand font-mono">
                        AI Navigator
                    </h2>
                </div>
                {status.enrolled && (
                    <span className={`text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded ${status.status === 'active' ? 'text-brand bg-brand-strong/8' : 'text-negative bg-negative/8'} font-mono`}>
                        {status.status === 'active' ? 'Active' : 'Paused'}
                    </span>
                )}
            </div>

            <p className="text-sm text-fg-muted mb-4">
                A dedicated paper account traded weekly by the news brain — long-horizon
                theses, strict rails, measured honestly against the S&amp;P 500. An experiment,
                not financial advice.
            </p>

            {!status.enrolled ? (
                <div className="flex flex-col gap-3">
                    <div>
                        <label htmlFor="navigator-balance" className="text-[10px] uppercase tracking-[0.1em] text-fg-muted font-mono">
                            The AI starts with ($)
                        </label>
                        <TextField
                            id="navigator-balance"
                            value={startBalance}
                            onChange={(e) => setStartBalance(e.target.value.replace(/[^0-9]/g, ''))}
                            inputMode="numeric"
                            autoComplete="off"
                            className="w-full mt-1"
                        />
                        {!balanceValid && startBalance !== '' && (
                            <p className="mt-1 text-xs text-negative">
                                Between {STARTING_BALANCE_RANGE}
                            </p>
                        )}
                    </div>
                    <ActionButton
                        variant="strong"
                        size="block"
                        glow
                        onClick={() => void run(() => enrollAiNavigator({startingBalance: balanceNum}))}
                        disabled={busy || !balanceValid}
                    >
                        {busy ? 'Enrolling…' : `Enroll — AI trades $${(balanceNum || 0).toLocaleString('en-US')}`}
                    </ActionButton>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    {status.status === 'active' && (
                        <ActionButton variant="strong" onClick={() => void run(runAiNavigatorNow)} disabled={busy}>
                            {busy ? 'Queueing…' : 'Run AI now'}
                        </ActionButton>
                    )}
                    {status.status === 'active' ? (
                        <ActionButton variant="danger" onClick={() => void run(pauseAiNavigator)} disabled={busy} className="tracking-wider">
                            Pause trading
                        </ActionButton>
                    ) : (
                        <button type="button" onClick={() => void run(resumeAiNavigator)} disabled={busy}
                                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-brand transition-colors disabled:opacity-50 font-mono"
                                style={{border: '1px solid color-mix(in srgb, var(--brand) 35%, transparent)'}}>
                            Resume trading
                        </button>
                    )}
                    {status.accountId && (
                        <Link href={`/portfolio?account=${status.accountId}`}
                              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-brand hover:underline font-mono">
                            View performance vs SPY →
                        </Link>
                    )}
                    <button type="button"
                            onClick={() => confirmingUnenroll ? void run(unenrollAiNavigator) : setConfirmingUnenroll(true)}
                            onBlur={() => setConfirmingUnenroll(false)}
                            disabled={busy}
                            className="ml-auto px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-fg-muted hover:text-negative transition-colors disabled:opacity-50 font-mono">
                        {confirmingUnenroll ? 'Confirm unenroll' : 'Unenroll'}
                    </button>
                </div>
            )}
            {status.lastError && (
                <p className="mt-3 text-xs text-negative font-mono">
                    Last run error: {status.lastError}
                </p>
            )}
        </Panel>
    );
};

export default NavigatorCard;
