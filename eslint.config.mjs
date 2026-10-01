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
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
