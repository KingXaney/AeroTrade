import type {ReactNode} from "react";
import Panel from "@/components/primitives/Panel";
import StatTile from "@/components/primitives/StatTile";

// Three tiles about one series — a title, one line of detail, then three measurements —
// framed as a <Panel>, so it follows the visual style like every other surface (never a
// hand-rolled glass-panel copy). "Time in the market" lays three of them side by side, one per
// way of owning SPY; nothing here colours a value by how it compares with the others.
// Server-safe and client-safe: no hooks, no server imports.

type SeriesTile = {label: ReactNode; value: string; hint?: string};

type Props = {
    title: ReactNode;
    detail?: string;
    tiles: readonly [SeriesTile, SeriesTile, SeriesTile];
    id?: string;
};

const SeriesTiles = ({title, detail, tiles, id}: Props) => (
    <Panel as="div" pad={4} id={id}>
        <h3 className="font-heading text-sm font-semibold text-fg">{title}</h3>
        {detail && <p className="font-mono text-[11px] text-fg-muted mt-0.5">{detail}</p>}
        <div className="grid grid-cols-3 gap-3 mt-3">
            {tiles.map((tile, i) => (
                <div key={i} data-tile={i}>
                    <StatTile label={tile.label} value={tile.value} hint={tile.hint} />
                </div>
            ))}
        </div>
    </Panel>
);

export default SeriesTiles;
