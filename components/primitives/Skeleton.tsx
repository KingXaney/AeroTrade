// Streaming placeholder sized to the widget's minHeight so the grid doesn't jump.
const WidgetSkeleton = ({height = 120, rows = 3}: {height?: number; rows?: number}) => (
    <div className="animate-pulse flex flex-col justify-center gap-3" style={{minHeight: height}} aria-hidden="true">
        {Array.from({length: rows}, (_, i) => (
            <div key={i} className="h-3 rounded bg-surface-3" style={{width: `${85 - i * 15}%`}} />
        ))}
    </div>
);

export default WidgetSkeleton;
