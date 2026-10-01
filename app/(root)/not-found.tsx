import Link from "next/link";
import Panel from "@/components/primitives/Panel";
import {actionButton} from "@/components/primitives/ActionButton";

// Clicking a search result the data provider can't price used to drop the user on a bare
// browser 404 with no navigation at all. This one keeps the header, sidebar and theme.
const NotFound = () => (
    <div className="space-y-4">
        <div className="mb-2">
            <h1 className="text-2xl font-semibold text-fg mb-1 tracking-tight"
                style={{fontFamily: 'var(--type-display)'}}>
                Not found
            </h1>
        </div>
        <Panel pad={8} className="text-center">
            <p className="text-sm text-fg-muted">
                We couldn&apos;t find that page. If you were looking up a ticker, the data provider
                may not cover it.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
                <Link
                    href="/topics"
                    className={actionButton({size: 'md'})}
                >
                    My topics
                </Link>
                <Link
                    href="/"
                    className={actionButton({variant: 'secondary', size: 'md'})}
                >
                    Dashboard
                </Link>
            </div>
        </Panel>
    </div>
);

export default NotFound;
