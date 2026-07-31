'use client';

import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import ReactMarkdown from "react-markdown";
import {toast} from "sonner";
import {formatTimeAgo} from "@/lib/utils";
import {getSecondOpinionPrompt, requestSecondOpinion, saveManualSecondOpinion} from "@/lib/actions/opinion.actions";
import type {SecondOpinionView} from "@/lib/brain/opinion";

// The API path generates in the background, so refresh a couple of times after
// queueing instead of making the user hunt for the reload button.
const REFRESH_DELAYS_MS = [35_000, 90_000];

const SOURCE_LABELS: Record<SecondOpinionView['source'], string> = {
    api: 'via API',
    cli: 'via Claude Code',
    manual: 'pasted',
};

const BUTTON_STYLE = {fontFamily: 'var(--font-jetbrains)', border: '1px solid rgba(125,244,255,0.35)', backgroundColor: 'rgba(0,240,255,0.06)'};

const SecondOpinionCard = ({configured, opinion}: {configured: boolean; opinion: SecondOpinionView | null}) => {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasted, setPasted] = useState('');
    // Shown only when the clipboard API is unavailable (non-HTTPS origins) so
    // the copy path still works by hand.
    const [promptFallback, setPromptFallback] = useState('');
    // router.refresh() is global, so a pending timer would reload whatever page
    // the user navigated to instead of this one.
    const refreshTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => () => {
        refreshTimers.current.forEach(clearTimeout);
    }, []);

    const onAsk = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await requestSecondOpinion();
            if (result.success) {
                toast.success(result.message || 'Queued');
                refreshTimers.current.push(
                    ...REFRESH_DELAYS_MS.map((delay) => setTimeout(() => router.refresh(), delay)),
                );
            } else {
                toast.error(result.message || 'Could not queue the request');
            }
        } finally {
            setBusy(false);
        }
    };

    const onCopyPrompt = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await getSecondOpinionPrompt();
            if (!result.success || !result.prompt) {
                toast.error(result.message || 'Could not build the prompt');
                return;
            }
            try {
                await navigator.clipboard.writeText(result.prompt);
                setPromptFallback('');
                setPasteOpen(true);
                toast.success('Prompt copied — paste it into claude.ai, then paste the answer back below');
            } catch {
                setPromptFallback(result.prompt);
                setPasteOpen(true);
                toast.message('Clipboard blocked — copy the prompt from the box below');
            }
        } finally {
            setBusy(false);
        }
    };

    const onSavePasted = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await saveManualSecondOpinion(pasted);
            if (result.success) {
                toast.success(result.message || 'Saved');
                setPasted('');
                setPasteOpen(false);
                setPromptFallback('');
                router.refresh();
            } else {
                toast.error(result.message || 'Could not save');
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
                {opinion && (
                    <span className="text-[11px] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {opinion.model} · {SOURCE_LABELS[opinion.source]} · {formatTimeAgo(Math.floor(opinion.generatedAt / 1000))}
                    </span>
                )}
            </div>

            <p className="text-sm text-[#849495] mb-4">
                A stronger model reads the same theses, decisions and headlines — and argues with them:
                where the narratives look crowded or stale, what contradicts them, and what to watch next.
                It only critiques; the deterministic rails still make every trade.
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
                {configured && (
                    <button type="button" onClick={() => void onAsk()} disabled={busy}
                            className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 text-[#002022]"
                            style={{fontFamily: 'var(--font-jetbrains)', backgroundColor: '#00f0ff'}}>
                        {busy ? 'Working…' : 'Ask Claude (API)'}
                    </button>
                )}
                <button type="button" onClick={() => void onCopyPrompt()} disabled={busy}
                        className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#7df4ff] transition-all active:scale-[0.98] disabled:opacity-50"
                        style={BUTTON_STYLE}>
                    {busy ? 'Working…' : 'Copy prompt for claude.ai'}
                </button>
                {!pasteOpen && (
                    <button type="button" onClick={() => setPasteOpen(true)} disabled={busy}
                            className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#b9cacb] hover:text-[#7df4ff] transition-colors disabled:opacity-50"
                            style={{fontFamily: 'var(--font-jetbrains)', border: '1px solid rgba(59,73,75,0.4)'}}>
                        Paste an answer
                    </button>
                )}
            </div>

            <p className="text-xs text-[#849495] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                {configured
                    ? 'Using your Claude subscription instead: copy the prompt into claude.ai and paste the answer back — or run `npm run opinion:local` to have Claude Code do it for you.'
                    : 'No API key needed: copy the prompt into claude.ai (your Max plan) and paste the answer back — or run `npm run opinion:local` to have Claude Code do it for you.'}
            </p>

            {promptFallback && (
                <textarea readOnly value={promptFallback} rows={6} onFocus={(e) => e.currentTarget.select()}
                          className="w-full mb-3 rounded-lg px-3 py-2 text-xs text-[#b9cacb] outline-none"
                          style={{backgroundColor: '#111318', border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}} />
            )}

            {pasteOpen && (
                <div className="mb-4">
                    <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5}
                              placeholder="Paste Claude's answer here…"
                              className="w-full rounded-lg px-3 py-2 text-sm text-[#e2e2e8] outline-none"
                              style={{backgroundColor: '#111318', border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}} />
                    <div className="flex items-center gap-2 mt-2">
                        <button type="button" onClick={() => void onSavePasted()} disabled={busy || pasted.trim().length === 0}
                                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#7df4ff] transition-all active:scale-[0.98] disabled:opacity-50"
                                style={BUTTON_STYLE}>
                            {busy ? 'Saving…' : 'Save opinion'}
                        </button>
                        <button type="button" onClick={() => {setPasteOpen(false); setPromptFallback('');}} disabled={busy}
                                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#849495] hover:text-[#ffb4ab] transition-colors disabled:opacity-50"
                                style={{fontFamily: 'var(--font-jetbrains)'}}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {opinion ? (
                <div className="px-4 py-3 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(125,244,255,0.15)] text-sm text-[#b9cacb] leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-4 [&_li]:list-disc">
                    <ReactMarkdown>{opinion.opinionMd}</ReactMarkdown>
                </div>
            ) : (
                <p className="text-sm text-[#849495]">No opinion yet — copy the prompt above, or ask Claude Code to fetch one.</p>
            )}
        </section>
    );
};

export default SecondOpinionCard;
