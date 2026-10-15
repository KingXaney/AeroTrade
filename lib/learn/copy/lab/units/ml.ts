// The machine-learning track's units, in the plan's order (lib/learn/copy/lab/plan.ts). Written
// for an expert reader; held to the 'lab' tier of lib/learn/banned.ts over their prose.

import {md} from "@/lib/learn/copy/lab/md";
import type {LabUnit} from "@/lib/learn/copy/lab/types";

export const ML_UNITS: readonly LabUnit[] = [
    {
        id: 'ml-transformer-internals',
        track: 'ml',
        quiz: [
            {
                id: 'ml-transformer-internals/q1',
                prompt: 'Why do modern blocks normalise the sub-layer input rather than the residual sum?',
                options: ['The residual stream stays untouched, so gradients flow through the identity path', 'It halves the parameters', 'It removes the need for attention', 'It makes RoPE unnecessary'],
                answer: 0,
                why: 'Deep stacks then train without the warm-up and learning-rate care post-norm needs.',
            },
            {
                id: 'ml-transformer-internals/q2',
                prompt: 'What property of RoPE makes attention scores depend on relative position?',
                options: ['Absolute sinusoids are added', 'Rotations compose: $\\langle R_m q, R_n k\\rangle = \\langle q, R_{n-m} k\\rangle$', 'A learned bias per distance', 'Positions are clipped'],
                answer: 1,
                why: 'A query at $m$ and a key at $n$ interact through $n - m$ only.',
            },
            {
                id: 'ml-transformer-internals/q3',
                prompt: 'Why is a SwiGLU hidden width about $\\tfrac{8}{3} d$ rather than $4d$?',
                options: ['The vocabulary size', 'The number of heads', 'Three matrices must match a ReLU MLP\'s $8d^2$ parameters', 'The GPU tile size'],
                answer: 2,
                why: '$3 d\\, d_{ff} = 8d^2$ gives $d_{ff} = \\tfrac{8}{3}d$, rounded to a multiple of 256.',
            },
            {
                id: 'ml-transformer-internals/q4',
                prompt: 'Where does the $6ND$ training-cost rule come from?',
                options: ['Six layers times $N$ times $D$', 'The memory in bytes', 'The attention cost', 'About $2N$ FLOPs per token forward and twice that backward, over $D$ tokens'],
                answer: 3,
                why: 'A matmul by a $d \\times k$ weight costs $2dk$ per token.',
            },
        ],
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
        quiz: [
            {
                id: 'ml-scaling-laws-data/q1',
                prompt: 'What ratio follows from the Chinchilla compute-optimal balance?',
                options: ['About twenty tokens per parameter', 'About one token per parameter', 'About two hundred tokens per parameter', 'About two thousand tokens per parameter'],
                answer: 0,
                why: 'Parameters and tokens scale together, each as about $C^{0.5}$.',
            },
            {
                id: 'ml-scaling-laws-data/q2',
                prompt: 'Why did Kaplan et al. and Hoffmann et al. reach different allocations?',
                options: ['Kaplan counted the embeddings', 'Kaplan\'s cosine schedule was longer than the run, which under-trains small models', 'Different tokenizers alone', 'Hoffmann used fewer GPUs'],
                answer: 1,
                why: 'Matching the schedule to each run length made data as important as parameters.',
            },
            {
                id: 'ml-scaling-laws-data/q3',
                prompt: 'Why do production models train far past compute-optimal?',
                options: ['Larger models train slower', 'Loss curves are noisy', 'Serving costs $2N$ per token for the model\'s life, so a smaller model on more tokens wins', 'Data is free'],
                answer: 2,
                why: 'Minimising $6ND + 2N D_{inf}$ at fixed quality favours hundreds of tokens per parameter.',
            },
            {
                id: 'ml-scaling-laws-data/q4',
                prompt: 'What does repeating training data cost?',
                options: ['Nothing, at any count', 'Everything past one epoch', 'It doubles the loss', 'Little up to about four epochs, then returns fall sharply'],
                answer: 3,
                why: 'Past four epochs the effective data saturates near twice the unique count.',
            },
        ],
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
        quiz: [
            {
                id: 'ml-moe/q1',
                prompt: 'Which parameter count sets an MoE\'s FLOPs per token?',
                options: ['The active parameters', 'The total parameters', 'The number of experts', 'The router\'s size'],
                answer: 0,
                why: 'FLOPs and latency follow $2 P_{active}$; memory and download size follow the total.',
            },
            {
                id: 'ml-moe/q2',
                prompt: 'What does the Switch auxiliary loss do?',
                options: ['Shrinks the vocabulary', 'Pushes routing toward a uniform load through the differentiable mean probabilities', 'Trains the experts\' biases', 'Adds dropout to the experts'],
                answer: 1,
                why: '$\\mathcal{L}_{aux} = \\alpha E \\sum_i f_i p_i$ is minimised at uniform routing.',
            },
            {
                id: 'ml-moe/q3',
                prompt: 'How does DeepSeek-V3 balance experts without an auxiliary loss?',
                options: ['Dropping half the tokens', 'Sharing every expert', 'A per-expert bias on the selection scores, nudged against load, with unbiased gate values', 'A larger auxiliary loss'],
                answer: 2,
                why: 'Balancing then never fights the objective.',
            },
            {
                id: 'ml-moe/q4',
                prompt: 'Why does MoE throughput depend on batch size?',
                options: ['Experts live on disk', 'The router is slow', 'Small batches overflow memory', 'Each MoE layer is an all-to-all exchange, amortised only at large batch'],
                answer: 3,
                why: 'At small batch most experts idle and the communication dominates.',
            },
        ],
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
    {
        id: 'ml-long-context-attention',
        track: 'ml',
        quiz: [
            {
                id: 'ml-long-context-attention/q1',
                prompt: 'What does FlashAttention change?',
                options: ['The memory traffic — tiling, an online softmax, recomputation — and not the function', 'The attention function, to an approximation', 'The model\'s parameters', 'The sequence-length cap'],
                answer: 0,
                why: 'Attention stays exact; the gains are largest at long sequences and small head dimensions.',
            },
            {
                id: 'ml-long-context-attention/q2',
                prompt: 'What is the KV-cache size per token, in bytes?',
                options: ['$N d$', '$2 L H_{kv} d_h b$', '$L d b$', '$2 H d_h$'],
                answer: 1,
                why: 'Keys and values, every layer, every KV head; GQA divides it by the group size.',
            },
            {
                id: 'ml-long-context-attention/q3',
                prompt: 'How does multi-head latent attention avoid reconstructing keys at decode time?',
                options: ['It drops half the heads', 'It recomputes attention from scratch', 'It caches a low-rank latent and absorbs the key up-projection into the query', 'It stores full keys in fp8'],
                answer: 2,
                why: '$q^\\top W_{UK} c_t = (W_{UK}^\\top q)^\\top c_t$, so attention runs over the latents.',
            },
            {
                id: 'ml-long-context-attention/q4',
                prompt: 'What does NTK-aware RoPE scaling do?',
                options: ['Rescales every position equally', 'Removes position entirely', 'Trains a new embedding table', 'Raises the base so slow frequencies stretch and fast ones barely move'],
                answer: 3,
                why: 'Plain interpolation loses short-range resolution; YaRN interpolates per frequency with a ramp.',
            },
        ],
        title: 'Attention variants and long context: FlashAttention, MQA/GQA/MLA, RoPE extension',
        oneLiner: 'Context length is a memory-bandwidth problem; the KV cache, not FLOPs, is the limit.',
        readingMinutes: 28,
        prerequisites: ['ml-transformer-internals'],
        sections: {
            idea: md`
Three separate problems hide under the words "long context", and each has its own fix. The first is **training and prefill compute**: attention materialises an $N \times N$ score matrix per head, so at $N$ in the hundreds of thousands the quadratic term dominates and the matrix does not fit in memory. **FlashAttention** does not change the arithmetic; it changes the order of it. By tiling the query, key and value matrices into blocks that fit in on-chip SRAM, computing the softmax incrementally with a running maximum and running sum (the *online softmax* trick), and never writing the score matrix to high-bandwidth memory, it turns a memory-bound kernel into a compute-bound one. FlashAttention-2 reorders the loops and parallelises across the sequence; FlashAttention-3 overlaps the matrix multiplies with the softmax on Hopper's asynchronous units and uses FP8. Exact attention, two to four times faster, and the memory of the score matrix gone.

The second problem is **decoding memory**. Generating one token requires reading every cached key and value of every previous token in every layer — the **KV cache** — and that read, not the arithmetic, sets the time per token and the number of concurrent sequences a GPU can hold. **Multi-query attention** shares one key and value head across all query heads; **grouped-query attention** shares a key/value head among a group of query heads (8 KV heads for 64 query heads in the Llama family), cutting the cache by the group size at almost no quality cost. DeepSeek's **multi-head latent attention** goes further: it caches a low-rank latent vector per token from which keys and values are reconstructed on the fly, with the up-projection folded into the query and output weights so no extra multiply is paid at decode; the cache shrinks by roughly an order of magnitude against full multi-head attention while keeping per-head expressivity.

The third problem is **position**. Rotary position embedding (RoPE) rotates each pair of channels in a query and key by an angle proportional to the token's position, so the dot product depends on the relative offset; the rotation frequencies form a geometric series, from fast (local order) to slow (long-range). A model trained to 8k positions has never seen the slow frequencies rotate far, and at 32k the attention logits for distant pairs are out of distribution. **Position interpolation** rescales positions into the trained range (losing resolution on short-range frequencies); **NTK-aware** scaling changes the base of the geometric series so slow frequencies stretch and fast ones do not; **YaRN** combines a per-frequency interpolation ramp with a temperature on the attention logits and extends to 128k with a few hundred fine-tuning steps. Beyond that, **ring attention** shards the sequence across devices and passes key/value blocks around a ring so each device computes its queries' attention over the whole sequence with memory proportional to its own shard.
`,
            maths: md`
**Online softmax.** For a query row with scores $s_1, \dots, s_N$ processed in blocks, keep the running maximum $m$ and running denominator $\ell$. On a new block with scores $s_{(b)}$ and values $V_{(b)}$:

$$m' = \max(m, \max s_{(b)}), \qquad \ell' = e^{\,m - m'}\,\ell + \sum_j e^{\,s_{(b),j} - m'}, \qquad o' = e^{\,m - m'}\, o + \sum_j e^{\,s_{(b),j} - m'}\, V_{(b),j},$$

and the output is $o / \ell$ at the end. Each block is a rescale of the running state plus a local softmax; nothing of size $N \times N$ is ever stored. The backward pass recomputes the block scores from $Q$, $K$ and the saved $(m, \ell)$ rather than reading a stored score matrix.

**KV cache size.** Per token, with $L$ layers, $H_{kv}$ key/value heads of dimension $d_h$, two tensors (keys and values) and $b$ bytes per element:

$$\text{bytes per token} = 2\, L\, H_{kv}\, d_h\, b,$$

and a context of $N$ tokens holds $N$ times that. GQA with a group size $g = H_q / H_{kv}$ divides the cache by $g$ relative to MHA. For MLA with latent dimension $d_c$ (plus a small decoupled RoPE key of dimension $d_r$), the cache is $L\,(d_c + d_r)\, b$ per token — one vector per layer, independent of the head count.

**Multi-head latent attention.** The latent $c_t = W_{DKV}\, h_t \in \mathbb{R}^{d_c}$ is cached; keys and values are $k_t = W_{UK}\, c_t$ and $v_t = W_{UV}\, c_t$. Since $q^{\top} k_t = q^{\top} W_{UK}\, c_t = (W_{UK}^{\top} q)^{\top} c_t$, the up-projection is absorbed into the query side, and likewise $W_{UV}$ into the output projection, so decoding attends directly over the cached latents. RoPE does not commute with $W_{UK}$, which is why a separate small rotary key is kept.

**RoPE and its extension.** For channel pair $i$ with base frequency $\theta_i = \beta^{-2i/d}$ (base $\beta = 10{,}000$ originally), a token at position $p$ is rotated by $p\,\theta_i$, and $q_m^{\top} k_n$ depends on $(m - n)\,\theta_i$ only. Position interpolation maps $p \mapsto p / s$ for a scale $s = N_{\text{new}} / N_{\text{train}}$. NTK-aware scaling instead sets $\beta' = \beta\, s^{\,d/(d-2)}$, so the slowest frequency stretches by $s$ and the fastest barely moves. YaRN interpolates per frequency with a ramp $\gamma(r)$ on the wavelength ratio $r$ — full interpolation for long wavelengths, none for short — and scales the logits by $\sqrt{1/t}$ with $t = 0.1 \ln s + 1$ to keep the attention entropy near its trained value.
`,
            code: md`
The two things worth having in your hands: the online-softmax recurrence as a plain loop over key blocks, and the KV-cache arithmetic for a given model shape.

\`\`\`python
import torch

def attention_blocked(q, K, V, block=256):
    # q: (d,), K, V: (N, d). Exact softmax attention without an N-vector of scores in memory.
    m = torch.tensor(float("-inf")); l = torch.tensor(0.0); o = torch.zeros_like(q)
    scale = q.shape[-1] ** -0.5
    for start in range(0, K.shape[0], block):
        s = (K[start:start + block] @ q) * scale          # scores of this block only
        m_new = torch.maximum(m, s.max())
        p = torch.exp(s - m_new)
        l = torch.exp(m - m_new) * l + p.sum()
        o = torch.exp(m - m_new) * o + p @ V[start:start + block]
        m = m_new
    return o / l

def kv_cache_bytes(layers, kv_heads, head_dim, tokens, bytes_per=2):
    return 2 * layers * kv_heads * head_dim * bytes_per * tokens   # keys and values

# A 70B-class shape: 80 layers, 8 KV heads (GQA over 64 query heads), head dim 128, fp16.
per_token = kv_cache_bytes(80, 8, 128, 1)                 # 327,680 bytes
at_128k = kv_cache_bytes(80, 8, 128, 128 * 1024) / 2**30  # about 40 GiB for one sequence
mha_equiv = kv_cache_bytes(80, 64, 128, 128 * 1024) / 2**30   # 320 GiB without GQA
\`\`\`

Check it against a direct softmax on a small $N$; the recurrence is exact, and the rescaling factors $e^{m - m'}$ are what make it so.
`,
            whyNow: md`
Context windows went from 4k to 128k as a product default and to a million tokens in the frontier within two years, and every step was one of these three fixes rather than a new attention. Serving economics now turn on the KV cache: it decides how many requests share a GPU, it is what prefix caching and paged attention manage (the inference unit), and the choice between GQA and MLA is a choice about the memory bill of every deployed model. The DeepSeek-V2 and V3 reports made MLA the reference design for cache-efficient attention at scale.

Length extension became a post-training step rather than a pretraining choice: a base model trained at 8k or 32k is extended with YaRN-style scaling and a short continued-pretraining run on long documents, then evaluated on needle-in-a-haystack and on RULER-style tasks whose difficulty grows with length. The honest finding of those evaluations is that an advertised context length and an *effective* one differ, often by a factor of two or more, and that "lost in the middle" degradation persists after extension.
`,
            pitfalls: md`
- **FlashAttention is exact.** Confusing it with sparse or approximate attention leads to wrong expectations; it changes memory traffic, not the function. Its gains are largest at long sequences and small head dimensions.
- **The cache, not the weights.** At long context a 70B model's single-sequence KV cache can exceed its weights; a serving plan that budgets weights only will OOM at the first long prompt.
- **Extension without fine-tuning.** NTK and YaRN scaling run zero-shot but degrade perplexity; a few hundred steps on long documents recover most of it. Position interpolation alone hurts short-range resolution.
- **RoPE and MLA.** The rotary rotation does not commute with the latent up-projection; the decoupled rotary key is not optional, and omitting it silently breaks relative position.
- **Effective context.** Needle retrieval at 128k says nothing about reasoning over 128k; use multi-hop and aggregation tasks (RULER, LongBench) and expect a cliff well below the advertised length.
- **Numerics.** FP8 attention (FlashAttention-3) needs block-wise scaling of $Q$ and $K$; naive casting produces softmax overflow at long range where scores are largest.
`,
        },
        sources: [
            {title: 'FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness', url: 'https://arxiv.org/abs/2205.14135', kind: 'paper', year: 2022},
            {title: 'FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision', url: 'https://arxiv.org/abs/2407.08608', kind: 'paper', year: 2024},
            {title: 'Fast Transformer Decoding: One Write-Head is All You Need (MQA)', url: 'https://arxiv.org/abs/1911.02150', kind: 'paper', year: 2019},
            {title: 'GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints', url: 'https://arxiv.org/abs/2305.13245', kind: 'paper', year: 2023},
            {title: 'DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model', url: 'https://arxiv.org/abs/2405.04434', kind: 'paper', year: 2024, note: 'Multi-head latent attention, section 2.1.'},
            {title: 'RoFormer: Enhanced Transformer with Rotary Position Embedding', url: 'https://arxiv.org/abs/2104.09864', kind: 'paper', year: 2021},
            {title: 'YaRN: Efficient Context Window Extension of Large Language Models', url: 'https://arxiv.org/abs/2309.00071', kind: 'paper', year: 2023},
            {title: 'Ring Attention with Blockwise Transformers for Near-Infinite Context', url: 'https://arxiv.org/abs/2310.01889', kind: 'paper', year: 2023},
        ],
        cards: [
            {id: 'ml-long-context-attention/flash', front: 'What does FlashAttention change, and what does it not change?', back: 'The order of computation: tiled blocks in SRAM, an online softmax with running max and sum, no score matrix written to HBM, recomputation in the backward pass. It does not change the function: attention stays exact.', tags: ['flash', 'systems']},
            {id: 'ml-long-context-attention/online-softmax', front: 'Write the online-softmax update for a new block of scores.', back: '$m\' = \\max(m, \\max s)$; $\\ell\' = e^{m-m\'}\\ell + \\sum_j e^{s_j - m\'}$; $o\' = e^{m-m\'}o + \\sum_j e^{s_j-m\'} V_j$; output $o/\\ell$ at the end. The rescale by $e^{m-m\'}$ keeps earlier blocks consistent with the new maximum.', tags: ['flash', 'maths']},
            {id: 'ml-long-context-attention/kv-bytes', front: 'Give the KV-cache bytes per token for a model with L layers, H_kv key/value heads of dimension d_h at b bytes per element.', back: '$2 L H_{kv} d_h b$: keys and values, every layer, every KV head. GQA divides it by the group size relative to MHA; MLA replaces $H_{kv} d_h$ by one latent of dimension $d_c + d_r$.', tags: ['kv-cache', 'arithmetic']},
            {id: 'ml-long-context-attention/mla', front: 'How does multi-head latent attention avoid paying for reconstructing keys at decode time?', back: 'It caches a low-rank latent $c_t$ per token and absorbs the key up-projection into the query ($q^\\top W_{UK} c_t = (W_{UK}^\\top q)^\\top c_t$) and the value up-projection into the output weights, so attention runs directly over the latents. A small separate rotary key carries position, since RoPE does not commute with the up-projection.', tags: ['mla', 'deepseek']},
            {id: 'ml-long-context-attention/rope', front: 'Why does a RoPE model fail beyond its trained length, and what do interpolation, NTK scaling and YaRN each do?', back: 'Slow frequencies never rotated far in training, so distant-pair logits are out of distribution. Interpolation rescales all positions into range (loses short-range resolution); NTK-aware scaling raises the base so slow frequencies stretch and fast ones barely move; YaRN interpolates per frequency with a ramp and tempers the logits.', tags: ['rope', 'extension']},
            {id: 'ml-long-context-attention/ring', front: 'What is ring attention?', back: 'The sequence is sharded across devices; key/value blocks are passed around a ring while each device computes its own queries\' attention over every block it receives, so memory per device scales with its shard, not the full sequence.', tags: ['ring', 'distributed']},
            {id: 'ml-long-context-attention/effective', front: 'What is the difference between advertised and effective context length?', back: 'Advertised is the position range the model accepts; effective is where task accuracy holds. Needle retrieval overstates it; aggregation and multi-hop tasks (RULER, LongBench) show a cliff, often at half the advertised length, and a lost-in-the-middle dip persists.', tags: ['evaluation']},
        ],
        problems: [
            {
                id: 'ml-long-context-attention/p1',
                kind: 'quant',
                title: 'The cache of one long sequence',
                statement: md`
A model has 80 layers, 64 query heads and 8 key/value heads of dimension 128, and serves in fp16 (2 bytes per element).

1. How many bytes of KV cache does one token occupy?
2. How many GiB does a single 131,072-token sequence occupy?
3. By what factor would the cache grow without grouped-query attention (64 KV heads)?

Give the first answer: bytes per token.
`,
                hints: ['Keys and values are two tensors per layer.', 'Multiply 2, the layer count, the KV head count, the head dimension and the bytes per element.'],
                solution: md`
1. $2 \times 80 \times 8 \times 128 \times 2 = 327{,}680$ bytes per token (320 KiB).
2. $131{,}072 \times 327{,}680 = 42{,}949{,}672{,}960$ bytes $= 40$ GiB exactly — more than many single GPUs hold after the weights.
3. With 64 KV heads the per-token cache is 8 times larger, 2.5 MiB, and the sequence needs 320 GiB. Grouped-query attention is what makes 128k contexts serveable at all; MLA cuts it further by caching one latent per layer.
`,
                answer: '327680',
            },
        ],
    },
    {
        id: 'ml-state-space-models',
        track: 'ml',
        quiz: [
            {
                id: 'ml-state-space-models/q1',
                prompt: 'A time-invariant SSM is computed as a recurrence at inference and as what for training?',
                options: ['A convolution with a kernel from the recurrence\'s matrices, by FFT', 'A transformer', 'A random walk', 'A lookup table'],
                answer: 0,
                why: 'Selection breaks the convolutional form, so a selective model trains through a scan.',
            },
            {
                id: 'ml-state-space-models/q2',
                prompt: 'What does Mamba make input-dependent?',
                options: ['The number of layers', 'The step size and the B and C projections, per token', 'Only the output layer', 'The vocabulary'],
                answer: 1,
                why: 'A large step forgets and writes, a small one preserves: the recurrence gates by content.',
            },
            {
                id: 'ml-state-space-models/q3',
                prompt: 'Where do SSMs lose to transformers?',
                options: ['Training stability', 'Parameter count', 'Exact recall and copying: the state is a fixed-size compression', 'Throughput at long context'],
                answer: 2,
                why: 'Once the needed memory exceeds the state the task cannot be solved exactly; a KV cache stores every token.',
            },
            {
                id: 'ml-state-space-models/q4',
                prompt: 'What does a hybrid\'s attention-layer ratio control?',
                options: ['The learning rate', 'The tokenizer', 'The FFT size', 'Recall against KV-cache memory'],
                answer: 3,
                why: 'Jamba runs about one full-attention layer in eight; the ratio is set from the recall workload.',
            },
        ],
        title: 'State-space and linear-attention models: S4, Mamba, hybrids',
        oneLiner: 'Hybrids give long context at constant memory per token; knowing where they lose (exact recall) matters.',
        readingMinutes: 26,
        prerequisites: ['ml-long-context-attention'],
        sections: {
            idea: md`
A **state-space model** is a linear recurrence: a hidden state $h_t$ of fixed size is updated from $h_{t-1}$ and the input $x_t$, and the output is a linear read of the state. Written out it is a convolution of the input with a kernel determined by the recurrence's matrices, so the same model can be run as a recurrence (constant memory per step, one step per token at inference) or as a convolution (parallel over the sequence at training time). **S4** made this work for long sequences by structuring the state matrix — the HiPPO initialisation, which sets the state to remember a compressed history of the input — and by computing the long convolution kernel efficiently with FFTs. Its cost per token is independent of context length, which attention's is not.

The limitation of S4 is that its dynamics are the same for every token: a linear time-invariant system cannot decide, from the content of a token, what to keep and what to forget. **Mamba** makes the step size, the input projection and the output projection *functions of the input* (a *selective* SSM), so the recurrence can gate: a token can reset the state, write to it or pass through. Selection breaks the convolutional form, so Mamba instead computes the recurrence with a hardware-aware parallel scan that keeps the expanded state in SRAM. **Mamba-2** reframes the selective SSM as a form of linear attention with a structured mask — *state space duality* — which lets it use matrix-multiply hardware and larger state dimensions. The linear-attention family (RetNet, GLA, RWKV, DeltaNet) arrives at the same place from the other side: attention without the softmax is a recurrence whose state is a $d \times d$ matrix.

What these models trade is **exact recall**. A transformer's KV cache stores every token; an SSM's state is a fixed-size compression, and a task that requires retrieving an arbitrary earlier token verbatim — copying a long string, looking up a key seen once among many — degrades as the required memory exceeds the state. The "Repeat After Me" line of work shows transformers beating SSMs on copying with far fewer parameters, and associative-recall probes show the state size setting a hard ceiling. The practical answer is the **hybrid**: a stack that is mostly SSM or linear-attention layers with a few full-attention layers (Jamba at a 1 to 7 ratio, later Nemotron-H and others), which keeps the memory cost near the SSM's while the attention layers provide the recall.
`,
            maths: md`
**The continuous and discrete SSM.** With state $h(t) \in \mathbb{R}^{N}$ per channel,

$$h'(t) = A\, h(t) + B\, x(t), \qquad y(t) = C\, h(t),$$

discretised with step $\Delta$ by zero-order hold: $\bar{A} = \exp(\Delta A)$, $\bar{B} = (\Delta A)^{-1}(\exp(\Delta A) - I)\,\Delta B$, giving the recurrence $h_t = \bar{A}\, h_{t-1} + \bar{B}\, x_t$, $y_t = C\, h_t$. Unrolling,

$$y_t = \sum_{k=0}^{t} C\, \bar{A}^{\,k}\, \bar{B}\, x_{t-k} = (\bar{K} * x)_t, \qquad \bar{K} = \big(C\bar{B},\ C\bar{A}\bar{B},\ C\bar{A}^2\bar{B},\ \dots\big),$$

a convolution with a kernel as long as the sequence, computed in $O(L \log L)$ by FFT when $A$ is time-invariant.

**Selection.** Mamba sets $\Delta_t = \operatorname{softplus}(W_\Delta x_t)$, $B_t = W_B x_t$, $C_t = W_C x_t$ per token, with $A$ diagonal and negative. The recurrence becomes

$$h_t = \exp(\Delta_t A)\, h_{t-1} + \Delta_t\, B_t\, x_t, \qquad y_t = C_t\, h_t,$$

so a large $\Delta_t$ forgets ($\exp(\Delta A) \to 0$) and writes, a small one preserves. With $A$ diagonal the scan is elementwise; the per-layer state is $d_{\text{inner}} \times N$ numbers and never grows with the sequence.

**State space duality.** With scalar decay $a_t = \exp(\Delta_t A)$ shared across the state, the output is a masked quadratic form:

$$y_t = \sum_{s \le t} \Big(\prod_{r = s+1}^{t} a_r\Big)\, (C_t^{\top} B_s)\, x_s, \qquad \text{i.e.}\quad Y = \big(L \odot (C B^{\top})\big) X,$$

where $L$ is the lower-triangular matrix of cumulative decays — linear attention with a learned decay mask, computable blockwise with matrix multiplies.

**The recall bound.** An associative-recall task with $k$ key–value pairs of dimension $d$ needs about $k\, d$ numbers of state to answer any query; a model whose per-layer state has fewer cannot solve it exactly, whatever the training. A transformer with a KV cache of $k$ tokens has $2 k d$ by construction.
`,
            code: md`
A selective scan in plain PyTorch — the sequential reference, not the fused kernel — and the recall ceiling made concrete by counting state.

\`\`\`python
import torch, torch.nn.functional as F

def selective_scan(x, A, W_delta, W_B, W_C):
    # x: (L, d_inner); A: (d_inner, N) negative; the projections map x_t to delta_t, B_t, C_t.
    L, d = x.shape
    N = A.shape[1]
    h = torch.zeros(d, N)
    ys = []
    for t in range(L):
        delta = F.softplus(x[t] @ W_delta)                 # (d,)  per-channel step
        B_t = x[t] @ W_B                                   # (N,)
        C_t = x[t] @ W_C                                   # (N,)
        a_bar = torch.exp(delta[:, None] * A)              # (d, N) decay, close to 0 forgets
        h = a_bar * h + (delta[:, None] * B_t[None, :]) * x[t][:, None]
        ys.append(h @ C_t)                                 # (d,)
    return torch.stack(ys)                                 # (L, d_inner)

def ssm_state_numbers(layers, d_inner, N):
    return layers * d_inner * N                            # constant in the sequence length

def kv_cache_numbers(layers, kv_heads, head_dim, tokens):
    return 2 * layers * kv_heads * head_dim * tokens       # grows with the sequence

# Mamba-2.8B-like: 64 layers, d_inner 5120, N 16  ->  5.2M numbers, whatever the context.
# A GQA transformer of similar size at 4096 tokens holds about 2 * 32 * 8 * 128 * 4096 = 268M.
\`\`\`

The loop is the semantics; the fused kernel computes the same thing with a parallel scan and keeps $h$ in SRAM so the $(d, N)$ state is never written out per step.
`,
            whyNow: md`
Hybrids left the research track in 2024–25: Jamba, Nemotron-H, the Granite and Falcon-H lines, and several production models at the 50 to 400 billion parameter scale interleave Mamba-2 or linear-attention layers with a minority of attention layers, and the DeepSeek and Qwen families' work on sparse attention competes with them for the same budget — long context at a fraction of the KV-cache cost. The question is no longer whether an SSM can match a transformer at short context but what the right ratio of attention layers is for a given memory budget and recall requirement, and that ratio is a measurable engineering parameter.

The theory caught up with the practice: state space duality unified the SSM and linear-attention lines, the recall experiments gave a clean account of what the state size buys and what it cannot, and hybrid design now starts from the recall workload (how many exact lookups over how long a context) rather than from architecture preference.
`,
            pitfalls: md`
- **Copying and lookup.** Any workload that needs verbatim recall of arbitrary earlier tokens — long code edits, document question answering with exact quotes — exposes a pure SSM. Measure associative recall at the context lengths you serve, not perplexity.
- **The convolutional view needs time invariance.** Selection breaks the FFT path; a selective model trains through a scan, and its throughput depends on a fused kernel for the hardware you have.
- **Initialisation matters.** S4-style $A$ initialisation (negative real parts, HiPPO-like spacing) is what gives long memory at the start of training; a random $A$ forgets within a few tokens.
- **Benchmarks at short context** (4k) show SSMs and transformers at parity and hide every difference that matters; the differences appear past the trained length and under recall load.
- **Hybrid ratio.** Too few attention layers and recall collapses; too many and the memory advantage disappears. Published ratios between 1:7 and 1:4 are starting points, not laws.
- **Numerics of long decays.** Products of many $a_t$ underflow; implementations keep log-decays and use the segmented, chunked formulation of state space duality to stay stable.
`,
        },
        sources: [
            {title: 'Efficiently Modeling Long Sequences with Structured State Spaces (S4)', url: 'https://arxiv.org/abs/2111.00396', kind: 'paper', year: 2021},
            {title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces', url: 'https://arxiv.org/abs/2312.00752', kind: 'paper', year: 2023},
            {title: 'Transformers are SSMs: Generalized Models and Efficient Algorithms Through Structured State Space Duality (Mamba-2)', url: 'https://arxiv.org/abs/2405.21060', kind: 'paper', year: 2024},
            {title: 'Jamba: A Hybrid Transformer-Mamba Language Model', url: 'https://arxiv.org/abs/2403.19887', kind: 'paper', year: 2024},
            {title: 'Repeat After Me: Transformers are Better than State Space Models at Copying', url: 'https://arxiv.org/abs/2402.01032', kind: 'paper', year: 2024},
            {title: 'Gated Linear Attention Transformers with Hardware-Efficient Training', url: 'https://arxiv.org/abs/2312.06635', kind: 'paper', year: 2023},
            {title: 'Simple linear attention language models balance the recall-throughput tradeoff (Based)', url: 'https://arxiv.org/abs/2402.18668', kind: 'paper', year: 2024, note: 'The recall–memory frontier measured across architectures.'},
        ],
        cards: [
            {id: 'ml-state-space-models/two-views', front: 'In what two ways can a time-invariant SSM be computed, and when is each used?', back: 'As a recurrence (constant memory, one step per token: inference) or as a convolution with a kernel built from the recurrence\'s matrices, computed by FFT (parallel over the sequence: training). Selection breaks the convolutional form.', tags: ['ssm', 's4']},
            {id: 'ml-state-space-models/selection', front: 'What does Mamba make input-dependent, and what does that let the model do?', back: 'The step size, the input projection B and the output projection C per token. A large step forgets and writes, a small one preserves, so the recurrence can gate by content: reset, store or pass through.', tags: ['mamba']},
            {id: 'ml-state-space-models/state-size', front: 'How much state does a selective SSM layer hold, and how does it scale with context?', back: '$d_{inner} \\times N$ numbers per layer (expansion times state dimension), constant in the sequence length. A transformer\'s KV cache grows linearly with the tokens held.', tags: ['memory']},
            {id: 'ml-state-space-models/duality', front: 'What is state space duality?', back: 'A selective SSM with scalar decay equals linear attention with a lower-triangular mask of cumulative decays, $Y = (L \\odot CB^\\top)X$, so it can be computed blockwise with matrix multiplies and larger states (Mamba-2).', tags: ['mamba-2', 'linear-attention']},
            {id: 'ml-state-space-models/recall', front: 'Where do SSMs lose to transformers, and why?', back: 'Exact recall: copying and associative lookup over arbitrary earlier tokens. The state is a fixed-size compression, so once the needed memory exceeds it the task cannot be solved exactly; a KV cache stores every token by construction.', tags: ['recall', 'limits']},
            {id: 'ml-state-space-models/hybrid', front: 'What is a hybrid, and what does the attention-layer ratio control?', back: 'A stack mostly of SSM or linear-attention layers with a minority of full-attention layers (Jamba at about 1 in 8). The ratio trades recall against KV-cache memory; it is set from the recall workload, not by preference.', tags: ['hybrid']},
            {id: 'ml-state-space-models/hippo', front: 'What does the HiPPO initialisation of A do?', back: 'Sets the state to maintain a compressed projection of the input\'s history (negative, structured eigenvalues), giving long memory from the start of training; a random A forgets within a few tokens.', tags: ['s4', 'init']},
        ],
        problems: [
            {
                id: 'ml-state-space-models/p1',
                kind: 'quant',
                title: 'Counting the state',
                statement: md`
A Mamba-style model has 64 layers, model width 2560 with expansion 2 (so $d_{\text{inner}} = 5120$) and state dimension $N = 16$.

1. How many numbers of SSM state does one layer hold?
2. How many does the whole model hold, and how many bytes in fp16?
3. A grouped-query transformer with 32 layers, 8 KV heads of dimension 128 holds a KV cache of $2 \times 32 \times 8 \times 128$ numbers per token. At what context length does its cache equal the Mamba model's whole state?

Give the first answer: numbers of state in one layer.
`,
                hints: ['State per layer is the inner width times the state dimension.', 'The transformer\'s per-token cache is 65,536 numbers.'],
                solution: md`
1. $5120 \times 16 = 81{,}920$ numbers per layer.
2. $64 \times 81{,}920 = 5{,}242{,}880$ numbers, $10{,}485{,}760$ bytes (10 MiB) in fp16 — the same at 1k tokens as at 1M.
3. The transformer holds $65{,}536$ numbers per token, so its cache equals the SSM's state at $5{,}242{,}880 / 65{,}536 = 80$ tokens. Past that the transformer pays more memory per sequence, and it keeps paying linearly; what it buys is exact recall of every one of those tokens.
`,
                answer: '81920',
            },
        ],
    },
    {
        id: 'ml-post-training',
        track: 'ml',
        quiz: [
            {
                id: 'ml-post-training/q1',
                prompt: 'What is the optimal policy of the KL-regularised reward objective?',
                options: ['$\\pi_{ref}(y|x)\\exp(r(x,y)/\\beta)/Z(x)$', 'The uniform policy', 'The argmax of the reward', 'The SFT model unchanged'],
                answer: 0,
                why: 'The reference reweighted by the exponentiated reward; inverting gives DPO\'s implicit reward.',
            },
            {
                id: 'ml-post-training/q2',
                prompt: 'Why does the partition function disappear from the DPO loss?',
                options: ['$\\beta$ removes it', '$Z(x)$ depends only on the prompt and cancels in the difference of two rewards', 'It is set to one', 'It is learned by a second model'],
                answer: 1,
                why: 'Both responses in a pair share the prompt.',
            },
            {
                id: 'ml-post-training/q3',
                prompt: 'How does KTO differ from DPO in its data requirement?',
                options: ['It needs no model', 'It needs a reward model', 'It needs only a binary label per single response', 'It needs triples'],
                answer: 2,
                why: 'SimPO, by contrast, drops the reference model and uses a length-normalised log-probability.',
            },
            {
                id: 'ml-post-training/q4',
                prompt: 'Which is a known DPO failure?',
                options: ['The margin shrinks to zero', '$\\beta$ turns negative', 'The reference model drifts', 'Both the chosen and the rejected log-probabilities fall while the margin grows'],
                answer: 3,
                why: 'Watch the chosen log-probability, not only the margin; a small SFT term holds it up.',
            },
        ],
        title: 'Post-training: SFT, reward models, RLHF, DPO and its relatives',
        oneLiner: 'The alignment stack is what you touch when you fine-tune; DPO\'s closed form explains most of it.',
        readingMinutes: 28,
        prerequisites: ['ml-transformer-internals'],
        sections: {
            idea: md`
A pretrained language model predicts the next token of internet text; post-training turns it into a model that answers. The stack that InstructGPT described in 2022 is still the frame. **Supervised fine-tuning (SFT)** continues training on prompt–response pairs written or curated by people, with the loss on the response tokens only; it teaches the format and the basic behaviours and is where most of the capability of a chat model's style comes from. **A reward model** is then trained on comparisons: for a prompt, two responses, and a label saying which a rater preferred, the model learns a scalar score whose differences fit the preferences under the Bradley–Terry model. **Reinforcement learning from human feedback (RLHF)** then optimises the policy to maximise the reward, with a KL penalty toward the SFT model so the policy does not drift into the reward model's blind spots; the optimiser is usually PPO, with the value function, the reference model and the reward model all in memory alongside the policy.

**Direct preference optimisation (DPO)** removed the reward model and the RL loop from that recipe. Its observation is that the RLHF objective — reward minus a KL to the reference — has a closed-form optimal policy, and inverting it expresses the reward as the log-ratio of the policy to the reference, up to a per-prompt constant that cancels in a comparison. Substituting that into the Bradley–Terry likelihood gives a loss on preference pairs that trains the policy directly, with no sampling and no separate reward model: a logistic loss on the difference of the two responses' log-ratios, scaled by the KL coefficient. The relatives — IPO, KTO (which needs only a thumbs-up or thumbs-down per response rather than a pair), SimPO (which drops the reference model and length-normalises), ORPO — change the loss shape or the data requirement while keeping the same idea.

Which to use is an empirical question with a fairly settled answer. DPO is cheap, stable and good when the preference data is on-policy enough; PPO-style RL with a reward model wins when the policy must explore beyond the preference set, on reasoning and agentic tasks where rewards can be computed rather than rated (the next unit), and in the largest labs' pipelines where the reward model is itself a trained artefact worth the cost. Most open models now run SFT, then one or more rounds of DPO-family training on preferences collected from the current policy's own samples (on-policy or *iterative* DPO), then RL on verifiable tasks.
`,
            maths: md`
**Bradley–Terry.** For a prompt $x$ and responses $y_w$ (preferred) and $y_l$, with reward $r$,

$$p(y_w \succ y_l \mid x) = \sigma\big(r(x, y_w) - r(x, y_l)\big) = \frac{e^{r(x,y_w)}}{e^{r(x,y_w)} + e^{r(x,y_l)}},$$

and a reward model $r_\phi$ is trained by maximising the log-likelihood of the rated pairs, $-\log \sigma(r_\phi(x, y_w) - r_\phi(x, y_l))$.

**The RLHF objective and its optimal policy.** With reference policy $\pi_{\text{ref}}$ and coefficient $\beta$,

$$\max_{\pi}\ \mathbb{E}_{x,\, y \sim \pi(\cdot \mid x)}\big[ r(x, y) \big] - \beta\, \mathbb{D}_{\text{KL}}\big(\pi(\cdot \mid x)\, \|\, \pi_{\text{ref}}(\cdot \mid x)\big)$$

has the solution $\pi^{*}(y \mid x) = \frac{1}{Z(x)}\, \pi_{\text{ref}}(y \mid x)\, \exp\!\big(r(x, y) / \beta\big)$. Inverting,

$$r(x, y) = \beta \log \frac{\pi^{*}(y \mid x)}{\pi_{\text{ref}}(y \mid x)} + \beta \log Z(x).$$

**DPO.** Substituting the reward into Bradley–Terry, $Z(x)$ cancels in the difference, and the loss on a pair is

$$\mathcal{L}_{\text{DPO}}(\theta) = -\log \sigma\!\left( \beta \log \frac{\pi_\theta(y_w \mid x)}{\pi_{\text{ref}}(y_w \mid x)} - \beta \log \frac{\pi_\theta(y_l \mid x)}{\pi_{\text{ref}}(y_l \mid x)} \right).$$

Its gradient weights each pair by $\sigma(\hat r_\theta(y_l) - \hat r_\theta(y_w))$ — how wrong the implicit reward currently is — and pushes up the chosen response's log-probability and down the rejected one's. The *implicit reward* $\hat r_\theta = \beta \log(\pi_\theta / \pi_{\text{ref}})$ is what the margin plots in DPO papers show.

**Relatives.** KTO replaces the pair with a single response and a binary label, using a reference point $z_0 = \mathbb{E}[\hat r]$ and a prospect-theory-shaped loss. SimPO uses the length-normalised log-probability $\frac{\beta}{|y|} \log \pi_\theta(y \mid x)$ as the reward, no reference model, and a target margin $\gamma$: $-\log \sigma\big(\frac{\beta}{|y_w|}\log\pi_\theta(y_w|x) - \frac{\beta}{|y_l|}\log\pi_\theta(y_l|x) - \gamma\big)$.

**PPO's clipped objective**, for completeness, with per-token advantage $\hat A_t$ from a value model and ratio $\rho_t = \pi_\theta(a_t \mid s_t) / \pi_{\text{old}}(a_t \mid s_t)$:

$$\mathcal{L}_{\text{PPO}} = -\mathbb{E}_t\big[\min\big(\rho_t \hat A_t,\ \operatorname{clip}(\rho_t, 1-\epsilon, 1+\epsilon)\, \hat A_t\big)\big],$$

with the KL to the reference added to the reward per token in RLHF practice.
`,
            code: md`
The DPO loss from sequence log-probabilities, which is all it needs: two forward passes of the policy and two of the frozen reference per pair.

\`\`\`python
import torch, torch.nn.functional as F

def sequence_logprob(model, input_ids, response_mask):
    # Sum of the response tokens' log-probabilities under the model; prompt tokens masked out.
    logits = model(input_ids).logits[:, :-1]                           # predict token t+1 from t
    targets = input_ids[:, 1:]
    logp = torch.log_softmax(logits.float(), dim=-1).gather(-1, targets[..., None]).squeeze(-1)
    return (logp * response_mask[:, 1:]).sum(-1)                       # (B,)

def dpo_loss(policy, reference, chosen, rejected, beta=0.1):
    # chosen, rejected: dicts with input_ids and response_mask for the same prompts.
    pi_w = sequence_logprob(policy, chosen["input_ids"], chosen["response_mask"])
    pi_l = sequence_logprob(policy, rejected["input_ids"], rejected["response_mask"])
    with torch.no_grad():
        ref_w = sequence_logprob(reference, chosen["input_ids"], chosen["response_mask"])
        ref_l = sequence_logprob(reference, rejected["input_ids"], rejected["response_mask"])
    r_w = beta * (pi_w - ref_w)                                        # implicit rewards
    r_l = beta * (pi_l - ref_l)
    loss = -F.logsigmoid(r_w - r_l).mean()
    margin = (r_w - r_l).mean().item()                                 # the number to watch
    return loss, margin
\`\`\`

The reference log-probabilities can be precomputed once per dataset, which is most of what makes DPO cheap; the policy's two passes per pair are the whole training cost.
`,
            whyNow: md`
Post-training is where the differences between models of the same size now live, and it is the layer anyone fine-tuning a model touches. The 2024–25 open recipes (Llama 3, Tülu 3, the Qwen and DeepSeek reports) converged on the same shape: a large SFT mix, several rounds of on-policy preference training with a DPO-family loss on the model's own samples ranked by a reward model or by rules, and RL with verifiable rewards for maths, code and agent tasks (the next unit). The reward model did not disappear; it moved from the RL loop into the data pipeline, labelling the policy's samples.

The open problems are the ones the maths points at: reward hacking (a policy that exploits the reward model's errors; the KL term is a crude guard), length bias (raters and reward models prefer longer answers; SimPO's normalisation and explicit length penalties are patches), and the distribution shift between the preference data and the policy that produces samples at deployment, which is why iterative, on-policy preference collection replaced static datasets.
`,
            pitfalls: md`
- **Off-policy DPO drifts.** Preference pairs written for another model teach the format of that model; the implicit-reward margin rises while the policy's own samples get worse. Collect preferences on the current policy's outputs and iterate.
- **Both log-probabilities fall.** A known DPO failure: the chosen response's log-probability drops along with the rejected one's, as long as the gap grows. Watch the chosen log-probability, not only the margin; a small SFT term or a conservative $\beta$ holds it up.
- **Length.** Raters prefer longer answers; without normalisation the policy learns verbosity. Measure mean response length across training and report win rates length-controlled.
- **The KL coefficient** $\beta$ sets how far the policy may move: too small and the reward model is exploited, too large and nothing changes. It is the one hyperparameter to sweep.
- **Reward-model evaluation.** A reward model's accuracy on held-out pairs is not its usefulness; test it on the policy's samples after a round of optimisation, where its errors concentrate.
- **Catastrophic forgetting of pretraining knowledge** through aggressive SFT: keep a replay of pretraining-like data in the mix and evaluate base-model benchmarks after every stage.
`,
        },
        sources: [
            {title: 'Training language models to follow instructions with human feedback (InstructGPT)', url: 'https://arxiv.org/abs/2203.02155', kind: 'paper', year: 2022},
            {title: 'Direct Preference Optimization: Your Language Model is Secretly a Reward Model', url: 'https://arxiv.org/abs/2305.18290', kind: 'paper', year: 2023},
            {title: 'Proximal Policy Optimization Algorithms', url: 'https://arxiv.org/abs/1707.06347', kind: 'paper', year: 2017},
            {title: 'Training a Helpful and Harmless Assistant with Reinforcement Learning from Human Feedback', url: 'https://arxiv.org/abs/2204.05862', kind: 'paper', year: 2022},
            {title: 'KTO: Model Alignment as Prospect Theoretic Optimization', url: 'https://arxiv.org/abs/2402.01306', kind: 'paper', year: 2024},
            {title: 'SimPO: Simple Preference Optimization with a Reference-Free Reward', url: 'https://arxiv.org/abs/2405.14734', kind: 'paper', year: 2024},
            {title: 'Is DPO Superior to PPO for LLM Alignment? A Comprehensive Study', url: 'https://arxiv.org/abs/2404.10719', kind: 'paper', year: 2024},
            {title: 'Rank Analysis of Incomplete Block Designs: The Method of Paired Comparisons (Bradley and Terry)', url: 'https://doi.org/10.2307/2334029', kind: 'paper', year: 1952},
        ],
        cards: [
            {id: 'ml-post-training/stages', front: 'Name the three stages of the InstructGPT recipe and what each needs as data.', back: 'SFT on prompt–response pairs (loss on response tokens); a reward model on pairwise comparisons under Bradley–Terry; RL (PPO) maximising the reward with a KL penalty toward the SFT model, needing only prompts.', tags: ['rlhf', 'pipeline']},
            {id: 'ml-post-training/optimal-policy', front: 'What is the optimal policy of the KL-regularised reward objective?', back: '$\\pi^*(y|x) = \\pi_{ref}(y|x)\\exp(r(x,y)/\\beta)/Z(x)$: the reference reweighted by the exponentiated reward. Inverting gives $r = \\beta\\log(\\pi^*/\\pi_{ref}) + \\beta\\log Z$.', tags: ['dpo', 'derivation']},
            {id: 'ml-post-training/dpo-loss', front: 'Write the DPO loss and say why the partition function disappears.', back: '$-\\log\\sigma(\\beta\\log\\frac{\\pi_\\theta(y_w|x)}{\\pi_{ref}(y_w|x)} - \\beta\\log\\frac{\\pi_\\theta(y_l|x)}{\\pi_{ref}(y_l|x)})$. $Z(x)$ depends on the prompt only, so it cancels in the difference of two rewards for the same prompt.', tags: ['dpo']},
            {id: 'ml-post-training/implicit-reward', front: 'What is DPO\'s implicit reward, and what does the gradient weight each pair by?', back: '$\\hat r_\\theta(x,y) = \\beta\\log(\\pi_\\theta(y|x)/\\pi_{ref}(y|x))$. Each pair is weighted by $\\sigma(\\hat r(y_l) - \\hat r(y_w))$: how wrong the current implicit reward is on it.', tags: ['dpo']},
            {id: 'ml-post-training/kto-simpo', front: 'How do KTO and SimPO differ from DPO in their data or reference requirement?', back: 'KTO needs only a binary label per single response, not a pair. SimPO needs no reference model: its reward is the length-normalised log-probability, with a target margin.', tags: ['relatives']},
            {id: 'ml-post-training/when-rl', front: 'When does PPO-style RL beat DPO?', back: 'When the policy must explore beyond the preference set: reasoning and agentic tasks with computable rewards, and pipelines where a strong reward model labels fresh on-policy samples. DPO wins on cost and stability with on-policy preference data.', tags: ['rl', 'choice']},
            {id: 'ml-post-training/beta', front: 'What does the KL coefficient control, and what goes wrong at each extreme?', back: 'How far the policy may move from the reference. Too small: the reward model (or the preferences) are exploited, reward hacking. Too large: nothing changes. It is the hyperparameter to sweep.', tags: ['hyperparameters']},
        ],
        problems: [
            {
                id: 'ml-post-training/p1',
                kind: 'quant',
                title: 'One DPO pair',
                statement: md`
With $\beta = 0.1$, the policy's sequence log-probability of the chosen response is 2 nats above the reference's, and that of the rejected response is 1 nat below the reference's.

1. What are the two implicit rewards?
2. What is the DPO loss on this pair, $-\log \sigma(\hat r_w - \hat r_l)$?
3. What is the weight the gradient gives this pair, $\sigma(\hat r_l - \hat r_w)$?

Give the second answer, the loss, to three decimals.
`,
                hints: ['The implicit reward is beta times the log-ratio: 0.2 and −0.1.', 'The loss is log(1 + exp(−margin)) with margin 0.3.'],
                solution: md`
1. $\hat r_w = 0.1 \times 2 = 0.2$ and $\hat r_l = 0.1 \times (-1) = -0.1$, margin $0.3$.
2. $-\log \sigma(0.3) = \log(1 + e^{-0.3}) = \log(1.7408) = 0.554$.
3. $\sigma(-0.3) = 0.426$: the pair is still "wrong enough" to carry most of its gradient. A margin of 3 would give a weight of $0.047$; DPO spends its gradient on pairs the implicit reward has not yet separated.
`,
                answer: '0.554',
                tolerance: 0.002,
            },
        ],
    },
];
