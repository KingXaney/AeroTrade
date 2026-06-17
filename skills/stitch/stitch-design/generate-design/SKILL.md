---
name: stitch::generate-design
description: >-
  Generate new screens from text prompts or images, edit existing screens
  with prompts and design system tokens, and generate design variants using
  Stitch MCP. Includes prompt enhancement pipeline, design mappings, professional
  UI/UX terminology, design tokens and theme system capabilities.
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Generate Design

Create new design screens from text descriptions, images, or mockups, edit
existing screens with prompts and design system tokens, and generate design
variants using Stitch MCP.

> [!NOTE]
> Refer to your system prompt for instruction on handling MCP tool prefixes for
> all tools mentioned in this skill (e.g., `list_projects`,
> `generate_screen_from_text`, `edit_screens`).

## 🎨 Prompt Enhancement Pipeline

Before calling any Stitch generation or editing tool, you MUST enhance the
user's prompt.

### 1. Analyze Context

- **Project**: Use `list_projects` to find the correct `projectId`. If no
  suitable project exists, create one using `create_project`.
- **Design System**: Check if a design system exists for the project via
  `list_design_systems`. If one exists, design tokens (colors, fonts, roundness)
  are already applied at the project level — do NOT include any color, font, or
  theme instructions in the generation prompt. If none exists, delegate to the
  **manage-design-system** skill first before generating screens.

### 2. Refine UI/UX Terminology

Consult Design Mappings to replace vague terms.

- Vague: "Make a nice header"
- Professional: "Sticky navigation bar with glassmorphism effect and centered
  logo"

Use Prompting Keywords for component names, adjective palettes, color roles, and shape descriptions.

### 3. Structure the Final Prompt

Format the enhanced prompt for Stitch. Focus exclusively on **layout, content,
and structure** — never include colors, fonts, or theme instructions (these are
handled by the manage-design-system skill at the project level).

For **new screens**, use this template:

```markdown
[Overall purpose and user intent of the page]

**PLATFORM:** [Web/Mobile], [Desktop/Mobile]-first

**PAGE STRUCTURE:**
1. **Header:** [Description of navigation and branding]
2. **Hero Section:** [Headline, subtext, and primary CTA]
3. **Primary Content Area:** [Detailed component breakdown]
4. **Footer:** [Links and copyright information]
```

For **edits**, be specific about what to change:

- **Location**: "Change the [primary button] in the [hero section]..."
- **Visuals**: "...to a darker blue (#004080) and add a subtle shadow."
- **Structure**: "Add a secondary button next to the primary one with the text
  'Learn More'."

> [!CAUTION]
> Do NOT include hex codes, font names, color palettes, roundness values, or
> any design system tokens in a **generation** prompt. These are applied at the
> project level by the manage-design-system skill and will conflict if
> duplicated. (For **edit** prompts, hex codes are acceptable for precise
> color adjustments.)

### 4. Present AI Insights

After any tool call, always surface the `outputComponents` (Text Description and
Suggestions) to the user.

---

## Steps

### Determine the Mode

Decide which flow to use based on the user's request:

- User wants to create from a text description → **Generate from Text** flow
- User provides an image, screenshot, or mockup → **Generate from Image** flow
- User wants to modify an existing screen → **Edit** flow
- User wants layout/color/content variations → **Generate Variant** flow
