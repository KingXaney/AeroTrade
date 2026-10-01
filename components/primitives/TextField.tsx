import type {ComponentProps} from "react";
import {cn} from "@/lib/utils";

// The compact text input of the app's own forms: the order ticket, the account dialogs,
// Add friend, the Navigator's balance. surface-0 fill, a line-strong/40 hairline, and
// `field-focus` (globals.css) for the keyboard focus ring — the ring's border-color is
// !important, which is what beats the hairline's border utility, so keep the two together.
//
// TextField vs .form-input: `.form-input` is the tall (h-12) auth-page field and the
// topic composer's; TextField is everything else. Use `TextArea` for multi-line input and
// `fieldClass` for a native <select> that should match.

type Font = 'mono' | 'body';

export const fieldClass = (className?: string, font: Font = 'mono') =>
    cn(
        'rounded-lg px-3 py-2 text-sm text-fg bg-surface-0 border border-line-strong/40 outline-none field-focus',
        font === 'mono' ? 'font-mono' : 'font-sans',
        className,
    );

type FieldProps<T extends 'input' | 'textarea'> = ComponentProps<T> & {font?: Font};

const TextField = ({font, className, ...rest}: FieldProps<'input'>) => (
    <input className={fieldClass(className, font)} {...rest} />
);

export const TextArea = ({font, className, ...rest}: FieldProps<'textarea'>) => (
    <textarea className={fieldClass(className, font)} {...rest} />
);

export default TextField;
