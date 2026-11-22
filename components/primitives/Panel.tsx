import type {CSSProperties, ReactNode, SubmitEventHandler} from "react";
import {cn} from "@/lib/utils";

// The one framed surface in the app. `.glass-panel` (app/globals.css) carries the
// background, border, blur, shadow and radius of the app's one look (the --panel-* tokens), so
// a panel assembled by hand out of bg-surface-2/40 + border-line-strong/20 is silently another
// surface: no tint, no layered shadow, a radius of its own.
//
// `className` is LAYOUT ONLY: grid, flex, space-y, scroll-mt, max-w, text-center.
// Never background, border, shadow or radius. `.glass-panel` is declared outside any
// cascade layer, so those utilities lose to it and the override reads as a silent no-op.

export type PanelPad = 0 | 2 | 3 | 4 | 5 | 6 | 8 | 12;

// Numeric on purpose: the app has no spacing scale yet, so sm/md/lg would invent one.
// When a scale lands, only this map changes — every call site is already behind the seam.
// The look is compact: from 3 up each key draws a step under its name (the default, 5, is 16px;
// 12, the roomiest, is 32px), so a page that asked for a roomy panel still gets a roomier one.
const PAD: Record<PanelPad, string> = {
    0: '',
    2: 'p-2',
    3: 'p-3',
    4: 'p-3.5',
    5: 'p-4',
    6: 'p-5',
    8: 'p-6',
    12: 'p-8',
};

// The padding class a key draws, for a surface that frames its body itself (the dashboard's
// widget shell while it is being arranged).
export const panelPad = (pad: PanelPad): string => PAD[pad];

type Props = {
    as?: 'section' | 'div' | 'article' | 'aside' | 'nav' | 'li' | 'form';
    pad?: PanelPad;
    // For a panel that is itself a link or a button. Renders data-interactive, which
    // globals.css hovers — a `hover:border-*` utility would lose to the unlayered rule.
    interactive?: boolean;
    id?: string;
    className?: string;
    // Measured values only (a drag ghost's pixel width). Never frame properties — see above.
    style?: CSSProperties;
    // For `as="form"`: a form that is itself the framed surface (an order ticket).
    onSubmit?: SubmitEventHandler<HTMLElement>;
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
