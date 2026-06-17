---
name: stitch::extract-static-html
description: >-
  Extract self-contained static HTML from a built web application or React
  components by inlining CSS and images. Use this skill whenever you need to
  capture a specific UI state, share a static version of a page, or prepare
  assets for Stitch upload.
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Extract Static HTML

Extract a self-contained static HTML file from any web application.

## Which Strategy to Use

You MUST ask the user to choose which strategy to use before proceeding.

| | Strategy A (Puppeteer) | Strategy B (Browser Subagent) |
| :--- | :--- | :--- |
| **When** | App runs locally, no auth wall | Need to interact with page first (click, fill forms) |
| **Fidelity** | **Highest — computed styles resolved** | High — rendered DOM |
| **Setup** | **Zero — no mock needed** | Zero — no mock needed |
| **Framework** | **Any** | Any |
| **Output** | **Writes to file — no size limit** | May truncate in agent context |

> [!WARNING]
> **Checkpoint — User Confirmation Required.**
> You **MUST** ask the user which strategy they prefer before proceeding.

## Strategy A: Puppeteer Snapshot (Recommended)

Launches headless Chrome, captures the fully rendered DOM, and produces a self-contained HTML file with all CSS inlined and images as base64.

### Prerequisites

- App running locally (e.g., `npm run dev`)
- Node.js with `puppeteer` available

### Workflow

1. **Start the App** and note the port.
2. **Run the Snapshot Script**:
   ```bash
   npx tsx <SKILL_DIR>/scripts/snapshot.ts \
     --url http://localhost:5173 \
     --output .stitch/home.html \
     --wait 2000
   ```
3. **Multiple pages** — run once per route.

### Script Flags

| Flag | Default | Description |
| :--- | :--- | :--- |
| `--url` | *(required)* | URL to capture |
| `--output` | *(required)* | Output file path |
| `--wait` | `1000` | Wait time in ms before capture |

## Strategy B: Browser Subagent

Use the browser subagent to interact with the page before capturing.
