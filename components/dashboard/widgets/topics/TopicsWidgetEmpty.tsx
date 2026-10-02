import Link from "next/link";

// Zero followed topics is an invitation, not an error state.
const TopicsWidgetEmpty = () => (
    <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">You&apos;re not following anything yet.</p>
        <Link href="/topics" className="label-type text-xs text-brand hover:underline">
            Follow a topic →
        </Link>
    </div>
);

export default TopicsWidgetEmpty;
