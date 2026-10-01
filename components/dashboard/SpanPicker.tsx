'use client';

import {SPAN_LABELS, type WidgetSpan} from "@/lib/dashboard/catalog";
import {cn} from "@/lib/utils";

const SpanPicker = ({spans, value, onChange}: {spans: readonly WidgetSpan[]; value: WidgetSpan; onChange: (span: WidgetSpan) => void}) => (
    <div role="group" aria-label="Widget width" className="inline-flex rounded-md border border-line-strong/30 overflow-hidden">
        {spans.map((s) => (
            <button key={s} type="button" aria-pressed={s === value} onClick={() => onChange(s)} title={`${s} of 12 columns`}
                    className={cn(
                        'px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors',
                        s === value ? 'bg-brand text-on-brand' : 'text-fg-muted hover:text-fg hover:bg-surface-3',
                    )}
                    style={{fontFamily: 'var(--type-mono)'}}>
                {SPAN_LABELS[s]}
            </button>
        ))}
    </div>
);

export default SpanPicker;
