// A job's progress: a thin bar filled to `share` (a runtime value, so an inline width) and the
// line that says what it counts.
type Props = {share: number | null; label: string};

const ProgressLine = ({share, label}: Props) => (
    <div className="space-y-1" role="status" data-poker-progress={share === null ? undefined : share.toFixed(3)}>
        <div className="h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <div className="h-full bg-brand transition-[width] motion-reduce:transition-none" style={{width: `${Math.round((share ?? 0) * 100)}%`}}/>
        </div>
        <p className="font-mono text-[11px] text-fg-muted">{label}</p>
    </div>
);

export default ProgressLine;
