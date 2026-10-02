'use client';

import {useState, useTransition, type FormEvent} from "react";
import {usePathname, useRouter} from "next/navigation";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import KeywordChips from "@/components/forms/KeywordChips";
import {cn} from "@/lib/utils";
import {createTopic, updateTopic} from "@/lib/actions/topics.actions";
import {MAX_EXCLUDES, NAME_MAX} from "@/lib/topics/config";
import {KEYWORD_MAX, MAX_KEYWORDS} from "@/lib/news/keywords";
import {suggestKeywords} from "@/lib/topics/suggest-keywords";
import {TOPIC_COLORS} from "@/lib/topics/colors";
import type {TopicView} from '@/lib/topics/types';
import ActionButton from "@/components/primitives/ActionButton";

export type ComposerMode = 'create' | 'edit';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: ComposerMode;
    initial?: TopicView | null;
    onSaved?: (topic: TopicView) => void;
};

const labelClass = 'label-type text-[length:var(--label-size)] text-fg-muted';

// The form lives in its own component so its state initialises from props on every
// open (Radix unmounts dialog content when closed) — no reset effect required.
const ComposerForm = ({mode, initial, onClose, onSaved}: {mode: ComposerMode; initial: TopicView | null; onClose: () => void; onSaved?: (topic: TopicView) => void}) => {
    const router = useRouter();
    const pathname = usePathname();
    const [name, setName] = useState(initial?.name ?? '');
    const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
    const [exclude, setExclude] = useState<string[]>(initial?.exclude ?? []);
    const [color, setColor] = useState<string | null>(initial?.color ?? null);
    const [keywordsTouched, setKeywordsTouched] = useState(mode === 'edit');
    const [advanced, setAdvanced] = useState(mode === 'edit' && (initial?.exclude.length ?? 0) > 0);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const onNameChange = (value: string) => {
        setName(value);
        // Until the user edits the keyword list, it follows the name.
        if (!keywordsTouched) setKeywords(suggestKeywords(value, 6));
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        const input = {name: name.trim(), keywords, exclude, color: color ?? undefined};
        startTransition(async () => {
            const result = mode === 'edit' && initial ? await updateTopic(initial.id, input) : await createTopic(input);
            if (!result.success || !result.topic) {
                setError(result.message ?? 'Something went wrong');
                return;
            }
            toast.success(mode === 'edit' ? 'Topic updated' : `Following "${result.topic.name}"`);
            onClose();
            onSaved?.(result.topic);
            // One render of the destination, not two: a new topic's page runs a live
            // fetch on first visit, and push()+refresh() would run it twice concurrently.
            const target = `/topics/${result.topic.slug}`;
            if (pathname === target) router.refresh();
            else router.push(target);
        });
    };

    return (
        <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1.5">
                <label htmlFor="topic-name" className={labelClass}>Name</label>
                <input
                    id="topic-name"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    maxLength={NAME_MAX}
                    autoFocus
                    placeholder="e.g. Fed rate decisions, AI chips, NBA trade deadline"
                    className="form-input w-full"
                />
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className={labelClass}>Match any of</span>
                    <span className="text-[10px] text-fg-muted font-mono">{keywords.length}/{MAX_KEYWORDS}</span>
                </div>
                <div className="rounded-lg border border-line-strong/30 bg-surface-0 px-2 py-1.5">
                    <KeywordChips
                        values={keywords}
                        editable
                        max={MAX_KEYWORDS}
                        maxLength={KEYWORD_MAX}
                        ariaLabel="Keywords"
                        placeholder={keywords.length === 0 ? 'Add a keyword…' : 'Add another…'}
                        onChange={(next) => { setKeywordsTouched(true); setKeywords(next); }}
                    />
                </div>
                {!keywordsTouched && keywords.length > 0 && (
                    <p className="text-[11px] text-fg-muted">Suggested from the name — remove any that don&apos;t fit.</p>
                )}
            </div>

            <button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}
                    className="label-type text-[length:var(--label-size)] text-fg-muted hover:text-fg">
                {advanced ? '− Hide advanced' : '+ Advanced (exclusions, colour)'}
            </button>

            {advanced && (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className={labelClass}>But not</span>
                            <span className="text-[10px] text-fg-muted font-mono">{exclude.length}/{MAX_EXCLUDES}</span>
                        </div>
                        <div className="rounded-lg border border-line-strong/30 bg-surface-0 px-2 py-1.5">
                            <KeywordChips values={exclude} variant="exclude" editable max={MAX_EXCLUDES} maxLength={KEYWORD_MAX}
                                          ariaLabel="Exclusions" placeholder="Skip articles mentioning…" onChange={setExclude} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <span className={labelClass}>Colour</span>
                        <div className="flex items-center gap-2" role="radiogroup" aria-label="Topic colour">
                            {TOPIC_COLORS.map((c) => (
                                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
                                        onClick={() => setColor(color === c ? null : c)}
                                        className={cn('h-6 w-6 rounded-full border-2 transition-transform', color === c ? 'border-fg scale-110' : 'border-transparent')}
                                        style={{background: c}} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {error && <p className="text-sm text-negative">{error}</p>}

            <div className="flex justify-end gap-2 font-mono">
                <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
                    Cancel
                </ActionButton>
                <ActionButton type="submit" className="inline-flex items-center gap-2" disabled={pending || name.trim().length < 2}>
                    {pending && <Loader2 className="size-3.5 animate-spin" />}
                    {mode === 'edit' ? 'Save changes' : 'Follow topic'}
                </ActionButton>
            </div>
        </form>
    );
};

const TopicComposer = ({open, onOpenChange, mode, initial = null, onSaved}: Props) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle className="font-heading">{mode === 'edit' ? 'Edit topic' : 'Follow a topic'}</DialogTitle>
                <DialogDescription>
                    We match headlines and summaries against these keywords. Add exclusions to cut noise.
                </DialogDescription>
            </DialogHeader>
            {open && <ComposerForm mode={mode} initial={initial} onClose={() => onOpenChange(false)} onSaved={onSaved} />}
        </DialogContent>
    </Dialog>
);

export default TopicComposer;
