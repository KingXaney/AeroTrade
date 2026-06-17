---
name: stitch::extract-design-md
description: >-
  Extract a comprehensive design system (DESIGN.md) directly from frontend source
  code — React, Vue, Svelte, Angular, plain HTML/CSS, or any web framework. Analyzes
  component files, stylesheets, Tailwind configs, theme definitions, and design tokens
  to produce a rich, Stitch-compatible design system document.
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Extract Design System from Frontend Code

Analyze frontend source code to extract a comprehensive design system document
(DESIGN.md) that captures the project's visual language — colors, typography,
spacing, component patterns, and layout principles — directly from the source
files, without needing to build or render the application.

## Why This Exists

The `design-md` skill works from rendered HTML. But often you have a codebase
and want to understand its design system before you can even run the app —
maybe dependencies are missing, the build is broken, or you just want a quick
audit. This skill reads the source files themselves: stylesheets, component
files, theme configs, and Tailwind setups. It's faster and works anywhere.

## When to Use

- User has a frontend codebase and wants to extract or document its design system
- User wants to migrate a project's visual identity into Stitch
- User asks to "audit the styling" or "understand the design language" of a repo
- User wants to create a DESIGN.md from existing source code
- The app can't be built/rendered but the source is available
- User wants to unify or reconcile inconsistent styles across a codebase

## Prerequisites

- Access to the frontend project's source directory
- No build or runtime dependencies needed — this skill reads source files only

---

## Workflow

### Phase 1: Project Discovery

Start by understanding what you're working with. This determines which
extraction patterns to use.

#### 1. Detect the Framework and Stack

Scan the project root for telltale files:

| Signal File | Framework / Tool |
|:---|:---|
| `package.json` with `react` | React / Next.js |
| `package.json` with `vue` | Vue / Nuxt |
| `package.json` with `svelte` | Svelte / SvelteKit |
| `package.json` with `@angular/core` | Angular |
| `tailwind.config.js/ts` | Tailwind CSS |
| `postcss.config.js` | PostCSS pipeline |
| `styled-components` or `@emotion` in deps | CSS-in-JS |
| `.css` / `.scss` / `.less` files only | Plain CSS / SASS |
| `theme.js` / `theme.ts` / `tokens.js` | Design token files |

Read `package.json` first — it reveals the framework, CSS tooling, and any
design-token libraries.

#### 2. Map the Source Tree

Identify the key directories and files you'll analyze:

```
src/
├── components/     ← Component-level styles
├── styles/         ← Global stylesheets
├── theme/          ← Theme definitions, tokens
├── assets/         ← Fonts, images
├── app.css         ← Root styles
└── index.css       ← Entry CSS
```

Also check for:
- `tailwind.config.js` / `tailwind.config.ts` — Custom colors, fonts, spacing
- `globals.css` / `global.css` — CSS custom properties (variables)
- Any `theme.*` or `tokens.*` files
- Component library config (e.g., `chakra-theme.ts`, `vuetify.config.ts`)

### Phase 2: Deep Extraction

Work through each design dimension systematically. For each one, gather raw
data from the source files, then synthesize it into descriptive language.

The goal isn't to dump every CSS property — it's to understand the *intent*
behind the styling choices and describe them in human, editorial language that
another designer (or Stitch) can use to recreate the same visual feel.

#### 1. Visual Theme & Atmosphere

Read the broadest styling first to understand the overall mood:

- **Root background**: What's the body or root element background?
- **Whitespace philosophy**: Are spacing values generous (32px+) or tight?
- **Density**: Count the components per page/section
- **Color temperature**: Are the neutrals warm (creams, tans) or cool (blue-grays, slates)?
- **Overall feel**: Synthesize into 1-2 rich sentences that capture the mood
