// The quantitative-finance track's units, in the plan's order (lib/learn/copy/lab/plan.ts).
// Written for an expert reader; held to the 'lab' tier of lib/learn/banned.ts over their prose.
// Every example is on synthetic or index-level data; nothing here says what to own.

import {md} from "@/lib/learn/copy/lab/md";
import type {LabUnit} from "@/lib/learn/copy/lab/types";

export const QUANT_UNITS: readonly LabUnit[] = [
    {
        id: 'quant-factor-models',
        track: 'quant',
        title: 'Factor models and cross-sectional alpha',
        oneLiner: 'The frame everything else is measured in: alpha means the residual to a factor model, and published factors decay.',
        readingMinutes: 24,
        sections: {
            idea: md`
A factor model says that the expected return of an asset is explained by its exposures to a small number of common sources of risk, each carrying a premium. The CAPM has one factor, the market; Fama and French (1993) added size and value and showed that the three together absorb most of the cross-sectional variation in average stock returns; later work added profitability, investment and momentum. The word **alpha** has a precise meaning inside this frame: it is the intercept of a time-series regression of an asset's excess return on the factor returns — the part of the average return the factors do not explain. A strategy's alpha is relative to a model; change the model and the alpha changes.

The cross-sectional question is the mirror image: given characteristics measured for every stock at the end of a month (book-to-market, past twelve-month return, accruals), do they predict next month's returns across stocks? **Fama–MacBeth** regression answers it with a two-pass procedure: each month, regress that month's returns on last month's characteristics across stocks; then average the monthly slopes and test whether the average is different from zero, using the time-series standard error of the slopes. The monthly cross-sections handle the fact that returns are correlated across stocks in the same month, which an ordinary pooled regression would ignore.

The modern problem is the **factor zoo**. Hundreds of published characteristics "predict" returns; Harvey, Liu and Zhu argued that after accounting for the multiple testing implied by decades of searching, a newly proposed factor needs a $t$-statistic above about 3, not 2. McLean and Pontiff measured what happens after publication: a predictor's return falls by roughly a third out of sample and by more than half after publication, the signature of a real effect being arbitraged plus some original overfitting. The practitioner's use of factor models is therefore defensive as much as offensive: to know what a backtest's return is *not* — exposure to a known premium dressed up as skill — and to size the discount a new signal deserves.
`,
            maths: md`
**The time-series model.** For asset $i$ with excess return $r_{i,t}$ and $K$ factor returns $f_t \in \mathbb{R}^{K}$:

$$r_{i,t} = \alpha_i + \beta_i^{\top} f_t + \varepsilon_{i,t}, \qquad \mathbb{E}[\varepsilon_{i,t}] = 0,\; \operatorname{Cov}(\varepsilon_{i,t}, f_t) = 0.$$

If the factors price the cross-section, $\alpha_i = 0$ for every $i$. A joint test of all the alphas is the GRS statistic (Gibbons, Ross and Shanken 1989):

$$\text{GRS} = \frac{T - N - K}{N}\,\frac{\hat\alpha^{\top}\hat\Sigma^{-1}\hat\alpha}{1 + \bar f^{\top}\hat\Omega^{-1}\bar f} \sim F_{N,\, T-N-K},$$

with $\hat\Sigma$ the residual covariance and $\hat\Omega$ the factor covariance.

**Fama–MacBeth.** With characteristics $z_{i,t-1} \in \mathbb{R}^{K}$ known at the end of month $t-1$:

$$\text{(pass 1, each month)}\quad r_{i,t} = \gamma_{0,t} + \gamma_t^{\top} z_{i,t-1} + u_{i,t} \quad\text{across } i,$$

$$\text{(pass 2)}\quad \hat\gamma = \frac{1}{T}\sum_{t=1}^{T}\hat\gamma_t, \qquad t(\hat\gamma_k) = \frac{\hat\gamma_k}{\hat\sigma(\hat\gamma_{k,t})/\sqrt{T}}.$$

The standard error uses the dispersion of the monthly slopes, so cross-sectional correlation within a month is absorbed; autocorrelation across months (from overlapping or persistent characteristics) is handled with a Newey–West adjustment.

**The multiple-testing hurdle.** If $M$ factors have been tried and the tests are independent, the Bonferroni-adjusted threshold for a single discovery at level $a$ is $a / M$; with $M$ in the hundreds, the implied $t$-threshold rises from 1.96 toward 3. Harvey, Liu and Zhu's time-varying version puts the hurdle near 3.0 for a factor proposed today, and rising.

**Post-publication decay** (McLean and Pontiff). Let $\bar r_{\text{in}}$, $\bar r_{\text{out}}$, $\bar r_{\text{post}}$ be a predictor's average long–short return in the original sample, after the sample but before publication, and after publication. Their estimates are roughly $\bar r_{\text{out}} \approx 0.74\,\bar r_{\text{in}}$ and $\bar r_{\text{post}} \approx 0.42\,\bar r_{\text{in}}$: the first gap measures original overfitting, the second the capital that followed the paper.
`,
            code: md`
Fama–MacBeth on a synthetic panel, with the second-pass standard error done by hand so the mechanism is visible.

\`\`\`python
import numpy as np

rng = np.random.default_rng(0)
T, N, K = 600, 2000, 3                     # 50 years of months, 2000 stocks, 3 characteristics
gamma_true = np.array([0.004, -0.002, 0.0])   # monthly premia: value 0.4%, size -0.2%, noise 0

slopes = np.empty((T, K + 1))
for t in range(T):
    z = rng.standard_normal((N, K))                      # characteristics, standardised each month
    common = rng.standard_normal() * 0.04                # the market move this month: shared by all stocks
    r = 0.005 + z @ gamma_true + common + rng.standard_normal(N) * 0.08
    X = np.column_stack([np.ones(N), z])                 # pass 1: cross-sectional OLS this month
    slopes[t] = np.linalg.lstsq(X, r, rcond=None)[0]

gamma_hat = slopes.mean(0)                               # pass 2: average the monthly slopes
se = slopes.std(0, ddof=1) / np.sqrt(T)                  # their time-series standard error
for name, g, s in zip(["const", "value", "size", "noise"], gamma_hat, se):
    print(f"{name:6s} premium {g*100:6.3f}%/month  t = {g/s:5.2f}")
\`\`\`

The \`common\` term is why pass 1 is monthly: a pooled regression over all $T \times N$ observations would treat the month's shared move as $N$ independent observations and report standard errors far too small. The noise characteristic's $t$ lands near zero; run the loop over a thousand random characteristics and count how many clear 2 — that count is the factor zoo in miniature.
`,
            whyNow: md`
Factor models are the vocabulary of institutional risk and performance reporting: every portfolio is decomposed into factor exposures and a residual, every manager's return into premia and alpha. For anyone building signals, the model is the first filter — a new feature whose returns load on value or momentum is not new — and the publication-decay numbers are the first discount. Two developments keep the subject current. Machine-learning asset pricing (the ML-for-alpha unit) replaces linear characteristics with boosted trees and neural networks but is evaluated in exactly this frame, with the same multiple-testing problem multiplied by hyperparameter search. And factor timing and factor crowding — whether a premium is large now because capital has left or small because it has arrived — are measured with the same regressions on rolling windows.

The app's own experiment is a small instance: the quant strategies on /strategies are judged against the S&P 500's total return, a one-factor benchmark, and the leaderboard is an alpha-against-the-market table with all the caveats above.
`,
            pitfalls: md`
- **Alpha is model-relative.** Quoting an alpha without naming the factor model is quoting a number without units.
- **Look-ahead in characteristics.** Book values are reported with a lag; using a fiscal-year value before its filing date manufactures predictability. The convention is a six-month lag from fiscal year end.
- **Survivorship.** A universe built from today's constituents excludes the firms that delisted; small-cap and value premia are inflated by it.
- **Microcaps and the equal-weighted average.** Many published anomalies live in the smallest, least tradable stocks and vanish in value-weighted portfolios net of costs (the transaction-costs unit).
- **Standard errors.** Pooled OLS on a panel understates uncertainty; Fama–MacBeth or clustered errors by month are the minimum.
- **The hurdle is moving.** A $t$ of 2.5 on a new signal, found after trying twenty variants, is consistent with noise under the multiple-testing correction.
`,
        },
        sources: [
            {title: 'Common risk factors in the returns on stocks and bonds', url: 'https://doi.org/10.1016/0304-405X(93)90023-5', kind: 'paper', year: 1993},
            {title: 'Risk, Return, and Equilibrium: Empirical Tests (Fama–MacBeth)', url: 'https://doi.org/10.1086/260061', kind: 'paper', year: 1973},
            {title: '… and the Cross-Section of Expected Returns', url: 'https://doi.org/10.1093/rfs/hhv059', kind: 'paper', year: 2016, note: 'Harvey, Liu and Zhu: the multiple-testing hurdle.'},
            {title: 'Does Academic Research Destroy Stock Return Predictability?', url: 'https://doi.org/10.1111/jofi.12365', kind: 'paper', year: 2016, note: 'McLean and Pontiff: post-publication decay.'},
            {title: 'Empirical Asset Pricing via Machine Learning', url: 'https://doi.org/10.1093/rfs/hhaa009', kind: 'paper', year: 2020},
            {title: 'A Test of the Efficiency of a Given Portfolio (GRS)', url: 'https://doi.org/10.2307/1913625', kind: 'paper', year: 1989},
        ],
        cards: [
            {id: 'quant-factor-models/alpha', front: 'What does "alpha" mean inside a factor model?', back: 'The intercept of a time-series regression of an asset\'s excess return on the factor returns: the average return the model does not explain. It is defined relative to the model.', tags: ['alpha']},
            {id: 'quant-factor-models/fama-macbeth', front: 'Describe the two passes of Fama–MacBeth and what the second pass\'s standard error captures.', back: 'Pass 1: each month, regress returns on last month\'s characteristics across stocks. Pass 2: average the monthly slopes and test them with the time-series standard error of the slopes, which absorbs cross-sectional correlation within a month.', tags: ['fama-macbeth']},
            {id: 'quant-factor-models/pooled-error', front: 'Why does pooled OLS on a stock-month panel understate uncertainty?', back: 'Stocks in the same month share a common move; pooled OLS treats $N$ correlated observations as independent and divides by $\\sqrt{NT}$ instead of $\\sqrt{T}$.', tags: ['inference']},
            {id: 'quant-factor-models/hurdle', front: 'Why is a $t$-statistic of 2 no longer enough for a new factor?', back: 'Hundreds of factors have been tried; under a multiple-testing correction the single-discovery hurdle rises toward 3 (Harvey, Liu and Zhu), and keeps rising with the count.', tags: ['multiple-testing']},
            {id: 'quant-factor-models/decay', front: 'What happens to a published predictor\'s return, by McLean and Pontiff\'s estimates?', back: 'About 26% lower out of sample before publication (original overfitting) and about 58% lower after publication (capital following the paper).', tags: ['decay']},
            {id: 'quant-factor-models/grs', front: 'What does the GRS test ask?', back: 'Whether all $N$ alphas are jointly zero: $\\hat\\alpha^{\\top}\\hat\\Sigma^{-1}\\hat\\alpha$, scaled by the factors\' Sharpe ratio, against an $F$ distribution.', tags: ['grs']},
            {id: 'quant-factor-models/look-ahead', front: 'Name two data mistakes that manufacture cross-sectional predictability.', back: 'Using accounting values before their filing date (look-ahead; the convention is a six-month lag) and building the universe from today\'s constituents (survivorship).', tags: ['data']},
        ],
        problems: [
            {
                id: 'quant-factor-models/p1',
                kind: 'quant',
                title: 'A premium\'s $t$-statistic',
                statement: md`
A Fama–MacBeth regression over 600 months gives monthly slope estimates for a characteristic with mean $0.50\%$ and standard deviation $3.0\%$ (no autocorrelation).

1. What is the $t$-statistic of the premium?
2. Would it clear the 3.0 hurdle? With how many months of the same mean and dispersion would it first clear 3.0?

Give the first answer to two decimal places.
`,
                hints: ['$t = \\bar\\gamma / (\\sigma_\\gamma / \\sqrt{T})$.', 'Solve $0.5\\sqrt{T}/3 = 3$ for $T$.'],
                solution: md`
1. $t = 0.50 / (3.0/\sqrt{600}) = 0.50 / 0.1225 = 4.08$.
2. Yes. The hurdle is met when $0.5\sqrt{T}/3 \ge 3$, that is $\sqrt{T} \ge 18$, $T \ge 324$ months — twenty-seven years. A premium with half that mean would need four times as long. This is why most candidate factors are statistically undecidable on the data that exists, and why the decay after publication is measured on the few that are not.
`,
                answer: '4.08',
                tolerance: 0.02,
            },
        ],
    },
    {
        id: 'quant-portfolio-construction',
        track: 'quant',
        title: 'From signal to weights: shrinkage, risk parity, Kelly, drawdown control',
        oneLiner: 'The weighting step destroys or preserves most of an edge.',
        readingMinutes: 26,
        glossaryTerms: ['volatility', 'max-drawdown', 'kelly-criterion', 'correlation'],
        sections: {
            idea: md`
A signal ranks assets; a portfolio is a vector of weights. The step between them decides most of what a strategy earns and nearly all of what it loses. Markowitz's mean–variance optimisation is the reference point: choose weights to maximise expected return for a given variance, which requires expected returns and a covariance matrix. The practical difficulty is estimation. Expected returns are estimated with enormous error, and the optimiser is an error-maximiser — it leans hardest into the assets whose means are most overestimated. The covariance matrix with $N$ assets has $N(N+1)/2$ free entries estimated from $T$ observations, and when $N$ is comparable to $T$ the sample matrix is nearly singular and its inverse amplifies noise.

**Shrinkage** addresses the covariance: Ledoit and Wolf pull the sample matrix toward a structured target (a constant-correlation matrix, or a scaled identity) by an amount set to minimise expected estimation error. **Risk parity** sidesteps expected returns entirely: weights are set so each asset contributes equally to portfolio variance, which in practice over-weights low-volatility assets and is often levered to a target volatility. **Hierarchical risk parity** (López de Prado) uses a clustering of the correlation matrix to allocate top-down without inverting anything, which makes it stable when $N$ is large.

The second family of methods asks how *much* to risk in total. The **Kelly criterion** gives the fraction of wealth that maximises the long-run growth rate of a repeated bet; for a continuous return with drift $\mu$ and volatility $\sigma$ it is $\mu/\sigma^2$, which for realistic equity parameters is a leverage above 1 that no one runs, because the estimate of $\mu$ is uncertain and the drawdowns at full Kelly are severe. Fractional Kelly — a half or a quarter — gives most of the growth with far smaller swings. **Drawdown control** makes the trade-off explicit as a rule: scale exposure down as the drawdown from the high-water mark deepens, so a losing streak cannot become a ruin.
`,
            maths: md`
**Mean–variance.** With expected excess returns $\mu \in \mathbb{R}^{N}$ and covariance $\Sigma$, the unconstrained tangency weights are proportional to $\Sigma^{-1}\mu$; the portfolio Sharpe ratio is $\sqrt{\mu^{\top}\Sigma^{-1}\mu}$. The error amplification is visible in $\Sigma^{-1}$: the smallest eigenvalues of a sample covariance are underestimated, so their inverses are overestimated and the optimiser loads on the directions of least estimated risk.

**Ledoit–Wolf shrinkage.** Replace the sample covariance $S$ by

$$\hat\Sigma = \delta F + (1 - \delta) S, \qquad \delta^{*} = \frac{\sum_{ij}\operatorname{Var}(s_{ij}) - \operatorname{Cov}(f_{ij}, s_{ij})}{\sum_{ij}(f_{ij} - \sigma_{ij})^2},$$

with $F$ the target (constant correlation) and $\delta^{*}$ the intensity estimated from the data; $\delta$ is clipped to $[0, 1]$. The shrunk matrix is well-conditioned and its inverse no longer explodes.

**Risk parity.** With weights $w$ and marginal risk contributions $(\Sigma w)_i$, asset $i$'s contribution is $\mathrm{RC}_i = w_i (\Sigma w)_i / \sqrt{w^{\top}\Sigma w}$; risk parity solves $\mathrm{RC}_i = \mathrm{RC}_j$ for all $i, j$, usually numerically. For uncorrelated assets the solution is $w_i \propto 1/\sigma_i$: inverse-volatility weighting.

**Kelly for a continuous return.** With wealth growing as $dW/W = f(\mu\,dt + \sigma\,dB)$, the expected log-growth rate is

$$g(f) = f\mu - \tfrac{1}{2} f^2 \sigma^2, \qquad f^{*} = \frac{\mu}{\sigma^2}, \qquad g(f^{*}) = \frac{\mu^2}{2\sigma^2}.$$

At a fraction $c f^{*}$ the growth is $g = (c - \tfrac{1}{2}c^2)\, g(f^{*})$: half-Kelly keeps 75% of the growth with half the volatility; quarter-Kelly keeps 44%. Because $f^{*}$ is linear in $\mu$ and $\mu$ is the worst-estimated input, an overestimate of $\mu$ by a factor of two puts a "full Kelly" bettor at twice the true optimum, where the growth rate is zero.

**Drawdown control.** With high-water mark $M_t = \max_{s \le t} W_s$ and drawdown $D_t = 1 - W_t / M_t$, a common rule scales exposure as

$$f_t = f_0 \cdot \max\!\Big(0,\; 1 - \frac{D_t}{D_{\max}}\Big),$$

so the strategy is flat at the drawdown limit $D_{\max}$ and recovers exposure as the high-water mark is regained. Vol targeting — $f_t = f_0\,\sigma_{\text{target}}/\hat\sigma_t$ — is the complementary rule on the risk side (the volatility unit).
`,
            code: md`
Three weightings of the same synthetic universe, with their realised Sharpe out of sample, and the Kelly growth curve.

\`\`\`python
import numpy as np
from scipy.optimize import minimize

rng = np.random.default_rng(1)
N, T_in, T_out = 40, 120, 120                 # 40 assets, ten years in, ten years out (monthly)
true_mu = rng.normal(0.004, 0.003, N)          # true monthly premia
L = rng.normal(0, 0.03, (N, 3)); true_cov = L @ L.T + np.diag(rng.uniform(0.001, 0.004, N))
R_in = rng.multivariate_normal(true_mu, true_cov, T_in); R_out = rng.multivariate_normal(true_mu, true_cov, T_out)

mu_hat, S = R_in.mean(0), np.cov(R_in.T)
def sharpe(w, R): p = R @ w; return p.mean() / p.std() * np.sqrt(12)

w_mv = np.linalg.solve(S, mu_hat); w_mv /= np.abs(w_mv).sum()          # mean-variance on sample estimates
F = np.full_like(S, np.mean(S[~np.eye(N, dtype=bool)])); np.fill_diagonal(F, np.diag(S))
delta = 0.5                                                             # Ledoit-Wolf intensity, fixed here for brevity
w_lw = np.linalg.solve(delta * F + (1 - delta) * S, mu_hat); w_lw /= np.abs(w_lw).sum()
def rc_gap(w): rc = w * (S @ w); return ((rc - rc.mean()) ** 2).sum()
w_rp = minimize(rc_gap, np.ones(N) / N, bounds=[(0, 1)] * N, constraints={"type": "eq", "fun": lambda w: w.sum() - 1}).x

for name, w in [("mean-variance", w_mv), ("shrunk", w_lw), ("risk parity", w_rp)]:
    print(f"{name:14s} in-sample {sharpe(w, R_in):5.2f}  out-of-sample {sharpe(w, R_out):5.2f}")

mu, sigma = 0.08, 0.16                                                  # annual drift and vol for the Kelly curve
f = np.linspace(0, 8, 801); g = f * mu - 0.5 * f**2 * sigma**2
print(f"full Kelly f*={mu/sigma**2:.3f}  growth {g.max():.4f}  half-Kelly keeps {g[np.argmin(abs(f - mu/sigma**2/2))]/g.max():.0%}")
\`\`\`

The in-sample column flatters mean–variance and the out-of-sample column punishes it; shrinkage closes most of the gap and risk parity, which never saw \`mu_hat\`, is the most stable of the three. The Kelly line prints a leverage above 3 — the number nobody runs, and the reason fractional Kelly exists.
`,
            whyNow: md`
Portfolio construction is where machine-learning signals meet reality: a model that ranks stocks well can still lose money if the weights chase estimation error, ignore costs, or size positions so that one bad month ends the strategy. The methods in this unit are the industry's standard defences and they appear, in one form or another, in every systematic fund's pipeline — shrunk covariances, risk budgets, volatility targets, drawdown limits.

The app's AI Navigator and the culture pickers are a toy version with the same anatomy: a score per symbol, an allocator with a position cap, a cash floor and a hard stop, and a rebalance band. The rails are the drawdown-control and concentration rules of this unit written as fixed numbers; the legend on /brain states them.
`,
            pitfalls: md`
- **Expected returns dominate the error.** A covariance estimated from a few years is usable; a mean estimated from a few years is not. Methods that need $\mu$ (mean–variance, Kelly) inherit its noise squared.
- **Constraints are estimation.** Long-only and position caps are not just risk limits; they regularise the optimiser and usually improve out-of-sample results. Treat them as part of the estimator.
- **Full Kelly is a ceiling, not a target.** Overestimating the edge by a factor of two puts full Kelly at zero growth. Half or quarter Kelly is the practice.
- **Risk parity is a leverage decision.** Unlevered risk parity across stocks and bonds is mostly bonds; the published results assume leverage to a volatility target, with its financing cost and its 2022.
- **Turnover.** Re-optimising every period on noisy inputs churns the book; the transaction-costs unit prices that churn, and penalising it in the objective is standard.
- **Drawdown rules lock in losses by design.** Scaling down into a drawdown means recovering slowly; the rule trades expected return for survival, and that trade is the point.
`,
        },
        sources: [
            {title: 'Portfolio Selection (Markowitz)', url: 'https://doi.org/10.2307/2975974', kind: 'paper', year: 1952},
            {title: 'Honey, I Shrunk the Sample Covariance Matrix', url: 'https://doi.org/10.3905/jpm.2004.110', kind: 'paper', year: 2004},
            {title: 'Building Diversified Portfolios that Outperform Out of Sample (Hierarchical Risk Parity)', url: 'https://doi.org/10.3905/jpm.2016.42.4.059', kind: 'paper', year: 2016},
            {title: 'A New Interpretation of Information Rate (Kelly)', url: 'https://doi.org/10.1002/j.1538-7305.1956.tb03809.x', kind: 'paper', year: 1956},
            {title: 'The Kelly Capital Growth Investment Criterion: Theory and Practice', url: 'https://doi.org/10.1142/7598', kind: 'book', year: 2011, note: 'MacLean, Thorp and Ziemba: the collected papers, fractional Kelly included.'},
            {title: 'Optimal Versus Naive Diversification: How Inefficient is the 1/N Portfolio Strategy?', url: 'https://doi.org/10.1093/rfs/hhm075', kind: 'paper', year: 2009, note: 'DeMiguel, Garlappi and Uppal: how long an estimation window mean–variance needs to win.'},
        ],
        cards: [
            {id: 'quant-portfolio-construction/error-maximiser', front: 'Why is the mean–variance optimiser called an error-maximiser?', back: 'Weights are proportional to $\\Sigma^{-1}\\mu$: it leans hardest into assets whose means are most overestimated and into directions whose risk is most underestimated (the small, noisy eigenvalues of the sample covariance).', tags: ['mean-variance']},
            {id: 'quant-portfolio-construction/shrinkage', front: 'What does Ledoit–Wolf shrinkage do to the covariance matrix?', back: 'Replaces the sample matrix by $\\delta F + (1-\\delta) S$, pulling it toward a structured target with an intensity $\\delta$ chosen to minimise estimation error; the result is well-conditioned and its inverse stops amplifying noise.', tags: ['covariance']},
            {id: 'quant-portfolio-construction/risk-parity', front: 'What condition defines risk parity, and what is its solution for uncorrelated assets?', back: 'Equal risk contributions: $w_i(\\Sigma w)_i$ equal for all $i$. For uncorrelated assets, $w_i \\propto 1/\\sigma_i$, inverse-volatility weighting.', tags: ['risk-parity']},
            {id: 'quant-portfolio-construction/kelly', front: 'State the continuous Kelly fraction and the growth rate at a fraction $c$ of it.', back: '$f^{*} = \\mu/\\sigma^{2}$ with growth $\\mu^{2}/2\\sigma^{2}$; at $c f^{*}$ the growth is $(c - c^{2}/2)$ of the maximum: half-Kelly keeps 75%, quarter-Kelly 44%.', tags: ['kelly']},
            {id: 'quant-portfolio-construction/kelly-error', front: 'What happens to a full-Kelly bettor who overestimates the drift by a factor of two?', back: 'They bet $2f^{*}$, where $g(2f^{*}) = 2f^{*}\\mu - 2f^{*2}\\sigma^{2} = 0$: zero long-run growth with large swings. Fractional Kelly is the hedge against that error.', tags: ['kelly']},
            {id: 'quant-portfolio-construction/drawdown-rule', front: 'How does a drawdown-control rule scale exposure?', back: 'Linearly down with the drawdown from the high-water mark, $f_t = f_0 \\max(0, 1 - D_t/D_{\\max})$: flat at the limit, restored as the mark is regained. It trades expected return for survival on purpose.', tags: ['drawdown']},
            {id: 'quant-portfolio-construction/hrp', front: 'Why does hierarchical risk parity stay stable when $N$ is large?', back: 'It allocates top-down through a clustering of the correlation matrix and never inverts a covariance, so the near-singularity that breaks mean–variance at large $N$ never enters.', tags: ['hrp']},
        ],
        problems: [
            {
                id: 'quant-portfolio-construction/p1',
                kind: 'quant',
                title: 'Continuous Kelly and why nobody runs it',
                statement: md`
An index has an excess drift of $8\%$ a year and a volatility of $16\%$ a year, lognormal.

1. What leverage maximises the long-run growth rate?
2. What share of the full-Kelly growth rate does half-Kelly keep?
3. If the true drift is $4\%$ rather than $8\%$, what is the growth rate at the leverage from part 1?

Give the first answer as a leverage (a multiple of wealth).
`,
                hints: ['$g(f) = f\\mu - \\tfrac{1}{2}f^{2}\\sigma^{2}$.', 'Part 3: plug $f = 3.125$ and $\\mu = 0.04$ into $g$.'],
                solution: md`
1. $f^{*} = \mu/\sigma^{2} = 0.08/0.0256 = 3.125$: more than three times wealth.
2. At $c = \tfrac{1}{2}$, $g = (c - \tfrac{1}{2}c^{2})\,g(f^{*}) = 0.375\,g(f^{*})$ against $0.5\,g(f^{*})$ at full Kelly — $75\%$ of the growth with half the volatility.
3. $g(3.125) = 3.125 \times 0.04 - \tfrac{1}{2}\times 3.125^{2}\times 0.0256 = 0.125 - 0.125 = 0$. A drift overestimated by a factor of two turns the "optimal" leverage into zero growth, which is the whole argument for fractional Kelly: the error in $\mu$ enters the bet linearly and the penalty quadratically.
`,
                answer: '3.125',
                tolerance: 0.001,
            },
        ],
    },
    {
        id: 'quant-transaction-costs',
        track: 'quant',
        title: 'Transaction costs and market impact: the square-root law, Almgren–Chriss, capacity',
        oneLiner: 'Net of costs is the only Sharpe that exists; capacity decides what a strategy is.',
        readingMinutes: 24,
        glossaryTerms: ['bid-ask-spread', 'adverse-selection'],
        sections: {
            idea: md`
Every trade pays three costs. The **spread**: a market order buys at the ask and sells at the bid, half the spread each way. **Market impact**: a large order moves the price against itself while it executes, and part of that move persists. **Opportunity and timing cost**: trading slowly to reduce impact exposes the order to price moves and to the signal decaying. A strategy's gross backtest is a statement about prices; its net return subtracts these, and for anything that trades daily or holds small-cap names, the subtraction is most of the gross.

The empirical regularity that organises impact is the **square-root law**: the average price move caused by an order of size $Q$ in a stock trading $V$ shares a day with daily volatility $\sigma$ is roughly $Y\sigma\sqrt{Q/V}$, with $Y$ of order one. It holds across markets, decades and order sizes spanning orders of magnitude, and it is concave — doubling the order less than doubles the impact per share but more than doubles the total cost, which grows as $Q^{3/2}$. That exponent is why **capacity** is finite: as assets under management grow, impact grows faster than the gross return, and at some size the net return is zero. Capacity is a property of a strategy as fundamental as its Sharpe ratio.

**Almgren and Chriss** turned execution into an optimisation: split a parent order into a schedule of child orders over a horizon, trading off the expected impact cost of trading fast against the variance of the price over the time spent trading slowly. The result is a family of trajectories indexed by risk aversion, from a straight line (TWAP) to a front-loaded curve. The model's linear impact is a simplification the square-root law contradicts, but its structure — temporary impact you pay and permanent impact you leave behind, a risk term that rewards speed — is how every execution desk thinks, and the model underlies the volume-participation and arrival-price algorithms brokers sell.
`,
            maths: md`
**The square-root law.** For an order of $Q$ shares executed over a window in which the market trades $V$ shares, with daily volatility $\sigma$:

$$\frac{\Delta p}{p} \approx Y\,\sigma\,\sqrt{\frac{Q}{V}}, \qquad Y \approx 0.5 \text{ to } 1.$$

The total cost of the order is $Q \cdot p \cdot Y\sigma\sqrt{Q/V} \propto Q^{3/2}$. A strategy with gross daily return $\alpha$ on a position of size $Q$ nets $\alpha - Y\sigma\sqrt{Q/V} \cdot \text{turnover}$; setting this to zero gives the capacity

$$Q_{\max} = V\left(\frac{\alpha}{Y\sigma\,\tau}\right)^{2},$$

with $\tau$ the daily turnover fraction. A signal half as strong has a quarter of the capacity.

**Almgren–Chriss.** Sell $X$ shares over $T$ periods with holdings $x_k$ ($x_0 = X$, $x_T = 0$) and trade sizes $n_k = x_{k-1} - x_k$. Permanent impact $g(v) = \gamma v$ and temporary impact $h(v) = \epsilon\,\operatorname{sign}(v) + \eta v$ per share, with price volatility $\sigma$ per period. The expected cost and its variance are

$$\mathbb{E}[C] = \tfrac{1}{2}\gamma X^{2} + \epsilon X + \eta \sum_{k} \frac{n_k^{2}}{\tau}, \qquad \operatorname{Var}[C] = \sigma^{2}\tau\sum_{k} x_k^{2},$$

and minimising $\mathbb{E}[C] + \lambda\operatorname{Var}[C]$ gives the schedule

$$x_k = X\,\frac{\sinh\big(\kappa (T - k)\tau\big)}{\sinh(\kappa T\tau)}, \qquad \kappa \approx \sqrt{\frac{\lambda\sigma^{2}}{\eta}}.$$

At $\lambda = 0$ the schedule is linear (TWAP); as $\lambda$ grows it front-loads, paying impact to shed risk. The efficient frontier of execution is the curve of $(\operatorname{Var}, \mathbb{E})$ pairs traced by $\lambda$.

**Spread cost.** A round trip in a stock with quoted spread $s$ (as a fraction of price) costs $s$ if both legs cross the spread, $s/2$ for one leg; for the strategies of this app, which fill at the last close with no spread, that is the first thing a real broker would add.
`,
            code: md`
The square-root law applied to a strategy's capacity, and the Almgren–Chriss schedule for a few risk aversions.

\`\`\`python
import numpy as np

# Capacity: a daily-rebalanced signal with gross alpha of 15 bps/day in a stock with 2% daily vol.
alpha, sigma, Y, tau = 0.0015, 0.02, 0.7, 0.5          # tau: half the book turns over each day
V = 5_000_000                                           # shares traded a day
def net(Q): return alpha - Y * sigma * np.sqrt(Q / V) * tau
Q_max = V * (alpha / (Y * sigma * tau)) ** 2
for Q in [10_000, 100_000, 500_000, Q_max]:
    print(f"Q={Q:>10,.0f} shares  impact={Y*sigma*np.sqrt(Q/V)*1e4:5.1f} bps  net/day={net(Q)*1e4:6.2f} bps")

# Almgren-Chriss: sell X shares over T periods for several risk aversions.
X, T, dt, sigma_p, eta = 1_000_000, 20, 1.0, 0.3, 2.5e-6     # per-period vol in $ and temporary-impact coefficient
k = np.arange(T + 1)
for lam in [0.0, 1e-7, 1e-6, 1e-5]:
    kappa = np.sqrt(lam * sigma_p**2 / eta) if lam > 0 else 0.0
    x = X * (T - k) / T if kappa == 0 else X * np.sinh(kappa * (T - k) * dt) / np.sinh(kappa * T * dt)
    first_quarter = 1 - x[T // 4] / X
    print(f"lambda={lam:.0e}  sold in the first quarter of the window: {first_quarter:5.1%}")
\`\`\`

Watch the capacity line: the net return crosses zero at a position size that is a small fraction of daily volume, and that size shrinks with the square of the signal strength. The schedule loop shows the shape Almgren–Chriss adds: the same order, front-loaded as the trader's risk aversion grows.
`,
            whyNow: md`
Costs decide which published results survive contact with capital. Frazzini, Israel and Moskowitz measured realised trading costs at a large quantitative manager and found that the standard factor premia survive at scale but with capacities far below the paper returns imply; many anomalies in small, illiquid names do not survive at all. Any evaluation of an ML signal now reports net returns at an assumed cost model, and the square-root law is that model's backbone.

For the app's own strategies the gap is explicit: fills are at the last close with no spread and no impact, so the leaderboard is a gross number. The unit's arithmetic is what converts it to the number a real account would see, and the reason the strategy pages warn that a real broker would queue and fill differently.
`,
            pitfalls: md`
- **Costs scale with the square root of size, so backtests at any fixed size understate the cost of growing.** Report capacity, not just a cost assumption.
- **The impact coefficient $Y$ is not universal.** Values between 0.3 and 1 appear depending on market, order type and how volume is measured (the window's or the day's); calibrate on your own fills.
- **Spread is a function of time and volatility.** Spreads widen at the open, at the close and on news days; a constant spread assumption misses the days that matter.
- **Permanent versus temporary impact is identifiable only with data.** Models that assume all impact is temporary overstate what patient execution can save.
- **Turnover is the multiplier.** A signal's cost is impact times turnover; a strategy that rebalances daily pays twenty times what a monthly one pays for the same book.
- **Execution and alpha interact.** A trade scheduled over a day has the signal decaying while it trades; the slower the schedule, the less of the alpha arrives.
`,
        },
        sources: [
            {title: 'Optimal execution of portfolio transactions (Almgren and Chriss)', url: 'https://doi.org/10.21314/JOR.2001.041', kind: 'paper', year: 2000},
            {title: 'No-dynamic-arbitrage and market impact (Gatheral)', url: 'https://doi.org/10.1080/14697680903373692', kind: 'paper', year: 2010},
            {title: 'Trades, Quotes and Prices: Financial Markets Under the Microscope', url: 'https://doi.org/10.1017/9781316659335', kind: 'book', year: 2018, note: 'Bouchaud, Bonart, Donier and Gould: the square-root law and its evidence.'},
            {title: 'Trading Costs (Frazzini, Israel and Moskowitz)', url: 'https://ssrn.com/abstract=3229719', kind: 'paper', year: 2018},
            {title: 'Continuous Auctions and Insider Trading (Kyle)', url: 'https://doi.org/10.2307/1913210', kind: 'paper', year: 1985, note: 'Linear impact as the equilibrium of an informed trader against a market maker.'},
            {title: 'Market impact and trading profile of hidden orders in stock markets', url: 'https://doi.org/10.1103/PhysRevE.80.066102', kind: 'paper', year: 2009, note: 'Moro et al.: the square-root law measured on metaorders.'},
        ],
        cards: [
            {id: 'quant-transaction-costs/three-costs', front: 'Name the three components of transaction cost.', back: 'The bid–ask spread (half each way for a market order), market impact (the order moving the price against itself) and timing or opportunity cost (price moves and signal decay while trading slowly).', tags: ['costs']},
            {id: 'quant-transaction-costs/sqrt-law', front: 'State the square-root law and the scaling of total cost it implies.', back: 'Impact $\\approx Y\\sigma\\sqrt{Q/V}$ with $Y$ of order one; total cost of an order grows as $Q^{3/2}$, concave per share, convex in total.', tags: ['impact']},
            {id: 'quant-transaction-costs/capacity', front: 'Why is capacity finite, and how does it depend on signal strength?', back: 'Impact grows as $Q^{3/2}$ while gross return grows as $Q$, so net return crosses zero at $Q_{\\max} = V(\\alpha / Y\\sigma\\tau)^{2}$: a signal half as strong has a quarter of the capacity.', tags: ['capacity']},
            {id: 'quant-transaction-costs/almgren-chriss', front: 'What trade-off does Almgren–Chriss optimise, and what do the extremes look like?', back: 'Expected impact cost of trading fast against the variance of the price while trading slowly, $\\mathbb{E}[C] + \\lambda \\operatorname{Var}[C]$. At $\\lambda = 0$ the schedule is linear (TWAP); as $\\lambda$ grows it front-loads.', tags: ['execution']},
            {id: 'quant-transaction-costs/permanent-temporary', front: 'Distinguish permanent and temporary impact.', back: 'Temporary impact is paid on the shares traded now and decays after the trade; permanent impact shifts the price for the rest of the order and beyond. Only data separates them, and assuming all impact is temporary overstates what patience saves.', tags: ['impact']},
            {id: 'quant-transaction-costs/turnover', front: 'Why does turnover multiply a strategy\'s cost?', back: 'Cost per period is impact times the fraction of the book traded; a daily rebalance pays about twenty times a monthly one for the same book, so turnover penalties belong in the objective.', tags: ['turnover']},
            {id: 'quant-transaction-costs/app-fills', front: 'What costs do the app\'s paper strategies leave out, and what would a broker add?', back: 'Fills are at the last close with no spread and no impact: the leaderboard is a gross number. A broker adds the spread, queueing to the next session and impact on size.', tags: ['app']},
        ],
        problems: [
            {
                id: 'quant-transaction-costs/p1',
                kind: 'quant',
                title: 'Impact of a participation order',
                statement: md`
A stock has daily volatility $2\%$ and trades 4 million shares a day. An order to buy 200,000 shares is executed over the day with impact coefficient $Y = 1$.

1. By the square-root law, what is the expected impact as a fraction of price, in basis points?
2. What is the total impact cost in dollars at a price of \$50?
3. If the same desk doubled the order, by what factor would the total cost grow?

Give the first answer in basis points to one decimal place.
`,
                hints: ['$Q/V = 0.05$.', 'Total cost is $Q \\cdot p \\cdot$ impact, so it scales as $Q^{3/2}$.'],
                solution: md`
1. $\sqrt{0.05} = 0.2236$; impact $= 0.02 \times 0.2236 = 0.447\% = 44.7$ basis points.
2. $200{,}000 \times 50 \times 0.00447 \approx \$44{,}700$, on a \$10 million order.
3. $2^{3/2} \approx 2.83$: the per-share impact rises by $\sqrt{2}$ and the share count doubles, so a \$20 million order costs about \$126,000, not \$89,400. That convexity is the arithmetic behind capacity.
`,
                answer: '44.7',
                tolerance: 0.2,
                unit: 'bps',
            },
        ],
    },
];
