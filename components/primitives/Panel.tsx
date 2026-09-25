import type {CSSProperties, ReactNode} from "react";
import {cn} from "@/lib/utils";

// The one framed surface in the app. `.glass-panel` (app/globals.css) carries the
// background, border, blur, shadow and radius of the *active visual style*, so a panel
// assembled by hand out of bg-surface-2/40 + border-line-strong/20 silently stops
// responding to the style axis — it looks right in `minimal` and wrong in the other four.
//
// `className` is LAYOUT ONLY: grid, flex, space-y, scroll-mt, max-w, text-center.
// Never background, border, shadow or radius. `.glass-panel` is declared outside any
// cascade layer, so those utilities lose to it and the override reads as a silent no-op.

export type PanelPad = 0 | 2 | 3 | 4 | 5 | 6 | 8 | 12;

// Numeric on purpose: the app has no spacing scale yet, so sm/md/lg would invent one.
// When a scale lands, only this map changes — every call site is already behind the seam.
const PAD: Record<PanelPad, string> = {
    0: '',
    2: 'p-2',
    3: 'p-3',
    4: 'p-4',
    5: 'p-5',
    6: 'p-6',
    8: 'p-8',
    12: 'p-12',
};

type Props = {
    as?: 'section' | 'div' | 'article' | 'aside' | 'nav' | 'li';
    pad?: PanelPad;
    // For a panel that is itself a link or a button. Renders data-interactive, which
    // globals.css hovers — a `hover:border-*` utility would lose to the unlayered rule.
    interactive?: boolean;
    id?: string;
    className?: string;
    // Measured values only (a drag ghost's pixel width). Never frame properties — see above.
    style?: CSSProperties;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'data-testid'?: string;
    children: ReactNode;
};

const Panel = ({as: Tag = 'section', pad = 5, interactive, className, children, ...rest}: Props) => (
    <Tag className={cn('glass-panel', PAD[pad], className)} {...(interactive ? {'data-interactive': ''} : {})} {...rest}>
        {children}
    </Tag>
);

export default Panel;
