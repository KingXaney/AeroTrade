import Link from "next/link";
import Panel from "@/components/primitives/Panel";
import PageTitle from "@/components/primitives/PageTitle";
import {actionButton} from "@/components/primitives/ActionButton";

// Clicking a search result the data provider can't price used to drop the user on a bare
// browser 404 with no navigation at all. This one keeps the header, sidebar and theme.
// Not EmptyState: that leads with a title line, and this panel is one sentence.
const NotFound = () => (
    <div className="space-y-4">
        <PageTitle title="Not found" />
        <Panel pad={8} className="text-center">
            <p className="text-sm text-fg-muted">
                We couldn&apos;t find that page. If you were looking up a ticker, the data provider
                may not cover it.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
                <Link href="/topics" className={actionButton({size: 'md'})}>
                    My topics
                </Link>
                <Link href="/" className={actionButton({variant: 'secondary', size: 'md'})}>
                    Dashboard
                </Link>
            </div>
        </Panel>
    </div>
);

export default NotFound;
