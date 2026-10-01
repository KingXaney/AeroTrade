import type {TopicBriefView} from '@/lib/topics/types';
import Panel from '@/components/primitives/Panel';
import SectionHeading from "@/components/primitives/SectionHeading";
import MicroLabel from "@/components/primitives/MicroLabel";
import {TOPIC_BRIEF_COPY} from "@/lib/learn/copy/topics";

// The AI "what changed today" summary. Plain text only — never rendered as HTML.
// `compact` is for lists that already carry a heading (widgets, digests).

const TopicBrief = ({brief, compact = false}: {brief: TopicBriefView; compact?: boolean}) => {
    const body = (
        <>
            {!compact && (
                <div className="flex items-center justify-between gap-2 mb-2">
                    <SectionHeading spacing="none">
                        What changed today
                    </SectionHeading>
                    <span className="text-[10px] text-fg-muted font-mono">{brief.date}</span>
                </div>
            )}
            <p className="text-sm text-fg-soft leading-relaxed">{brief.summary}</p>
            {brief.bullets.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {brief.bullets.map((b, i) => (
                        <li key={i} className="flex gap-2 text-sm text-fg-soft">
                            <span className="text-brand" aria-hidden="true">›</span>
                            <span>{b}</span>
                        </li>
                    ))}
                </ul>
            )}
            <MicroLabel as="p" className="mt-3">
                {compact ? TOPIC_BRIEF_COPY.datedCaveat(brief.date) : TOPIC_BRIEF_COPY.caveat}
            </MicroLabel>
        </>
    );
    // Compact sits inside a list that already has its frame.
    return compact ? <section>{body}</section> : <Panel>{body}</Panel>;
};

export default TopicBrief;
