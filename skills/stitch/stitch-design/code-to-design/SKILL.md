---
name: stitch::code-to-design
description: >-
  Convert frontend code (Vite, React, etc.) to a Stitch Design by chaining
  static HTML extraction, design system extraction, and file upload. ALWAYS use
  this skill when the user's intent is to move existing web apps or React
  components into Stitch.
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Code to Design

Transform your existing frontend code into a Stitch Design so you can iterate and improve it using Stitch.

This skill orchestrates three other skills in sequence:
1. `extract-static-html`: Extract a single self-contained HTML file from your build output.
2. `extract-design-md`: Analyze the source code to create a design system (DESIGN.md).
3. `upload-to-stitch`: Upload that HTML file and the design system to your Stitch project.

## Workflow

### Prerequisites

- A built web application directory containing `index.html` and assets.
- Target Stitch `projectId` (use `list_projects` if unknown).

### Steps

#### 1. Extract Self-Contained HTML

Delegate to the `extract-static-html` skill to produce a single HTML file with all CSS and images inlined.

#### 2. Extract Design System

Delegate to the `extract-design-md` skill to analyze the source code and generate a DESIGN.md file.

#### 3. Upload to Stitch

Delegate to the `upload-to-stitch` skill to upload the HTML file and design system to the Stitch project.
