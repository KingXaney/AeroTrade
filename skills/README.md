# 🧠 Agent Skills

All installed agent skills, organized by provider. **37 skills** currently installed.

## Quick Overview

| Provider | Folder | Skills | Source |
|:---------|:-------|:-------|:-------|
| **Google Stitch** | `stitch/` | 14 | [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) |
| **Engineering Workflows** | `engineering/` | 23 | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) |

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

Production-grade engineering disciplines from Addy Osmani. Full software development lifecycle coverage.

### 🔴 Core Lifecycle (Spec → Ship)
| Skill | Description |
|:------|:------------|
| `spec-driven-development/` | Define specs before code |
| `planning-and-task-breakdown/` | Break work into atomic, testable chunks |
| `incremental-implementation/` | Build in small verified steps |
| `test-driven-development/` | Write tests first, code second |
| `code-review-and-quality/` | Self-review checklist |
| `shipping-and-launch/` | Pre-launch verification |

### 🟠 Quality & Security
| Skill | Description |
|:------|:------------|
| `security-and-hardening/` | XSS, injection, secrets, auth vulnerabilities |
| `performance-optimization/` | Bundle analysis, lazy loading, Core Web Vitals |
| `debugging-and-error-recovery/` | Systematic debugging methodology |
| `code-simplification/` | Reduce complexity |
| `api-and-interface-design/` | RESTful best practices |

### 🟡 Workflow & Process
| Skill | Description |
|:------|:------------|
| `git-workflow-and-versioning/` | Branch strategy, commit messages |
| `ci-cd-and-automation/` | GitHub Actions, deployment pipelines |
| `documentation-and-adrs/` | Architecture Decision Records |
| `deprecation-and-migration/` | Safe API deprecation |
| `frontend-ui-engineering/` | Component architecture, accessibility |

### 🔵 Agent Meta-Skills
| Skill | Description |
|:------|:------------|
| `context-engineering/` | Optimize context window usage |
| `doubt-driven-development/` | Question assumptions before proceeding |
| `source-driven-development/` | Read docs/source before writing code |
| `idea-refine/` | Transform vague ideas into specs |
| `interview-me/` | Ask clarifying questions first |
| `browser-testing-with-devtools/` | Visual verification with DevTools |
| `using-agent-skills/` | Meta: how to discover and use skills |

---

## Adding New Skills

1. Create a folder: `skills/<provider>/<skill-name>/`
2. Add a `SKILL.md` file
3. Update `registry.json`
