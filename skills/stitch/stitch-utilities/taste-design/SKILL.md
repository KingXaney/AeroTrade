---
name: taste-design
description: Semantic Design System Skill for Google Stitch. Generates agent-friendly DESIGN.md files that enforce premium, anti-generic UI standards — strict typography, calibrated color, asymmetric layouts, perpetual micro-motion, and hardware-accelerated performance.
allowed-tools:
  - "StitchMCP"
  - "Read"
  - "Write"
---

# Stitch Design Taste — Semantic Design System Skill

## Overview
This skill generates `DESIGN.md` files optimized for Google Stitch screen generation. It translates battle-tested anti-slop frontend engineering directives into Stitch's native semantic design language — descriptive, natural-language rules paired with precise values that Stitch's AI agent can interpret to produce premium, non-generic interfaces.

## Prerequisites
- Access to Google Stitch via [labs.google.com/stitch](https://labs.google.com/stitch)
- Optionally: Stitch MCP Server for programmatic integration

## The Goal
Generate a `DESIGN.md` file that encodes:
1. **Visual atmosphere** — the mood, density, and design philosophy
2. **Color calibration** — neutrals, accents, and banned patterns with hex codes
3. **Typographic architecture** — font stacks, scale hierarchy, and anti-patterns
4. **Component behaviors** — buttons, cards, inputs with interaction states
5. **Layout principles** — grid systems, spacing philosophy, responsive strategy
6. **Motion philosophy** — animation engine specs, spring physics, perpetual micro-interactions
7. **Anti-patterns** — explicit list of banned AI design clichés

## Analysis & Synthesis Instructions

### 1. Define the Atmosphere
- **Density:** "Art Gallery Airy" (1–3) → "Daily App Balanced" (4–7) → "Cockpit Dense" (8–10)
- **Variance:** "Predictable Symmetric" (1–3) → "Offset Asymmetric" (4–7) → "Artsy Chaotic" (8–10)
- **Motion:** "Static Restrained" (1–3) → "Fluid CSS" (4–7) → "Cinematic Choreography" (8–10)

Default baseline: Creativity 9, Variance 8, Motion 6, Density 5.

### 2. Map the Color Palette
**Mandatory constraints:**
- Maximum 1 accent color. Saturation below 80%
- The "AI Purple/Blue Neon" aesthetic is strictly BANNED
- Use absolute neutral bases (Zinc/Slate) with high-contrast singular accents
- Never use pure black (`#000000`) — use Off-Black, Zinc-950, or Charcoal

### 3. Establish Typography Rules
- **Display/Headlines:** Track-tight, controlled scale
- **Body:** Relaxed leading, max 65 characters per line
- **Font Selection:** `Inter` is BANNED for premium/creative contexts. Use: `Geist`, `Outfit`, `Cabinet Grotesk`, or `Satoshi`
- **Serif Ban:** Generic serifs BANNED. If needed: `Fraunces`, `Gambarino`, `Editorial New`, or `Instrument Serif`
- **Dashboard Constraint:** Sans-Serif exclusively (`Geist` + `Geist Mono` or `Satoshi` + `JetBrains Mono`)

### 4. Define the Hero Section
- **Inline Image Typography:** Embed small contextual photos between words/letters in headlines
- **No Overlapping:** Text must never overlap images
- **No Filler Text:** "Scroll to explore", scroll arrows are BANNED
- **Asymmetric Structure:** Centered Hero layouts BANNED when variance exceeds 4
- **CTA Restraint:** Maximum one primary CTA

### 5. Describe Component Stylings
- **Buttons:** Tactile push feedback. No neon outer glows. No custom cursors
- **Cards:** Use ONLY when elevation communicates hierarchy. Tint shadows to background hue
- **Inputs/Forms:** Label above input, helper text optional, error text below
- **Loading States:** Skeletal loaders matching layout — no generic spinners
- **Empty States:** Composed compositions indicating how to populate
- **Error States:** Clear, inline error reporting

### 6. Define Layout Principles
- No overlapping elements
- Centered Hero sections BANNED when variance exceeds 4
- The generic "3 equal card row" is BANNED — use asymmetric layouts
