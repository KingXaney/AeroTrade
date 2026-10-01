import type {ComponentProps, CSSProperties} from "react";
import {cn} from "@/lib/utils";

// The compact text input of the app's own forms: the order ticket, the account dialogs,
// Add friend, the Navigator's balance. surface-0 fill, a line-strong/40 hairline, and
// `field-focus` (globals.css) for the keyboard focus ring — the ring's !important is what
// beats the inline border, so keep the two together.
//
// TextField vs .form-input: `.form-input` is the tall (h-12) auth-page field and the
// topic composer's; TextField is everything else. Use `TextArea` for multi-line input and
// `fieldClass` + FIELD_STYLE for a native <select> that should match.
//
// Inline style rather than bg-/border- utilities on purpose: it is what the field-focus
// rule was written against, so the focus ring keeps working without a specificity fight.

export const FIELD_STYLE: CSSProperties = {
    backgroundColor: 'var(--surface-0)',
    border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)',
};

type Font = 'mono' | 'body';

export const fieldClass = (className?: string, font: Font = 'mono') =>
    cn('rounded-lg px-3 py-2 text-sm text-fg outline-none field-focus', font === 'mono' ? 'font-mono' : 'font-sans', className);

type FieldProps<T extends 'input' | 'textarea'> = ComponentProps<T> & {font?: Font};

const TextField = ({font, className, style, ...rest}: FieldProps<'input'>) => (
    <input className={fieldClass(className, font)} style={{...FIELD_STYLE, ...style}} {...rest} />
);

export const TextArea = ({font, className, style, ...rest}: FieldProps<'textarea'>) => (
    <textarea className={fieldClass(className, font)} style={{...FIELD_STYLE, ...style}} {...rest} />
);

export default TextField;
