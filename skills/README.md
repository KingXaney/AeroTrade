# 🧠 Agent Skills

All installed agent skills, organized by provider. **24 skills** currently installed.

> Note: these are reference/library skills — they are not auto-loaded by Claude Code
> (that requires `.claude/skills/`). 13 engineering skills were removed on 2026-07-30
> because they duplicated or conflicted with skills already active globally
> (Superpowers, Spartan, Anthropic).

## Quick Overview

| Provider | Folder | Skills | Source |
|:---------|:-------|:-------|:-------|
| **Google Stitch** | `stitch/` | 14 | [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) |
| **Engineering Workflows** | `engineering/` | 10 | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) |

---

## 📐 Stitch Skills (`stitch/`)

Design, build, and utility skills for Google Stitch MCP. See [stitch/registry.json](stitch/registry.json) for details.

| Plugin | Skills |
|:-------|:-------|
| `stitch-design/` | generate-design, extract-design-md, manage-design-system, code-to-design, upload-to-stitch, extract-static-html |
| `stitch-build/` | react-components, react-native, remotion, shadcn-ui |
| `stitch-utilities/` | design-md, enhance-prompt, stitch-loop, taste-design |

---

## 🔧 Engineering Workflows (`engineering/`)

Production-grade engineering disciplines from Addy Osmani. Only skills with no
globally-active counterpart are kept here.

### 🔴 Lifecycle & Delivery
| Skill | Description |
|:------|:------------|
| `incremental-implementation/` | Build in small verified steps |
| `shipping-and-launch/` | Pre-launch verification, rollback plans, monitoring |
| `deprecation-and-migration/` | Safe API deprecation, migration guides |
| `ci-cd-and-automation/` | GitHub Actions, deployment pipelines |
| `git-workflow-and-versioning/` | Branch strategy, commit messages, versioning |

### 🟠 Quality & Knowledge
| Skill | Description |
|:------|:------------|
| `performance-optimization/` | Bundle analysis, lazy loading, Core Web Vitals |
| `documentation-and-adrs/` | Architecture Decision Records |

### 🔵 Agent Meta-Skills
| Skill | Description |
|:------|:------------|
| `context-engineering/` | Optimize context window usage |
| `doubt-driven-development/` | Adversarial fresh-context review of decisions |
| `source-driven-development/` | Read docs/source before writing code |

### Removed as duplicates (2026-07-30)

`test-driven-development`, `debugging-and-error-recovery`, `code-review-and-quality`,
`code-simplification`, `spec-driven-development`, `planning-and-task-breakdown`,
`interview-me`, `idea-refine`, `browser-testing-with-devtools`, `using-agent-skills`,
`security-and-hardening`, `frontend-ui-engineering`, and `api-and-interface-design`
(the last conflicted with the global RPC-style API rules). Each has an active
counterpart in the global Superpowers/Spartan/Anthropic skill set.

---

## Adding New Skills

1. Create a folder: `skills/<provider>/<skill-name>/`
2. Add a `SKILL.md` file
3. Update `registry.json`
