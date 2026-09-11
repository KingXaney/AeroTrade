import Link from "next/link";

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
        <section className="glass-panel rounded-xl p-8 text-center">
            <p className="text-sm text-fg-muted">
                We couldn&apos;t find that page. If you were looking up a ticker, the data provider
                may not cover it.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
                <Link
                    href="/topics"
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] bg-brand text-on-brand"
                    style={{fontFamily: 'var(--type-mono)'}}
                >
                    My topics
                </Link>
                <Link
                    href="/"
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft border border-line-strong/40 hover:text-fg transition-colors"
                    style={{fontFamily: 'var(--type-mono)'}}
                >
                    Dashboard
                </Link>
            </div>
        </section>
    </div>
);

export default NotFound;
