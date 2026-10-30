# Research log

The ideas behind the brains — the news brain and its AI Navigator, the culture brain and its two
pickers — and the published research each one rests on. Written for whoever changes a brain next:
read the entry before you move its constant, and add one before you ship a change that rests on a
paper.

## How this log works

- **One entry per idea**, numbered R1, R2, … in the order logged. A number is never reused or
  renumbered; an idea that is dropped keeps its entry, marked *rejected*, with the reason.
- **Status**: *live* (built and running), *measuring* (built; its numbers decide what happens next),
  *proposed* (not built; the entry says what evidence would build it), *rejected*.
- **Each entry says**: the idea in plain words; the evidence (each paper: what it found, on what data,
  how strongly); where it lives in the app; how the app measures it; what would undo or change it;
  when it was logged.
- **Code names its entry.** A comment saying `Research log R<n>` sits beside each constant or module an
  entry built. `lib/__tests__/research-log.test.ts` holds the two together: every entry the code names
  exists, and every *live* or *measuring* entry is named somewhere in the code. Every backticked path in
  this file is checked against the tree by `lib/__tests__/docs-map.test.ts`.
- **Citations** carry a DOI or a stable link; one this log could not confirm says so.
- **Expect small numbers.** A market signal's information coefficient (R1) is a few hundredths when it
  is real. The pickers and the Navigator hold eight to ten names and decide weekly, so even a real
  signal shows as a thin edge over SPY (Grinold 1989). A figure within ±2 standard errors is noise;
  with many signals read at once, ±3 is the bar for calling one found (Harvey, Liu & Zhu 2016). And the
  edge from reading headlines with a model has been shrinking as more traders do it (Lopez-Lira & Tang
  2023, version 6).
- **No advice.** Like everything in the app, an entry describes what the brains do and why; it says
  nothing about what anyone should do with money (AGENTS.md invariant 12).

## Index

| Id | Idea | Brain | Status |
|---|---|---|---|
| R1 | Measure each signal against what followed before tuning it | both | live |
| R2 | A jump in retail attention may reverse | culture (Spike) | measuring |
| R3 | Attention the press has not caught up with | culture (Quiet) | live, measuring |
| R4 | One story told by five outlets is one piece of evidence about tone | news | live |
| R5 | News horizons differ by the kind of event, and bad news drifts | news | proposed |
| R6 | What customers do forecasts earnings: ratings, not page views | culture | proposed |
| R7 | Attention matters most where valuation is hardest | culture | proposed |
| R8 | A model's knowledge of a company colours its reading of tone | news | proposed |
| R9 | News that lands on a crowded day is read late | news | proposed |

---

## R1 — Measure each signal against what followed before tuning it

**Status:** live · **Brains:** both · **Logged:** 2026-10-30

**Idea.** Before a weight moves, find out whether the signal it weighs puts names in the order of the
returns they go on to earn. Each week, rank the names a brain could buy twice — by the signal, and by
their return over the next h weeks — and correlate the two orders. The average of those weekly
correlations, the *information coefficient* (IC), is the signal's skill; its t-statistic says whether
the average is distinguishable from zero.

**Evidence.**
- Grinold (1989): an active strategy's information ratio is roughly its IC times the square root of
  its breadth (independent bets a year). Few names and weekly decisions mean little breadth, so even a
  skilled signal trails or leads SPY by little. Grinold & Kahn (2000) set out the IC method.
- Newey & West (1987): consecutive weeks' h-week returns overlap by h − 1 weeks, so their ICs move
  together; the standard error must allow for that, or every t-statistic is too large.
- Harvey, Liu & Zhu (2016): with hundreds of factors tried, a new one needs a t-statistic above 3,
  not 2. The signal checks read a dozen rows at five horizons at once.
- Bailey & López de Prado (2014): a backtest's Sharpe ratio must be deflated for the number of
  variants tried. Not yet applied here; it is the next step if the what-if variants are compared.

**In the app.**
- The maths: `lib/research/ic.ts` (`spearman`, `neweyWestT`, `summarizeIc`, `icTable`) and forward
  returns from one decision's open to another's, dividends included (`lib/research/returns.ts`).
- Culture brain: `lib/culture/signal-check.ts` measures every term and each picker's whole score inside
  the backtest (`lib/culture/simulator.simulateCulture`), over its five years of weekly decisions; the
  rows are stored on the backtest under `SIGNALS_VERSION` (`lib/culture/config.ts`) and drawn at
  /culture?view=picks by `components/culture/SignalCheck.tsx`.
- News brain: the weekly job's scoring step keeps the whole scored universe each week
  (`database/models/navigator-signal-week.model.ts`, written by
  `lib/navigator/store.computeNavigatorScores`); `lib/navigator/signal-check.ts` measures it and
  /brain?view=navigator draws it (`components/navigator/NavigatorSignalCheck.tsx`).
- Shared table and words: `components/research/IcTable.tsx`, `lib/learn/copy/research.ts`.

**Limits.** The culture backtest has pageviews and prices only: the terms that need App Store ranks,
mentions, the press or report dates have no row, and the catalog was chosen in 2026, which flatters
it. The Navigator's record starts with its first weekly run after this was built (2 November 2026);
its 1-week column needs eight recorded weeks, its 13-week column twenty-one.

**Changes it.** Nothing undoes a measurement. Bump `SIGNALS_VERSION` whenever what is measured, or
how, changes, so the stored backtest is rebuilt.

## R2 — A jump in retail attention may reverse

**Status:** measuring · **Brain:** culture (Spike) · **Logged:** 2026-10-30

**Idea.** A jump in Wikipedia page views is mostly retail attention. Attention-driven buying pushes a
price up for days to weeks, and the push then fades or reverses. Spike enters on a four-week surprise
and holds at least 21 trading days, so it may be buying after the push and holding through the fade.

**Evidence.**
- Da, Engelberg & Gao (2011): Google search volume measures retail attention. A rise predicts higher
  prices over the next two weeks and an eventual reversal within the year.
- Barber & Odean (2008): individual investors are net buyers of attention-grabbing stocks (news,
  unusual volume, extreme returns); institutions much less so.
- Barber, Huang, Odean & Schwarz (2022): stocks Robinhood users bought most intensely on a day earned
  −4.7% average abnormal returns over the next 20 trading days.
- Ben-Rephael, Da & Israelsen (2017): institutional attention leads retail attention and goes with a
  permanent price adjustment; retail attention does not.
- Moat et al. (2013): views of Wikipedia articles on Dow Jones companies rose before market falls
  (2007–2012) — the market as a whole, not a cross-section of stocks.

**In the app.** `attentionAnomaly` (the last `ATTENTION_RECENT_DAYS` against the
`ATTENTION_BASELINE_DAYS` before) and `attentionTrend`, weighted 0.20 and 0.10 in
`lib/culture/config.CULTURE_PROFILES` (Spike); the holding rail `CULTURE_RAILS.minHoldingTradingDays`.

**Measured by.** The signal check's `attentionAnomaly`, `attentionTrend` and Spike rows (R1), at 1, 2,
4, 8 and 13 weeks, over the backtest's weeks.

**Decision rule.**
- Anomaly's mean IC below zero from 4 weeks on, t ≤ −3: the jump is an exit-side signal for this
  universe. Build it as a new profile id (AGENTS.md: a picker is never reweighted in place).
- Above zero at 1–2 weeks (t ≥ 3) and gone by 4: the sign is right and the holding rail is the
  mismatch; a shorter-horizon profile is the experiment.
- Inside ±2 at every horizon: no evidence either way. Spike stays as the control a reader can watch.

## R3 — Attention the press has not caught up with

**Status:** live, measuring · **Brain:** culture (Quiet) · **Logged:** 2026-10-30

**Idea.** Attention alone is not a return signal; attention that has lasted, that the press has not
covered, and that is taking share inside its category may be. This is what Quiet follows. The design
note in `lib/culture/config.ts` says Quiet reads "the terms the market is slowest on"; this entry records
the evidence behind that idea, not where it came from.

**Evidence.**
- Fang & Peress (2009): stocks with no media coverage earned more than heavily covered ones — about 3%
  a year against above-median coverage (1993–2002) — most in small stocks with high retail ownership.
- Focke, Ruenzi & Ungeheuer (2020): advertising raises attention but does not move short-term returns;
  earlier evidence that it did was reverse causality. Attention by itself is not the signal.

**In the app.** `quietAttention` (needs the press feed), `attentionPersistence`, `categoryShare` and
`attentionSinceReport`, weighted in `lib/culture/config.CULTURE_PROFILES` (Quiet).

**Measured by.** The signal check's `attentionPersistence`, `categoryShare` and Quiet rows (R1). The
backtest has no press history and no report dates, so `quietAttention` and `attentionSinceReport`
have no rows; their evidence can come only from live weeks.

**Changes it.** Persistence and category share inside ±2 at every horizon, while Quiet's whole score
is no different from the price-only control's, would leave Quiet resting on the two terms nothing
measures yet — the case for recording live weeks as the Navigator does (R1).

## R4 — One story told by five outlets is one piece of evidence about tone

**Status:** live · **Brain:** news · **Logged:** 2026-10-30

**Idea.** Outlets syndicate one story under near-identical headlines, and the brain read each copy as
fresh evidence: one wire story reprinted five times cast five votes on a name's sentiment. A repeat
should still count as attention — people are reading it — but not as new information about tone. This
is the rule the brain already applies to opinion pieces and rumours (`SENTIMENT_SHARE_BY_NATURE`).

**Evidence.**
- Tetlock (2011): measured a story's staleness by its textual similarity to the firm's ten previous
  stories. Prices respond less to stale news, a stale-news day's return partly reverses over the next
  week, and individual investors trade more aggressively on stale news — an over-reaction to old
  information.
- Huberman & Regev (2001): a Sunday New York Times story about a cancer-drug result that Nature and the
  Times itself had reported five months earlier sent EntreMed from about $12 to a $52 close the next
  day; nothing new had been learned.

**In the app.** `lib/brain/novelty.ts` (`repeatedMentions`), used by
`lib/brain/update.foldExtractionsIntoBrain`; `REPEAT_SIMILARITY` (0.6) and `REPEAT_SENTIMENT_SHARE` (0)
in `lib/brain/config.ts`. The brain's daily status line counts the repeated mentions; the /brain legend
states the rule from its constants.

**Narrower than the paper.** Only articles folded in the same daily run, compared by headline (Jaccard
similarity over words), and only for the names the two share; the first published copy keeps its tone.

**Measured by.** The Navigator's news-sentiment row (R1). The rule and the record began together, so
there is no before-and-after in this record; a later change to `REPEAT_SENTIMENT_SHARE` can be compared.

**Changes it.** A status line showing many repeats on days of distinct stories means headline matching
is too coarse: raise `REPEAT_SIMILARITY`, or compare summaries as well as headlines.

## R5 — News horizons differ by the kind of event, and bad news drifts

**Status:** proposed · **Brain:** news · **Logged:** 2026-10-30

**Idea.** Every article fades on the same two half-lives (`HALF_LIFE_FAST_DAYS`, `HALF_LIFE_SLOW_DAYS`)
whatever it covers. The evidence says the horizon depends on the kind of news: an earnings surprise is
absorbed over weeks to months, a burst of media pessimism within a week.

**Evidence.**
- Bernard & Thomas (1989): prices keep drifting in the direction of an earnings surprise for about 60
  trading days after the announcement.
- Chan (2003): after a public headline, bad news drifts for months — most in small, illiquid stocks;
  large moves with no news reverse.
- Tetlock (2007): media pessimism predicts a fall the next day and a reversal within the week.
- Tetlock, Saar-Tsechansky & Macskassy (2008): negative words in firm-specific stories predict lower
  earnings, and prices briefly under-react to them, most for stories about fundamentals.
- Ke, Kelly & Xiu (2019): sentiment learned from news text predicts returns, mostly within days of the
  story. Lopez-Lira & Tang (2023): a model's headline scores predict next-day returns, most for small
  stocks and after negative news. The Navigator's universe is large caps and sector funds, where text
  predicts least, so its news rows (R1) are expected to be small.

**Would build it.** Record each name's slow weight by event type (`extraction.eventType`) beside the
weekly record (R1). If earnings and guidance news show a higher IC than analyst and opinion news at 8
and 13 weeks (t ≥ 3), give them their own slow half-life; if negative tone's IC is reliably larger
than positive tone's, an asymmetric sentiment share.

## R6 — What customers do forecasts earnings: ratings, not page views

**Status:** proposed · **Brain:** culture · **Logged:** 2026-10-30

**Idea.** Page views measure curiosity. What customers think of what they bought, and how much they
buy, forecasts the next earnings report — the kind of fundamental news that moves a price for weeks.

**Evidence.**
- Huang (2018): abnormal Amazon customer ratings (14.5 million reviews, 2004–2015) predict a firm's
  returns and its revenue and earnings surprises; hedge funds trade in their direction.
- Froot, Kang, Ozik & Sadka (2017): real-time sales measures built from about 50 million mobile devices
  track a firm's sales growth and predict its earnings surprises.

**Would build it.** A new feed: each tracked app's average rating and rating count, daily, from Apple's
keyless lookup (the culture brain already reads the App Store charts each morning), scored as the
change against the app's own 90-day baseline. No history exists to backtest, so it would be recorded
and measured on live weeks (R1) before it carried any weight.

## R7 — Attention matters most where valuation is hardest

**Status:** proposed · **Brain:** culture · **Logged:** 2026-10-30

**Idea.** Both pickers' largest holdings on 2026-10-27 were Microsoft, Amazon and Tesla: `attentionSlow`
ranks the biggest brands highest, and momentum carries 35–40% of each profile. The evidence says
attention and sentiment move the hard-to-value names — small, young, volatile — far more than the
largest companies.

**Evidence.**
- Baker & Wurgler (2006): sentiment-driven mispricing concentrates in small, young, volatile,
  unprofitable, non-dividend-paying and distressed stocks.
- Fang & Peress (2009): the no-coverage premium (R3) is largest in small stocks.

**Would build it.** Split the signal check (R1) by size: market value from the stored price and the
shares outstanding in each owner's Finnhub profile. If the attention terms' IC sits in the smallest
third (t ≥ 3 there) and near zero in the largest, scale attention by the inverse of log market value,
or leave the largest third to momentum alone — as a new profile id.

## R8 — A model's knowledge of a company colours its reading of tone

**Status:** proposed · **Brain:** news · **Logged:** 2026-10-30

**Idea.** The extractor reads every headline with the company named. What the model already knows of
the company can colour the tone it reports, apart from what the headline says.

**Evidence.**
- Glasserman & Lin (2023): sentiment from GPT-3.5 with company names masked gave better in-sample
  trading results than with names shown: the distraction of the model's general knowledge outweighed
  its look-ahead bias, and out of sample look-ahead was not a concern.
- Not a risk to the backtests here: the brains' simulations replay stored numbers, never model calls.
  Re-scoring history with a model would need the look-ahead checks of the same paper and of later
  work on time-cut models (DatedGPT, 2026).

**Would build it.** The extractor needs names to link tickers, so masking can only be a second tone
read: a sample of about 20 articles a day with names masked, both tones recorded, compared in the
Navigator's record (R1) once enough weeks exist. It spends model calls the daily budget
(`MAX_EXTRACTION_CALLS_PER_DAY`) does not have to spare on the free tier.

## R9 — News that lands on a crowded day is read late

**Status:** proposed · **Brain:** news · **Logged:** 2026-10-30

**Idea.** On a day crowded with announcements, investors absorb each one less; the price reacts less
on the day and more afterwards. A brain that weighs a crowded day's news as it weighs a quiet day's
reads the timing wrong.

**Evidence.**
- Hirshleifer, Lim & Teoh (2009): on days with many earnings announcements, the immediate reaction to
  a firm's surprise is weaker and the drift after it stronger.

**Would build it.** The brain counts each day's articles already. Record a day's crowding (its share
of the trailing month's daily count) with the weekly record, and measure whether names whose news
arrived on crowded days show a larger IC at 4 to 13 weeks. Lowest priority of the proposals: its
effect, if any, is the smallest.

---

## Sources

1. Bailey, D. H., & López de Prado, M. (2014). The deflated Sharpe ratio: correcting for selection
   bias, backtest overfitting, and non-normality. *Journal of Portfolio Management*, 40(5), 94–107.
   https://doi.org/10.3905/jpm.2014.40.5.094
2. Baker, M., & Wurgler, J. (2006). Investor sentiment and the cross-section of stock returns.
   *Journal of Finance*, 61(4), 1645–1680. https://doi.org/10.1111/j.1540-6261.2006.00885.x
3. Barber, B. M., & Odean, T. (2008). All that glitters: the effect of attention and news on the
   buying behavior of individual and institutional investors. *Review of Financial Studies*, 21(2),
   785–818. https://doi.org/10.1093/rfs/hhm079
4. Barber, B. M., Huang, X., Odean, T., & Schwarz, C. (2022). Attention-induced trading and returns:
   evidence from Robinhood users. *Journal of Finance*, 77(6), 3141–3190.
   https://doi.org/10.1111/jofi.13183
5. Ben-Rephael, A., Da, Z., & Israelsen, R. D. (2017). It depends on where you search: institutional
   investor attention and underreaction to news. *Review of Financial Studies*, 30(9), 3009–3047.
   (DOI not confirmed by this log; working paper https://doi.org/10.2139/ssrn.2692181)
6. Bernard, V. L., & Thomas, J. K. (1989). Post-earnings-announcement drift: delayed price response or
   risk premium? *Journal of Accounting Research*, 27 (Supplement), 1–36. (DOI not confirmed by this
   log)
7. Chan, W. S. (2003). Stock price reaction to news and no-news: drift and reversal after headlines.
   *Journal of Financial Economics*, 70(2), 223–260. https://doi.org/10.1016/S0304-405X(03)00146-6
8. Da, Z., Engelberg, J., & Gao, P. (2011). In search of attention. *Journal of Finance*, 66(5),
   1461–1499. https://doi.org/10.1111/j.1540-6261.2011.01679.x
9. Fang, L., & Peress, J. (2009). Media coverage and the cross-section of stock returns. *Journal of
   Finance*, 64(5), 2023–2052. https://doi.org/10.1111/j.1540-6261.2009.01493.x
10. Focke, F., Ruenzi, S., & Ungeheuer, M. (2020). Advertising, attention, and financial markets.
    *Review of Financial Studies*, 33(10), 4676–4720. https://doi.org/10.1093/rfs/hhz142
11. Froot, K., Kang, N., Ozik, G., & Sadka, R. (2017). What do measures of real-time corporate sales
    say about earnings surprises and post-announcement returns? *Journal of Financial Economics*,
    125(1), 143–162. https://doi.org/10.1016/j.jfineco.2017.04.008
12. Glasserman, P., & Lin, C. (2023). Assessing look-ahead bias in stock return predictions generated
    by GPT sentiment analysis. arXiv:2309.17322. https://arxiv.org/abs/2309.17322
13. Grinold, R. C. (1989). The fundamental law of active management. *Journal of Portfolio
    Management*, 15(3), 30–37. (DOI not confirmed by this log)
14. Grinold, R. C., & Kahn, R. N. (2000). *Active Portfolio Management* (2nd ed.). McGraw-Hill.
15. Harvey, C. R., Liu, Y., & Zhu, H. (2016). … and the cross-section of expected returns. *Review of
    Financial Studies*, 29(1), 5–68. https://doi.org/10.1093/rfs/hhv059
16. Hirshleifer, D., Lim, S. S., & Teoh, S. H. (2009). Driven to distraction: extraneous events and
    underreaction to earnings news. *Journal of Finance*, 64(5), 2289–2325.
    https://doi.org/10.1111/j.1540-6261.2009.01501.x
17. Huang, J. (2018). The customer knows best: the investment value of consumer opinions. *Journal of
    Financial Economics*, 128(1), 164–182. https://doi.org/10.1016/j.jfineco.2018.02.001
18. Huberman, G., & Regev, T. (2001). Contagious speculation and a cure for cancer: a nonevent that
    made stock prices soar. *Journal of Finance*, 56(1), 387–396.
    https://doi.org/10.1111/0022-1082.00330
19. Ke, Z. T., Kelly, B. T., & Xiu, D. (2019). Predicting returns with text data. NBER Working Paper
    26186. https://doi.org/10.3386/w26186
20. Lopez-Lira, A., & Tang, Y. (2023). Can ChatGPT forecast stock price movements? Return
    predictability and large language models. arXiv:2304.07619 (versions 1–6, 2023–2025).
    https://arxiv.org/abs/2304.07619
21. Moat, H. S., Curme, C., Avakian, A., Kenett, D. Y., Stanley, H. E., & Preis, T. (2013). Quantifying
    Wikipedia usage patterns before stock market moves. *Scientific Reports*, 3, 1801.
    https://doi.org/10.1038/srep01801
22. Newey, W. K., & West, K. D. (1987). A simple, positive semi-definite, heteroskedasticity and
    autocorrelation consistent covariance matrix. *Econometrica*, 55(3), 703–708.
    https://doi.org/10.2307/1913610
23. Tetlock, P. C. (2007). Giving content to investor sentiment: the role of media in the stock market.
    *Journal of Finance*, 62(3), 1139–1168. https://doi.org/10.1111/j.1540-6261.2007.01232.x
24. Tetlock, P. C. (2011). All the news that's fit to reprint: do investors react to stale information?
    *Review of Financial Studies*, 24(5), 1481–1512. https://doi.org/10.1093/rfs/hhq141
25. Tetlock, P. C., Saar-Tsechansky, M., & Macskassy, S. (2008). More than words: quantifying language
    to measure firms' fundamentals. *Journal of Finance*, 63(3), 1437–1467.
    https://doi.org/10.1111/j.1540-6261.2008.01362.x
26. Yan, et al. (2026). DatedGPT: preventing lookahead bias in large language models with time-aware
    pretraining. arXiv:2603.11838. https://arxiv.org/abs/2603.11838
