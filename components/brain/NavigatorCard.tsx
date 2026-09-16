'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {toast} from "sonner";
import {enrollAiNavigator, pauseAiNavigator, resumeAiNavigator, runAiNavigatorNow, unenrollAiNavigator} from "@/lib/actions/navigator.actions";
import {MAX_STARTING_BALANCE, MIN_STARTING_BALANCE, PAPER_STARTING_BALANCE} from "@/lib/constants";

// Enrollment + kill switch for the AI-managed paper account.
const NavigatorCard = ({status}: {status: NavigatorStatus}) => {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [confirmingUnenroll, setConfirmingUnenroll] = useState(false);
    const [startBalance, setStartBalance] = useState(String(PAPER_STARTING_BALANCE));

    const balanceNum = startBalance === '' ? 0 : parseInt(startBalance, 10);
    const balanceValid = balanceNum >= MIN_STARTING_BALANCE && balanceNum <= MAX_STARTING_BALANCE;

    const run = async (action: () => Promise<OrderResult>) => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await action();
            if (result.success) {
                toast.success(result.message || 'Done');
                router.refresh();
            } else {
                toast.error(result.message || 'Something went wrong');
            }
        } finally {
            setBusy(false);
            setConfirmingUnenroll(false);
        }
    };

    return (
        <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-brand">smart_toy</span>
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                        AI Navigator
                    </h2>
                </div>
                {status.enrolled && (
                    <span className={`text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded ${status.status === 'active' ? 'text-brand bg-brand-strong/8' : 'text-negative bg-negative/8'}`}
                          style={{fontFamily: 'var(--type-mono)'}}>
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
                        <label htmlFor="navigator-balance" className="text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                            The AI starts with ($)
                        </label>
                        <input
                            id="navigator-balance"
                            value={startBalance}
                            onChange={(e) => setStartBalance(e.target.value.replace(/[^0-9]/g, ''))}
                            inputMode="numeric"
                            autoComplete="off"
                            className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-fg outline-none field-focus"
                            style={{backgroundColor: 'var(--surface-0)', border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-mono)'}}
                        />
                        {!balanceValid && startBalance !== '' && (
                            <p className="mt-1 text-xs text-negative">
                                Between ${MIN_STARTING_BALANCE.toLocaleString('en-US')} and ${MAX_STARTING_BALANCE.toLocaleString('en-US')}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => void run(() => enrollAiNavigator({startingBalance: balanceNum}))}
                        disabled={busy || !balanceValid}
                        className="w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 text-on-brand"
                        style={{fontFamily: 'var(--type-mono)', backgroundColor: 'var(--brand-strong)', boxShadow: '0 0 15px color-mix(in srgb, var(--brand-strong) 30%, transparent)'}}
                    >
                        {busy ? 'Enrolling…' : `Enroll — AI trades $${(balanceNum || 0).toLocaleString('en-US')}`}
                    </button>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    {status.status === 'active' && (
                        <button type="button" onClick={() => void run(runAiNavigatorNow)} disabled={busy}
                                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 text-on-brand"
                                style={{fontFamily: 'var(--type-mono)', backgroundColor: 'var(--brand-strong)'}}>
                            {busy ? 'Queueing…' : 'Run AI now'}
                        </button>
                    )}
                    {status.status === 'active' ? (
                        <button type="button" onClick={() => void run(pauseAiNavigator)} disabled={busy}
                                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-fg-soft hover:text-negative transition-colors disabled:opacity-50"
                                style={{border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-mono)'}}>
                            Pause trading
                        </button>
                    ) : (
                        <button type="button" onClick={() => void run(resumeAiNavigator)} disabled={busy}
                                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-brand transition-colors disabled:opacity-50"
                                style={{border: '1px solid color-mix(in srgb, var(--brand) 35%, transparent)', fontFamily: 'var(--type-mono)'}}>
                            Resume trading
                        </button>
                    )}
                    {status.accountId && (
                        <Link href={`/portfolio?account=${status.accountId}`}
                              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-brand hover:underline"
                              style={{fontFamily: 'var(--type-mono)'}}>
                            View performance vs SPY →
                        </Link>
                    )}
                    <button type="button"
                            onClick={() => confirmingUnenroll ? void run(unenrollAiNavigator) : setConfirmingUnenroll(true)}
                            onBlur={() => setConfirmingUnenroll(false)}
                            disabled={busy}
                            className="ml-auto px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-fg-muted hover:text-negative transition-colors disabled:opacity-50"
                            style={{fontFamily: 'var(--type-mono)'}}>
                        {confirmingUnenroll ? 'Confirm unenroll' : 'Unenroll'}
                    </button>
                </div>
            )}
            {status.lastError && (
                <p className="mt-3 text-xs text-negative" style={{fontFamily: 'var(--type-mono)'}}>
                    Last run error: {status.lastError}
                </p>
            )}
        </div>
    );
};

export default NavigatorCard;
