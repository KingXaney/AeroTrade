import type {CSSProperties, ReactNode} from "react";
import {cn} from "@/lib/utils";

// One row inside a panel: a friend, a trade, a holding, a setting with its switch, a job
// stamp. A small bordered tile whose fill, border and radius are the look's card tokens
// (--card-*, read by .row-card in app/globals.css).
//
// RowCard vs Panel: a Panel is a top-level framed surface (.glass-panel: the look's tint,
// layered shadow and panel radius). A RowCard sits *inside* a Panel and stays flat, so a
// list of twenty rows is not twenty framed cards.
// Never nest a Panel in a Panel; reach for RowCard instead.
//
//   plain    — the default row
//   brand    — a row the app wrote about the user's data (a thesis, an AI answer)
//   selected — the row that is "you" or the active account
//
// `interactive` is for a row that is itself a link or a button (hover lifts the border).
// A Link, an <a> or a component that takes its own className (SafeMarkdown) uses the
// same recipe through `rowCard(...)`. The padding is the row tokens' (.row-card, in the
// components layer), so a call site that asks for its own (`px-3 py-2`) gets it; `className`
// may add layout too (flex, grid, gap).

export type RowTone = 'plain' | 'brand' | 'selected';

const BASE = 'row-card';

const TONE: Record<RowTone, string> = {
    plain: '',
    brand: 'border-brand/15',
    selected: 'bg-brand-strong/6 border-brand/25',
};

type Recipe = {tone?: RowTone; interactive?: boolean; className?: string};

export const rowCard = ({tone = 'plain', interactive, className}: Recipe = {}) =>
    cn(BASE, TONE[tone], interactive && 'hover:border-brand/30 transition-colors', className);

type Props = Recipe & {
    as?: 'div' | 'li' | 'label';
    id?: string;
    htmlFor?: string;
    title?: string;
    style?: CSSProperties;
    children: ReactNode;
};

const RowCard = ({as: Tag = 'div', tone, interactive, className, children, ...rest}: Props) => (
    <Tag className={rowCard({tone, interactive, className})} {...rest}>
        {children}
    </Tag>
);

export default RowCard;
