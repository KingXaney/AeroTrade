# What a piece is, apart from what it covers: nature labels and source trust

Status: Built (2026-10-06).

## Why

The owner asked whether the scare and bullish takes outlets and companies post about market trends
could be kept from steering the brain. Until now a take and a reported event weighed the same: the
extractor labelled an article's *event* (earnings, macro, …) and an importance, but nothing said
whether the piece reported something or argued something, and a company's own press release was
tagged like a newsroom's reporting. Sentiment is a weighted mean of every mention, so a flood of
opinion moved it as much as facts did.

## What

- **Nature.** The extractor labels each article's nature beside its event type:
  `reported` (a newsroom reporting something that happened), `company` (the company or its
  executives speaking for themselves), `opinion` (analysis, commentary, predictions, outlook pieces,
  lists of stocks to watch, calls on where the market is going) or `rumour` (unconfirmed reports,
  "sources say", speculation, social chatter). When unsure between reported and opinion, the prompt
  asks for opinion. A response that leaves the field out reads as `reported`, so an older model
  answer changes nothing.
- **Deterministic clamps**, in `sanitizeExtraction` after parsing, the way Reddit is already capped
  (invariant 4 — the model's label is untrusted and only ever lowers a weight):
  - an `opinion` or `rumour` piece counts at most `TAKE_IMPORTANCE_CAP` (0.3) in importance;
  - a piece's tone joins a name's sentiment at `SENTIMENT_SHARE_BY_NATURE[nature]`: reported 1,
    company 0.5, opinion 0.5, rumour 0. Attention (importance × relevance) always counts in full,
    so a loud take still shows that people are talking without steering the sentiment average.
- **Source trust**, `lib/brain/trust.ts` (pure): a piece from a press-release wire (PR Newswire,
  Business Wire, GlobeNewswire, Accesswire, Newsfile, PRWeb, EIN Presswire) is the company speaking
  for itself whatever the model said — its nature is forced to `company`; a piece from an outlet that
  is mostly commentary (Motley Fool, Seeking Alpha, InvestorPlace, Zacks, TipRanks, Simply Wall St,
  GuruFocus, 24/7 Wall St) weighs `COMMENTARY_IMPORTANCE_SHARE` (0.6) of its importance. Matched on
  the stored outlet name and the article's URL host. Reddit keeps its existing cap.
- **The fold**: `ArticleFold` carries the nature; each mention's `sentimentShare` scales only the
  sentiment sum (`lib/brain/decay.foldMentions`). Co-mention links are unchanged — they encode
  structure, not tone.
- **Shown, not hidden**: the evidence list badges a company statement, an opinion piece or a rumour
  beside the event badge (`lib/brain/event-types.NATURE_BADGES`), each a glossary entry
  (`nature-company`, `nature-opinion`, `nature-rumour`) the panel's one "What these labels mean"
  lists when shown; a reported piece carries no badge, like an `other` event. The `/brain` legend's
  "Reading the news" section gains the rule in the constants' own figures.
- **Stored**: `NewsExtraction.nature` (optional — rows tagged before this have none and read as
  reported). No re-ingest: the labels apply from the next daily update; re-tagging stored articles
  would spend the same Gemini quota that already bounds the daily update.

## Not done

Rephrased duplicates of one take across outlets still count separately (the duplicate check is exact
URL or headline). Sentiment is still a weighted mean, not a corroborated or trimmed one. Reddit posts
are labelled by the model like any other piece rather than forced to `rumour`.
