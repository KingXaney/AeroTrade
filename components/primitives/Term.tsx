import type {ReactNode} from "react";
import {cn} from "@/lib/utils";
import {GLOSSARY, type GlossaryKey} from "@/lib/learn/glossary";

// A label that carries its definition: the glossary's short text as a native tooltip,
// marked with a dotted underline so the affordance is visible. Client-safe on purpose —
// no hooks, no server imports — so a 'use client' tile and a server table wrap their
// labels the same way. Touch devices never see a title=, which is why every panel that
// uses Term also renders one <WhatTheseMean> with the same entries.

type Props = {
    k: GlossaryKey;
    className?: string;
    children?: ReactNode;
};

const Term = ({k, className, children}: Props) => (
    <span
        title={GLOSSARY[k].short}
        data-term={k}
        className={cn('underline decoration-dotted decoration-fg-muted/50 underline-offset-2 cursor-help', className)}
    >
        {children ?? GLOSSARY[k].term}
    </span>
);

export default Term;
