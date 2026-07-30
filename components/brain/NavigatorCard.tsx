'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {toast} from "sonner";
import {enrollAiNavigator, pauseAiNavigator, resumeAiNavigator, unenrollAiNavigator} from "@/lib/actions/navigator.actions";

// Enrollment + kill switch for the AI-managed paper account.
const NavigatorCard = ({status}: {status: NavigatorStatus}) => {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [confirmingUnenroll, setConfirmingUnenroll] = useState(false);

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
                    <span className="material-symbols-outlined text-[#7df4ff]">smart_toy</span>
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        AI Navigator
                    </h2>
                </div>
                {status.enrolled && (
                    <span className={`text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded ${status.status === 'active' ? 'text-[#7df4ff] bg-[rgba(0,240,255,0.08)]' : 'text-[#ffb4ab] bg-[rgba(255,180,171,0.08)]'}`}
                          style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {status.status === 'active' ? 'Active' : 'Paused'}
                    </span>
                )}
            </div>

            <p className="text-sm text-[#849495] mb-4">
                A dedicated $100k paper account traded weekly by the news brain — long-horizon
                theses, strict rails, measured honestly against the S&amp;P 500. An experiment,
                not financial advice.
            </p>

            {!status.enrolled ? (
                <button
                    type="button"
                    onClick={() => void run(enrollAiNavigator)}
                    disabled={busy}
                    className="w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 text-[#002022]"
                    style={{fontFamily: 'var(--font-jetbrains)', backgroundColor: '#00f0ff', boxShadow: '0 0 15px rgba(0,240,255,0.3)'}}
                >
                    {busy ? 'Enrolling…' : 'Enroll — create the AI account'}
                </button>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    {status.status === 'active' ? (
                        <button type="button" onClick={() => void run(pauseAiNavigator)} disabled={busy}
                                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#b9cacb] hover:text-[#ffb4ab] transition-colors disabled:opacity-50"
                                style={{border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}}>
                            Pause trading
                        </button>
                    ) : (
                        <button type="button" onClick={() => void run(resumeAiNavigator)} disabled={busy}
                                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#7df4ff] transition-colors disabled:opacity-50"
                                style={{border: '1px solid rgba(125,244,255,0.35)', fontFamily: 'var(--font-jetbrains)'}}>
                            Resume trading
                        </button>
                    )}
                    {status.accountId && (
                        <Link href={`/portfolio?account=${status.accountId}`}
                              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#7df4ff] hover:underline"
                              style={{fontFamily: 'var(--font-jetbrains)'}}>
                            View performance vs SPY →
                        </Link>
                    )}
                    <button type="button"
                            onClick={() => confirmingUnenroll ? void run(unenrollAiNavigator) : setConfirmingUnenroll(true)}
                            onBlur={() => setConfirmingUnenroll(false)}
                            disabled={busy}
                            className="ml-auto px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#849495] hover:text-[#ffb4ab] transition-colors disabled:opacity-50"
                            style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {confirmingUnenroll ? 'Confirm unenroll' : 'Unenroll'}
                    </button>
                </div>
            )}
            {status.lastError && (
                <p className="mt-3 text-xs text-[#ffb4ab]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Last run error: {status.lastError}
                </p>
            )}
        </div>
    );
};

export default NavigatorCard;
