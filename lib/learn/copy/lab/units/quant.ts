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
    {
        id: 'quant-backtest-overfitting',
        track: 'quant',
        title: 'Backtest overfitting: multiple testing, deflated Sharpe, CPCV, purging',
        oneLiner: 'With compute this plentiful most backtests are selection; the statistics of selection are the defence.',
        readingMinutes: 28,
        glossaryTerms: ['survivorship-bias', 'simulated-record'],
        prerequisites: ['quant-factor-models'],
        sections: {
            idea: md`
A backtest is a statistical test, and the trouble with it is the number of tests nobody reports. A researcher who tries a hundred variants of a rule and shows the one with the highest Sharpe ratio has not found a strategy with that Sharpe; they have found the maximum of a hundred draws, and the maximum of a hundred noisy draws is large even when every draw has zero mean. Harvey, Liu and Zhu made the point for the factor literature — hundreds of published factors, a t-statistic hurdle of 2 that should have been 3 once the trials were counted — and Bailey, Borwein, López de Prado and Zhu made it for strategy development: the expected maximum Sharpe ratio across $N$ independent trials of a zero-skill strategy grows like $\sqrt{2 \ln N}$, so a reported in-sample Sharpe must be read against the number of trials that produced it.

Two tools make that reading. The **deflated Sharpe ratio** takes the observed Sharpe, the number of trials, the variance of the Sharpe across them, the sample length and the return distribution's skew and kurtosis, and gives the probability that the true Sharpe exceeds the expected maximum under no skill; a strategy "passes" when that probability is high. The **probability of backtest overfitting (PBO)** asks a different question — whether the configuration chosen in-sample is also among the better configurations out-of-sample — and estimates it by splitting the history into blocks, forming every combination of training and testing blocks (**combinatorially symmetric cross-validation, CSCV**), and recording how often the in-sample winner's out-of-sample rank falls in the bottom half.

The third family of tools concerns **leakage**. Financial labels overlap in time: a label computed from the next twenty days of returns at day $t$ shares information with the label at $t+1$, so a random train–test split leaks the test set's future into training. **Purging** removes from the training set any observation whose label window overlaps a test observation's; **embargoing** removes a further buffer after each test block for slow-decaying serial correlation; and **combinatorial purged cross-validation (CPCV)** generates many purged train–test splits so a strategy's out-of-sample performance is a distribution, not one number from one lucky split.

None of this makes a backtest a forecast. It makes the backtest's own uncertainty explicit — how many trials, how long a history, how much leakage — so that a Sharpe of two from a hundred trials over three years reads as what it is, which is nothing yet.
`,
            maths: md`
**The expected maximum.** For $N$ independent trials whose annualised Sharpe estimates are roughly normal with mean $0$ and variance $V$, the expected maximum is approximately

$$\mathbb{E}[\max_N \widehat{SR}] \approx \sqrt{V}\,\Big[(1 - \gamma)\, \Phi^{-1}\!\big(1 - \tfrac{1}{N}\big) + \gamma\, \Phi^{-1}\!\big(1 - \tfrac{1}{N e}\big)\Big],$$

with $\gamma \approx 0.5772$ the Euler–Mascheroni constant. It grows with $\sqrt{2 \ln N}$: ten trials buy about $1.5\sqrt{V}$, a hundred about $2.5\sqrt{V}$, a thousand about $3.2\sqrt{V}$.

**The Sharpe estimate's own error.** For $T$ observations of returns with skew $\gamma_3$ and kurtosis $\gamma_4$, the standard error of the Sharpe estimate (Lo; Bailey and López de Prado) is

$$\widehat{\sigma}(\widehat{SR}) = \sqrt{\frac{1 - \gamma_3 \widehat{SR} + \frac{\gamma_4 - 1}{4}\widehat{SR}^2}{T - 1}},$$

larger for negatively skewed, fat-tailed returns — exactly the returns of short-volatility and carry strategies.

**The deflated Sharpe ratio** is the probabilistic Sharpe ratio evaluated against the expected maximum rather than against zero:

$$\widehat{DSR} = \Phi\!\left( \frac{\widehat{SR} - \mathbb{E}[\max_N \widehat{SR}]}{\widehat{\sigma}(\widehat{SR})} \right),$$

the probability that the true Sharpe is above the selection-inflated benchmark. A $\widehat{DSR}$ below $0.95$ says the observed Sharpe is consistent with being the best of $N$ nothings.

**Minimum backtest length.** Setting the expected maximum equal to the Sharpe one hopes to find, the years of history needed to tell $N$ trials apart from luck are

$$\text{MinBTL} \approx \left( \frac{(1 - \gamma)\Phi^{-1}(1 - \frac{1}{N}) + \gamma \Phi^{-1}(1 - \frac{1}{Ne})}{SR_{\text{target}}} \right)^{2},$$

in years for an annualised Sharpe; a hundred trials and a target Sharpe of $1$ need about six years of out-of-sample history.

**PBO by CSCV.** Split the $T \times N$ matrix of strategy returns into $S$ blocks; for each of the $\binom{S}{S/2}$ ways of choosing half the blocks as training, pick the best in-sample configuration $n^{*}$, compute its out-of-sample rank $\bar\omega \in (0, 1)$ among the $N$, and the logit $\lambda = \ln \frac{\bar\omega}{1 - \bar\omega}$. Then

$$\text{PBO} = \Pr(\lambda < 0),$$

the fraction of combinations in which the in-sample winner underperforms the out-of-sample median.

**Purging.** For a test observation $j$ with label window $[t_{j,0}, t_{j,1}]$, drop every training observation $i$ with $[t_{i,0}, t_{i,1}] \cap [t_{j,0}, t_{j,1}] \neq \varnothing$; embargo drops training observations with $t_{i,0} \in (t_{j,1}, t_{j,1} + h]$.
`,
            code: md`
The expected-maximum correction and PBO by CSCV, on a matrix of candidate strategies' returns. The combinatorics are small for $S = 8$ blocks (70 combinations); use $S = 16$ with sampling for a real study.

\`\`\`python
import numpy as np
from itertools import combinations
from scipy.stats import norm

EULER_GAMMA = 0.5772156649

def expected_max_sharpe(n_trials, var_sharpe):
    z1 = norm.ppf(1 - 1 / n_trials)
    z2 = norm.ppf(1 - 1 / (n_trials * np.e))
    return np.sqrt(var_sharpe) * ((1 - EULER_GAMMA) * z1 + EULER_GAMMA * z2)

def deflated_sharpe(sr, n_trials, var_sharpe, T, skew=0.0, kurt=3.0):
    se = np.sqrt((1 - skew * sr + (kurt - 1) / 4 * sr**2) / (T - 1))
    return norm.cdf((sr - expected_max_sharpe(n_trials, var_sharpe)) / se)

def sharpe(r):
    return r.mean(0) / r.std(0, ddof=1) * np.sqrt(252)

def pbo_cscv(returns, S=8):
    # returns: (T, N) daily returns of N candidate configurations; S blocks of equal length.
    blocks = np.array_split(np.arange(returns.shape[0]), S)
    logits = []
    for train_ix in combinations(range(S), S // 2):
        test_ix = [b for b in range(S) if b not in train_ix]
        train = returns[np.concatenate([blocks[b] for b in train_ix])]
        test = returns[np.concatenate([blocks[b] for b in test_ix])]
        best = np.argmax(sharpe(train))                               # chosen in-sample
        rank = (sharpe(test) < sharpe(test)[best]).mean()            # its out-of-sample rank in (0, 1)
        rank = min(max(rank, 1e-6), 1 - 1e-6)
        logits.append(np.log(rank / (1 - rank)))
    return (np.array(logits) < 0).mean()                              # probability of backtest overfitting
\`\`\`

Run \`pbo_cscv\` on a matrix of pure noise and it returns about $0.5$: the in-sample winner is as likely as not to be below the out-of-sample median, which is the number a real study has to beat.
`,
            whyNow: md`
Compute made the problem universal. A laptop evaluates ten thousand parameter settings of a rule over twenty years of daily data in minutes; a cloud account evaluates millions; an automated research agent evaluates them without a person noticing how many were tried. The defence has to be procedural: log every trial, report the count with every result, and apply the deflation and the cross-validation as a matter of course. Machine-learning strategies raise the stakes, since a gradient-boosted model's hyperparameter search is itself thousands of trials and its labels are overlapping by construction (the ML-for-alpha unit builds on this one).

The academic side moved too. The replication crisis in factor research — McLean and Pontiff's post-publication decay, the "factor zoo" papers — made multiple-testing adjustment a reviewer's expectation, and the deflated Sharpe ratio and PBO are standard sections in strategy papers that take themselves seriously. In this app, every simulated record a strategy page shows is one configuration chosen before the history was seen, which is the only way a single backtest escapes the problem.
`,
            pitfalls: md`
- **The count is the hard part.** Trials include every parameter tried, every universe, every start date, every variant discarded in a notebook — and the trials of colleagues whose results informed the choice. Undercounting $N$ is the common way to pass the deflation and still be wrong.
- **Correlated trials.** The formula assumes independent trials; a hundred near-identical parameter settings are closer to a handful of effective trials. Estimate the effective number from the correlation of the trials' returns.
- **One split is one draw.** A single walk-forward test gives one out-of-sample number whose variance is unknown. CPCV gives a distribution; report it.
- **Leakage through features**, not only labels: a feature computed with any look-ahead (a restated fundamental, a point-in-time error, an index membership known only in hindsight) leaks regardless of purging. Point-in-time data is the prerequisite.
- **Survivorship.** A universe of today's constituents backtested into the past removes every firm that failed; the deflation does not fix a biased sample.
- **Passing the tests is not a forecast.** A deflated Sharpe above 0.95 and a low PBO say the result is not explained by selection and leakage; they say nothing about whether the effect persists after publication or capacity.
`,
        },
        sources: [
            {title: 'The Probability of Backtest Overfitting', url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253', kind: 'paper', year: 2017, note: 'Bailey, Borwein, López de Prado and Zhu: CSCV and PBO.'},
            {title: 'The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality', url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551', kind: 'paper', year: 2014},
            {title: 'Pseudo-Mathematics and Financial Charlatanism: The Effects of Backtest Overfitting on Out-of-Sample Performance', url: 'https://www.ams.org/notices/201405/rnoti-p458.pdf', kind: 'paper', year: 2014, note: 'The minimum backtest length.'},
            {title: '… and the Cross-Section of Expected Returns', url: 'https://doi.org/10.1093/rfs/hhv059', kind: 'paper', year: 2016, note: 'Harvey, Liu and Zhu: the t-statistic hurdle of 3.'},
            {title: 'Advances in Financial Machine Learning', url: 'https://www.wiley.com/en-us/Advances+in+Financial+Machine+Learning-p-9781119482086', kind: 'book', year: 2018, note: 'López de Prado: purging, embargo and CPCV, chapters 7 and 12.'},
            {title: 'A Backtesting Protocol in the Era of Machine Learning', url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3275654', kind: 'paper', year: 2019, note: 'Arnott, Harvey and Markowitz: the research-process checklist.'},
            {title: 'The Statistics of Sharpe Ratios', url: 'https://doi.org/10.2469/faj.v58.n4.2453', kind: 'paper', year: 2002, note: 'Lo: the Sharpe estimate\'s standard error.'},
        ],
        cards: [
            {id: 'quant-backtest-overfitting/max-of-n', front: 'How does the expected maximum Sharpe of N zero-skill trials grow with N?', back: 'Like $\\sqrt{V}\\sqrt{2\\ln N}$: about $1.5\\sqrt{V}$ for ten trials, $2.5\\sqrt{V}$ for a hundred, $3.2\\sqrt{V}$ for a thousand, where $V$ is the variance of the Sharpe estimates across trials.', tags: ['selection', 'maths']},
            {id: 'quant-backtest-overfitting/dsr', front: 'What does the deflated Sharpe ratio measure?', back: 'The probability that the true Sharpe exceeds the expected maximum of N trials under no skill, using the Sharpe estimate\'s standard error (which grows with negative skew and kurtosis). Below about 0.95 the observed Sharpe is consistent with being the best of N nothings.', tags: ['dsr']},
            {id: 'quant-backtest-overfitting/pbo', front: 'What question does PBO answer, and how is it estimated?', back: 'Whether the configuration chosen in-sample is also good out-of-sample. CSCV forms every combination of half the time blocks as training, picks the in-sample winner, records its out-of-sample rank, and PBO is the fraction of combinations where that rank is below the median.', tags: ['pbo', 'cscv']},
            {id: 'quant-backtest-overfitting/purging', front: 'Why do financial labels leak under a random train–test split, and what fixes it?', back: 'Labels overlap in time (a 20-day forward return at t shares 19 days with the one at t+1), so training sees the test set\'s future. Purging drops training observations whose label window overlaps a test one; an embargo drops a buffer after each test block.', tags: ['leakage', 'cpcv']},
            {id: 'quant-backtest-overfitting/minbtl', front: 'Roughly how many years of history does it take to tell a hundred trials at a target Sharpe of 1 from luck?', back: 'About six: MinBTL is the square of the expected maximum (about 2.5 for a hundred trials) over the target Sharpe.', tags: ['minbtl']},
            {id: 'quant-backtest-overfitting/effective-n', front: 'What goes wrong with the trial count when the trials are correlated?', back: 'The deflation assumes independent trials; a hundred near-identical parameter settings are a handful of effective trials, so the count must be reduced from the correlation of their returns — but undercounting is the usual error, since discarded notebook variants and colleagues\' results are trials too.', tags: ['selection']},
            {id: 'quant-backtest-overfitting/se', front: 'How do skew and kurtosis enter the Sharpe estimate\'s standard error?', back: '$\\hat\\sigma(\\widehat{SR}) = \\sqrt{(1 - \\gamma_3\\widehat{SR} + \\frac{\\gamma_4-1}{4}\\widehat{SR}^2)/(T-1)}$: negative skew and fat tails widen it, which is why short-volatility and carry records are less significant than their Sharpe suggests.', tags: ['maths']},
        ],
        problems: [
            {
                id: 'quant-backtest-overfitting/p1',
                kind: 'quant',
                title: 'The best of a hundred nothings',
                statement: md`
A researcher ran 100 independent configurations of a rule, each with no skill, and the variance of the annualised Sharpe estimate across configurations is $V = 1$.

1. What is the expected maximum Sharpe ratio across the 100 trials? Use $\Phi^{-1}(0.99) = 2.326$ and $\Phi^{-1}(1 - \frac{1}{100e}) = 2.680$.
2. The best configuration showed a Sharpe of 2.0 over $T = 756$ daily observations with zero skew and kurtosis 3. What is its deflated Sharpe ratio, approximately?
3. How many years of history would it take for a target Sharpe of 1.0 to clear the expected maximum?

Give the first answer to two decimals.
`,
                hints: ['Weight the two quantiles by (1 − γ) = 0.4228 and γ = 0.5772.', 'The standard error at T = 756 and SR = 2 is about 0.0533 in daily units times the root of 252 — or simply note the observed Sharpe is below the expected maximum.'],
                solution: md`
1. $0.4228 \times 2.326 + 0.5772 \times 2.680 = 0.983 + 1.547 = 2.53$. The best of a hundred nothings is expected to show a Sharpe of about $2.5$.
2. The observed $2.0$ is *below* the expected maximum, so $\widehat{DSR} = \Phi\big((2.0 - 2.53)/\hat\sigma\big) < 0.5$ whatever the standard error: the result is less than what selection alone would produce.
3. $\text{MinBTL} \approx (2.53 / 1.0)^2 \approx 6.4$ years — of out-of-sample history, after the hundred trials were run.
`,
                answer: '2.53',
                tolerance: 0.01,
            },
        ],
    },
    {
        id: 'quant-volatility-regimes',
        track: 'quant',
        title: 'Volatility and regimes: realised estimators, GARCH and HAR, hidden Markov models, vol targeting',
        oneLiner: 'Volatility is the most forecastable quantity in markets; sizing by it is how risk is actually controlled.',
        readingMinutes: 27,
        glossaryTerms: ['volatility', 'daily-swing'],
        prerequisites: ['quant-portfolio-construction'],
        sections: {
            idea: md`
Returns are close to unpredictable; their variance is not. Large moves cluster — a volatile day is far more likely to be followed by another volatile day than a calm one is — and that clustering is the most robust empirical regularity in asset prices. Engle's **ARCH** and Bollerslev's **GARCH** model it directly: today's conditional variance is a weighted sum of a long-run level, yesterday's squared return and yesterday's conditional variance, so a shock raises variance and the increase decays geometrically. The RiskMetrics **exponentially weighted moving average** is the special case with no long-run level, which is the one most risk systems actually run.

With intraday data the variance of a day can be *measured* rather than inferred. **Realised variance** — the sum of squared five-minute returns — is a consistent estimator of the day's integrated variance, and the **HAR** (heterogeneous autoregressive) model of Corsi forecasts tomorrow's realised variance from the daily, weekly and monthly averages of past realised variance, three coefficients that beat most GARCH variants out of sample because they use the measured quantity instead of a single squared return. Range-based estimators (Parkinson, Garman–Klass, Yang–Zhang) extract the same information from open, high, low and close when intraday prints are not available, at several times the efficiency of close-to-close.

**Regimes** are the coarser version of the same observation. A two-state **hidden Markov model** with a calm state (low variance, slightly positive mean) and a stressed state (high variance, negative mean, high correlation across assets) fits most equity index histories well; the filtered probability of the stressed state is a volatility forecast with a memory of the transition matrix, and the state persistence (diagonal transition probabilities near 0.95 daily) is why "regime" is a useful word. Regime models are also the honest frame for strategy evaluation: a rule that looks good over a sample dominated by one regime has been tested on one draw.

What all of this is *for* is sizing. **Volatility targeting** scales a position so that its forecast volatility equals a target: a position in an asset whose forecast volatility doubled is halved. Because volatility is forecastable and returns are not, this changes the distribution of outcomes materially — drawdowns shrink, the Sharpe ratio of equity and futures strategies rises modestly, and the leverage required is highest exactly when volatility is lowest. Moreira and Muir showed the effect across factors; it is the mechanism behind most risk-parity and managed-futures portfolios.
`,
            maths: md`
**GARCH(1,1).** With daily return $r_t = \sigma_t \varepsilon_t$, $\varepsilon_t$ i.i.d. with unit variance,

$$\sigma_t^2 = \omega + \alpha\, r_{t-1}^2 + \beta\, \sigma_{t-1}^2, \qquad \alpha + \beta < 1,$$

unconditional variance $\bar\sigma^2 = \omega / (1 - \alpha - \beta)$, and a $k$-day-ahead forecast that decays toward it: $\mathbb{E}[\sigma_{t+k}^2] = \bar\sigma^2 + (\alpha + \beta)^{k}(\sigma_t^2 - \bar\sigma^2)$. Typical daily equity estimates are $\alpha \approx 0.08$, $\beta \approx 0.90$: a half-life of shocks around $35$ days. The **EWMA** is $\omega = 0$, $\alpha = 1 - \lambda$, $\beta = \lambda$ with $\lambda = 0.94$ (RiskMetrics):

$$\sigma_t^2 = \lambda\, \sigma_{t-1}^2 + (1 - \lambda)\, r_{t-1}^2 .$$

**Realised variance and HAR.** With $M$ intraday returns $r_{t,i}$ on day $t$, $RV_t = \sum_{i=1}^{M} r_{t,i}^2$, and the HAR forecast is

$$RV_{t+1} = c + \beta_d\, RV_t + \beta_w\, \overline{RV}_{t-4:t} + \beta_m\, \overline{RV}_{t-21:t} + u_{t+1},$$

three horizons of memory, estimated by least squares, usually in logs. The Parkinson range estimator for a day with high $H$ and low $L$ is $\hat\sigma^2 = \frac{(\ln H/L)^2}{4 \ln 2}$, about five times as efficient as a squared close-to-close return; Yang–Zhang adds the overnight gap and the open-to-close drift.

**The two-state HMM.** States $s_t \in \{1, 2\}$ with transition matrix $P$ and emissions $r_t \mid s_t \sim \mathcal{N}(\mu_{s}, \sigma_s^2)$. The filtered state probability updates as

$$\xi_{t \mid t}(j) \propto f(r_t \mid s_t = j)\, \sum_{i} P_{ij}\, \xi_{t-1 \mid t-1}(i),$$

and the one-step variance forecast is the mixture $\sum_j \xi_{t+1 \mid t}(j)\, (\sigma_j^2 + \mu_j^2) - \big(\sum_j \xi_{t+1\mid t}(j)\, \mu_j\big)^2$. Parameters come from the EM (Baum–Welch) algorithm; the expected duration of state $j$ is $1 / (1 - P_{jj})$.

**Volatility targeting.** With target annualised volatility $\sigma^{*}$ and forecast $\hat\sigma_t$ (annualised), the weight is

$$w_t = \min\!\left(\frac{\sigma^{*}}{\hat\sigma_t},\ w_{\max}\right),$$

and the scaled return is $w_t r_{t+1}$. If returns were i.i.d. this would change nothing but the leverage; because $\hat\sigma_t$ predicts $|r_{t+1}|$, it changes the realised distribution — lower kurtosis, shallower drawdowns — and, on assets whose expected return does not fall when volatility rises, a higher Sharpe.
`,
            code: md`
An EWMA and a GARCH-style filter, a HAR forecast, and the volatility-target weight they feed, on a vector of daily returns.

\`\`\`python
import numpy as np

def ewma_variance(r, lam=0.94, init=None):
    v = np.empty_like(r); v[0] = init if init is not None else r[:20].var()
    for t in range(1, len(r)):
        v[t] = lam * v[t - 1] + (1 - lam) * r[t - 1] ** 2        # uses only past returns
    return v

def garch_variance(r, omega, alpha, beta):
    v = np.empty_like(r); v[0] = omega / (1 - alpha - beta)
    for t in range(1, len(r)):
        v[t] = omega + alpha * r[t - 1] ** 2 + beta * v[t - 1]
    return v

def har_forecast(rv, c, bd, bw, bm):
    # rv: daily realised variance; forecast for the next day from the last day, week and month.
    d = rv[-1]; w = rv[-5:].mean(); m = rv[-22:].mean()
    return c + bd * d + bw * w + bm * m

def vol_target_weights(daily_vol_forecast, target_annual=0.10, w_max=2.0):
    annual = daily_vol_forecast * np.sqrt(252)
    return np.minimum(target_annual / annual, w_max)

r = np.random.default_rng(0).standard_t(4, 2000) * 0.01       # fat-tailed stand-in
sigma = np.sqrt(ewma_variance(r))
w = vol_target_weights(sigma)
scaled = w[:-1] * r[1:]                                        # today's weight on tomorrow's return
print(np.std(r[1:]) * np.sqrt(252), np.std(scaled) * np.sqrt(252))   # raw vs targeted volatility
\`\`\`

The one alignment that matters: the weight at $t$ uses the forecast made from returns through $t-1$ and is applied to the return of $t+1$. Shifting it by one day — a very common bug — uses the realised return inside its own weight and reports an impossible record.
`,
            whyNow: md`
Volatility forecasting is the part of quantitative finance that machine learning has not displaced: HAR with a handful of coefficients remains near the frontier of daily forecasts, and the gains from richer models are small and fragile. What changed is the data — realised measures from tick data are routine, options-implied volatility surfaces (a later unit) give a forward-looking input, and cross-asset realised covariance is estimated at frequencies that were impractical a decade ago — and the use: vol targeting and risk parity are now the default construction for multi-asset funds, so the forecast's quality is the fund's quality.

The regime frame also carried over into the current evaluation culture. Strategy records are reported by regime, machine-learning signals are tested for whether they work only in one state, and the 2020 and 2022 episodes are standard stress cases precisely because they are short, high-variance states that a sample mean hides.
`,
            pitfalls: md`
- **Alignment.** A one-day shift between forecast and return turns a vol-targeting backtest into look-ahead; check that the weight at $t$ depends on nothing after $t$.
- **Overnight versus intraday.** Realised variance from intraday returns misses the overnight gap, which is a third or more of total variance for single stocks; add the gap or use Yang–Zhang.
- **Microstructure noise** biases realised variance upward at high sampling frequencies; five-minute returns are the usual compromise, or a noise-robust estimator.
- **GARCH on short samples.** $\alpha + \beta$ near one is an estimate with a wide interval; the implied half-life swings by months between samples. HAR is more stable because it regresses on measured quantities.
- **Vol targeting needs leverage when volatility is low,** which is when calm regimes end; cap the weight and know the cost of the leverage. It also raises turnover, so the transaction-cost unit applies.
- **Regime models label the past, not the future.** A smoothed (two-sided) state sequence is not available in real time; use filtered probabilities and expect a lag of days at each transition.
`,
        },
        sources: [
            {title: 'Autoregressive Conditional Heteroscedasticity with Estimates of the Variance of United Kingdom Inflation (ARCH)', url: 'https://doi.org/10.2307/1912773', kind: 'paper', year: 1982},
            {title: 'Generalized Autoregressive Conditional Heteroskedasticity (GARCH)', url: 'https://doi.org/10.1016/0304-4076(86)90063-1', kind: 'paper', year: 1986},
            {title: 'A Simple Approximate Long-Memory Model of Realized Volatility (HAR)', url: 'https://doi.org/10.1093/jjfinec/nbp001', kind: 'paper', year: 2009},
            {title: 'Modeling and Forecasting Realized Volatility', url: 'https://doi.org/10.1111/1468-0262.00418', kind: 'paper', year: 2003, note: 'Andersen, Bollerslev, Diebold and Labys.'},
            {title: 'A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle (Hamilton)', url: 'https://doi.org/10.2307/1912559', kind: 'paper', year: 1989},
            {title: 'Volatility-Managed Portfolios', url: 'https://doi.org/10.1111/jofi.12513', kind: 'paper', year: 2017, note: 'Moreira and Muir.'},
            {title: 'Drift-Independent Volatility Estimation Based on High, Low, Open, and Close Prices (Yang–Zhang)', url: 'https://doi.org/10.1086/209650', kind: 'paper', year: 2000},
        ],
        cards: [
            {id: 'quant-volatility-regimes/garch', front: 'Write GARCH(1,1) and its long-run variance.', back: '$\\sigma_t^2 = \\omega + \\alpha r_{t-1}^2 + \\beta\\sigma_{t-1}^2$ with $\\alpha+\\beta<1$; the unconditional variance is $\\omega/(1-\\alpha-\\beta)$, and forecasts decay toward it at rate $(\\alpha+\\beta)^k$.', tags: ['garch']},
            {id: 'quant-volatility-regimes/ewma', front: 'What is the RiskMetrics EWMA, and how does it relate to GARCH?', back: '$\\sigma_t^2 = \\lambda\\sigma_{t-1}^2 + (1-\\lambda) r_{t-1}^2$ with $\\lambda = 0.94$ daily: GARCH(1,1) with no long-run level ($\\omega=0$, $\\alpha+\\beta=1$), so shocks never fully decay.', tags: ['ewma']},
            {id: 'quant-volatility-regimes/har', front: 'What does the HAR model regress on, and why does it forecast well?', back: 'Tomorrow\'s realised variance on the last day\'s, the last week\'s average and the last month\'s average realised variance (three coefficients). It uses the measured variance rather than one squared return, which is why it is stable and near the frontier.', tags: ['har', 'realised']},
            {id: 'quant-volatility-regimes/range', front: 'Why use a range-based estimator, and which one handles the overnight gap?', back: 'The high–low range carries about five times the information of a close-to-close return (Parkinson); Yang–Zhang adds the overnight gap and the open-to-close drift, which single stocks need.', tags: ['estimators']},
            {id: 'quant-volatility-regimes/hmm', front: 'What does a two-state HMM of index returns typically find, and what is the expected duration of a state?', back: 'A calm state (low variance, small positive mean) and a stressed one (high variance, negative mean); with diagonal transition probabilities near 0.95 the expected duration is $1/(1-P_{jj})$, about 20 days or more.', tags: ['regimes', 'hmm']},
            {id: 'quant-volatility-regimes/targeting', front: 'Why does volatility targeting change the return distribution when returns are unpredictable?', back: 'Because volatility is predictable: the weight $\\sigma^*/\\hat\\sigma_t$ shrinks before large moves, cutting kurtosis and drawdowns; on assets whose expected return does not fall with volatility, the Sharpe rises. With i.i.d. returns it would only change leverage.', tags: ['sizing']},
            {id: 'quant-volatility-regimes/alignment', front: 'What is the alignment rule in a vol-targeting backtest?', back: 'The weight at $t$ is built from returns through $t-1$ and applied to the return at $t+1$. A one-day shift puts the realised return inside its own weight and produces an impossible record.', tags: ['backtest', 'bugs']},
        ],
        problems: [
            {
                id: 'quant-volatility-regimes/p1',
                kind: 'quant',
                title: 'One EWMA step and the weight it sets',
                statement: md`
A risk system runs the RiskMetrics EWMA with $\lambda = 0.94$ on daily returns. Yesterday's volatility estimate was $1.0\%$ a day and yesterday's return was $-3.0\%$.

1. What is today's daily volatility estimate?
2. Annualised with $\sqrt{252}$, what is it in percent?
3. With a $10\%$ annualised target and a cap of 2, what weight does vol targeting set today?

Give the second answer, the annualised volatility in percent, to one decimal.
`,
                hints: ['Variance first: 0.94 times 0.0001 plus 0.06 times 0.0009.', 'Take the square root, then multiply by 15.87.'],
                solution: md`
1. $\sigma^2 = 0.94 \times (0.010)^2 + 0.06 \times (0.030)^2 = 0.000094 + 0.000054 = 0.000148$, so $\sigma = 1.217\%$ a day: one 3-sigma day lifts the estimate by a fifth.
2. $1.217\% \times \sqrt{252} = 19.3\%$ annualised.
3. $w = \min(10 / 19.3,\ 2) = 0.52$: the position is roughly halved on the day after the shock, and with $\lambda = 0.94$ the estimate decays back toward its old level with a half-life of about eleven days.
`,
                answer: '19.3',
                tolerance: 0.1,
                unit: '%',
            },
        ],
    },
    {
        id: 'quant-microstructure',
        track: 'quant',
        title: 'Market microstructure: order books, adverse selection, the microprice, queues',
        oneLiner: 'Where prices come from and why fills cost; needed to read any intraday data.',
        readingMinutes: 26,
        glossaryTerms: ['bid-ask-spread', 'adverse-selection', 'market-order'],
        prerequisites: ['quant-transaction-costs'],
        sections: {
            idea: md`
A price is not a number a market has; it is the state of a **limit order book**: resting bids and offers at each tick, in time priority within a price level. A limit order joins the queue at its price; a market order (or a marketable limit) consumes resting orders from the best price outward; the best bid and best ask define the spread, and the last trade is whichever side was just hit. Every intraday series — midpoints, trades, volume bars — is a reading of this object, and most of what looks like noise in it is the mechanics of queues and the strategic behaviour of the people in them.

Why is there a spread at all? The classic answer has two parts. **Inventory**: a market maker who buys accumulates a position whose risk they must be paid to hold, so they quote lower after buying and higher after selling (Avellaneda and Stoikov give the stochastic-control version: quotes skewed by inventory and widened by volatility and a risk-aversion parameter). **Adverse selection**: some counterparties know something — Kyle's informed trader, Glosten and Milgrom's informed fraction — and the market maker loses to them on average, so the spread must be wide enough that the gains from uninformed trades pay for the losses to informed ones. In Kyle's model the informed trader hides inside the uninformed order flow and the market maker's price impact per unit of net order flow, **Kyle's lambda**, is the ratio of what they know to how much noise they can hide in.

Two quantities make the book readable. The **microprice** is the fair value implied by the book's imbalance: when the bid queue is much larger than the ask queue, the next price move is more likely up, so the fair price sits above the midpoint, toward the ask. Stoikov's version weights the bid and ask by the opposite side's queue size, and the estimator improves on the midpoint as a predictor of the next trade price. **Queue position** is the other: a limit order's expected fill time and its adverse-selection exposure depend on how many shares are ahead of it, since the orders ahead fill first and the order fills exactly when the queue is exhausted — which is often the moment the price is about to move through it.

Reading intraday data without this frame produces artefacts: bid–ask bounce that looks like negative autocorrelation (Roll's estimator recovers the spread from it), volume that is mostly queue churn, and "price impact" that is partly the permanent information content of trades and partly the temporary cost of consuming liquidity. The transaction-cost unit's square-root law is the aggregate of exactly these mechanics.
`,
            maths: md`
**The microprice.** With best bid $b$ and ask $a$ and their queue sizes $Q_b$ and $Q_a$, the imbalance $I = \frac{Q_b}{Q_b + Q_a}$ and

$$P_{\text{micro}} = I\, a + (1 - I)\, b = \frac{Q_b\, a + Q_a\, b}{Q_b + Q_a},$$

the midpoint pulled toward the side with the larger queue *across* from it: a large bid queue pushes the fair price toward the ask. Stoikov's refinement adjusts the midpoint by $\mathbb{E}[\text{next mid change} \mid I, \text{spread}]$ estimated from data, which reduces to the formula above when the next move is linear in imbalance.

**Roll's spread estimator.** If trades alternate between bid and ask at random around a constant midpoint $m$, observed prices are $p_t = m + \frac{s}{2} q_t$ with $q_t = \pm 1$, and the first-order autocovariance of price changes is $\operatorname{Cov}(\Delta p_t, \Delta p_{t-1}) = -\frac{s^2}{4}$, so

$$\hat s = 2\sqrt{-\operatorname{Cov}(\Delta p_t, \Delta p_{t-1})} .$$

Bid–ask bounce is why trade prices show negative autocorrelation that the midpoint does not.

**Kyle (1985), one period.** The asset's value is $v \sim \mathcal{N}(\mu, \sigma_v^2)$, known to the informed trader, who submits $x = \beta (v - \mu)$; noise traders submit $u \sim \mathcal{N}(0, \sigma_u^2)$. The market maker sees only $y = x + u$ and prices at $p = \mu + \lambda y$. The linear equilibrium is

$$\lambda = \frac{\sigma_v}{2\sigma_u}, \qquad \beta = \frac{\sigma_u}{\sigma_v},$$

so impact per unit of flow rises with the information's variance and falls with the noise the informed trader can hide in; the informed trader's expected profit is $\frac{\sigma_v \sigma_u}{2}$, paid by the noise traders.

**Glosten–Milgrom.** With a fraction $\pi$ of informed traders who know whether $v$ is high ($v_H$) or low ($v_L$), and uninformed who buy or sell with equal probability, the ask is the expected value conditional on a buy:

$$a = \mathbb{E}[v \mid \text{buy}] = \frac{\pi\, v_H + (1 - \pi)\, \mathbb{E}[v]}{1} \quad\text{(with prior } \tfrac12\text{)},\qquad s = a - b = \pi\, (v_H - v_L),$$

the spread equal to the informed fraction times the value uncertainty: the uninformed pay for the informed's edge.

**Avellaneda–Stoikov quotes.** With inventory $q$, mid $S$, volatility $\sigma$, risk aversion $\gamma$, time to close $T - t$ and an order-arrival decay $\kappa$, the reservation price and the optimal spread are

$$r = S - q\, \gamma\, \sigma^2\, (T - t), \qquad \delta_a + \delta_b = \gamma \sigma^2 (T - t) + \frac{2}{\gamma} \ln\!\Big(1 + \frac{\gamma}{\kappa}\Big),$$

quotes centred on $r$ — skewed below the mid when long, above when short — and widened by volatility and by the time left to hold the inventory.

**Queue fill time.** With $q$ shares ahead at a level that depletes at rate $\mu$ (market orders hitting it) and gains at rate $\lambda$ (new limit orders behind, which do not matter for position) and cancels ahead at rate $\theta$ per share, the expected time to the front is roughly $q / (\mu + \theta q)$ — and the order fills exactly when the level is exhausted, which is when the price is most likely to move through it.
`,
            code: md`
A minimal price-time-priority book, the microprice from its top of book, and Roll's estimator on a synthetic trade series.

\`\`\`python
import numpy as np
from collections import deque, defaultdict

class Book:
    def __init__(self):
        self.bids = defaultdict(deque); self.asks = defaultdict(deque)   # price -> queue of (id, qty)
    def limit(self, side, price, qty, oid):
        (self.bids if side == "B" else self.asks)[price].append([oid, qty])
    def best(self):
        b = max(self.bids) if self.bids else None; a = min(self.asks) if self.asks else None
        return b, a
    def market(self, side, qty):                     # consumes the far side, best price first
        book = self.asks if side == "B" else self.bids
        fills = []
        while qty > 0 and book:
            px = min(book) if side == "B" else max(book)
            q = book[px]
            while qty > 0 and q:
                take = min(qty, q[0][1]); q[0][1] -= take; qty -= take; fills.append((px, take))
                if q[0][1] == 0: q.popleft()
            if not q: del book[px]
        return fills
    def microprice(self):
        b, a = self.best()
        Qb = sum(x[1] for x in self.bids[b]); Qa = sum(x[1] for x in self.asks[a])
        return (Qb * a + Qa * b) / (Qb + Qa)

def roll_spread(trade_prices):
    dp = np.diff(trade_prices)
    cov = np.cov(dp[1:], dp[:-1])[0, 1]
    return 2 * np.sqrt(-cov) if cov < 0 else float("nan")

book = Book(); book.limit("B", 100.00, 300, 1); book.limit("A", 100.02, 100, 2)
print(book.best(), round(book.microprice(), 4))       # (100.0, 100.02) 100.015: pulled toward the ask
rng = np.random.default_rng(1)
trades = 100 + 0.01 * rng.choice([-1, 1], 5000)       # bounce around a fixed mid, spread 0.02
print(round(roll_spread(trades), 4))                  # about 0.02
\`\`\`

Two things to notice: the microprice moves with queue sizes before the midpoint moves at all, and Roll recovers the spread from trade prices alone — which is also a warning that trade-price autocorrelation is not a signal.
`,
            whyNow: md`
Microstructure stopped being a specialist's field when every strategy's realised cost became the difference between its backtest and its record. Execution algorithms are judged against microprice benchmarks rather than midpoints; alpha researchers working on anything shorter than a week need to know what a trade print means; and the machine-learning literature on order-book data (predicting the next mid move from the book's shape) is a microstructure literature with new estimators. Retail flow routed to wholesalers, off-exchange volume near half of US equity trading, and the 2021–25 debates on payment for order flow are all questions about who is adversely selecting whom.

For this app's purposes the frame explains the records: a paper fill at the next open is a fiction with no spread and no impact, and the gap between it and a real fill is this unit — the half-spread, the queue a limit order would have waited in, and the impact a market order of real size would have had.
`,
            pitfalls: md`
- **Midpoint is not fair value.** Use the microprice (or an imbalance-adjusted mid) as the benchmark for fills and for short-horizon signals; mid-based cost estimates flatter a passive strategy that fills only when the price is moving against it.
- **Trade signs.** Lee–Ready and its successors infer buy or sell from the trade's position relative to the quote; misclassification rates of 10 to 20 percent are normal, and every impact estimate inherits them.
- **Timestamps.** Quotes and trades from different feeds are not synchronised at the millisecond; a "trade through the quote" is often a clock artefact.
- **Queue position is unobservable** from public data; models of fill probability from book snapshots are approximations, and a backtest of limit-order strategies is optimistic unless it assumes the back of the queue.
- **Hidden and iceberg liquidity,** odd lots, and off-exchange prints mean the visible book understates depth and the tape overstates the liquidity a strategy could have taken.
- **Models are stylised.** Kyle and Glosten–Milgrom explain why spreads exist; their parameters are not estimable per stock in any useful way. Use them to reason, not to fit.
`,
        },
        sources: [
            {title: 'Continuous Auctions and Insider Trading (Kyle)', url: 'https://doi.org/10.2307/1913210', kind: 'paper', year: 1985},
            {title: 'Bid, Ask and Transaction Prices in a Specialist Market with Heterogeneously Informed Traders (Glosten and Milgrom)', url: 'https://doi.org/10.1016/0304-405X(85)90044-3', kind: 'paper', year: 1985},
            {title: 'The Micro-Price: A High Frequency Estimator of Future Prices', url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2970694', kind: 'paper', year: 2018, note: 'Stoikov.'},
            {title: 'High-Frequency Trading in a Limit Order Book', url: 'https://doi.org/10.1080/14697680701381228', kind: 'paper', year: 2008, note: 'Avellaneda and Stoikov: inventory-skewed quotes.'},
            {title: 'The Price Impact of Order Book Events', url: 'https://doi.org/10.1093/jjfinec/nbt003', kind: 'paper', year: 2014, note: 'Cont, Kukanov and Stoikov: order-flow imbalance.'},
            {title: 'A Simple Implicit Measure of the Effective Bid-Ask Spread in an Efficient Market (Roll)', url: 'https://doi.org/10.1111/j.1540-6261.1984.tb03897.x', kind: 'paper', year: 1984},
            {title: 'Trades, Quotes and Prices: Financial Markets Under the Microscope', url: 'https://doi.org/10.1017/9781316659335', kind: 'book', year: 2018, note: 'Bouchaud, Bonart, Donier and Gould.'},
        ],
        cards: [
            {id: 'quant-microstructure/microprice', front: 'Write the microprice and say which way a large bid queue moves it.', back: '$P_{micro} = (Q_b a + Q_a b)/(Q_b + Q_a)$: the bid and ask weighted by the opposite side\'s queue. A large bid queue pushes it toward the ask, since the next mid move is more likely up.', tags: ['microprice']},
            {id: 'quant-microstructure/two-reasons', front: 'What are the two classic reasons a spread exists?', back: 'Inventory risk (a market maker must be paid to hold a position, so quotes skew after trades: Avellaneda–Stoikov) and adverse selection (some counterparties are informed, so uninformed trades must pay for the losses to informed ones: Kyle, Glosten–Milgrom).', tags: ['spread', 'theory']},
            {id: 'quant-microstructure/kyle-lambda', front: 'What is Kyle\'s lambda in the one-period model?', back: '$\\lambda = \\sigma_v / (2\\sigma_u)$: price impact per unit of net order flow, rising with the variance of the private information and falling with the noise-trader volume the informed trader can hide in.', tags: ['kyle']},
            {id: 'quant-microstructure/glosten', front: 'In Glosten–Milgrom, what sets the spread?', back: 'The informed fraction times the value uncertainty, $s = \\pi(v_H - v_L)$: the ask is the expected value given a buy, the bid given a sell, and the uninformed pay the difference.', tags: ['glosten-milgrom']},
            {id: 'quant-microstructure/roll', front: 'Why do trade prices show negative autocorrelation, and what does Roll\'s estimator do with it?', back: 'Bid–ask bounce: trades alternate between bid and ask around the mid, so $\\operatorname{Cov}(\\Delta p_t, \\Delta p_{t-1}) = -s^2/4$ and $\\hat s = 2\\sqrt{-\\operatorname{Cov}}$. The autocorrelation is a spread, not a signal.', tags: ['roll', 'artefacts']},
            {id: 'quant-microstructure/queue', front: 'Why is a limit order\'s fill both slow and adversely selected?', back: 'It fills only when every share ahead of it is taken, which is when the level is exhausted — the moment the price is most likely to move through it. Expected time to the front depends on the queue ahead and the arrival rate of market orders.', tags: ['queues']},
            {id: 'quant-microstructure/as-quotes', front: 'How do Avellaneda–Stoikov quotes respond to inventory and volatility?', back: 'They centre on a reservation price $S - q\\gamma\\sigma^2(T-t)$ — below the mid when long, above when short — and the spread widens with $\\gamma\\sigma^2(T-t)$ plus a term from the order-arrival decay.', tags: ['market-making']},
        ],
        problems: [
            {
                id: 'quant-microstructure/p1',
                kind: 'quant',
                title: 'Reading the top of the book',
                statement: md`
The best bid is 100.00 with 300 shares resting and the best ask is 100.02 with 100 shares resting.

1. What is the midpoint, and what is the microprice?
2. A market buy of 150 shares arrives. What does it pay on average, and what is the best ask afterwards if the next ask level is 100.03 with 500 shares?
3. Under Roll's model with a constant mid and this spread, what first-order autocovariance of trade-price changes would a long series show?

Give the microprice to three decimals.
`,
                hints: ['Weight each quote by the queue on the opposite side.', '(300 × 100.02 + 100 × 100.00) / 400.'],
                solution: md`
1. The midpoint is $100.01$. The microprice is $\frac{300 \times 100.02 + 100 \times 100.00}{400} = 100.015$: three-quarters of the way to the ask, because the bid queue is three times the ask queue and the next move is more likely up.
2. The buy takes 100 at 100.02 and 50 at 100.03, an average of $100.0233$; the best ask becomes 100.03 with 450 left, so the spread widened to 3 cents and the microprice jumps again.
3. $-s^2/4 = -(0.02)^2/4 = -0.0001$: a negative autocovariance of one basis point squared, from bounce alone, with no information in it.
`,
                answer: '100.015',
                tolerance: 0.0005,
            },
        ],
    },
];
