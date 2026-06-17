# 🧠 Agent Skills

This directory contains all installed agent skills organized by provider/plugin.
Skills are instruction files (SKILL.md) that teach AI agents how to perform specific workflows.

## Directory Structure

```
skills/
├── README.md              ← You are here
├── registry.json          ← Master registry of all installed skills
│
├── stitch-design/         ← Google Stitch — Design skills
│   ├── generate-design/
│   ├── extract-design-md/
│   ├── manage-design-system/
│   ├── code-to-design/
│   ├── upload-to-stitch/
│   └── extract-static-html/
│
├── stitch-build/          ← Google Stitch — Build skills
│   ├── react-components/
│   ├── react-native/
│   ├── remotion/
│   └── shadcn-ui/
│
└── stitch-utilities/      ← Google Stitch — Utility skills
    ├── design-md/
    ├── enhance-prompt/
    ├── stitch-loop/
    └── taste-design/
```

## How It Works

- Each skill lives in its own folder with a `SKILL.md` file
- The `registry.json` tracks all installed skills with metadata
- New skills from any provider can be added by creating a new `<provider>/` folder
- The agent reads skills from this directory to learn new capabilities

## Adding New Skills

1. Create a new folder under the appropriate provider: `skills/<provider>/<skill-name>/`
2. Add a `SKILL.md` file with the skill instructions
3. Update `registry.json` with the new skill entry

## Source

Current skills sourced from:
- **Google Stitch**: [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills)
