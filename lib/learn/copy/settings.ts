// Settings › Appearance (components/settings/AppearanceSettings.tsx): the palette chips and the
// Reduce motion switch. A theme is those two choices and nothing else (lib/theme/resolve.ts) —
// the app has one look — so no line here offers a style, a preset or a layout. Pure exports,
// held to the 'copy' tier of lib/learn/banned.ts by lib/learn/__tests__/settings-copy.test.ts.

export const APPEARANCE_COPY = {
    // Above the chips. A hover (or keyboard focus) previews, a click saves to the account.
    intro: 'Pick a palette. Hover to preview it, click to apply it on every device your account signs into.',
    // Back to the palette a new account starts with (DEFAULT_THEME); the motion choice is kept.
    reset: 'Reset to default',
    // The chips' group, for a screen reader.
    paletteGroup: 'Colour palette',
    motion: {
        // The robot's tip names this switch (lib/learn/copy/robot.ts), pinned by its test.
        title: 'Reduce motion',
        hint: 'Stops animations and moving scenes. Your OS setting is always respected too.',
    },
} as const;
