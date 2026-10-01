'use client';

import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import SafeMarkdown from "@/components/primitives/SafeMarkdown";
import {toast} from "sonner";
import {formatTimeAgoMs} from "@/lib/format";
import {getSecondOpinionPrompt, requestSecondOpinion, saveManualSecondOpinion} from "@/lib/actions/opinion.actions";
import {runWithToast, UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import type {SecondOpinionView} from "@/lib/brain/opinion";
import Panel from "@/components/primitives/Panel";
import {rowCard} from "@/components/primitives/RowCard";
import ActionButton from "@/components/primitives/ActionButton";
import {TextArea} from "@/components/primitives/TextField";
import SectionHeading from "@/components/primitives/SectionHeading";
import MicroLabel from "@/components/primitives/MicroLabel";
import {BRAIN_COPY} from "@/lib/learn/copy/brain";

// The API path generates in the background, so refresh a couple of times after
// queueing instead of making the user hunt for the reload button.
const REFRESH_DELAYS_MS = [35_000, 90_000];

const SOURCE_LABELS: Record<SecondOpinionView['source'], string> = {
    api: 'via API',
    cli: 'via Claude Code',
    manual: 'pasted',
};

const BUTTON_CLASS = 'px-3 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider text-brand border border-brand/35 bg-brand-strong/6 transition-all active:scale-[0.98] disabled:opacity-50';

const SecondOpinionCard = ({configured, opinion}: {configured: boolean; opinion: SecondOpinionView | null}) => {
    const router = useRouter();
    // One flag per action rather than a shared boolean: a copy in progress
    // should not make the paid API button look like it is running.
    const [pending, setPending] = useState<'ask' | 'copy' | 'save' | null>(null);
    const busy = pending !== null;
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
        setPending('ask');
        try {
            if (await runWithToast(requestSecondOpinion, toast, {success: 'Queued', error: 'Could not queue the request'})) {
                refreshTimers.current.push(
                    ...REFRESH_DELAYS_MS.map((delay) => setTimeout(() => router.refresh(), delay)),
                );
            }
        } finally {
            setPending(null);
        }
    };

    const onCopyPrompt = async () => {
        if (busy) return;
        setPending('copy');
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
        } catch {
            toast.error(UNREACHABLE_MESSAGE);
        } finally {
            setPending(null);
        }
    };

    const onSavePasted = async () => {
        if (busy) return;
        setPending('save');
        try {
            if (await runWithToast(() => saveManualSecondOpinion(pasted), toast, {success: 'Saved', error: 'Could not save'})) {
                setPasted('');
                setPasteOpen(false);
                setPromptFallback('');
                router.refresh();
            }
        } finally {
            setPending(null);
        }
    };

    return (
        <Panel>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <SectionHeading spacing="none">
                    Claude Second Opinion
                </SectionHeading>
                {opinion && (
                    <span className="text-[11px] text-fg-muted font-mono">
                        {opinion.model} · {SOURCE_LABELS[opinion.source]} · {formatTimeAgoMs(opinion.generatedAt)}
                    </span>
                )}
            </div>

            <p className="text-sm text-fg-muted mb-4">
                {BRAIN_COPY.secondOpinionAbout}
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
                {configured && (
                    <ActionButton variant="strong" onClick={() => void onAsk()} disabled={busy}>
                        {pending === 'ask' ? 'Queueing…' : 'Ask Claude (paid API)'}
                    </ActionButton>
                )}
                <button type="button" onClick={() => void onCopyPrompt()} disabled={busy}
                        className={BUTTON_CLASS}>
                    {pending === 'copy' ? 'Building…' : 'Copy prompt for claude.ai'}
                </button>
                {!pasteOpen && (
                    <ActionButton variant="secondary" onClick={() => setPasteOpen(true)} disabled={busy} className="tracking-wider hover:text-brand">
                        Paste an answer
                    </ActionButton>
                )}
            </div>

            <p className="text-xs text-fg-muted mb-4 font-mono">
                {configured
                    ? 'The API button bills Anthropic per use. To spend a Claude subscription instead, copy the prompt into claude.ai and paste the answer back.'
                    : 'No API key configured — copy the prompt into claude.ai (covered by your Claude subscription) and paste the answer back.'}
                {' '}Whoever runs this app locally can also skip the copying with <code>npm run opinion:local</code>.
            </p>

            {promptFallback && (
                <div className="mb-3">
                    <MicroLabel as="label" htmlFor="second-opinion-prompt">
                        Prompt — select all and copy
                    </MicroLabel>
                    <TextArea id="second-opinion-prompt" readOnly value={promptFallback} rows={6} onFocus={(e) => e.currentTarget.select()}
                              className="w-full mt-1 text-xs text-fg-soft" />
                </div>
            )}

            {pasteOpen && (
                <div className="mb-4">
                    <MicroLabel as="label" htmlFor="second-opinion-answer">
                        Claude&apos;s answer
                    </MicroLabel>
                    <TextArea id="second-opinion-answer" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5}
                              placeholder="Paste Claude's answer here…"
                              className="w-full mt-1" />
                    <div className="flex items-center gap-2 mt-2">
                        <button type="button" onClick={() => void onSavePasted()} disabled={busy || pasted.trim().length === 0}
                                className={BUTTON_CLASS}>
                            {pending === 'save' ? 'Saving…' : 'Save opinion'}
                        </button>
                        <button type="button" onClick={() => {setPasteOpen(false); setPromptFallback('');}} disabled={busy}
                                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-fg-muted hover:text-negative transition-colors disabled:opacity-50 font-mono">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {opinion ? (
                <SafeMarkdown className={rowCard({tone: 'brand', className: 'text-sm text-fg-soft leading-relaxed'})}>
                    {opinion.opinionMd}
                </SafeMarkdown>
            ) : (
                <p className="text-sm text-fg-muted">{BRAIN_COPY.secondOpinionEmpty}</p>
            )}
        </Panel>
    );
};

export default SecondOpinionCard;
