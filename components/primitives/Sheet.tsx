"use client"

import * as React from "react"
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui"

import { cn } from "@/lib/utils"

// radix-ui ships no Sheet — shadcn's is itself Dialog plus side-positioning and a slide
// animation, which is all this is. Built on the same primitives components/ui/dialog.tsx
// uses so the two share overlay and animation conventions.

function Sheet({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

// The edge a sheet slides from. 'left' is the app's navigation drawer (the default, unchanged);
// the poker night table opens its drawers from the right, and from the bottom on a phone.
export type SheetSide = "left" | "right" | "bottom"

const SIDE: Record<SheetSide, string> = {
  left: "inset-y-0 left-0 h-full w-72 max-w-[85vw] data-open:slide-in-from-left data-closed:slide-out-to-left",
  right: "inset-y-0 right-0 h-full w-72 max-w-[85vw] data-open:slide-in-from-right data-closed:slide-out-to-right",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-xl pb-[env(safe-area-inset-bottom)] data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
}

function SheetContent({
  className,
  children,
  title,
  side = "left",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; side?: SheetSide }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-[60] bg-black/40 duration-150 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          // z-[60] so it clears .header, which is z-50 — portal DOM order happens to win
          // today, but that is not something to rely on.
          "fixed z-[60] flex flex-col duration-150 outline-none chrome-surface",
          "data-open:animate-in data-closed:animate-out",
          SIDE[side],
          className
        )}
        {...props}
      >
        {/* Radix logs an a11y warning on every open without a title. */}
        <VisuallyHidden.Root>
          <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
        </VisuallyHidden.Root>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent }
