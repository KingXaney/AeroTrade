import type {ReactNode} from "react";
import {cn} from "@/lib/utils";
import {GLOSSARY, isGlossaryKey, type GlossaryKey} from "@/lib/learn/glossary";
import AskLink from "@/components/chat/AskLink";
import MicroLabel from "@/components/primitives/MicroLabel";

// The touch-reachable twin of every Term title= on a panel: one collapsed disclosure at
// the panel's foot listing the definitions of the terms that panel shows, and only those
// (a hidden column gets no entry). At most one per panel, always the same summary label,
// so "where do I look for what this means" has one answer everywhere.
//
// A panel with more to say about its numbers than their definitions (the signal board's
// "Read this board") passes it as `children` with its own `label`: it leads the same
// disclosure, and the definitions follow under the usual heading, so the panel still has
// exactly one.
//
// Native <details>, no JavaScript, client-safe: it renders inside 'use client' panels
// (StrategyPerformance) and server panels alike.

const DEFINITIONS_LABEL = 'What these mean';

type Props = {
    keys: readonly (GlossaryKey | string)[];
    id?: string;
    label?: string;
    className?: string;
    children?: ReactNode;
};

const WhatTheseMean = ({keys, id, label = DEFINITIONS_LABEL, className, children}: Props) => {
    const entries = Array.from(new Set(keys.filter(isGlossaryKey))).map((key) => GLOSSARY[key]);
    if (entries.length === 0 && !children) return null;
    return (
        <details id={id} className={cn('group mt-3', className)} data-what-these-mean>
            <summary className="font-mono cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden text-[11px] text-brand hover:underline inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-sm transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
                {label}
            </summary>
            {children && <div className="mt-2">{children}</div>}
            {children && entries.length > 0 && <MicroLabel as="p" className="mt-3">{DEFINITIONS_LABEL}</MicroLabel>}
            {entries.length > 0 && (
                <dl className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                    {entries.map((entry) => (
                        <div key={entry.key} id={id ? `${id}-${entry.key}` : undefined}>
                            <dt className="font-heading text-xs font-semibold text-fg flex items-baseline gap-2">
                                {entry.term}
                                <AskLink input={{kind: 'term', term: entry.term}} />
                            </dt>
                            <dd className="text-xs text-fg-muted leading-relaxed">
                                {entry.long}
                                {entry.formula && (
                                    <span className="block font-mono text-[10px] text-fg-muted/80 mt-0.5">{entry.formula}</span>
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </details>
    );
};

export default WhatTheseMean;
