const WatchlistEmpty = () => {
    return (
        <div className="glass-panel rounded-xl p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                 style={{
                     backgroundColor: 'color-mix(in srgb, var(--brand-strong) 8%, transparent)',
                     border: '1px solid color-mix(in srgb, var(--brand) 15%, transparent)',
                 }}>
                <span className="material-symbols-outlined text-3xl text-brand">bookmark</span>
            </div>
            <h3 className="text-xl font-semibold text-fg mb-2"
                style={{ fontFamily: 'var(--type-display)' }}>
                No Assets Tracked
            </h3>
            <p className="text-fg-muted mb-6 max-w-md"
               style={{ fontFamily: 'var(--type-body)' }}>
                Search for stocks to add them to your watchlist. See their quotes, market cap and P/E in one place, jump to the trade desk, or follow their news as a topic.
            </p>
            <div className="flex items-center gap-2 text-[10px] text-fg-muted"
                 style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                <span className="material-symbols-outlined text-sm text-brand-strong">search</span>
                USE SEARCH TO ADD ASSETS
            </div>
        </div>
    );
};

export default WatchlistEmpty;
