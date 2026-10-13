// The machine-learning track's units, in the plan's order (lib/learn/copy/lab/plan.ts). Written
// for an expert reader; held to the 'lab' tier of lib/learn/banned.ts over their prose.

import {md} from "@/lib/learn/copy/lab/md";
import type {LabUnit} from "@/lib/learn/copy/lab/types";

export const ML_UNITS: readonly LabUnit[] = [
    {
        id: 'ml-transformer-internals',
        track: 'ml',
        title: 'The transformer block as shipped: pre-norm, RoPE, SwiGLU, GQA, 6ND',
        oneLiner: 'FLOP arithmetic is the lingua franca of budgets; everything later is a correction to this block.',
        readingMinutes: 25,
        sections: {
            idea: md`
The block that every current language model ships is not the 2017 one. The 2017 transformer applied layer normalisation *after* each residual addition (post-norm), used absolute sinusoidal positions, a ReLU feed-forward network and one key–value head per query head. The block in Llama, Gemma, Qwen, DeepSeek and their descendants makes four substitutions, each chosen because it trains more stably or costs less at inference:

- **Pre-norm with RMSNorm.** Normalisation is applied to the input of each sub-layer, with the residual stream left untouched, so gradients flow through the identity path and deep stacks train without warm-up tricks. RMSNorm drops the mean-centering of LayerNorm and keeps only the scale, which is cheaper and empirically equivalent.
- **Rotary position embeddings (RoPE).** Instead of adding a position vector to the token embedding, each query and key is rotated in two-dimensional subspaces by an angle proportional to its position. The dot product between a query at position $m$ and a key at position $n$ then depends only on $m - n$: relative position falls out of the geometry, and the rotation can be extended or scaled for longer contexts (the long-context unit).
- **SwiGLU feed-forward.** The MLP becomes a gated unit: two input projections, one passed through SiLU and multiplied elementwise with the other, then a down projection. Three matrices instead of two, so the hidden width is set to about $\tfrac{8}{3}$ of the old $4d$ to keep parameter count equal — which is why you see widths like 14,336 next to $d = 4096$.
- **Grouped-query attention (GQA).** Several query heads share one key–value head. Quality is close to full multi-head attention, and the key–value cache — the thing that dominates inference memory — shrinks by the grouping factor.

The second half of the unit is bookkeeping. Training compute is well approximated by $6ND$ FLOPs for $N$ parameters and $D$ tokens; inference by $2N$ per generated token plus the attention over the cache. These two expressions are how budgets, data sizes and hardware choices are reasoned about, and the rest of the ML track keeps returning to them.
`,
            maths: md`
**One block**, with $x \in \mathbb{R}^{L \times d}$:

$$h = x + \operatorname{Attn}\big(\operatorname{RMSNorm}(x)\big), \qquad y = h + \operatorname{FFN}\big(\operatorname{RMSNorm}(h)\big),$$

$$\operatorname{RMSNorm}(x)_i = \frac{x_i}{\sqrt{\tfrac{1}{d}\sum_j x_j^2 + \epsilon}}\, g_i .$$

**RoPE.** Pair the dimensions of a head of size $d_h$ into $d_h/2$ planes with frequencies $\theta_k = b^{-2k/d_h}$ (base $b$, 10,000 originally, far larger in long-context models). Position $m$ rotates plane $k$ by $m\theta_k$:

$$f(q, m) = R_m q, \qquad R_m = \operatorname{diag}\big(R(m\theta_1), \dots, R(m\theta_{d_h/2})\big),\quad R(\alpha) = \begin{pmatrix}\cos\alpha & -\sin\alpha\\ \sin\alpha & \cos\alpha\end{pmatrix}.$$

Because rotations compose, $\langle R_m q, R_n k\rangle = \langle q, R_{n-m} k\rangle$: the score depends on the offset $n - m$ only.

**SwiGLU.** With $W_1, W_3 \in \mathbb{R}^{d \times d_{ff}}$ and $W_2 \in \mathbb{R}^{d_{ff} \times d}$:

$$\operatorname{FFN}(x) = \big(\operatorname{SiLU}(xW_1) \odot xW_3\big) W_2, \qquad \operatorname{SiLU}(z) = z\,\sigma(z).$$

Parameters: $3\, d\, d_{ff}$. Matching the $8d^2$ of a ReLU MLP with $d_{ff} = 4d$ gives $d_{ff} = \tfrac{8}{3}d$, rounded to a multiple of 256.

**GQA.** With $H$ query heads and $H_{kv}$ key–value heads ($H_{kv}$ divides $H$), the projections are $W_Q \in \mathbb{R}^{d \times H d_h}$ and $W_K, W_V \in \mathbb{R}^{d \times H_{kv} d_h}$. Attention parameters per block:

$$P_{\text{attn}} = d\cdot H d_h \;(W_Q) + 2\, d \cdot H_{kv} d_h \;(W_K, W_V) + H d_h \cdot d \;(W_O).$$

The cache per token per layer is $2 H_{kv} d_h$ values, so moving from $H_{kv} = H$ to $H_{kv} = H/8$ cuts it eight-fold.

**The FLOP rules.** A matrix multiply of an $L \times d$ activation by a $d \times k$ weight costs $2Ldk$ FLOPs (a multiply and an add per term). Summing over every weight matrix, a forward pass costs about $2N$ FLOPs per token for $N$ non-embedding parameters; the backward pass costs about twice the forward, giving

$$C_{\text{train}} \approx 6\, N D, \qquad C_{\text{infer}} \approx 2N \text{ per token} + 4\, L_{\text{ctx}}\, n_{\text{layers}}\, d \text{ for attention over the cache}.$$

The attention term is quadratic in context during prefill and linear during decoding; for typical contexts it is a small share of $2N$, which is why "parameters × 2" is the standard back-of-envelope.
`,
            code: md`
A block in plain PyTorch, with the parameter arithmetic beside it. Shapes are the Llama-3-8B ones.

\`\`\`python
import torch, torch.nn as nn, torch.nn.functional as F

d, H, Hkv, dh, dff = 4096, 32, 8, 128, 14336

class RMSNorm(nn.Module):
    def __init__(self, d, eps=1e-5):
        super().__init__(); self.g = nn.Parameter(torch.ones(d)); self.eps = eps
    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.g

def rope(x, pos, base=500_000.0):          # x: (B, L, heads, dh); rotate pairs of dims
    half = x.shape[-1] // 2
    freqs = base ** (-torch.arange(0, half, device=x.device) / half)      # (dh/2,)
    ang = pos[:, None].float() * freqs[None, :]                            # (L, dh/2)
    cos, sin = ang.cos()[None, :, None, :], ang.sin()[None, :, None, :]
    x1, x2 = x[..., :half], x[..., half:]
    return torch.cat([x1 * cos - x2 * sin, x1 * sin + x2 * cos], dim=-1)

class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.n1, self.n2 = RMSNorm(d), RMSNorm(d)
        self.wq, self.wk, self.wv, self.wo = nn.Linear(d, H*dh, bias=False), nn.Linear(d, Hkv*dh, bias=False), nn.Linear(d, Hkv*dh, bias=False), nn.Linear(H*dh, d, bias=False)
        self.w1, self.w3, self.w2 = nn.Linear(d, dff, bias=False), nn.Linear(d, dff, bias=False), nn.Linear(dff, d, bias=False)

    def forward(self, x, pos):
        B, L, _ = x.shape
        h = self.n1(x)
        q = rope(self.wq(h).view(B, L, H, dh), pos)
        k = rope(self.wk(h).view(B, L, Hkv, dh), pos)
        v = self.wv(h).view(B, L, Hkv, dh)
        k, v = k.repeat_interleave(H // Hkv, dim=2), v.repeat_interleave(H // Hkv, dim=2)   # GQA: share kv heads
        a = F.scaled_dot_product_attention(q.transpose(1, 2), k.transpose(1, 2), v.transpose(1, 2), is_causal=True)
        x = x + self.wo(a.transpose(1, 2).reshape(B, L, H*dh))
        h = self.n2(x)
        return x + self.w2(F.silu(self.w1(h)) * self.w3(h))

params = sum(p.numel() for p in Block().parameters())
print(params)                 # 218,112,000 per block; 32 blocks ≈ 7.0B before embeddings
\`\`\`

The \`repeat_interleave\` is the GQA trick made explicit: in a real kernel the key–value heads are shared without copying, which is where the memory saving comes from.
`,
            whyNow: md`
Every architectural debate of the last two years — mixture of experts, multi-head latent attention, state-space hybrids, speculative decoding — is a modification of this block judged by the same two numbers: FLOPs per token and bytes of cache per token. Being able to write $6ND$, $2N$ and $2 H_{kv} d_h$ per layer on a whiteboard is what lets you read a model card and know what a deployment costs before anyone runs it.

The block itself has mostly stopped moving. Pre-norm, RoPE, gated MLPs and grouped key–value heads are in essentially every open model released in 2025–26; the differences are in the attention variant for long context and in whether the feed-forward layer is dense or routed. Learn this one well and the rest of the track reads as deltas.
`,
            pitfalls: md`
- **Counting parameters.** Embeddings (and an untied output head) are large but do not multiply per token in the same way; $6ND$ uses non-embedding parameters. Papers differ on whether they include them — check before comparing.
- **$d_{ff}$ arithmetic.** SwiGLU's three matrices mean a "4× hidden" rule of thumb is wrong; the widths you see (11,008 for 4096 in Llama 2, 14,336 in Llama 3) come from $\tfrac{8}{3}d$ rounded, sometimes with a multiplier.
- **RoPE base and context.** A model trained with base 10,000 at 4k context does not read 32k context by changing nothing; the long-context unit covers scaling the base and the position interpolation methods.
- **GQA is not free.** Quality loss is small but measurable at $H_{kv} = 1$ (multi-query); 8 kv heads is the common compromise.
- **Pre-norm and the residual stream.** Because the residual is never normalised, activations grow with depth; final-norm before the head and careful initialisation keep logits in range. Some models add norms on the queries and keys (QK-norm) for the same reason.
- **The attention FLOP term matters in prefill.** For long prompts the quadratic prefill cost can exceed $2N$ per token; the $2N$ rule is a decoding rule.
`,
        },
        sources: [
            {title: 'Attention Is All You Need', url: 'https://arxiv.org/abs/1706.03762', kind: 'paper', year: 2017},
            {title: 'RoFormer: Enhanced Transformer with Rotary Position Embedding', url: 'https://arxiv.org/abs/2104.09864', kind: 'paper', year: 2021},
            {title: 'GLU Variants Improve Transformer', url: 'https://arxiv.org/abs/2002.05202', kind: 'paper', year: 2020},
            {title: 'Root Mean Square Layer Normalization', url: 'https://arxiv.org/abs/1910.07467', kind: 'paper', year: 2019},
            {title: 'GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints', url: 'https://arxiv.org/abs/2305.13245', kind: 'paper', year: 2023},
            {title: 'The Llama 3 Herd of Models', url: 'https://arxiv.org/abs/2407.21783', kind: 'paper', year: 2024, note: 'Section 3 states the shapes used in this unit.'},
            {title: 'Scaling Laws for Neural Language Models', url: 'https://arxiv.org/abs/2001.08361', kind: 'paper', year: 2020, note: 'Appendix: the 6ND and 2N accounting.'},
        ],
        cards: [
            {id: 'ml-transformer-internals/pre-norm', front: 'Why do modern blocks normalise the sub-layer input rather than the residual sum?', back: 'Pre-norm leaves the residual stream untouched, so gradients flow through the identity path and deep stacks train without the warm-up and learning-rate care post-norm needs. The cost is that activations grow with depth, handled by a final norm (and sometimes QK-norm).', tags: ['norm']},
            {id: 'ml-transformer-internals/rope', front: 'What property of RoPE makes attention scores depend on relative position?', back: 'Rotations compose: $\\langle R_m q, R_n k\\rangle = \\langle q, R_{n-m} k\\rangle$, so a query at $m$ and a key at $n$ interact through $n - m$ only.', tags: ['rope']},
            {id: 'ml-transformer-internals/swiglu-width', front: 'Why is a SwiGLU hidden width about $\\tfrac{8}{3} d$ rather than $4d$?', back: 'SwiGLU has three matrices ($3 d\\, d_{ff}$ parameters); matching a ReLU MLP\'s $8d^2$ gives $d_{ff} = \\tfrac{8}{3}d$, rounded to a multiple of 256 — hence 14,336 beside 4,096.', tags: ['ffn']},
            {id: 'ml-transformer-internals/gqa', front: 'What does grouped-query attention change and what does it save?', back: 'Several query heads share one key–value head. The KV cache per token per layer is $2 H_{kv} d_h$, so $H_{kv} = H/8$ cuts it eight-fold at a small quality cost.', tags: ['gqa', 'kv-cache']},
            {id: 'ml-transformer-internals/6nd', front: 'Where does $6ND$ come from?', back: 'A matmul of an activation by a $d \\times k$ weight costs $2 d k$ per token (multiply and add), so a forward pass is about $2N$ FLOPs per token; the backward pass is about twice that; over $D$ tokens: $6ND$.', tags: ['flops']},
            {id: 'ml-transformer-internals/decode-cost', front: 'What is the per-token inference cost rule, and when does it fail?', back: 'About $2N$ FLOPs per generated token. It ignores attention over the cache, which is small while decoding but quadratic in prompt length during prefill, so long prompts break the rule.', tags: ['flops', 'inference']},
            {id: 'ml-transformer-internals/rmsnorm', front: 'How does RMSNorm differ from LayerNorm?', back: 'It drops mean-centering and divides by the root mean square of the vector only, then scales by a learned gain: cheaper, and empirically equivalent in transformers.', tags: ['norm']},
        ],
        problems: [
            {
                id: 'ml-transformer-internals/p1',
                kind: 'quant',
                title: 'Parameters in one block',
                statement: md`
A block has $d = 4096$, $H = 32$ query heads of size $d_h = 128$, $H_{kv} = 8$ key–value heads, and a SwiGLU feed-forward layer with $d_{ff} = 14{,}336$. No biases; ignore the two RMSNorm gains.

1. How many parameters are in the feed-forward layer?
2. How many in the attention projections?
3. For 32 such blocks, what is the non-embedding parameter count, and roughly what does one training token cost in FLOPs?

Give the first answer as an integer.
`,
                hints: ['SwiGLU has three matrices: two of shape $d \\times d_{ff}$ and one of $d_{ff} \\times d$.', '$W_Q$ and $W_O$ are $d \\times H d_h$; $W_K$ and $W_V$ are $d \\times H_{kv} d_h$.'],
                solution: md`
1. $3 \cdot 4096 \cdot 14336 = 176{,}160{,}768$.
2. $W_Q$: $4096 \cdot 4096 = 16{,}777{,}216$; $W_O$ the same; $W_K$ and $W_V$: $4096 \cdot 1024 = 4{,}194{,}304$ each. Total $41{,}943{,}040$.
3. Per block $218{,}103{,}808$; 32 blocks give $6.98 \times 10^9$ — the "8B" model's 7.0B of non-embedding weights (the 128k-token embedding and output head add the rest). One training token costs about $6N \approx 4.2 \times 10^{10}$ FLOPs, so 15 trillion tokens is about $6.3 \times 10^{23}$ FLOPs.
`,
                answer: '176160768',
            },
        ],
    },
    {
        id: 'ml-scaling-laws-data',
        track: 'ml',
        title: 'Scaling laws and data: Chinchilla, overtraining for inference, mixtures, repetition',
        oneLiner: 'Model size against tokens against inference load is where the money goes; overtrained small models follow directly.',
        readingMinutes: 24,
        sections: {
            idea: md`
A scaling law is an empirical fit of loss against the quantities you can buy: parameters $N$, training tokens $D$ and compute $C \approx 6ND$. Kaplan et al. (2020) found smooth power laws in each and concluded that, for a fixed compute budget, parameters should grow faster than data. Hoffmann et al. (2022, "Chinchilla") redid the experiments with the learning-rate schedule matched to each run length and found the opposite balance: at the compute-optimal point, parameters and tokens should scale *together*, about twenty tokens per parameter. A 70B model trained on 1.4 trillion tokens outperformed a 280B model trained on 300 billion at the same compute.

Compute-optimal is the right question only if the model is trained once and never run. Inference cost is $2N$ per token for the life of the model, so a lab that will serve a model trillions of times prefers a *smaller* model trained on *more* tokens than Chinchilla prescribes — "overtraining". The Llama 3 8B model saw about 15 trillion tokens, nearly 1,900 per parameter; its training was far from compute-optimal and its serving cost is a fraction of a Chinchilla-optimal model of equal quality. The trade is explicit: spend more on training once, save on every query.

Two data questions follow. First, **what the tokens are**: the mixture of web text, code, mathematics, books and synthetic data changes the exponent of the law, and most of the capability differences between models of equal size are mixture differences (plus filtering). Second, **what happens when data runs out**: Muennighoff et al. (2023) measured that repeating a dataset for up to about four epochs costs little relative to fresh data, after which returns fall sharply; synthetic data and code help, but the stock of high-quality public text is a real constraint that the frontier has already met. Data curation — deduplication, quality classifiers, decontamination — moved from preprocessing to the centre of the recipe.
`,
            maths: md`
**The Chinchilla parametric fit.** Loss as a function of parameters and tokens:

$$L(N, D) = E + \frac{A}{N^{\alpha}} + \frac{B}{D^{\beta}},$$

with fitted $E \approx 1.69$, $A \approx 406.4$, $B \approx 410.7$, $\alpha \approx 0.34$, $\beta \approx 0.28$ (natural-log loss on their data). $E$ is the irreducible entropy of the text; the two terms are the finite-size and finite-data penalties.

**Compute-optimal allocation.** Minimising $L$ subject to $C = 6ND$ gives

$$N_{\text{opt}}(C) \propto C^{a}, \quad D_{\text{opt}}(C) \propto C^{b}, \qquad a = \frac{\beta}{\alpha+\beta}, \; b = \frac{\alpha}{\alpha+\beta},$$

and with the fitted exponents $a \approx b \approx 0.5$: double the compute, scale both the model and the data by $\sqrt{2}$. The resulting ratio $D/N \approx 20$ is the "twenty tokens per parameter" rule.

**Inference-aware allocation.** If the model will be served for $D_{\text{inf}}$ tokens, total cost is

$$C_{\text{total}} = 6ND + 2N D_{\text{inf}},$$

and the optimum shifts to smaller $N$ and larger $D$ as $D_{\text{inf}}$ grows. Setting a target loss $L^{*}$ and minimising $C_{\text{total}}$ over the iso-loss curve $L(N, D) = L^{*}$ gives the overtraining ratio; for serving volumes in the trillions, ratios of 100 to 2,000 tokens per parameter come out, which is where the small-model-many-tokens recipes sit.

**Repetition.** With $D$ unique tokens repeated so the model sees $D_{\text{seen}}$ tokens, the data term is replaced by an effective count

$$D' = D + D\,\big(1 - e^{-(D_{\text{seen}} - D)/(R^{*} D)}\big),$$

with a fitted decay constant $R^{*} \approx 15$: the first few repetitions count almost fully, and the effective data saturates near $2D$ however many epochs run. (Muennighoff et al. fit the same form for parameters: beyond a point, extra parameters on repeated data are wasted too.)
`,
            code: md`
The fit as a function, and the two optimisation questions solved numerically: compute-optimal, and inference-aware for a serving budget.

\`\`\`python
import numpy as np
from scipy.optimize import minimize_scalar

E, A, B, alpha, beta = 1.69, 406.4, 410.7, 0.34, 0.28

def loss(N, D):                       # Chinchilla's parametric form (natural-log units)
    return E + A / N**alpha + B / D**beta

def compute_optimal(C):               # minimise loss at fixed training compute C = 6 N D
    f = lambda logN: loss(np.exp(logN), C / (6 * np.exp(logN)))
    r = minimize_scalar(f, bounds=(np.log(1e6), np.log(1e13)), method="bounded")
    N = np.exp(r.x); return N, C / (6 * N)

def cheapest_at_loss(L_target, D_inf):   # minimise 6ND + 2N·D_inf on the iso-loss curve
    def D_for(N):                     # solve loss(N, D) = L_target for D
        rem = L_target - E - A / N**alpha
        return np.inf if rem <= 0 else (B / rem) ** (1 / beta)
    f = lambda logN: 6 * np.exp(logN) * D_for(np.exp(logN)) + 2 * np.exp(logN) * D_inf
    r = minimize_scalar(f, bounds=(np.log(1e8), np.log(1e12)), method="bounded")
    N = np.exp(r.x); return N, D_for(N)

N, D = compute_optimal(5.76e23)         # Chinchilla's budget
print(f"compute-optimal: N={N:.3g} D={D:.3g} D/N={D/N:.0f}")   # ≈ 70B, 1.4T, 20
N2, D2 = cheapest_at_loss(loss(N, D), D_inf=5e13)             # serve 50T tokens at the same loss
print(f"inference-aware: N={N2:.3g} D={D2:.3g} D/N={D2/N2:.0f}")  # smaller model, far more tokens
\`\`\`

Run it and move \`D_inf\`: the optimal model shrinks and the token ratio climbs into the hundreds as serving volume grows. That curve is the business case for every small overtrained model.
`,
            whyNow: md`
The public frontier moved from "bigger models" to "more and better tokens per parameter" between 2023 and 2025, and the reasons are all in this unit: inference cost dominates once a model is popular, the stock of high-quality text is finite, and the Chinchilla exponents say data and parameters are near-interchangeable at the optimum. Synthetic data (rephrased web text, model-written code and solutions, verified reasoning traces) is the lever now, and its scaling behaviour — whether it extends the law or collapses it — is the open empirical question, with evidence on both sides.

A second reason to know the arithmetic: scaling laws are now fit for post-training too (reward-model data, RL compute, test-time compute), and the same parametric forms appear in those papers. Reading them critically requires knowing what a fitted exponent can and cannot support.
`,
            pitfalls: md`
- **Kaplan versus Chinchilla is a schedule artefact.** Kaplan's runs used a cosine schedule longer than the run, which under-trains small models; matched schedules changed the conclusion. Any scaling study must state its schedule.
- **Loss is not capability.** Downstream metrics can be flat then jump ("emergence") while loss moves smoothly; the jumps are often metric artefacts (exact-match scoring), but extrapolating loss to a benchmark is still a guess.
- **Fitted constants are dataset-specific.** $E$, $A$, $B$ and the exponents change with the mixture and tokenizer; the 20-tokens-per-parameter rule is a property of their data, not a law of nature.
- **FLOPs are not dollars.** Hardware utilisation, memory bandwidth and the $2N$ rule's blindness to long contexts separate compute from cost.
- **Repetition is fine until it is not.** Four epochs of good data are close to free; forty are not, and quality classifiers that discard too aggressively push you into repetition sooner.
- **Decontamination is part of the data pipeline.** A benchmark seen in pretraining is measured, not learned; the evals unit covers the detection methods.
`,
        },
        sources: [
            {title: 'Scaling Laws for Neural Language Models', url: 'https://arxiv.org/abs/2001.08361', kind: 'paper', year: 2020},
            {title: 'Training Compute-Optimal Large Language Models (Chinchilla)', url: 'https://arxiv.org/abs/2203.15556', kind: 'paper', year: 2022},
            {title: 'Scaling Data-Constrained Language Models', url: 'https://arxiv.org/abs/2305.16264', kind: 'paper', year: 2023},
            {title: 'Beyond Chinchilla-Optimal: Accounting for Inference in Language Model Scaling Laws', url: 'https://arxiv.org/abs/2401.00448', kind: 'paper', year: 2023},
            {title: 'The Llama 3 Herd of Models', url: 'https://arxiv.org/abs/2407.21783', kind: 'paper', year: 2024, note: '8B at ~15T tokens: overtraining in production.'},
            {title: 'DataComp-LM: In search of the next generation of training sets for language models', url: 'https://arxiv.org/abs/2406.11794', kind: 'paper', year: 2024, note: 'What filtering and mixture choices are worth, measured.'},
        ],
        cards: [
            {id: 'ml-scaling-laws-data/chinchilla-rule', front: 'What is the Chinchilla compute-optimal balance, and what ratio follows from it?', back: 'Parameters and tokens scale together, each as about $C^{0.5}$; about twenty tokens per parameter at the optimum.', tags: ['scaling']},
            {id: 'ml-scaling-laws-data/kaplan-vs-chinchilla', front: 'Why did Kaplan et al. and Hoffmann et al. reach different allocations?', back: 'Kaplan\'s runs used a cosine schedule longer than the run, which under-trains small models and favours parameters; Chinchilla matched the schedule to each run length and found data equally important.', tags: ['scaling', 'method']},
            {id: 'ml-scaling-laws-data/parametric', front: 'Write the Chinchilla parametric loss and name its three terms.', back: '$L(N,D) = E + A/N^{\\alpha} + B/D^{\\beta}$: the irreducible entropy $E$, the finite-model penalty $A/N^{\\alpha}$ and the finite-data penalty $B/D^{\\beta}$.', tags: ['scaling']},
            {id: 'ml-scaling-laws-data/overtraining', front: 'Why do production models train far past compute-optimal?', back: 'Serving costs $2N$ per token for the model\'s life; minimising $6ND + 2N D_{\\text{inf}}$ at fixed quality favours a smaller model on more tokens as serving volume grows — hundreds to thousands of tokens per parameter.', tags: ['inference', 'scaling']},
            {id: 'ml-scaling-laws-data/repetition', front: 'How much does repeating training data cost, and where is the cliff?', back: 'Up to about four epochs the loss is close to fresh-data loss; past that, the effective data saturates near twice the unique count ($D^{\\prime}$ with decay $R^{*} \\approx 15$) and returns fall sharply.', tags: ['data']},
            {id: 'ml-scaling-laws-data/loss-vs-capability', front: 'Why is a smooth scaling law not a prediction of a benchmark score?', back: 'Downstream metrics can stay flat and then jump while loss moves smoothly — often an artefact of exact-match scoring — so loss extrapolates, capability does not.', tags: ['eval']},
            {id: 'ml-scaling-laws-data/mixture', front: 'What changes a scaling law\'s exponent more than architecture does?', back: 'The data mixture and its filtering: web, code, maths, books and synthetic shares, deduplication and quality classifiers. Most differences between equal-size models are mixture differences.', tags: ['data']},
        ],
        problems: [
            {
                id: 'ml-scaling-laws-data/p1',
                kind: 'quant',
                title: 'A Chinchilla budget',
                statement: md`
Using $C \approx 6ND$ and the twenty-tokens-per-parameter rule:

1. How many tokens should a compute-optimal 70-billion-parameter model train on?
2. How many FLOPs does that training run cost?
3. A lab instead trains an 8-billion-parameter model on 15 trillion tokens. How many FLOPs does it spend, and how does that compare with the compute-optimal run for 8B?

Give the second answer in FLOPs.
`,
                hints: ['$D = 20N$ at the optimum.', '$6 \\times 70 \\times 10^{9} \\times 1.4 \\times 10^{12}$.'],
                solution: md`
1. $D = 20 \times 70 \times 10^9 = 1.4 \times 10^{12}$ tokens.
2. $C = 6 \times 70 \times 10^9 \times 1.4 \times 10^{12} = 5.88 \times 10^{23}$ FLOPs — Chinchilla's own budget.
3. $6 \times 8 \times 10^9 \times 15 \times 10^{12} = 7.2 \times 10^{23}$ FLOPs: more compute than the 70B run, on a model a ninth the size. Compute-optimal for 8B would be $160$ billion tokens and $7.7 \times 10^{21}$ FLOPs; the lab spent about $94\times$ that, buying a model that costs $2 \times 8 \times 10^9$ FLOPs per served token instead of $1.4 \times 10^{11}$. At tens of trillions of served tokens the extra training pays for itself many times over.
`,
                answer: '5.88e23',
                tolerance: 1.5e22,
                unit: 'FLOPs',
            },
        ],
    },
    {
        id: 'ml-moe',
        track: 'ml',
        title: 'Mixture of experts: routing, load balancing, fine-grained and shared experts',
        oneLiner: 'Frontier open models are MoE; capacity and per-token cost came apart.',
        readingMinutes: 23,
        sections: {
            idea: md`
A mixture-of-experts layer replaces the dense feed-forward network with $E$ parallel feed-forward "experts" and a router that sends each token to a few of them. The parameters grow $E$-fold; the compute per token grows only with the number of experts activated, $k$. A model can therefore hold hundreds of billions of parameters while costing, per token, what a dense model a tenth the size costs. Switch Transformer (2021) made $k = 1$ routing work at scale; Mixtral (2023) showed an open 8-expert, top-2 model matching much larger dense ones; DeepSeek-V3 (2024) scaled to 256 fine-grained experts with 8 active plus a shared expert, 671 billion total parameters with 37 billion active.

Three problems define the engineering. **Load balance**: a router left alone sends most tokens to a few experts, which wastes the rest and overflows the busy ones. The classical fix is an auxiliary loss that pushes the fraction of tokens and the mean router probability per expert toward uniform; DeepSeek-V3 replaced it with a per-expert bias adjusted online — raise the bias of under-used experts, lower it for over-used — so no loss term fights the language-modelling objective. **Capacity**: on hardware, each expert processes a fixed-size buffer per batch; tokens beyond an expert's capacity are dropped (pass through the residual untouched) or re-routed. **Communication**: experts live on different devices, so every MoE layer is an all-to-all exchange of token activations across the cluster, and expert parallelism joins data, tensor and pipeline parallelism in the training layout.

Two design moves changed the frontier. **Fine-grained experts** split each expert into several smaller ones and activate proportionally more of them: at the same active parameter count, the number of possible expert combinations explodes, and the model specialises better. **Shared experts** are always-on experts every token passes through, carrying common knowledge so the routed experts can specialise. Together they are the DeepSeekMoE recipe that the largest open models use.
`,
            maths: md`
**Routing.** For a token $x \in \mathbb{R}^{d}$ the router computes logits $s = W_r x \in \mathbb{R}^{E}$ and gates

$$g_i = \begin{cases}\operatorname{softmax}(s)_i & i \in \operatorname{TopK}(s, k)\\ 0 & \text{otherwise}\end{cases}, \qquad y = x + \sum_{i=1}^{E} g_i\,\operatorname{FFN}_i(x),$$

with the softmax taken over all $E$ logits (Switch, Mixtral) or renormalised over the chosen $k$ (DeepSeek). The gate values are differentiable, so the router learns through the weighted sum even though the selection is discrete.

**Active parameters.** With $E$ experts of $P_e$ parameters each, attention parameters $P_a$ per layer, $S$ shared experts and $k$ routed experts active:

$$P_{\text{total}} = n_{\text{layers}}\,(P_a + (E + S) P_e), \qquad P_{\text{active}} = n_{\text{layers}}\,(P_a + (k + S) P_e).$$

Per-token FLOPs follow $2 P_{\text{active}}$, not $2 P_{\text{total}}$; memory follows $P_{\text{total}}$.

**The auxiliary balance loss** (Switch). For a batch of $T$ tokens, with $f_i$ the fraction of tokens routed to expert $i$ and $p_i$ the mean router probability of expert $i$:

$$\mathcal{L}_{\text{aux}} = \alpha\, E \sum_{i=1}^{E} f_i\, p_i .$$

Under uniform routing $f_i = p_i = 1/E$ and the loss is $\alpha$; concentration raises it. $f_i$ is not differentiable, $p_i$ is, so the gradient flows through the probabilities.

**Auxiliary-loss-free balancing** (DeepSeek-V3). Selection uses biased scores $s_i + b_i$ while the gate values use the unbiased $s_i$; after each step,

$$b_i \leftarrow b_i - \gamma\,\operatorname{sign}\!\big(\text{load}_i - \overline{\text{load}}\big),$$

so an over-used expert becomes slightly less likely to be selected without changing what it contributes when it is.

**Capacity factor.** Each expert accepts at most $\lceil \phi\, kT / E\rceil$ tokens per batch for capacity factor $\phi$ (typically 1 to 1.25); overflow is dropped to the residual. Larger $\phi$ wastes padding, smaller drops tokens.
`,
            code: md`
A top-$k$ MoE layer with the Switch auxiliary loss, written for clarity rather than for the all-to-all kernels a real implementation needs.

\`\`\`python
import torch, torch.nn as nn, torch.nn.functional as F

class Expert(nn.Module):              # a SwiGLU FFN, as in the dense block
    def __init__(self, d, dff):
        super().__init__(); self.w1, self.w3, self.w2 = nn.Linear(d, dff, bias=False), nn.Linear(d, dff, bias=False), nn.Linear(dff, d, bias=False)
    def forward(self, x): return self.w2(F.silu(self.w1(x)) * self.w3(x))

class MoE(nn.Module):
    def __init__(self, d, dff, n_experts=8, k=2, alpha=0.01):
        super().__init__()
        self.router = nn.Linear(d, n_experts, bias=False)
        self.experts = nn.ModuleList(Expert(d, dff) for _ in range(n_experts))
        self.k, self.alpha = k, alpha

    def forward(self, x):                       # x: (T, d), tokens flattened over the batch
        probs = self.router(x).softmax(-1)      # (T, E)
        topv, topi = probs.topk(self.k, dim=-1) # (T, k)
        y = torch.zeros_like(x)
        for e, expert in enumerate(self.experts):
            rows, slot = (topi == e).nonzero(as_tuple=True)          # tokens that chose expert e
            if rows.numel():
                y[rows] += topv[rows, slot, None] * expert(x[rows])  # gate-weighted contribution
        # Switch-style balance loss: fraction routed (not differentiable) × mean probability (is).
        E = probs.shape[-1]
        f = torch.bincount(topi.flatten(), minlength=E).float() / (x.shape[0] * self.k)
        p = probs.mean(0)
        aux = self.alpha * E * (f * p).sum()
        return x + y, aux

layer = MoE(d=512, dff=1408, n_experts=8, k=2)
out, aux = layer(torch.randn(64, 512))
print(out.shape, float(aux))      # ≈ alpha when balanced
\`\`\`

The loop over experts is the all-to-all in disguise: in a real system \`x[rows]\` is sent to the device that holds expert \`e\` and the result comes back, which is why expert placement and batch size decide MoE throughput.
`,
            whyNow: md`
The largest open models released since 2024 are MoE — Mixtral, DeepSeek-V2 and V3, Qwen3's largest variants, Llama 4 — because routing is the only known way to grow knowledge capacity without growing per-token cost in step. The practical consequences reach deployment: an MoE needs the memory of its total parameters even though it computes like a small model, so it favours many-GPU serving with high batch sizes where the all-to-all is amortised, and it is awkward on a single consumer device. Quantising experts, offloading cold experts, and predicting routing ahead of time are active engineering areas.

The research frontier is routing itself: how many experts a token should see, whether routing should be learned per layer or shared, whether experts should be tiny (fine-grained) and numerous, and how to keep balance without any auxiliary objective. Reading a 2026 model card means checking total versus active parameters, the expert count and granularity, and the balancing method before anything else.
`,
            pitfalls: md`
- **Total and active parameters are different numbers and both matter.** Memory and download size follow total; FLOPs, latency and the $2N$ rule follow active. Benchmarks that compare "parameter counts" across dense and MoE models are comparing different things.
- **Load imbalance is silent.** With dropped tokens a model still trains; quality just degrades. Log per-expert load from day one.
- **The auxiliary loss fights the objective.** A high $\alpha$ balances routing and hurts loss; a low one lets experts collapse. The bias method avoids the trade but needs its own tuning of $\gamma$.
- **Batch size at inference.** With small batches most experts idle and the all-to-all cost dominates; MoE throughput advantages appear at large batch.
- **Fine-tuning MoEs is fragile.** Small fine-tuning sets can collapse routing; freezing the router or using a balance loss during fine-tuning is common.
- **Expert specialisation is weaker than the name suggests.** Experts often split by token statistics (punctuation, code syntax) rather than by topic; do not over-interpret routing maps.
`,
        },
        sources: [
            {title: 'Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity', url: 'https://arxiv.org/abs/2101.03961', kind: 'paper', year: 2021},
            {title: 'GShard: Scaling Giant Models with Conditional Computation and Automatic Sharding', url: 'https://arxiv.org/abs/2006.16668', kind: 'paper', year: 2020},
            {title: 'Mixtral of Experts', url: 'https://arxiv.org/abs/2401.04088', kind: 'paper', year: 2024},
            {title: 'DeepSeekMoE: Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models', url: 'https://arxiv.org/abs/2401.06066', kind: 'paper', year: 2024, note: 'Fine-grained and shared experts.'},
            {title: 'DeepSeek-V3 Technical Report', url: 'https://arxiv.org/abs/2412.19437', kind: 'paper', year: 2024, note: 'Auxiliary-loss-free balancing; 671B total, 37B active.'},
            {title: 'ST-MoE: Designing Stable and Transferable Sparse Expert Models', url: 'https://arxiv.org/abs/2202.08906', kind: 'paper', year: 2022, note: 'Router z-loss and the stability tricks.'},
        ],
        cards: [
            {id: 'ml-moe/active-vs-total', front: 'Which parameter count sets an MoE\'s FLOPs per token, and which its memory?', back: 'Active parameters ($P_a + (k+S)P_e$ per layer) set FLOPs and latency via $2 P_{\\text{active}}$; total parameters ($P_a + (E+S)P_e$) set memory and download size.', tags: ['moe', 'cost']},
            {id: 'ml-moe/why-balance', front: 'What goes wrong with an unregulated router, and what does the Switch auxiliary loss do about it?', back: 'Tokens concentrate on a few experts, wasting the rest and overflowing the busy ones. $\\mathcal{L}_{\\text{aux}} = \\alpha E \\sum_i f_i p_i$ is minimised at uniform routing; the gradient flows through the differentiable mean probabilities $p_i$.', tags: ['moe', 'balance']},
            {id: 'ml-moe/loss-free', front: 'How does DeepSeek-V3 balance experts without an auxiliary loss?', back: 'A per-expert bias is added to the routing scores for selection only and nudged after each step against the expert\'s load ($b_i \\leftarrow b_i - \\gamma\\,\\operatorname{sign}(\\text{load}_i - \\overline{\\text{load}})$); gate values stay unbiased, so balancing never fights the objective.', tags: ['moe', 'balance']},
            {id: 'ml-moe/capacity', front: 'What is the capacity factor, and what happens to tokens beyond it?', back: 'Each expert accepts at most $\\lceil \\phi k T / E \\rceil$ tokens per batch; the rest are dropped to the residual (or re-routed). Larger $\\phi$ pads, smaller drops.', tags: ['moe', 'systems']},
            {id: 'ml-moe/fine-grained', front: 'What do fine-grained experts and a shared expert each buy?', back: 'Fine-grained: split experts into smaller ones and activate more, so the number of expert combinations at a fixed active size explodes and specialisation improves. Shared: always-on experts carry common knowledge so routed experts can specialise.', tags: ['moe', 'deepseekmoe']},
            {id: 'ml-moe/all-to-all', front: 'Why does MoE throughput depend on batch size?', back: 'Every MoE layer is an all-to-all exchange of token activations across the devices holding the experts; at small batch most experts idle and the communication dominates, at large batch it is amortised.', tags: ['moe', 'systems']},
            {id: 'ml-moe/differentiable', front: 'Top-$k$ selection is discrete; how does the router learn?', back: 'Through the gate values: the chosen experts\' outputs are weighted by their softmax probabilities, which are differentiable, so the router receives a gradient from every token it routed.', tags: ['moe', 'routing']},
        ],
        problems: [
            {
                id: 'ml-moe/p1',
                kind: 'quant',
                title: 'Total against active',
                statement: md`
A model has 64 layers. In each layer the attention projections hold 50 million parameters, and the feed-forward layer is a mixture of 8 routed experts of 120 million parameters each with top-2 routing, plus one shared expert of the same size that every token uses.

1. What is the total parameter count (ignoring embeddings)?
2. How many parameters are active per token?
3. What does one generated token cost in FLOPs, by the $2 P_{\text{active}}$ rule?

Give the second answer in billions, to two decimal places.
`,
                hints: ['Per layer, total is $P_a + (E + S)P_e$ and active is $P_a + (k + S)P_e$.', '$k = 2$, $S = 1$, $E = 8$.'],
                solution: md`
1. Per layer: $50 + 9 \times 120 = 1{,}130$ million; 64 layers: $72.32$ billion.
2. Per layer active: $50 + 3 \times 120 = 410$ million; 64 layers: $26.24$ billion.
3. $2 \times 26.24 \times 10^9 \approx 5.2 \times 10^{10}$ FLOPs per token — the cost of a 26B dense model, with the memory footprint of a 72B one. The ratio of total to active, about 2.8 here, reaches 18 in DeepSeek-V3 (671B over 37B) because its experts are fine-grained and only 8 of 256 are active.
`,
                answer: '26.24',
                unit: 'billion parameters',
            },
        ],
    },
];
