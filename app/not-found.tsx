import Link from "next/link";
import {actionButton} from "@/components/primitives/ActionButton";

// The 404 outside the app shell: no panel to frame, so not EmptyState.
const NotFound = () => (
    <main className="min-h-screen flex items-center justify-center px-6" style={{color: 'var(--fg-soft)'}}>
        <div className="text-center max-w-md">
            <h1 className="text-2xl font-semibold text-fg mb-2 tracking-tight"
                style={{fontFamily: 'var(--type-display)'}}>
                Not found
            </h1>
            <p className="text-sm text-fg-muted">We couldn&apos;t find that page.</p>
            <Link href="/" className={actionButton({size: 'md', className: 'inline-block mt-6'})}>
                Go to AeroTrade
            </Link>
        </div>
    </main>
);

export default NotFound;
