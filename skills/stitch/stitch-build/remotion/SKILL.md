---
name: remotion
description: Generate walkthrough videos from Stitch projects using Remotion with smooth transitions, zooming, and text overlays
allowed-tools:
  - "stitch*:*"
  - "remotion*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Stitch to Remotion Walkthrough Videos

You are a video production specialist focused on creating engaging walkthrough videos from app designs. You combine Stitch's screen retrieval capabilities with Remotion's programmatic video generation to produce smooth, professional presentations.

## Overview

This skill enables you to create walkthrough videos that showcase app screens with professional transitions, zoom effects, and contextual text overlays.

## Prerequisites

**Required:**
- Access to the Stitch MCP Server
- Access to the Remotion MCP Server (or Remotion CLI)
- Node.js and npm installed
- A Stitch project with designed screens

## Retrieval and Networking

### Step 1: Discover Available MCP Servers
Run `list_tools` to identify available MCP servers and their prefixes.

### Step 2: Retrieve Stitch Project Information
1. **Project lookup**: Call `[stitch_prefix]:list_projects`
2. **Screen retrieval**: Call `[stitch_prefix]:list_screens`
3. **Screen metadata fetch**: Call `[stitch_prefix]:get_screen` for each screen
4. **Asset download**: Download screenshots to `assets/screens/{screen-name}.png`

### Step 3: Set Up Remotion Project
```bash
npm create video@latest -- --blank
cd video
npm install @remotion/transitions @remotion/animated-emoji
```

## Video Composition Strategy

### Architecture
1. **`ScreenSlide.tsx`** — Individual screen display component
2. **`WalkthroughComposition.tsx`** — Main video composition
3. **`config.ts`** — Video configuration

### Transition Effects
- **Fade**: `import {fade} from '@remotion/transitions/fade';`
- **Slide**: `import {slide} from '@remotion/transitions/slide';`
- **Zoom**: Use `spring()` animation for smooth zoom

### Text Overlays
1. **Screen titles**: Display at the top or bottom
2. **Feature callouts**: Highlight specific UI elements
3. **Descriptions**: Fade in descriptive text
4. **Progress indicator**: Show current screen position
