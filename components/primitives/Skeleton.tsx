// Streaming placeholder sized to the widget's minHeight so the grid doesn't jump. Each line
// shimmers (.fx-shimmer in app/globals.css: a soft band sweeps across it, still under either
// reduce-motion setting); the lines narrow down the block, as a paragraph's would.
const WidgetSkeleton = ({height = 120, rows = 3}: {height?: number; rows?: number}) => (
    <div className="flex flex-col justify-center gap-3" style={{minHeight: height}} aria-hidden="true" data-skeleton="">
        {Array.from({length: rows}, (_, i) => (
            <div key={i} className="fx-shimmer h-3 rounded bg-surface-3" style={{width: `${85 - i * 15}%`}} />
        ))}
    </div>
);

export default WidgetSkeleton;
