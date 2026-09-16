import Link from "next/link";

// Zero followed topics is an invitation, not an error state.
const TopicsWidgetEmpty = ({text = "You're not following anything yet."}: {text?: string}) => (
    <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">{text}</p>
        <Link href="/topics" className="text-xs uppercase tracking-[0.1em] text-brand hover:underline" style={{fontFamily: 'var(--type-mono)'}}>
            Follow a topic →
        </Link>
    </div>
);

export default TopicsWidgetEmpty;
