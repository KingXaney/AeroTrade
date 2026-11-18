---
paths:
  - "lib/brain/**"
  - "components/brain/**"
  - "components/three/**"
  - "app/(root)/brain/**"
  - "lib/jobs/functions/brain.ts"
  - "lib/actions/opinion.actions.ts"
  - "lib/learn/copy/brain.ts"
  - "database/models/brain-entity.model.ts"
  - "database/models/news-item.model.ts"
---

# brain

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/brain/ingest` is the daily update's sweep, extraction batches and ticker guard. An article the
  model has read is never sent again: one it answered with nothing to tag is stamped `readAt`, one it
  left out of its answer after `MAX_EXTRACTION_TRIES`; the queue and "waiting to be read" skip both.
- A story the same run already folded under a near-identical headline (`lib/brain/novelty`,
  `REPEAT_SIMILARITY`) adds its attention but no tone (`REPEAT_SENTIMENT_SHARE`): research log R4.
- A piece's nature — `reported`, `company`, `opinion`, `rumour` (`NATURES` in `lib/brain/config`) — is
  the extractor's second label, beside the event type. `lib/brain/trust.sourceTrust` reads the
  outlet first (a press-release wire is `company` whatever the model said; a commentary outlet
  weighs `COMMENTARY_IMPORTANCE_SHARE` of its importance), then `lib/brain/extraction.sanitizeExtraction`
  clamps: an opinion or a rumour at most `TAKE_IMPORTANCE_CAP`, and each mention's tone joins the
  sentiment at `SENTIMENT_SHARE_BY_NATURE` (the `sentimentShare` of `lib/brain/decay.foldMentions`);
  attention always counts in full, and a clamp only ever lowers a weight. The evidence list badges
  company, opinion and rumour (`NATURE_BADGES` in `lib/brain/event-types`, glossary `nature-*`); a
  reported piece carries none, and a row tagged before the label reads as reported. The model never
  sees a URL; the trust check reads it.
- The Knowledge Graph is 3D: `components/brain/BrainGraph` over `components/brain/graph-scene`
  (three.js, loaded on demand). The entities sit on three concentric shells — themes inner,
  sectors middle, tickers outer — placed by the pure `lib/brain/graph-layout` (deterministic for
  one input: every entity takes one of n directions spread evenly over the sphere — the heaviest
  facing the camera, a linked one beside its links, an unlinked one as far from the rest as it
  can — and its shell only sets the radius, so no two names are ever close from the centre
  however densely the news links them), as spheres sized by slow
  weight and coloured by sentiment, a thesis haloed, each entity's heaviest links as lines
  (`restingEdges`; all of an entity's links while it is lit). Each label is a real link
  to `evidenceHref`, floated over the canvas by the scene, so Tab and Enter work as the SVG's nodes
  did; the canvas is `aria-hidden`, the host `role="group"`, never `img`. Without WebGL the SVG
  rings draw instead (`components/brain/BrainGraph2D`). Both scenes read the page through
  `components/three/scene-env` (WebGL, the theme stamp, reduced motion, a coarse pointer, the
  colour tokens as RGB through `lib/theme/css-color`).
- `lib/brain/links.evidenceHref` is the one address of an entity's evidence — the graph's nodes,
  Active Theses and the leaderboard all link through it. `lib/brain/store.getEntityEvidence`
  projects the evidence fields and `extraction.eventType`, never importance.
- Active Theses' "since thesis": `lib/brain/since-thesis` is the pure maths — the ten heaviest
  ticker theses, both legs total returns over the same sessions, a missing leg hides the line; both
  legs count a dividend only when its ex-date is after the base close. It is fed by
  `lib/brain/store.getSinceThesis`: one `$or` bars read (`lib/prices/store.getBarsFrom` — each
  ticker from its own thesis date, SPY from the earliest), memoised for the day on the latest
  closes' stamp. `components/brain/ActiveTheses` takes the opt-in `definitions` and `sinceThesis`
  only from the page, never on the dashboard widget.
- `/brain` is three views, one at a time in the URL (`?view=`): narratives (the default, and
  where an evidence link `?entity=` always lands), the AI Navigator, and system. Each view reads
  only its own data.
- `lib/brain/legend` is the /brain legend: every figure from the brain's and the Navigator's
  constants, the fading example worked by `lib/brain/decay.ts`; mechanism only.
  `components/brain/BrainLegend` shows it collapsed, at the foot of every view.
- `lib/brain/event-types` are the evidence badges: eight of the extractor's nine labels, 'other'
  none, each a glossary `event-*` entry.
