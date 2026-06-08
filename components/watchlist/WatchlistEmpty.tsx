const WatchlistEmpty = () => {
    return (
        <div className="glass-panel rounded-xl p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                 style={{
                     backgroundColor: 'rgba(0, 240, 255, 0.08)',
                     border: '1px solid rgba(125, 244, 255, 0.15)',
                 }}>
                <span className="material-symbols-outlined text-3xl text-[#7df4ff]">bookmark</span>
            </div>
            <h3 className="text-xl font-semibold text-[#e2e2e8] mb-2"
                style={{ fontFamily: 'var(--font-sora)' }}>
                No Assets Tracked
            </h3>
            <p className="text-[#849495] mb-6 max-w-md"
               style={{ fontFamily: 'var(--font-hanken)' }}>
                Search for stocks to add them to your watchlist. Track real-time prices, set alerts, and monitor market movements.
            </p>
            <div className="flex items-center gap-2 text-[10px] text-[#849495]"
                 style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                <span className="material-symbols-outlined text-sm text-[#00f0ff]">search</span>
                USE SEARCH TO ADD ASSETS
            </div>
        </div>
    );
};

export default WatchlistEmpty;
