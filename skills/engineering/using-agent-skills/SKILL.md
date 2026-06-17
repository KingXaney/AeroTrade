---

---
name: using-agent-skills
description: Discovers and invokes agent skills. Use when starting a session or when you need to discover which skill applies to the current task. This is the meta-skill that governs how all other skills are discovered and invoked.
---

# Using Agent Skills

## Overview

Agent Skills is a collection of engineering workflow skills organized by development phase. Each skill encodes a specific process that senior engineers follow. This meta-skill helps you discover and apply the right skill for your current task.

## Skill Discovery

When a task arrives, identify the development phase and apply the corresponding skill:

```
Task arrives
    â”‚
    â”œâ”€â”€ Don't know what you want yet? â”€â”€â”€â”€â”€â”€â†’ interview-me
    â”œâ”€â”€ Have a rough concept, need variants? â†’ idea-refine
    â”œâ”€â”€ New project/feature/change? â”€â”€â†’ spec-driven-development
    â”œâ”€â”€ Have a spec, need tasks? â”€â”€â”€â”€â”€â”€â†’ planning-and-task-breakdown
    â”œâ”€â”€ Implementing code? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ incremental-implementation
    â”‚   â”œâ”€â”€ UI work? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ frontend-ui-engineering
    â”‚   â”œâ”€â”€ API work? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ api-and-interface-design
    â”‚   â”œâ”€â”€ Need better context? â”€â”€â”€â”€â”€â†’ context-engineering
    â”‚   â”œâ”€â”€ Need doc-verified code? â”€â”€â”€â†’ source-driven-development
    â”‚   â””â”€â”€ Stakes high / unfamiliar code? â”€â”€â†’ doubt-driven-development
    â”œâ”€â”€ Writing/running tests? â”€â”€â”€â”€â”€â”€â”€â”€â†’ test-driven-development
    â”‚   â””â”€â”€ Browser-based? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ browser-testing-with-devtools
    â”œâ”€â”€ Something broke? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ debugging-and-error-recovery
    â”œâ”€â”€ Reviewing code? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ code-review-and-quality
    â”‚   â”œâ”€â”€ Too complex? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ code-simplification
    â”‚   â”œâ”€â”€ Security concerns? â”€â”€â”€â”€â”€â”€â”€â†’ security-and-hardening
    â”‚   â””â”€â”€ Performance concerns? â”€â”€â”€â”€â†’ performance-optimization
    â”œâ”€â”€ Committing/branching? â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ git-workflow-and-versioning
    â”œâ”€â”€ CI/CD pipeline work? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ ci-cd-and-automation
    â”œâ”€â”€ Deprecating/migrating? â”€â”€â”€â”€â”€â”€â”€â”€â†’ deprecation-and-migration
    â”œâ”€â”€ Writing docs/ADRs? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ documentation-and-adrs
    â””â”€â”€ Deploying/launching? â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ shipping-and-launch
```

## Core Operating Behaviors

These behaviors apply at all times, across all skills. They are non-negotiable.

### 1. Surface Assumptions

Before implementing anything non-trivial, explicitly state your assumptions:

```
ASSUMPTIONS I'M MAKING:
1. [assumption about requirements]
2. [assumption about architecture]
3. [assumption about scope]
â†’ Correct me now or I'll proceed with these.
```

Don't silently fill in ambiguous requirements. The most common failure mode is making wrong assumptions and running with them unchecked. Surface uncertainty early â€” it's cheaper than rework.

### 2. Manage Confusion Actively

When you encounter inconsistencies, conflicting requirements, or unclear specifications:

1. **STOP.** Do not proceed with a guess.
2. Name the specific confusion.
3. Present the tradeoff or ask the clarifying question.
4. Wait for resolution before continuing.

**Bad:** Silently picking one interpretation and hoping it's right.
**Good:** "I see X in the spec but Y in the existing code. Which takes precedence?"

### 3. Push Back When Warranted

You are not a
