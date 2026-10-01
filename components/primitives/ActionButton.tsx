import type {ComponentProps, CSSProperties} from "react";
import {cn} from "@/lib/utils";

// The one labelled button: mono, bold, uppercase, on the control radius (rounded-lg is
// var(--radius) = var(--control-radius), so it follows the style axis). Restyling every
// call-to-action in the app is an edit to VARIANT or SIZE below.
//
// Use it for a button with a text label. Not for: an icon-only affordance (`iconButton`),
// a segmented toggle or a chip that carries its own on/off state, or a framed surface
// that happens to be clickable (`<Panel interactive>` / `RowCard interactive`).
//
//   primary   — the page's main action (Follow a topic, Save, Try again)
//   strong    — a form's commit button, the darker fill with a press scale (Place order,
//               Create account, Enroll)
//   secondary — the quiet bordered action beside a primary (Cancel, Dashboard, Edit)
//   danger    — the same quiet button for an action that takes something away; it only
//               turns red on hover (Log out, Pause trading, Reset, Decline)
//   destructive — the filled red commit of a destructive dialog (Delete account, Sell)
//
// A Link or an <a download> takes the same recipe through `actionButton(...)`.
// `className` is passed through tailwind-merge, so a call site may still override
// padding, tracking or a hover colour; that is the escape hatch, not the default.

export type ActionVariant = 'primary' | 'strong' | 'secondary' | 'danger' | 'destructive';
export type ActionSize = 'xs' | 'sm' | 'md' | 'block';

const BASE = 'font-mono rounded-lg text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-50';

const VARIANT: Record<ActionVariant, string> = {
    primary: 'bg-brand text-on-brand',
    strong: 'bg-brand-strong text-on-brand tracking-wider transition-all active:scale-[0.98]',
    secondary: 'text-fg-soft hover:text-fg border border-line-strong/40 transition-colors',
    danger: 'text-fg-soft hover:text-negative border border-line-strong/40 transition-colors',
    destructive: 'bg-negative text-on-negative tracking-wider transition-all active:scale-[0.98]',
};

const SIZE: Record<ActionSize, string> = {
    xs: 'px-3 py-1.5',
    sm: 'px-3 py-2',
    md: 'px-4 py-2',
    block: 'w-full py-3 text-sm',
};

// The halo under a form's commit button. Inline because it is one shadow, not a ring.
const GLOW: Record<'strong' | 'destructive', CSSProperties['boxShadow']> = {
    strong: '0 0 15px color-mix(in srgb, var(--brand-strong) 30%, transparent)',
    destructive: '0 0 15px color-mix(in srgb, var(--negative) 25%, transparent)',
};

type Recipe = {variant?: ActionVariant; size?: ActionSize; className?: string};

export const actionButton = ({variant = 'primary', size = 'sm', className}: Recipe = {}) =>
    cn(BASE, VARIANT[variant], SIZE[size], className);

type Props = ComponentProps<'button'> & Recipe & {
    // Only for `strong` and `destructive`.
    glow?: boolean;
};

const ActionButton = ({variant = 'primary', size, glow, className, style, type = 'button', ...rest}: Props) => {
    const halo = glow && (variant === 'strong' || variant === 'destructive') ? {boxShadow: GLOW[variant]} : undefined;
    return (
        <button type={type} className={actionButton({variant, size, className})}
                style={halo || style ? {...halo, ...style} : undefined} {...rest} />
    );
};

export default ActionButton;
