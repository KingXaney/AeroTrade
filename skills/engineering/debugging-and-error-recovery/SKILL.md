---

---
name: debugging-and-error-recovery
description: Guides systematic root-cause debugging. Use when tests fail, builds break, behavior doesn't match expectations, or you encounter any unexpected error. Use when you need a systematic approach to finding and fixing the root cause rather than guessing.
---

# Debugging and Error Recovery

## Overview

Systematic debugging with structured triage. When something breaks, stop adding features, preserve evidence, and follow a structured process to find and fix the root cause. Guessing wastes time. The triage checklist works for test failures, build errors, runtime bugs, and production incidents.

## When to Use

- Tests fail after a code change
- The build breaks
- Runtime behavior doesn't match expectations
- A bug report arrives
- An error appears in logs or console
- Something worked before and stopped working

## The Stop-the-Line Rule

When anything unexpected happens:

```
1. STOP adding features or making changes
2. PRESERVE evidence (error output, logs, repro steps)
3. DIAGNOSE using the triage checklist
4. FIX the root cause
5. GUARD against recurrence
6. RESUME only after verification passes
```

**Don't push past a failing test or broken build to work on the next feature.** Errors compound. A bug in Step 3 that goes unfixed makes Steps 4-10 wrong.

## The Triage Checklist

Work through these steps in order. Do not skip steps.

### Step 1: Reproduce

Make the failure happen reliably. If you can't reproduce it, you can't fix it with confidence.

```
Can you reproduce the failure?
â”œâ”€â”€ YES â†’ Proceed to Step 2
â””â”€â”€ NO
    â”œâ”€â”€ Gather more context (logs, environment details)
    â”œâ”€â”€ Try reproducing in a minimal environment
    â””â”€â”€ If truly non-reproducible, document conditions and monitor
```

**When a bug is non-reproducible:**

```
Cannot reproduce on demand:
â”œâ”€â”€ Timing-dependent?
â”‚   â”œâ”€â”€ Add timestamps to logs around the suspected area
â”‚   â”œâ”€â”€ Try with artificial delays (setTimeout, sleep) to widen race windows
â”‚   â””â”€â”€ Run under load or concurrency to increase collision probability
â”œâ”€â”€ Environment-dependent?
â”‚   â”œâ”€â”€ Compare Node/browser versions, OS, environment variables
â”‚   â”œâ”€â”€ Check for differences in data (empty vs populated database)
â”‚   â””â”€â”€ Try reproducing in CI where the environment is clean
â”œâ”€â”€ State-dependent?
â”‚   â”œâ”€â”€ Check for leaked state between tests or requests
â”‚   â”œâ”€â”€ Look for global variables, singletons, or shared caches
â”‚   â””â”€â”€ Run the failing scenario in isolation vs after other operations
â””â”€â”€ Truly random?
    â”œâ”€â”€ Add defensive logging at the suspected location
    â”œâ”€â”€ Set up an alert for the specific error signature
    â””â”€â”€ Document the conditions observed and revisit when it recurs
```

For test failures:
```bash
# Run the specific failing test
npm test -- --grep "test name"

# Run with verbose output
npm test -- --verbose

# Run in isolation (rules out test pollution)
npm test -- --testPathPattern="specific-file" --runInBand
```

### Step 2: Localize

Narrow down WHERE the failure happens:

```
Which layer is failing?
â”œâ”€â”€ UI/Frontend     â†’ Check console, DOM, network tab
â”œâ”€â”€ API/Backend     â†’ Check server logs, request/response
â”œâ”€â”€ Database        â†’ Check queries, schema, data integrity
â”œâ”€â”€ Build tooling   â†’ Check config, dependencies, environment
â”œâ”€â”€ External service â†’ Check connectivity, API changes, rate limits
â””â”€â”€ Test itself     â†’ Check if the test is correct (false negative)
```

**Use bisection for regression bugs:**
```bash
# Find which commit introduced the bug
git bisect start
git bisect bad                    # Current commit is broken
git bisect good <known-good-sha> # This commit worked
# Git will checkout midpoint commits; run your test at each
git bisect run npm test -- --grep "failing test"
```

### Step 3: Reduce

Create the minimal failing case:

- Remove unrelated code/config until only the bug remains
- Simplify the input to the smallest example that triggers the failure
- Strip the test to the bare minimum that reproduces the issue

A minimal reproduction makes the root cause obvious and prevents fixing symptoms instead of causes.

### Step 4: Fix the Root Cause

Fix the underlying issue, not the symptom:

```
Symptom: "The user list shows duplicate entries"

Symptom fix (bad):
  â†’ Deduplicate in the UI component: [...new Set(users)]

Root cause fix (good):
  â†’ The API endpoint has a JOIN th
