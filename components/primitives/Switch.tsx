import type {ComponentProps} from "react";
import {cn} from "@/lib/utils";
import {Switch as UiSwitch} from "@/components/ui/switch";

// The themed toggle every settings panel uses: the shadcn switch (components/ui, regenerable)
// with the brand fill when on and the surface fill and line when off, from the theme tokens.
const THEMED = "data-[state=checked]:!bg-brand-strong data-[state=unchecked]:!bg-surface-4 data-[state=unchecked]:!border data-[state=unchecked]:!border-line-strong transition-colors duration-200";

const Switch = ({className, ...props}: ComponentProps<typeof UiSwitch>) => (
    <UiSwitch className={cn(THEMED, className)} {...props} />
);

export default Switch;
