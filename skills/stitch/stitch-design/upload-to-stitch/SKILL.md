---
name: stitch::upload-to-stitch
description: >-
  Upload local assets (images, mockups, extracted HTML) to a Stitch project.
  ALWAYS use this skill when you need to upload visual assets or full HTML pages
  to Stitch, particularly when direct MCP tool calls fail or truncate due to
  base64 token limits.
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Upload-to-Stitch

Upload local assets (images, mockups, HTML files) to a Stitch project using the
provided upload script, which bypasses the MCP tool's base64 output token limits.

> [!NOTE]
> The AI model cannot upload files via MCP tools directly because the base64
> encoding of even a small file exceeds the model's output token limit (~16K
> tokens). This script reads the file and sends it directly over HTTP.

## Steps

### 1. Identify Target Project

Use `list_projects` to find the correct `projectId`.

### 2. Get the API Key

Locate your active MCP server configuration file and extract the API key:
- **Antigravity**: `.gemini/antigravity/mcp_config.json` or `.gemini/jetski/mcp_config.json`
- **Gemini CLI**: `~/.gemini/settings.json` or `~/.gemini/extensions/Stitch/gemini-extension.json`
- **Claude Code**: `~/.claude.json`

Extract:
- **API Key**: From the `X-Goog-Api-Key` header or auth argument
- **MCP URL** (optional): From the `httpUrl` or endpoint argument (defaults to
  `https://stitch.googleapis.com`)

> [!IMPORTANT]
> If you cannot find the API key in any of these locations, or if you cannot access these files, you MUST ask the user to provide the Stitch API key. Do not proceed without a valid API key.

### 3. Run Upload Script

Use the upload script to send the file to Stitch via HTTP.
