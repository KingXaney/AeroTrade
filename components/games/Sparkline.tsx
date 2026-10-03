import {sparkline} from "@/lib/games/rounds";
import {cn} from "@/lib/utils";

// A game's last rounds as one line, oldest at the left, scaled to its own range. Presentational
// and client-safe; nothing is drawn for fewer than two rounds.
const Sparkline = ({scores, label, width = 160, height = 32, className}: {scores: readonly number[]; label: string; width?: number; height?: number; className?: string}) => {
    const points = sparkline(scores, width, height);
    if (!points) return null;
    return (
        <svg viewBox={`-2 -2 ${width + 4} ${height + 4}`} width={width} height={height} role="img" aria-label={label}
             className={cn('overflow-visible', className)} data-sparkline={scores.length}>
            <polyline points={points} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-brand"/>
        </svg>
    );
};

export default Sparkline;
