---

---
name: performance-optimization
description: Optimizes application performance. Use when performance requirements exist, when you suspect performance regressions, or when Core Web Vitals or load times need improvement. Use when profiling reveals bottlenecks that need fixing.
---

# Performance Optimization

## Overview

Measure before optimizing. Performance work without measurement is guessing â€” and guessing leads to premature optimization that adds complexity without improving what matters. Profile first, identify the actual bottleneck, fix it, measure again. Optimize only what measurements prove matters.

## When to Use

- Performance requirements exist in the spec (load time budgets, response time SLAs)
- Users or monitoring report slow behavior
- Core Web Vitals scores are below thresholds
- You suspect a change introduced a regression
- Building features that handle large datasets or high traffic

**When NOT to use:** Don't optimize before you have evidence of a problem. Premature optimization adds complexity that costs more than the performance it gains.

## Core Web Vitals Targets

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| **LCP** (Largest Contentful Paint) | â‰¤ 2.5s | â‰¤ 4.0s | > 4.0s |
| **INP** (Interaction to Next Paint) | â‰¤ 200ms | â‰¤ 500ms | > 500ms |
| **CLS** (Cumulative Layout Shift) | â‰¤ 0.1 | â‰¤ 0.25 | > 0.25 |

## The Optimization Workflow

```
1. MEASURE  â†’ Establish baseline with real data
2. IDENTIFY â†’ Find the actual bottleneck (not assumed)
3. FIX      â†’ Address the specific bottleneck
4. VERIFY   â†’ Measure again, confirm improvement
5. GUARD    â†’ Add monitoring or tests to prevent regression
```

### Step 1: Measure

Two complementary approaches â€” use both:

- **Synthetic (Lighthouse, DevTools Performance tab):** Controlled conditions, reproducible. Best for CI regression detection and isolating specific issues.
- **RUM (web-vitals library, CrUX):** Real user data in real conditions. Required to validate that a fix actually improved user experience.

**Frontend:**
```bash
# Synthetic: Lighthouse in Chrome DevTools (or CI)
# Chrome DevTools â†’ Performance tab â†’ Record
# Chrome DevTools MCP â†’ Performance trace

# RUM: Web Vitals library in code
import { onLCP, onINP, onCLS } from 'web-vitals';

onLCP(console.log);
onINP(console.log);
onCLS(console.log);
```

**Backend:**
```bash
# Response time logging
# Application Performance Monitoring (APM)
# Database query logging with timing

# Simple timing
console.time('db-query');
const result = await db.query(...);
console.timeEnd('db-query');
```

### Where to Start Measuring

Use the symptom to decide what to measure first:

```
What is slow?
â”œâ”€â”€ First page load
â”‚   â”œâ”€â”€ Large bundle? --> Measure bundle size, check code splitting
â”‚   â”œâ”€â”€ Slow server response? --> Measure TTFB in DevTools Network waterfall
â”‚   â”‚   â”œâ”€â”€ DNS long? --> Add dns-prefetch / preconnect for known origins
â”‚   â”‚   â”œâ”€â”€ TCP/TLS long? --> Enable HTTP/2, check edge deployment, keep-alive
â”‚   â”‚   â””â”€â”€ Waiting (server) long? --> Profile backend, check queries and caching
â”‚   â””â”€â”€ Render-blocking resources? --> Check network waterfall for CSS/JS blocking
â”œâ”€â”€ Interaction feels sluggish
â”‚   â”œâ”€â”€ UI freezes on click? --> Profile main thread, look for long tasks (>50ms)
â”‚   â”œâ”€â”€ Form input lag? --> Check re-renders, controlled component overhead
â”‚   â””â”€â”€ Animation jank? --> Check layout thrashing, forced reflows
â”œâ”€â”€ Page after navigation
â”‚   â”œâ”€â”€ Data loading? --> Measure API response times, check for waterfalls
â”‚   â””â”€â”€ Client rendering? --> Profile component render time, check for N+1 fetches
â””â”€â”€ Backend / API
    â”œâ”€â”€ Single endpoint slow? --> Profile database queries, check indexes
    â”œâ”€â”€ All endpoints slow? --> Check connection pool, memory, CPU
    â””â”€â”€ Intermittent slowness? --> Check for lock contention, GC pauses, external deps
```

### Step 2: Identify the Bottleneck

Common bottlenecks by category:

**Frontend:**

| Symptom | Likely Cause | Investigation |
|---------|-------------|---------------|
| Slow LCP | Large images, render-blocking resources, slow server | Check network waterfall, image sizes |
| High CLS | Images without dimensions, late-loading content, font shifts | Check layout shift attribution |
| Poor INP | Heavy JavaScript on main thread, large DOM updates | Check long tasks in Performance trace |
| Slow initial load | Large bundle, many network requests | Check bundle size, code splitting |

**Backend:**

| Symptom | Likely Cause | Investigation |
|---------|-------------|---------------|
| Slow API responses | N+1 queries, missing indexes, unoptimized queries | Check database query log |
| Memory growth | Leaked ref
