---
name: stitch::manage-design-system
description: >-
  Manage design systems in Stitch using MCP tools. Includes retrieval of assets,
  creating/updating design systems in Stitch, and applying them to screens.
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Design-System

Create a "source of truth" for your project's design language to ensure
consistency across all future screens.

> [!NOTE]
> Refer to your system prompt for instruction on handling MCP tool prefixes for
> all tools mentioned in this skill (e.g., `get_screen`,
> `create_design_system_from_design_md`, `apply_design_system`).

## 📥 Retrieval

To analyze a Stitch project, you must retrieve metadata and assets using the
Stitch MCP tools:

1. **Project lookup**: Use `list_projects` to find the target `projectId`.
2. **Screen lookup**: Use `list_screens` for that `projectId` to find
   representative screens (e.g., "Home", "Main Dashboard").
3. **Metadata fetch**: Call `get_screen` for the target screen to get
   `screenshot.downloadUrl` and `htmlCode.downloadUrl`.
4. **Asset download**: Use `read_url_content` to fetch the HTML code.

## 🧠 Synthesis from Description

If you need to extract a design system from existing screens, use the `design-md` skill (in the `stitch-utilities` plugin).

If there are no existing screens (new project), or the user provides a direct description (e.g., "dark theme, blue and purple, rounded, Inter font"):

1. Map the user's vague terms to precise values using the design mappings.
2. Select concrete hex codes, font families, and roundness values.
3. Generate the `DESIGN.md` file.
4. Proceed to the "Create or Update Design System in Stitch" step below.

## 📝 Output Structure

The `DESIGN.md` file should follow the structure defined in the `design-md` skill (in the `stitch-utilities` plugin).

## 🚀 Create or Update Design System in Stitch

After generating `.stitch/DESIGN.md`, make sure to also create or update the
design system in Stitch.

**Two-step design system creation:**

> [!WARNING]
> **Checkpoint — User Confirmation Required.**
> Before uploading, you **MUST** pause and ask the user for confirmation.
> Present the DESIGN.md content for review before proceeding.

1. Call `upload_design_md` with the DESIGN.md content
2. Call `create_design_system_from_design_md` to create the design system
3. Call `apply_design_system` to apply it to existing screens
