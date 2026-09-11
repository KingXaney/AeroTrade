'use client';

import {useState, type KeyboardEvent} from "react";
import {X} from "lucide-react";
import {cn} from "@/lib/utils";

type Props = {
    values: string[];
    variant?: 'include' | 'exclude';
    editable?: boolean;
    onChange?: (next: string[]) => void;
    max?: number;
    maxLength?: number;
    placeholder?: string;
    ariaLabel: string;
};

// Include chips carry the brand tint; exclusions are muted and prefixed with "−".
const KeywordChips = ({values, variant = 'include', editable = false, onChange, max = 8, maxLength = 40, placeholder, ariaLabel}: Props) => {
    const [draft, setDraft] = useState('');
    const chipClass = variant === 'include'
        ? 'bg-brand/10 text-brand border-brand/25'
        : 'bg-surface-3 text-fg-muted border-line-strong/30';

    const add = () => {
        const term = draft.trim().replace(/,$/, '').trim();
        if (!term || !onChange) return;
        if (values.length >= max || term.length > maxLength) return;
        if (values.some((v) => v.toLowerCase() === term.toLowerCase())) { setDraft(''); return; }
        onChange([...values, term]);
        setDraft('');
    };
    const remove = (term: string) => onChange?.(values.filter((v) => v !== term));

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
        } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
            remove(values[values.length - 1]);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={ariaLabel}>
            {values.map((v) => (
                <span key={v} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs', chipClass)} style={{fontFamily: 'var(--type-mono)'}}>
                    {variant === 'exclude' && <span aria-hidden="true">−</span>}
                    {v}
                    {editable && (
                        <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`} className="ml-0.5 rounded-full hover:text-fg">
                            <X className="size-3" />
                        </button>
                    )}
                </span>
            ))}
            {editable && values.length < max && (
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={add}
                    maxLength={maxLength}
                    placeholder={placeholder ?? 'Add a keyword…'}
                    aria-label={`Add to ${ariaLabel}`}
                    className="min-w-[10rem] flex-1 bg-transparent px-2 py-1 text-xs text-fg outline-none field-focus placeholder:text-fg-muted"
                    style={{fontFamily: 'var(--type-mono)'}}
                />
            )}
        </div>
    );
};

export default KeywordChips;
