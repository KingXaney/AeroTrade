---
name: design-md
description: Analyze Stitch projects and synthesize a semantic design system into DESIGN.md files
allowed-tools:
  - "stitch*:*"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Stitch DESIGN.md Skill

You are an expert Design Systems Lead. Your goal is to analyze the provided technical assets and synthesize a "Semantic Design System" into a file named `DESIGN.md`.

## Overview

This skill helps you create `DESIGN.md` files that serve as the "source of truth" for prompting Stitch to generate new screens that align perfectly with existing design language. Stitch interprets design through "Visual Descriptions" supported by specific color values.

## Prerequisites

- Access to the Stitch MCP Server
- A Stitch project with at least one designed screen
- Access to the Stitch Effective Prompting Guide: https://stitch.withgoogle.com/docs/learn/prompting/

## Retrieval and Networking

1. **Namespace discovery**: Run `list_tools` to find the Stitch MCP prefix.
2. **Project lookup**: Call `[prefix]:list_projects` with `filter: "view=owned"`
3. **Screen lookup**: Call `[prefix]:list_screens` with the `projectId`
4. **Metadata fetch**: Call `[prefix]:get_screen` with both `projectId` and `screenId`
   - Returns: `screenshot.downloadUrl`, `htmlCode.downloadUrl`, `width`, `height`, `deviceType`
5. **Asset download**: Use `web_fetch` or `read_url_content` to download HTML code
6. **Project metadata**: Call `[prefix]:get_project` to get `designTheme` object

## Analysis & Synthesis Instructions

### 1. Extract Project Identity (JSON)
- Locate the Project Title and specific Project ID

### 2. Extract Visual Theme & Atmosphere
- Describe the overall mood, density, and design philosophy

### 3. Extract Color Palette
- Map all colors with hex codes, roles, and descriptive names

### 4. Extract Typography
- Document font stacks, scale hierarchy, and weight usage

### 5. Extract Component Patterns
- Catalog buttons, cards, inputs, and their styling patterns

### 6. Extract Layout Principles
- Document grid systems, spacing philosophy, and responsive strategy
