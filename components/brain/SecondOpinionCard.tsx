'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import ReactMarkdown from "react-markdown";
import {toast} from "sonner";
import {formatTimeAgo} from "@/lib/utils";
import {requestSecondOpinion} from "@/lib/actions/opinion.actions";
import type {SecondOpinionView} from "@/lib/brain/opinion";

// The opinion is generated in the background, so refresh the page a couple of
// times after queueing instead of making the user hunt for the reload button.
const REFRESH_DELAYS_MS = [35_000, 90_000];

const SecondOpinionCard = ({configured, opinion}: {configured: boolean; opinion: SecondOpinionView | null}) => {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const onAsk = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await requestSecondOpinion();
            if (result.success) {
                toast.success(result.message || 'Queued');
                REFRESH_DELAYS_MS.forEach((delay) => setTimeout(() => router.refresh(), delay));
            } else {
                toast.error(result.message || 'Could not queue the request');
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Claude Second Opinion
                </h2>
                <div className="flex items-center gap-3">
                    {opinion && (
                        <span className="text-[11px] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            {opinion.model} · {formatTimeAgo(Math.floor(opinion.generatedAt / 1000))}
                        </span>
                    )}
                    <button type="button" onClick={() => void onAsk()} disabled={busy || !configured}
                            className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 text-[#002022]"
                            style={{fontFamily: 'var(--font-jetbrains)', backgroundColor: '#00f0ff'}}>
                        {busy ? 'Queueing…' : 'Ask Claude'}
                    </button>
                </div>
            </div>

            <p className="text-sm text-[#849495] mb-3">
                A stronger model reads the same theses, decisions and headlines — and argues with them:
                where the narratives look crowded or stale, what contradicts them, and what to watch next.
                It only critiques; the deterministic rails still make every trade.
            </p>

            {!configured && (
                <p className="text-xs text-[#ffd700] mb-3" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Not connected — set ANTHROPIC_API_KEY in your deployment (key from console.anthropic.com) to enable this.
                </p>
            )}

            {opinion ? (
                <div className="px-4 py-3 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(125,244,255,0.15)] text-sm text-[#b9cacb] leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-4 [&_li]:list-disc">
                    <ReactMarkdown>{opinion.opinionMd}</ReactMarkdown>
                </div>
            ) : (
                <p className="text-sm text-[#849495]">
                    No opinion yet{configured ? ' — press "Ask Claude" and it appears here in a minute or two' : ''}.
                </p>
            )}
        </section>
    );
};

export default SecondOpinionCard;
