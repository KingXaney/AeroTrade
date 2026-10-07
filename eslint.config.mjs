import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Fonts ship in app/fonts: a build-time fetch from Google Fonts failed whole Vercel builds.
      "no-restricted-imports": ["error", {
        paths: [{name: "next/font/google", message: "Bundle the font in app/fonts and load it with next/font/local (see app/layout.tsx)."}],
      }],
    },
  },
  {
    // AGENTS.md invariant 5: a font comes from the font-mono / font-heading / font-sans
    // utilities. An inline fontFamily beats every class, so one left in a component stops a
    // theme's type change from reaching it — and a `const mono = {fontFamily}` is the same thing.
    files: ["**/*.tsx", "**/*.jsx"],
    rules: {
      // Any fontFamily key, not only one written inside style={{…}}: a JSX style object
      // with fontFamily is rejected wherever the object literal was written.
      "no-restricted-syntax": ["error", {
        selector: "Property[key.name='fontFamily'], Property[key.value='fontFamily']",
        message: "Use the font-mono / font-heading / font-sans utility, not an inline fontFamily (AGENTS.md invariant 5).",
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Claude Code's git worktrees live under .claude/worktrees, each with a build output of its
    // own; a sibling session's tree is never this tree's lint target.
    ".claude/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
