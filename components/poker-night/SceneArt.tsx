// A scene's art: inline SVG drawn over the scene's sky (lib/poker-night/looks SCENES[id].art) — a
// chandelier, two floor lamps, a skyline, palms, planets, a fireplace or string lights — in the
// scene's two inks only: .pn-ink (--pn-ink, the silhouettes) and .pn-glow (--pn-glow, the lights),
// both from LOOKS_CSS through [data-pn-scene], so no colour is written here. Decoration only:
// aria-hidden, no pointer events, no images.
//
// The pieces sit at the edges of the scene (app/globals.css .pn-art-*), sized in container units of
// the layer they are drawn in, so the same art fits the full-screen table and a picker's small
// preview. What moves is the scene's ambient loop — twinkle, drift, flicker, waves — as CSS keyframes
// on the classes .pn-ambient and .pn-ambient-<loop> (in both motion guards; brutalist stops
// .pn-ambient by name). `still` draws the art without them (a preview among many).

import type {ReactNode} from "react";
import type {AmbientId, SceneArtId} from "@/lib/poker-night/looks";
import {cn} from "@/lib/utils";

type Props = {art: SceneArtId; ambient: AmbientId; still?: boolean};

// The class a moving part carries: its loop, unless the art is drawn still.
const loop = (ambient: AmbientId, still: boolean, kind: Exclude<AmbientId, 'none'>): string | undefined =>
    !still && ambient === kind ? `pn-ambient pn-ambient-${kind}` : undefined;

const Piece = ({className, viewBox, ratio = 'xMidYMid meet', children}: {className: string; viewBox: string; ratio?: string; children: ReactNode}) => (
    <svg className={className} viewBox={viewBox} preserveAspectRatio={ratio} focusable="false">{children}</svg>
);

// ── the pieces ──

const Chandelier = () => (
    <Piece className="pn-art-hang" viewBox="0 0 240 180">
        <circle className="pn-glow" cx="120" cy="96" r="84" opacity="0.1"/>
        <circle className="pn-glow" cx="120" cy="96" r="50" opacity="0.12"/>
        <rect className="pn-ink" x="117" y="0" width="6" height="40"/>
        <ellipse className="pn-ink" cx="120" cy="42" rx="16" ry="6"/>
        <path className="pn-ink" d="M112 46 C104 66 104 86 112 104 L128 104 C136 86 136 66 128 46 Z"/>
        <path className="pn-ink-line" strokeWidth="5" strokeLinecap="round" d="M120 98 C96 116 50 112 34 84 M120 98 C144 116 190 112 206 84 M120 92 C104 104 82 102 74 78 M120 92 C136 104 158 102 166 78"/>
        {[34, 74, 166, 206].map((x) => (
            <g key={x}>
                <rect className="pn-ink" x={x - 8} y={x === 74 || x === 166 ? 72 : 78} width="16" height="7" rx="2"/>
                <rect className="pn-glow" x={x - 3} y={x === 74 || x === 166 ? 56 : 62} width="6" height="16" opacity="0.95"/>
                <ellipse className="pn-glow" cx={x} cy={x === 74 || x === 166 ? 50 : 56} rx="4" ry="7"/>
                <circle className="pn-glow" cx={x} cy={x === 74 || x === 166 ? 50 : 56} r="13" opacity="0.18"/>
            </g>
        ))}
        {[52, 92, 120, 148, 188].map((x, i) => (
            <path key={x} className="pn-glow" opacity="0.8" d={`M${x} ${112 + (i % 2) * 8} l4 7 l-4 9 l-4 -9 z`}/>
        ))}
        <path className="pn-ink" d="M112 104 L128 104 L124 128 L120 138 L116 128 Z"/>
        <circle className="pn-glow" cx="120" cy="146" r="5" opacity="0.85"/>
    </Piece>
);

const Lamp = ({side}: {side: 'left' | 'right'}) => (
    <Piece className={side === 'left' ? 'pn-art-left' : 'pn-art-right'} viewBox="0 0 140 420" ratio={side === 'left' ? 'xMinYMax meet' : 'xMaxYMax meet'}>
        <g transform={side === 'right' ? 'translate(140 0) scale(-1 1)' : undefined}>
            <path className="pn-glow" opacity="0.1" d="M30 122 L110 122 L140 340 L0 340 Z"/>
            <circle className="pn-glow" cx="70" cy="112" r="46" opacity="0.18"/>
            <rect className="pn-ink" x="66" y="118" width="8" height="290"/>
            <ellipse className="pn-ink" cx="70" cy="410" rx="38" ry="9"/>
            <rect className="pn-ink" x="58" y="300" width="24" height="6" rx="2"/>
            <path className="pn-glow" opacity="0.92" d="M42 44 L98 44 L118 122 L22 122 Z"/>
            <path className="pn-ink" opacity="0.35" d="M42 44 L58 44 L44 122 L22 122 Z"/>
            <rect className="pn-ink" x="38" y="40" width="64" height="6" rx="3"/>
            <rect className="pn-ink" x="20" y="120" width="100" height="5" rx="2.5"/>
        </g>
    </Piece>
);

const Haze = ({ambient, still}: {ambient: AmbientId; still: boolean}) => (
    <Piece className="pn-art-haze" viewBox="0 0 1200 300" ratio="none">
        <g className={loop(ambient, still, 'drift')}>
            <ellipse className="pn-glow" cx="260" cy="120" rx="320" ry="60" opacity="0.06"/>
            <ellipse className="pn-glow" cx="820" cy="170" rx="380" ry="70" opacity="0.05"/>
            <ellipse className="pn-glow" cx="560" cy="80" rx="240" ry="40" opacity="0.05"/>
        </g>
    </Piece>
);

// The skyline: towers of every height, their windows lit in rows; three blocks of windows and a sign
// flicker.
const TOWERS: readonly (readonly [x: number, w: number, top: number])[] = [
    [0, 70, 210], [64, 56, 150], [116, 80, 240], [190, 46, 110], [232, 90, 190], [316, 60, 260], [370, 74, 130], [440, 52, 220],
    [488, 96, 170], [580, 58, 90], [634, 84, 200], [714, 62, 140], [772, 100, 230], [868, 54, 120], [918, 82, 180], [996, 66, 250],
    [1058, 78, 160], [1132, 68, 210],
];

// Each tower's lit windows, in rows, a few left dark.
const WINDOWS: readonly (readonly (readonly [x: number, y: number])[])[] = TOWERS.map(([x, w, top], i) => {
    const rows = Math.floor((360 - top - 24) / 28);
    const cols = Math.max(1, Math.floor((w - 12) / 18));
    const out: [number, number][] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) if ((row * 7 + col * 3 + i) % 5 !== 0) out.push([x + 8 + col * 18, top + 14 + row * 28]);
    }
    return out;
});

const Skyline = ({ambient, still}: {ambient: AmbientId; still: boolean}) => (
    <Piece className="pn-art-band-bottom" viewBox="0 0 1200 360" ratio="xMidYMax slice">
        {TOWERS.map(([x, w, top]) => <rect key={x} className="pn-ink" x={x} y={top} width={w} height={360 - top}/>)}
        <rect className="pn-ink" x="208" y="70" width="3" height="40"/>
        <rect className="pn-ink" x="608" y="44" width="3" height="46"/>
        <rect className="pn-ink" x="894" y="78" width="3" height="42"/>
        <g>
            {WINDOWS.map((lit, i) => (
                <g key={TOWERS[i][0]} className={i % 4 === 1 ? loop(ambient, still, 'flicker') : undefined} opacity={i % 3 === 0 ? 0.9 : 0.6}>
                    {lit.map(([x, y]) => <rect key={`${x}-${y}`} className="pn-glow" x={x} y={y} width="7" height="10"/>)}
                </g>
            ))}
        </g>
        <g className={loop(ambient, still, 'flicker')}>
            <rect className="pn-glow-line" x="500" y="186" width="70" height="26" rx="5" strokeWidth="3"/>
            <rect className="pn-glow" x="512" y="196" width="46" height="6" rx="3"/>
        </g>
    </Piece>
);

const Palm = ({side}: {side: 'left' | 'right'}) => (
    <Piece className={side === 'left' ? 'pn-art-left' : 'pn-art-right'} viewBox="0 0 260 460" ratio={side === 'left' ? 'xMinYMax meet' : 'xMaxYMax meet'}>
        <g transform={side === 'right' ? 'translate(260 0) scale(-1 1)' : undefined}>
            <path className="pn-ink" d="M58 460 C70 360 92 250 128 132 L140 136 C108 252 90 360 84 460 Z"/>
            {[180, 240, 300, 360, 420].map((y) => <path key={y} className="pn-glow" opacity="0.12" d={`M${62 + (460 - y) * 0.12} ${y} l22 -4 l0 4 z`}/>)}
            <path className="pn-ink" d="M134 128 C100 96 54 96 8 132 C56 112 96 116 130 140 Z"/>
            <path className="pn-ink" d="M136 126 C122 80 84 52 34 54 C82 68 112 96 128 136 Z"/>
            <path className="pn-ink" d="M138 124 C150 76 190 48 240 52 C192 70 162 98 146 136 Z"/>
            <path className="pn-ink" d="M140 128 C178 102 222 106 256 140 C214 122 178 124 146 142 Z"/>
            <path className="pn-ink" d="M138 126 C140 84 132 44 108 12 C142 40 156 82 148 132 Z"/>
            <circle className="pn-ink" cx="128" cy="144" r="9"/>
            <circle className="pn-ink" cx="146" cy="146" r="8"/>
            <circle className="pn-ink" cx="137" cy="156" r="8"/>
        </g>
    </Piece>
);

// Wave crests drawn past both edges, so the loop's sway never shows an end.
const crest = (y: number, amp: number, step: number): string => {
    let d = `M-120 ${y}`;
    for (let x = -120; x < 1320; x += step * 2) d += ` q${step / 2} ${-amp} ${step} 0 t${step} 0`;
    return d;
};

const Sea = ({ambient, still}: {ambient: AmbientId; still: boolean}) => (
    <Piece className="pn-art-sea" viewBox="0 0 1200 200" ratio="none">
        <g className={loop(ambient, still, 'waves')}>
            <path className="pn-glow-line" strokeWidth="3" opacity="0.5" d={crest(30, 8, 40)}/>
            <path className="pn-glow-line" strokeWidth="2.5" opacity="0.35" d={crest(80, 7, 52)}/>
            <path className="pn-glow-line" strokeWidth="2" opacity="0.25" d={crest(140, 6, 64)}/>
        </g>
        <path className="pn-glow" opacity="0.35" d="M520 6 L680 6 L660 14 L540 14 Z"/>
        <path className="pn-glow" opacity="0.2" d="M540 26 L660 26 L646 32 L554 32 Z"/>
    </Piece>
);

// A field of stars across the whole sky, a few of them four-pointed sparkles.
const STARS: readonly (readonly [x: number, y: number, r: number])[] = [
    [60, 80, 2], [180, 220, 1.5], [300, 60, 2.5], [420, 160, 1.5], [540, 40, 2], [660, 210, 1.5], [780, 90, 2.5], [900, 180, 2], [960, 50, 1.5],
    [120, 400, 1.5], [240, 520, 2], [80, 700, 2.5], [200, 880, 1.5], [360, 760, 2], [930, 420, 2.5], [860, 600, 1.5], [970, 760, 2], [760, 900, 1.5],
    [620, 960, 2], [480, 880, 1.5], [40, 960, 2], [990, 930, 1.5], [700, 520, 1.5], [320, 330, 1.5],
];
const SPARKLES: readonly (readonly [x: number, y: number, s: number])[] = [[140, 140, 9], [840, 320, 11], [260, 640, 8], [900, 820, 10], [600, 120, 7]];

const Stars = ({ambient, still}: {ambient: AmbientId; still: boolean}) => (
    <Piece className="pn-art-sky" viewBox="0 0 1000 1000" ratio="xMidYMid slice">
        <g>
            {STARS.map(([x, y, r]) => <circle key={`${x}-${y}`} className={cn('pn-glow', loop(ambient, still, 'twinkle'))} cx={x} cy={y} r={r}/>)}
            {SPARKLES.map(([x, y, s]) => (
                <path key={`${x}-${y}`} className={cn('pn-glow', loop(ambient, still, 'twinkle'))}
                      d={`M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`}/>
            ))}
        </g>
    </Piece>
);

const Planets = () => (
    <>
        <Piece className="pn-art-corner-tl" viewBox="0 0 200 200">
            <circle className="pn-glow" cx="100" cy="100" r="78" opacity="0.85"/>
            <circle className="pn-ink" cx="118" cy="86" r="77"/>
            <path className="pn-glow" opacity="0.12" d="M40 118 C80 104 130 110 170 128 L168 138 C128 122 82 116 44 130 Z"/>
        </Piece>
        <Piece className="pn-art-corner-br" viewBox="0 0 260 200">
            <path className="pn-glow-line" strokeWidth="6" opacity="0.6" d="M24 112 C24 84 236 84 236 112"/>
            <circle className="pn-ink" cx="130" cy="104" r="62"/>
            <path className="pn-glow" opacity="0.75" d="M86 62 A62 62 0 0 0 102 160 A70 70 0 0 1 86 62 Z"/>
            <path className="pn-glow" opacity="0.14" d="M74 92 C110 84 160 86 190 96 L188 104 C160 94 112 92 76 100 Z"/>
            <path className="pn-glow-line" strokeWidth="6" opacity="0.85" d="M24 112 C24 140 236 140 236 112"/>
        </Piece>
    </>
);

const Fireplace = ({ambient, still}: {ambient: AmbientId; still: boolean}) => (
    <>
        <Piece className="pn-art-left" viewBox="0 0 300 380" ratio="xMinYMax meet">
            <circle className="pn-glow" cx="140" cy="300" r="150" opacity="0.12"/>
            <rect className="pn-ink" x="10" y="60" width="260" height="320"/>
            <rect className="pn-ink" x="0" y="44" width="280" height="22" rx="3"/>
            {[[24, 84], [84, 84], [144, 84], [204, 84], [24, 128], [204, 128], [24, 172], [204, 172], [24, 216], [204, 216], [24, 260], [204, 260]].map(([x, y]) => (
                <rect key={`${x}-${y}`} className="pn-glow-line" x={x} y={y} width="52" height="34" rx="4" strokeWidth="1.5" opacity="0.14"/>
            ))}
            <path className="pn-glow" opacity="0.22" d="M80 380 L80 200 Q140 140 200 200 L200 380 Z"/>
            <g className={loop(ambient, still, 'flicker')}>
                <path className="pn-glow" opacity="0.95" d="M112 352 C96 318 112 290 126 270 C124 296 140 302 138 280 C160 304 168 330 152 352 Z"/>
                <path className="pn-glow" opacity="0.7" d="M138 352 C132 330 146 312 156 300 C156 318 170 322 166 306 C182 326 180 344 170 352 Z"/>
            </g>
            <g className={loop(ambient, still, 'flicker')}>
                <path className="pn-glow" opacity="0.6" d="M98 352 C94 334 104 322 112 314 C112 330 122 330 120 352 Z"/>
            </g>
            <rect className="pn-ink" x="88" y="350" width="104" height="14" rx="7"/>
            <rect className="pn-ink" x="96" y="340" width="86" height="12" rx="6" transform="rotate(-8 139 346)"/>
            <rect className="pn-ink" x="70" y="364" width="140" height="16"/>
        </Piece>
        <Piece className="pn-art-right" viewBox="0 0 200 150" ratio="xMaxYMax meet">
            {[[50, 128], [100, 128], [150, 128], [75, 88], [125, 88], [100, 50]].map(([x, y]) => (
                <g key={`${x}-${y}`}>
                    <circle className="pn-ink" cx={x} cy={y} r="22"/>
                    <circle className="pn-glow-line" cx={x} cy={y} r="13" strokeWidth="2" opacity="0.3"/>
                    <circle className="pn-glow" cx={x} cy={y} r="4" opacity="0.3"/>
                </g>
            ))}
        </Piece>
    </>
);

// Two swags of string lights: each bulb placed on its wire's curve.
const swag = (x0: number, x1: number, y: number, sag: number) => {
    const points: {x: number; y: number}[] = [];
    for (let i = 1; i < 7; i++) {
        const t = i / 7;
        const x = x0 + (x1 - x0) * t;
        points.push({x, y: y + 4 * sag * t * (1 - t)});
    }
    return points;
};
const BULBS = [...swag(-40, 600, 18, 90), ...swag(600, 1240, 18, 90)];

const Bulbs = ({ambient, still}: {ambient: AmbientId; still: boolean}) => (
    <>
        <Piece className="pn-art-band-top" viewBox="0 0 1200 160" ratio="xMidYMin slice">
            <path className="pn-ink-line" strokeWidth="3" d="M-40 18 Q280 198 600 18 Q920 198 1240 18"/>
            <g>
                {BULBS.map(({x, y}) => (
                    <g key={Math.round(x)} className={loop(ambient, still, 'twinkle')}>
                        <circle className="pn-glow" cx={x} cy={y + 18} r="20" opacity="0.25"/>
                        <rect className="pn-ink" x={x - 4} y={y - 2} width="8" height="9" rx="1.5"/>
                        <circle className="pn-glow" cx={x} cy={y + 15} r="9"/>
                    </g>
                ))}
            </g>
        </Piece>
        <Piece className="pn-art-hedge" viewBox="0 0 1200 120" ratio="xMidYMax slice">
            <path className="pn-ink" opacity="0.85"
                  d="M0 120 L0 60 Q40 20 90 50 Q130 10 180 46 Q230 14 280 52 Q320 24 370 56 Q420 30 470 58 Q520 26 570 54 Q620 22 670 56 Q720 28 770 54 Q800 30 830 56 Q870 18 920 50 Q960 12 1010 46 Q1060 16 1110 52 Q1160 22 1200 50 L1200 120 Z"/>
            {[[60, 62], [150, 54], [240, 66], [320, 60], [430, 64], [520, 58], [610, 62], [700, 60], [790, 64], [880, 60], [980, 54], [1080, 64], [1160, 58]].map(([x, y]) => (
                <circle key={x} className="pn-glow" cx={x} cy={y} r="4" opacity="0.9"/>
            ))}
        </Piece>
    </>
);

const SceneArt = ({art, ambient, still = false}: Props) => {
    if (art === 'none') return null;
    return (
        <div className="pn-art" aria-hidden="true" data-pn-art={art}>
            {art === 'chandelier' && <Chandelier/>}
            {art === 'lamps' && (
                <>
                    <Haze ambient={ambient} still={still}/>
                    <Lamp side="left"/>
                    <Lamp side="right"/>
                </>
            )}
            {art === 'skyline' && <Skyline ambient={ambient} still={still}/>}
            {art === 'palms' && (
                <>
                    <Sea ambient={ambient} still={still}/>
                    <Palm side="left"/>
                    <Palm side="right"/>
                </>
            )}
            {art === 'planets' && (
                <>
                    <Stars ambient={ambient} still={still}/>
                    <Planets/>
                </>
            )}
            {art === 'fireplace' && <Fireplace ambient={ambient} still={still}/>}
            {art === 'bulbs' && <Bulbs ambient={ambient} still={still}/>}
        </div>
    );
};

export default SceneArt;
