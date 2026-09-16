// The AI "what changed today" summary. Plain text only — never rendered as HTML.
// `compact` is for lists that already carry a heading (widgets, digests).
const mono = {fontFamily: 'var(--type-mono)'} as const;

const TopicBrief = ({brief, compact = false}: {brief: TopicBriefView; compact?: boolean}) => (
    <section className={compact ? '' : 'glass-panel rounded-xl p-5'}>
        {!compact && (
            <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={mono}>
                    What changed today
                </h2>
                <span className="text-[10px] text-fg-muted" style={mono}>{brief.date}</span>
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
        <p className="mt-3 text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={mono}>
            {compact ? `${brief.date} · AI summary · may contain errors` : 'AI summary · may contain errors'}
        </p>
    </section>
);

export default TopicBrief;
