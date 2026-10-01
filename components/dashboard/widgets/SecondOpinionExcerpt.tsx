import Link from "next/link";
import {formatTimeAgoMs} from "@/lib/utils";
import type {SecondOpinionView} from "@/lib/brain/opinion";

const EXCERPT_MAX_CHARS = 420;

// First paragraph as plain text — the full markdown (and the paid re-run) live on /brain.
const excerpt = (md: string): string => {
    const paragraph = md
        .split(/\n\s*\n/)
        .map((p) => p.replace(/^#+\s*/gm, '').replace(/[*_`>]/g, '').trim())
        .find((p) => p.length > 0) ?? '';
    return paragraph.length > EXCERPT_MAX_CHARS ? `${paragraph.slice(0, EXCERPT_MAX_CHARS - 1)}…` : paragraph;
};

const SecondOpinionExcerpt = ({opinion}: {opinion: SecondOpinionView | null}) => {
    if (!opinion) {
        return <p className="text-sm text-fg-muted">No second opinion yet — request one from the Brain page.</p>;
    }
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-2 text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                <span>{opinion.model}</span>
                <span>{formatTimeAgoMs(opinion.generatedAt)}</span>
            </div>
            <p className="text-sm text-fg-soft leading-relaxed">{excerpt(opinion.opinionMd)}</p>
            <Link href="/brain" className="inline-block mt-3 text-xs text-brand hover:underline" style={{fontFamily: 'var(--type-mono)'}}>
                Read the full opinion →
            </Link>
        </div>
    );
};

export default SecondOpinionExcerpt;
