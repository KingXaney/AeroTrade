// Plain download link styled like the other header buttons — the route handler
// streams the account's full trade history as CSV.
const ExportCsvButton = ({accountId}: {accountId: string}) => (
    <a
        href={`/api/accounts/${accountId}/export`}
        download
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#b9cacb] hover:text-[#7df4ff] transition-colors"
        style={{border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}}
    >
        <span className="material-symbols-outlined text-base">download</span>
        Export CSV
    </a>
);

export default ExportCsvButton;
