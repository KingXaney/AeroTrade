// The computer-vision track's units, in the plan's order (lib/learn/copy/lab/plan.ts). Written
// for an expert reader; held to the 'lab' tier of lib/learn/banned.ts over their prose. Examples
// use synthetic tensors; a named security appears only as data in a source's title.

import {md} from "@/lib/learn/copy/lab/md";
import type {LabUnit} from "@/lib/learn/copy/lab/types";

export const CV_UNITS: readonly LabUnit[] = [
    {
        id: 'cv-vit-dinov2',
        track: 'cv',
        title: 'ViT and self-supervised features: DINOv2',
        oneLiner: 'Frozen patch features are the default backbone for depth, segmentation, retrieval and robots; what the tokens encode and why registers fixed the artefacts.',
        readingMinutes: 22,
        sections: {
            idea: md`
A Vision Transformer cuts an image into a grid of patches, projects each patch to a vector, adds a position embedding and runs the sequence through a stack of transformer blocks. Nothing in the architecture knows about images: locality, translation equivariance and the notion of an edge are learned from data, which is why ViTs needed either web-scale supervision (JFT-300M in the original paper) or a strong self-supervised objective to match convolutional networks at ImageNet scale.

The objective that made ViT features reusable without labels is **self-distillation with no labels (DINO)** and its successor **DINOv2**. A student network sees local crops and a teacher — an exponential moving average of the student's weights — sees global crops of the same image; the student is trained to match the teacher's softmax output over a learned set of prototypes. There is no negative pair and no contrastive batch: collapse is avoided by *centering* (subtracting a running mean from the teacher logits) and *sharpening* (a lower teacher temperature). DINOv2 adds the iBOT masked-patch objective (predict the teacher's token for masked patches), KoLeo regularisation that spreads features uniformly, a curated 142-million-image dataset built by retrieval, and a distillation step from a ViT-g to smaller models.

What comes out is a frozen encoder whose **patch tokens** carry dense semantic and geometric information. A linear head on frozen DINOv2 patch features gives competitive depth estimation and semantic segmentation; nearest-neighbour search over patch tokens finds the same object part across images; the [CLS] token is a strong global descriptor for retrieval and k-NN classification. The practical consequence is a change of workflow: instead of fine-tuning a backbone per task, teams freeze DINOv2 and train small heads.

The 2023 **registers** paper explains an artefact visible in attention maps of large ViTs: a few background patch tokens acquire very high norm and act as global scratch memory, which makes dense maps noisy. Appending a handful of extra learnable tokens — registers — with no spatial meaning gives the network somewhere else to put that computation, and the attention maps become clean. DINOv2 checkpoints now ship with registers by default.
`,
            maths: md`
**Patchification.** An image $x \in \mathbb{R}^{H \times W \times 3}$ with patch size $p$ becomes $N = \frac{H}{p}\cdot\frac{W}{p}$ tokens. Each flattened patch $x_i \in \mathbb{R}^{3p^2}$ is projected with $E \in \mathbb{R}^{3p^2 \times d}$ and offset by a learned position embedding:

$$z_0 = [\,x_{\text{cls}};\; x_1 E;\; \dots;\; x_N E\,] + E_{\text{pos}}, \qquad z_0 \in \mathbb{R}^{(N+1) \times d}.$$

**Self-attention** on the sequence, per head, with $Q = zW_Q$, $K = zW_K$, $V = zW_V$:

$$\operatorname{Attn}(z) = \operatorname{softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_h}}\right) V,$$

so the cost per block is $O(N^2 d)$ for attention and $O(N d^2)$ for the projections and MLP. Halving the patch size quadruples $N$ and so multiplies the attention cost by sixteen.

**The DINO objective.** With prototypes $P$ and a projection head $h$, the teacher distribution for a global view $v$ is

$$p_t(v) = \operatorname{softmax}\!\left(\frac{h_t(f_t(v)) - c}{\tau_t}\right),$$

where $c$ is the running centre and $\tau_t < \tau_s$ sharpens it. The student matches it over every pair of views $(u, v)$ with $u \neq v$:

$$\mathcal{L}_{\text{DINO}} = \sum_{v \in \mathcal{V}_g} \sum_{u \neq v} -\, p_t(v)^{\top} \log p_s(u).$$

The teacher is updated by $\theta_t \leftarrow \lambda \theta_t + (1-\lambda)\theta_s$ with $\lambda$ rising from 0.996 toward 1. Centering alone would collapse to the uniform distribution and sharpening alone to a one-hot; together they balance.

**iBOT's masked term** applies the same cross-entropy per patch, between the student's masked patch tokens and the teacher's unmasked ones, which is what makes the patch tokens — not only [CLS] — informative.

**Registers.** With $r$ register tokens the sequence is $[x_{\text{cls}}; \text{reg}_1 \dots \text{reg}_r; x_1 E; \dots; x_N E]$; registers are dropped at the output. The observation behind them: high-norm outlier tokens appear on low-information patches after a few layers, carry little local information (a linear probe recovers position poorly from them) and much global information (a probe recovers the class well), so the model was recycling background patches as workspace.
`,
            code: md`
A frozen-feature workflow in a few lines. The encoder is never updated; a linear head is trained on patch tokens for a dense task.

\`\`\`python
import torch, torch.nn as nn

# DINOv2 ViT-B/14 with registers; patch tokens come out at stride 14.
backbone = torch.hub.load("facebookresearch/dinov2", "dinov2_vitb14_reg").eval()
for p in backbone.parameters():
    p.requires_grad_(False)

def patch_features(images):            # images: (B, 3, H, W), H and W multiples of 14
    out = backbone.forward_features(images)
    tokens = out["x_norm_patchtokens"]  # (B, N, 768): registers already dropped
    B, N, D = tokens.shape
    h = images.shape[-2] // 14
    return tokens.transpose(1, 2).reshape(B, D, h, N // h)   # (B, 768, H/14, W/14)

head = nn.Conv2d(768, 1, kernel_size=1)   # a linear probe for relative depth
opt = torch.optim.AdamW(head.parameters(), lr=1e-3)

for images, depth in loader:            # depth: (B, 1, H, W)
    with torch.no_grad():
        f = patch_features(images)
    pred = nn.functional.interpolate(head(f), size=depth.shape[-2:], mode="bilinear")
    loss = (pred - depth).abs().mean()
    opt.zero_grad(); loss.backward(); opt.step()
\`\`\`

The thing to notice is the shape bookkeeping: tokens are a flat sequence of length $N = (H/14)(W/14)$ and must be reshaped back to a grid before any spatial head, and inputs must be padded or resized to multiples of the patch size.
`,
            whyNow: md`
Three changes made frozen self-supervised features the default in 2025–26. First, the quality gap closed: on most dense benchmarks a linear or light head on DINOv2 patch tokens matches fully fine-tuned convolutional baselines, so the cost of fine-tuning a backbone per task stopped paying for itself. Second, robot learning and 3D pipelines adopted one shared encoder — policies, correspondence matching, feed-forward geometry models such as the DUSt3R family and monocular depth models all start from these tokens — so investment concentrated. Third, the registers fix removed the last common complaint about ViT dense maps.

The open question is what the next pretraining objective is. Masked-image modelling alone (MAE) learns features that fine-tune well but probe poorly; contrastive and distillation objectives probe well; joint-embedding predictive objectives (V-JEPA, covered in the video unit) try to get both by predicting in feature space rather than pixel space. Knowing which objective produced a checkpoint tells you whether its features can be used frozen.
`,
            pitfalls: md`
- **Resolution and stride.** A 224-pixel input at patch 14 is a 16-by-16 token grid: coarse for small objects. Most dense work runs 518 pixels or larger; interpolating position embeddings to new grid sizes is standard, but accuracy at resolutions far from training degrades.
- **Checkpoints without registers** have high-norm artefact tokens; attention maps and dense probes look noisy. Use the \`_reg\` variants.
- **[CLS] is not a dense feature.** It is a global summary tuned by the DINO loss. For localisation, patch tokens; for retrieval, [CLS].
- **Domain shift.** DINOv2's curated data is natural photographs. Medical, satellite and microscopy imagery often need adaptation or a domain-specific pretraining run.
- **Licence and reproducibility.** The dataset is not released; results depend on the released weights. Pin the exact checkpoint hash in experiments.
- **Reading a probe result.** A linear probe measures linear separability of the frozen features, which is one property; a fine-tuned number measures a different one. Papers that compare the two across models are comparing different questions.
`,
        },
        sources: [
            {title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale', url: 'https://arxiv.org/abs/2010.11929', kind: 'paper', year: 2020},
            {title: 'Emerging Properties in Self-Supervised Vision Transformers (DINO)', url: 'https://arxiv.org/abs/2104.14294', kind: 'paper', year: 2021},
            {title: 'DINOv2: Learning Robust Visual Features without Supervision', url: 'https://arxiv.org/abs/2304.07193', kind: 'paper', year: 2023},
            {title: 'Vision Transformers Need Registers', url: 'https://arxiv.org/abs/2309.16588', kind: 'paper', year: 2023},
            {title: 'iBOT: Image BERT Pre-Training with Online Tokenizer', url: 'https://arxiv.org/abs/2111.07832', kind: 'paper', year: 2021},
            {title: 'Masked Autoencoders Are Scalable Vision Learners', url: 'https://arxiv.org/abs/2111.06377', kind: 'paper', year: 2021, note: 'The reconstruction objective whose features fine-tune well but probe poorly.'},
            {title: 'facebookresearch/dinov2', url: 'https://github.com/facebookresearch/dinov2', kind: 'code', year: 2023},
        ],
        cards: [
            {id: 'cv-vit-dinov2/patch-cost', front: 'Halving a ViT\'s patch size changes the attention cost by what factor, and why?', back: 'Sixteen. Tokens $N$ scale with $1/p^2$, so halving $p$ quadruples $N$, and attention is $O(N^2 d)$.', tags: ['vit', 'cost']},
            {id: 'cv-vit-dinov2/collapse', front: 'DINO has no negative pairs. What stops the student and teacher from collapsing to a constant output?', back: 'Centering (subtracting a running mean from the teacher logits) prevents one prototype from dominating; sharpening (a low teacher temperature) prevents the uniform solution. Either alone collapses; together they balance.', tags: ['dino', 'ssl']},
            {id: 'cv-vit-dinov2/teacher', front: 'What is the DINO teacher, and how is it updated?', back: 'An exponential moving average of the student\'s weights, $\\theta_t \\leftarrow \\lambda\\theta_t + (1-\\lambda)\\theta_s$, with $\\lambda$ rising from about 0.996 toward 1 over training. It receives only global crops.', tags: ['dino', 'ema']},
            {id: 'cv-vit-dinov2/patch-tokens', front: 'Which DINOv2 objective makes the patch tokens, not only [CLS], semantically informative?', back: 'The iBOT masked-patch term: a per-patch cross-entropy between the student\'s masked tokens and the teacher\'s unmasked ones.', tags: ['ibot', 'dense']},
            {id: 'cv-vit-dinov2/registers', front: 'What artefact do registers remove, and what was causing it?', back: 'High-norm outlier tokens on low-information background patches that the network used as global scratch memory, which made attention maps and dense probes noisy. Extra learnable tokens with no spatial role give that computation somewhere else to live.', tags: ['registers', 'artefacts']},
            {id: 'cv-vit-dinov2/cls-vs-patch', front: 'When is [CLS] the right feature, and when are patch tokens?', back: '[CLS] for global tasks: retrieval, k-NN classification. Patch tokens, reshaped to a grid, for dense tasks: depth, segmentation, correspondence.', tags: ['features']},
            {id: 'cv-vit-dinov2/mae-vs-dino', front: 'How do MAE features and DINO-style features differ in use?', back: 'MAE (pixel reconstruction) features fine-tune well but probe poorly; DINO and iBOT (distillation in feature space) features probe well and are usable frozen. The pretraining objective decides whether a checkpoint can be frozen.', tags: ['mae', 'ssl']},
        ],
        problems: [
            {
                id: 'cv-vit-dinov2/p1',
                kind: 'quant',
                title: 'Tokens at inference resolution',
                statement: md`
DINOv2 runs dense tasks at 518 by 518 pixels with patch size 14, four registers and one [CLS] token.

1. How many **patch** tokens does one image produce?
2. How long is the full sequence the blocks see?
3. By what factor does the per-block attention cost exceed that of a 224 by 224 input (patch tokens only)?

Give the first answer as the number of patch tokens.
`,
                hints: ['A 518-pixel side holds 518 / 14 patches.', 'Attention cost scales with the square of the sequence length.'],
                solution: md`
1. $518 / 14 = 37$ patches a side, so $37^2 = 1369$ patch tokens.
2. The sequence is $1369 + 4 + 1 = 1374$ tokens.
3. At 224 pixels the grid is $16 \times 16 = 256$ tokens; the attention cost ratio is $(1369/256)^2 \approx 28.6$. That ratio is why high-resolution ViT inference is dominated by attention and why token-reduction methods (the efficient-vision unit) matter.
`,
                answer: '1369',
            },
        ],
    },
    {
        id: 'cv-clip-vlm',
        track: 'cv',
        title: 'Contrastive vision–language: CLIP, SigLIP and the VLM recipe',
        oneLiner: 'Every product VLM is a vision tower, a projector and a language model; the alignment loss and how pixels become tokens decide cost and hallucination.',
        readingMinutes: 24,
        sections: {
            idea: md`
CLIP trains an image encoder and a text encoder so that matching image–caption pairs score higher than every other pairing in the batch. With 400 million pairs scraped from the web, the result is a shared embedding space where "a photo of a dog" lands near pictures of dogs: zero-shot classification is retrieval of the nearest caption among the class names, and the same space powers image search, filtering and the vision towers of most multimodal language models.

**SigLIP** replaces the batch-wide softmax with an independent sigmoid per pair. Each (image, text) pair is a binary classification — is this a match? — so the loss no longer needs the full similarity matrix across devices, trains well at batch sizes where softmax contrastive learning saturates, and tolerates small batches. SigLIP 2 added captioning-based pretraining and self-distillation to improve dense features and localisation, which matters once the encoder feeds a language model that must talk about regions.

A **vision–language model (VLM)** of the LLaVA family is three parts: a pretrained vision tower (a CLIP or SigLIP encoder), a projector that maps patch embeddings into the language model's token space (a linear layer or a small MLP, sometimes a resampler that compresses many patches into a fixed number of query tokens), and a pretrained language model that reads image tokens interleaved with text. Training is staged: align the projector on captions with everything else frozen, then instruction-tune on multimodal conversations, often unfreezing the language model and sometimes the tower.

The design decisions that separate models are about **tokens per image**. A single 384-pixel tile through SigLIP gives 729 tokens; a high-resolution page split into tiles can cost several thousand. Native-resolution and dynamic tiling schemes (Qwen2-VL's 2D rotary positions over variable grids, "AnyRes" tiling in LLaVA-NeXT, PaliGemma's fixed resolutions) trade token count against the ability to read small text and fine detail. Token count sets both latency and the context the language model has left for reasoning.
`,
            maths: md`
**The CLIP objective.** With normalised embeddings $u_i$ (image) and $v_j$ (text) and a learned temperature $\tau$, the logits are $s_{ij} = u_i^{\top} v_j / \tau$. For a batch of $N$ pairs the symmetric InfoNCE loss is

$$\mathcal{L}_{\text{CLIP}} = -\frac{1}{2N}\sum_{i=1}^{N}\left[\log\frac{e^{s_{ii}}}{\sum_{j} e^{s_{ij}}} + \log\frac{e^{s_{ii}}}{\sum_{j} e^{s_{ji}}}\right].$$

Each image competes against $N-1$ negative captions and each caption against $N-1$ negative images. InfoNCE lower-bounds mutual information: $I(u; v) \ge \log N - \mathcal{L}$, so a batch of $N$ can certify at most $\log N$ nats of shared information. This is the formal reason contrastive pretraining wants enormous batches (32k is typical) and why gains flatten: the bound grows only logarithmically.

**The SigLIP objective.** Define labels $z_{ij} = +1$ when $i = j$ and $-1$ otherwise, a temperature $t$ and a learned bias $b$ that offsets the imbalance between one positive and $N-1$ negatives:

$$\mathcal{L}_{\text{SigLIP}} = -\frac{1}{N}\sum_{i=1}^{N}\sum_{j=1}^{N} \log \sigma\!\big(z_{ij}\,(t\, u_i^{\top} v_j + b)\big).$$

Every term depends on one pair only, so the loss decomposes across devices: each device needs only its own images against a rotating set of texts, with no all-gather of a full $N \times N$ matrix.

**The projector.** A linear projector maps a tower output $h \in \mathbb{R}^{n \times d_v}$ to $hW$, $W \in \mathbb{R}^{d_v \times d_{\text{lm}}}$; an MLP projector inserts a hidden layer and a GELU. A perceiver-style resampler learns $k$ queries $Q \in \mathbb{R}^{k \times d}$ that cross-attend to the $n$ patch tokens, giving $k$ image tokens whatever $n$ is:

$$T = \operatorname{softmax}\!\left(\frac{Q (hW_K)^{\top}}{\sqrt d}\right) hW_V.$$

The resampler bounds token count but discards spatial detail; linear projectors keep every patch and pay for it in context.
`,
            code: md`
The SigLIP loss, written out so the per-pair structure is visible, and a minimal VLM forward pass with a linear projector.

\`\`\`python
import torch, torch.nn.functional as F

def siglip_loss(img, txt, t, b):
    # img, txt: (N, d) L2-normalised; t: log-temperature scalar; b: learned bias.
    logits = img @ txt.T * t.exp() + b              # (N, N)
    labels = 2 * torch.eye(len(img), device=img.device) - 1   # +1 on the diagonal, -1 elsewhere
    return -F.logsigmoid(labels * logits).sum() / len(img)

class TinyVLM(torch.nn.Module):
    def __init__(self, tower, lm, d_vision, d_lm):
        super().__init__()
        self.tower, self.lm = tower, lm                # both pretrained
        self.proj = torch.nn.Sequential(torch.nn.Linear(d_vision, d_lm), torch.nn.GELU(), torch.nn.Linear(d_lm, d_lm))

    def forward(self, images, text_ids):
        patches = self.tower(images)                   # (B, n, d_vision) patch embeddings
        image_tokens = self.proj(patches)              # (B, n, d_lm): one LM token per patch
        text_tokens = self.lm.embed(text_ids)          # (B, L, d_lm)
        x = torch.cat([image_tokens, text_tokens], dim=1)
        return self.lm(inputs_embeds=x)               # next-token logits over the text part

# Stage 1: train self.proj only on image-caption pairs.  Stage 2: unfreeze the LM, instruction-tune.
\`\`\`

The concatenation line is the whole trick: image patches become ordinary tokens in the language model's sequence, so every later mechanism — attention, the KV cache, long-context limits — applies to them unchanged.
`,
            whyNow: md`
Vision towers trained with SigLIP-style losses are the de facto encoders inside open VLMs (PaliGemma, the Gemma 3 family, Qwen-VL, many LLaVA variants), and the shape of the problem shifted from "can the model see" to "what does seeing cost". Document understanding, screenshots for computer-use agents, and video all push token counts up; native-resolution encoders, token pooling (2D average pooling after the tower, as Qwen2-VL and others do) and resamplers are the levers teams pull.

The second shift is evaluation: models hallucinate objects and misread counts and text, and the mitigations are mostly data (grounded captions with boxes, synthetic reading tasks) rather than architecture. Reading a VLM paper in 2026 means looking at the data mixture and the token budget per image before the benchmark table.
`,
            pitfalls: md`
- **Batch size is part of the objective.** A CLIP-loss model trained at batch 4k and one at 32k are not the same model; the mutual-information bound explains why. SigLIP is far less sensitive.
- **Zero-shot prompts are a hyperparameter.** "a photo of a {class}" versus "{class}" moves ImageNet zero-shot accuracy by several points; prompt ensembles are standard.
- **Resolution mismatch.** A tower pretrained at 224 or 384 pixels does not read small text; tiling helps but multiplies tokens and breaks objects across tile boundaries.
- **Projector-only alignment is shallow.** Stage 1 teaches the language model to accept image tokens, not to reason over them; skipping stage 2 gives a captioner, not an assistant.
- **Hallucination is a data property.** Towers trained on alt-text learn alt-text's habits, including describing what is usually there rather than what is. Grounded data and negative examples reduce it; a bigger tower alone does not.
- **Contamination.** Web-scale pairs overlap with public benchmarks; a near-duplicate filter against the evaluation sets is part of a credible training recipe.
`,
        },
        sources: [
            {title: 'Learning Transferable Visual Models From Natural Language Supervision (CLIP)', url: 'https://arxiv.org/abs/2103.00020', kind: 'paper', year: 2021},
            {title: 'Sigmoid Loss for Language Image Pre-Training (SigLIP)', url: 'https://arxiv.org/abs/2303.15343', kind: 'paper', year: 2023},
            {title: 'SigLIP 2: Multilingual Vision-Language Encoders with Improved Semantic Understanding, Localization, and Dense Features', url: 'https://arxiv.org/abs/2502.14786', kind: 'paper', year: 2025},
            {title: 'Visual Instruction Tuning (LLaVA)', url: 'https://arxiv.org/abs/2304.08485', kind: 'paper', year: 2023},
            {title: 'PaliGemma: A versatile 3B VLM for transfer', url: 'https://arxiv.org/abs/2407.07726', kind: 'paper', year: 2024},
            {title: 'Qwen2-VL: Enhancing Vision-Language Model\'s Perception of the World at Any Resolution', url: 'https://arxiv.org/abs/2409.12191', kind: 'paper', year: 2024},
            {title: 'BLIP-2: Bootstrapping Language-Image Pre-training with Frozen Image Encoders and Large Language Models', url: 'https://arxiv.org/abs/2301.12597', kind: 'paper', year: 2023, note: 'The Q-Former: a resampler between a frozen tower and a frozen language model.'},
        ],
        cards: [
            {id: 'cv-clip-vlm/infonce-bound', front: 'What does InfoNCE certify about mutual information, and what does it imply for CLIP batch sizes?', back: '$I(u;v) \\ge \\log N - \\mathcal{L}$: a batch of $N$ pairs can certify at most $\\log N$ nats. Gains from larger batches grow only logarithmically, so CLIP wants very large batches and flattens past them.', tags: ['clip', 'infonce']},
            {id: 'cv-clip-vlm/siglip-why', front: 'Why does the sigmoid loss train well at batch sizes where the softmax contrastive loss saturates?', back: 'Each (image, text) pair is an independent binary classification with a learned bias for the positive/negative imbalance, so no global $N \\times N$ normalisation is needed and the loss decomposes across devices.', tags: ['siglip']},
            {id: 'cv-clip-vlm/three-parts', front: 'Name the three parts of a LLaVA-style VLM and what each is initialised from.', back: 'A vision tower (a pretrained CLIP or SigLIP encoder), a projector (trained from scratch: linear, MLP or resampler) and a pretrained language model that reads image tokens interleaved with text.', tags: ['vlm', 'architecture']},
            {id: 'cv-clip-vlm/stages', front: 'What do the two training stages of a LLaVA-style VLM teach?', back: 'Stage 1 (projector only, captions) teaches the language model to accept image tokens; stage 2 (instruction data, language model unfrozen) teaches it to reason and converse over them.', tags: ['vlm', 'training']},
            {id: 'cv-clip-vlm/tokens-per-image', front: 'Why is tokens-per-image the central design number of a VLM?', back: 'Every patch becomes a language-model token: it sets latency, KV-cache size and the context left for text. A 384-pixel SigLIP tile is 729 tokens; a tiled page runs to thousands.', tags: ['vlm', 'cost']},
            {id: 'cv-clip-vlm/resampler', front: 'What does a perceiver-style resampler trade for a fixed token count?', back: 'Spatial detail. $k$ learned queries cross-attend to $n$ patches and emit $k$ tokens regardless of $n$, bounding cost but discarding fine-grained layout that linear projectors keep.', tags: ['vlm', 'resampler']},
            {id: 'cv-clip-vlm/zero-shot', front: 'How does CLIP classify zero-shot, and what is the hidden hyperparameter?', back: 'It embeds each class name inside a prompt template and picks the caption nearest the image embedding. The template ("a photo of a …") and prompt ensembling move accuracy by several points.', tags: ['clip', 'eval']},
        ],
        problems: [
            {
                id: 'cv-clip-vlm/p1',
                kind: 'derivation',
                title: 'What a batch can certify',
                statement: md`
The InfoNCE loss with $N$ pairs satisfies $I(u; v) \ge \log N - \mathcal{L}_{\text{InfoNCE}}$.

1. Derive the bound from the loss (sketch why the softmax over $N$ candidates caps the estimator).
2. A CLIP run uses a batch of 32,768 pairs. In nats, what is the most mutual information between image and text embeddings that a perfectly fitted batch of that size can certify?

Give the second answer to one decimal place.
`,
                hints: ['The loss for a single positive among $N$ candidates is at least 0 and at most $\\log N$ when the model is uninformative.', '$\\log 32768 = 15 \\log 2$.'],
                solution: md`
1. Write the loss as $\mathcal{L} = -\mathbb{E}\log \frac{f(u, v)}{\sum_{j} f(u, v_j)}$ with $f = e^{s}$. The optimal critic satisfies $f(u,v) \propto p(v \mid u)/p(v)$; substituting gives $\mathcal{L} \ge \mathbb{E}\log\!\big(1 + (N-1)\,\tfrac{p(v)}{p(v\mid u)}\big) - \dots$ and, after the standard manipulation (Oord et al. 2018, van den Oord's appendix), $\mathcal{L} \ge \log N - I(u;v)$, hence $I(u; v) \ge \log N - \mathcal{L}$. The estimator saturates at $\log N$ because even a perfect critic cannot score the positive above $N$ candidates by more than $\log N$ nats.
2. $\log 32768 = 15 \ln 2 \approx 10.4$ nats. A perfectly fitted batch of 32,768 certifies at most about 10.4 nats of shared information between the two embeddings; doubling the batch adds $\ln 2 \approx 0.69$ nats, the logarithmic flattening that made SigLIP's independence from batch size attractive.
`,
                answer: '10.4',
                tolerance: 0.06,
                unit: 'nats',
            },
        ],
    },
    {
        id: 'cv-open-vocab-detection',
        track: 'cv',
        title: 'DETR and open-vocabulary detection',
        oneLiner: 'Set prediction with Hungarian matching replaced anchors; text queries replaced fixed class heads, and the labelling budget moved to prompts.',
        readingMinutes: 22,
        sections: {
            idea: md`
Detection used to be assembled from parts: anchor boxes at every location, a classifier and regressor per anchor, non-maximum suppression to remove duplicates. **DETR** (2020) reframed it as direct set prediction. A transformer decoder takes a fixed number of learned object queries, attends to the image features, and emits one box and class per query — including a "no object" class. Training matches the predictions to the ground-truth boxes one-to-one with the Hungarian algorithm, so each ground-truth object is claimed by exactly one query and the model learns to produce no duplicates. There are no anchors and no suppression step.

The original DETR converged slowly and handled small objects poorly. **Deformable DETR** attends to a small learned set of sampling points around a reference instead of every pixel, which restores multi-scale features and cuts training from 500 epochs to 50. **DINO** (the detector, not the self-supervised method) added denoising training — feeding noised ground-truth boxes as extra queries that the model must reconstruct — contrastive denoising, and mixed query selection, and became the standard DETR-family baseline.

**Open-vocabulary detection** replaces the fixed class head with text. The classifier logits become similarities between region features and text embeddings of the category names, so new categories are new strings. OWL-ViT fine-tunes a CLIP ViT end-to-end for detection with lightweight box and class heads on every output token; GLIP and **Grounding DINO** fuse language and image features early (cross-attention between the text encoder and the image backbone) and are trained on grounding data — phrases aligned to boxes — so a free-form query such as "the red cup left of the laptop" returns boxes. Grounding DINO is now the usual front end for "detect anything named", with SAM behind it for masks.
`,
            maths: md`
**The matching problem.** Let $\hat{y} = \{\hat{y}_i\}_{i=1}^{M}$ be the $M$ predictions (object queries) and $y = \{y_j\}$ the ground truth padded with $\varnothing$ to size $M$. DETR searches the permutation $\sigma$ that minimises the matching cost

$$
\hat{\sigma} = \arg\min_{\sigma \in \mathfrak{S}_M} \sum_{i=1}^{M} \mathcal{C}_{\text{match}}\big(y_i, \hat{y}_{\sigma(i)}\big), \qquad
\mathcal{C}_{\text{match}} = -\mathbb{1}_{\{c_i \neq \varnothing\}}\,\hat{p}_{\sigma(i)}(c_i) + \mathbb{1}_{\{c_i \neq \varnothing\}}\,\mathcal{L}_{\text{box}}(b_i, \hat{b}_{\sigma(i)}),
$$

found by the Hungarian algorithm in $O(M^3)$. The training loss is then applied to the matched pairs only:

$$
\mathcal{L} = \sum_{i=1}^{M}\Big[-\log \hat{p}_{\hat\sigma(i)}(c_i) + \mathbb{1}_{\{c_i \neq \varnothing\}}\,\mathcal{L}_{\text{box}}(b_i, \hat{b}_{\hat\sigma(i)})\Big],
\qquad \mathcal{L}_{\text{box}} = \lambda_{\text{iou}}\,\mathcal{L}_{\text{GIoU}} + \lambda_{L1}\,\|b - \hat{b}\|_1.
$$

The $L_1$ term alone is scale-sensitive (a small box's error is small in pixels), so generalised IoU is added; both are computed on normalised box coordinates.

**Deformable attention.** For query $q$ with reference point $p_q$, instead of attending over all $HW$ positions the module samples $K$ offsets per head:

$$\operatorname{DeformAttn}(z_q, p_q, x) = \sum_{m=1}^{H}W_m\sum_{k=1}^{K} A_{mqk}\; W'_m\, x\big(p_q + \Delta p_{mqk}\big),$$

with offsets $\Delta p_{mqk}$ and weights $A_{mqk}$ predicted from $z_q$; the cost is $O(KHW_{\text{queries}})$ rather than $O(H^2W^2)$, which is what makes multi-scale feature maps affordable.

**Open-vocabulary logits.** With region features $r_i$ and text embeddings $t_c$ for category names $c$, the class scores are

$$s_{ic} = \frac{r_i^{\top} t_c}{\tau}, \qquad \hat{p}_i(c) = \sigma(s_{ic}) \text{ or } \operatorname{softmax}_c(s_{ic}),$$

so adding a category is adding a row $t_c$. Grounding losses treat each word or phrase of the caption as a class, matching boxes to token spans; "no object" becomes "matches no phrase".
`,
            code: md`
Hungarian matching and the matched loss, in the shape DETR uses. The cost matrix is built for one image; SciPy's linear-sum-assignment returns the permutation.

\`\`\`python
import torch
from scipy.optimize import linear_sum_assignment
from torchvision.ops import generalized_box_iou

def match(pred_logits, pred_boxes, gt_classes, gt_boxes, w_cls=1.0, w_l1=5.0, w_giou=2.0):
    # pred_logits: (M, C+1) including no-object; pred_boxes: (M, 4) cxcywh in [0,1]
    # gt_classes: (G,), gt_boxes: (G, 4). Returns matched (pred_idx, gt_idx).
    prob = pred_logits.softmax(-1)                         # (M, C+1)
    cost_cls = -prob[:, gt_classes]                        # (M, G): higher prob, lower cost
    cost_l1 = torch.cdist(pred_boxes, gt_boxes, p=1)       # (M, G)
    cost_giou = -generalized_box_iou(to_xyxy(pred_boxes), to_xyxy(gt_boxes))
    cost = w_cls * cost_cls + w_l1 * cost_l1 + w_giou * cost_giou
    pred_idx, gt_idx = linear_sum_assignment(cost.detach().cpu())   # Hungarian, O(M^3)
    return torch.as_tensor(pred_idx), torch.as_tensor(gt_idx)

def set_loss(pred_logits, pred_boxes, gt_classes, gt_boxes, no_object_weight=0.1):
    pi, gi = match(pred_logits, pred_boxes, gt_classes, gt_boxes)
    target = torch.full((pred_logits.shape[0],), pred_logits.shape[1] - 1)   # all "no object"
    target[pi] = gt_classes[gi]                                               # except the matched
    weights = torch.ones(pred_logits.shape[1]); weights[-1] = no_object_weight
    loss_cls = torch.nn.functional.cross_entropy(pred_logits, target, weight=weights)
    loss_box = (pred_boxes[pi] - gt_boxes[gi]).abs().sum(-1).mean() \
             + (1 - generalized_box_iou(to_xyxy(pred_boxes[pi]), to_xyxy(gt_boxes[gi])).diag()).mean()
    return loss_cls + loss_box

def to_xyxy(b):
    cx, cy, w, h = b.unbind(-1)
    return torch.stack([cx - w/2, cy - h/2, cx + w/2, cy + h/2], -1)
\`\`\`

Two details carry the design: the no-object class is down-weighted because most of the $M$ queries match nothing, and the box loss is computed only on matched queries — an unmatched query is supervised only to say "no object".
`,
            whyNow: md`
Detection stopped being a closed-set problem. Grounding DINO and its successors (Grounding DINO 1.5 and 1.6, the Florence-2 family, OWLv2's self-training at web scale) answer natural-language queries with boxes, SAM turns those boxes into masks, and a VLM can verify the result. The labelling budget moved from drawing boxes for a fixed taxonomy to writing prompts and checking outputs, which is a different engineering loop: prompt sets, thresholds per phrase and verification sampling replace annotation guidelines.

The DETR family also won the closed-set race on its own terms: RT-DETR matches YOLO-class latency with set prediction and no suppression, so the "transformers are slow for detection" objection no longer holds at real-time budgets. What has not changed is the long tail: open-vocabulary models are only as good as the text encoder's notion of a rare category, and grounding data is still concentrated on common objects.
`,
            pitfalls: md`
- **Matching instability early in training.** With random initialisation the Hungarian assignment flips between epochs; denoising queries (DN-DETR, DINO) stabilise it and are the main reason modern DETRs converge in tens of epochs.
- **Query count is a capacity cap.** $M$ queries can detect at most $M$ objects; crowded scenes need more queries and pay in decoder cost.
- **Phrase thresholds are not class thresholds.** In Grounding DINO a box's score is a maximum over text tokens; a long prompt with many phrases dilutes scores and needs per-prompt calibration.
- **Vocabulary leakage in evaluation.** "Zero-shot" LVIS numbers are only zero-shot if the category names and their synonyms were held out of the grounding data; many reported numbers are not.
- **Small objects and resolution.** Deformable attention restored multi-scale features, but the text-fused models often run at lower resolution than specialised detectors; check the input size before comparing mAP.
- **Prompt engineering is part of the model.** The same detector returns different boxes for "person" and "people"; evaluation and deployment prompts must match.
`,
        },
        sources: [
            {title: 'End-to-End Object Detection with Transformers (DETR)', url: 'https://arxiv.org/abs/2005.12872', kind: 'paper', year: 2020},
            {title: 'Deformable DETR: Deformable Transformers for End-to-End Object Detection', url: 'https://arxiv.org/abs/2010.04159', kind: 'paper', year: 2020},
            {title: 'DINO: DETR with Improved DeNoising Anchor Boxes for End-to-End Object Detection', url: 'https://arxiv.org/abs/2203.03605', kind: 'paper', year: 2022},
            {title: 'Simple Open-Vocabulary Object Detection with Vision Transformers (OWL-ViT)', url: 'https://arxiv.org/abs/2205.06230', kind: 'paper', year: 2022},
            {title: 'Grounded Language-Image Pre-training (GLIP)', url: 'https://arxiv.org/abs/2112.03857', kind: 'paper', year: 2021},
            {title: 'Grounding DINO: Marrying DINO with Grounded Pre-Training for Open-Set Object Detection', url: 'https://arxiv.org/abs/2303.05499', kind: 'paper', year: 2023},
            {title: 'DETRs Beat YOLOs on Real-time Object Detection (RT-DETR)', url: 'https://arxiv.org/abs/2304.08069', kind: 'paper', year: 2023},
        ],
        cards: [
            {id: 'cv-open-vocab-detection/set-prediction', front: 'What two components of classical detectors does DETR remove, and what replaces them?', back: 'Anchor boxes and non-maximum suppression. A fixed set of learned object queries emits one box and class each, and one-to-one Hungarian matching during training makes duplicates unprofitable.', tags: ['detr']},
            {id: 'cv-open-vocab-detection/hungarian-cost', front: 'What does the Hungarian algorithm minimise in DETR, and at what cost?', back: 'The sum over queries of the matching cost (negative class probability plus the box loss, $L_1$ and GIoU) over all permutations, in $O(M^3)$ for $M$ queries. The training loss is then applied only to the matched pairs.', tags: ['detr', 'matching']},
            {id: 'cv-open-vocab-detection/giou', front: 'Why is GIoU added to the $L_1$ box loss?', back: '$L_1$ on coordinates is scale-sensitive: a small box\'s error is small in absolute terms. GIoU is scale-invariant and stays informative for non-overlapping boxes.', tags: ['detr', 'loss']},
            {id: 'cv-open-vocab-detection/deformable', front: 'What does deformable attention change, and what does it buy?', back: 'Each query attends to $K$ learned sampling points around a reference instead of every position: cost $O(K)$ per query rather than $O(HW)$, which makes multi-scale feature maps affordable and cut DETR training from 500 epochs to 50.', tags: ['deformable']},
            {id: 'cv-open-vocab-detection/denoising', front: 'What is denoising training in DN-DETR and DINO, and what problem does it solve?', back: 'Noised ground-truth boxes are fed as extra queries that the decoder must reconstruct, with a known target. It stabilises the early Hungarian matching, which otherwise flips between epochs and slows convergence.', tags: ['dino', 'training']},
            {id: 'cv-open-vocab-detection/open-vocab', front: 'How does an open-vocabulary detector classify a region?', back: 'By similarity between the region feature and text embeddings of category names or phrases: $s_{ic} = r_i^{\\top} t_c / \\tau$. A new category is a new text row; grounding data aligns phrases to boxes.', tags: ['open-vocabulary']},
            {id: 'cv-open-vocab-detection/zero-shot-caveat', front: 'When is a "zero-shot" open-vocabulary detection number not zero-shot?', back: 'When the evaluation categories, or their synonyms, appeared in the grounding or caption data. Credible results hold the category names out.', tags: ['eval']},
        ],
        problems: [
            {
                id: 'cv-open-vocab-detection/p1',
                kind: 'quant',
                title: 'A matching by hand',
                statement: md`
An image has two ground-truth objects, $y_1$ and $y_2$, and the detector has three queries $\hat{y}_a, \hat{y}_b, \hat{y}_c$. The matching costs $\mathcal{C}_{\text{match}}$ (class term plus box term) are:

| | $y_1$ | $y_2$ |
|---|---|---|
| $\hat{y}_a$ | 0.9 | 0.2 |
| $\hat{y}_b$ | 0.3 | 0.6 |
| $\hat{y}_c$ | 0.5 | 0.4 |

One query will be matched to $\varnothing$ (no object), at a matching cost of 0. What is the minimum total matching cost, and which query is left unmatched?
`,
                hints: ['Pad the ground truth with a third column of zeros and try the six permutations.', 'The greedy choice (take 0.2 first) is not the minimum.'],
                solution: md`
Pad with $y_3 = \varnothing$ at cost 0 for every query, then evaluate the six assignments of $\{a, b, c\}$ to $\{y_1, y_2, \varnothing\}$:

- $a \to y_1, b \to y_2$: $0.9 + 0.6 = 1.5$
- $a \to y_1, c \to y_2$: $0.9 + 0.4 = 1.3$
- $b \to y_1, a \to y_2$: $0.3 + 0.2 = 0.5$
- $b \to y_1, c \to y_2$: $0.3 + 0.4 = 0.7$
- $c \to y_1, a \to y_2$: $0.5 + 0.2 = 0.7$
- $c \to y_1, b \to y_2$: $0.5 + 0.6 = 1.1$

The minimum is $0.5$: $\hat{y}_b$ takes $y_1$, $\hat{y}_a$ takes $y_2$ and $\hat{y}_c$ is supervised to predict "no object". The greedy path — take the cheapest cell 0.2 ($a \to y_2$), then the cheapest remaining row for $y_1$ — happens to coincide here, but with $0.3$ replaced by $0.95$ it would not, which is why DETR solves the assignment exactly.
`,
                answer: '0.5',
            },
        ],
    },
    {
        id: 'cv-segment-anything',
        track: 'cv',
        title: 'Promptable segmentation: SAM and SAM 2',
        oneLiner: 'Masks are an API; the model-labels, human-fixes, retrain loop is the template for building any vision dataset.',
        readingMinutes: 24,
        prerequisites: ['cv-vit-dinov2'],
        sections: {
            idea: md`
The Segment Anything Model (SAM) reframed segmentation as a **promptable** task: given an image and a prompt — a point, a box, a rough mask, or in later variants a phrase — return the mask of the thing the prompt refers to. Three design choices follow from that framing. The image is encoded once by a heavy ViT (a masked-autoencoder-pretrained ViT-H at 1024 by 1024 pixels) into a 64 by 64 grid of 256-dimensional embeddings; prompts are encoded cheaply (positional encodings for points and boxes, a small convolution for masks); and a light two-way transformer **mask decoder** fuses the two and emits masks in a few milliseconds, so one image embedding serves hundreds of interactive prompts. Because a point is ambiguous — the tip of a finger, the hand, or the person — the decoder returns three masks at once with a predicted IoU score for each, and training uses the minimum loss over the three.

The model is half the paper. The other half is the **data engine**, the loop that built SA-1B: 11 million licensed images and 1.1 billion masks. In the assisted stage, annotators corrected masks SAM proposed in a browser tool, and the model was retrained on the growing set; in the semi-automatic stage SAM annotated the confident objects first and humans added what it missed; in the fully automatic stage SAM was prompted with a regular 32 by 32 grid of points per image, the resulting masks were filtered by predicted IoU and stability under threshold shifts, and duplicates were removed with non-maximum suppression. Each stage made the next cheaper, and the final dataset is 99.1 percent machine-generated masks that were never touched by a person.

**SAM 2** extends the task to video: a prompt on any frame defines an object, and the model propagates its mask through the clip. The image encoder becomes a hierarchical Hiera backbone; a **memory bank** stores the encoder features of recent frames and of the prompted frames, each fused with its predicted mask by a memory encoder; and a **memory attention** module lets the current frame's features attend to that bank (plus small *object pointer* vectors, one per stored frame) before the same mask decoder runs. An occlusion head predicts whether the object is present at all. The data engine ran again, for video: SA-V has 51 thousand videos and 643 thousand spatio-temporal masks (masklets), most of them corrected or produced by SAM 2 itself in the loop.

The reason to study SAM is less the architecture than the method: a model good enough to propose, a tool that makes correction cheaper than annotation from scratch, a retrain cycle, and quality filters computed by the model on its own outputs. That loop is how most production vision datasets are now built, whatever the task.
`,
            maths: md`
**The decoder's two-way attention.** With image embedding $F \in \mathbb{R}^{4096 \times 256}$ (the 64 by 64 grid flattened) and prompt tokens $T \in \mathbb{R}^{m \times 256}$ — the sparse prompt encodings plus learned output tokens for the three masks and the IoU head — one decoder layer applies, in order, self-attention over $T$, cross-attention from tokens to the image, a pointwise MLP, and cross-attention from the image to the tokens:

$$T \leftarrow T + \operatorname{Attn}(T, T, T), \quad T \leftarrow T + \operatorname{Attn}(T, F, F), \quad T \leftarrow T + \operatorname{MLP}(T), \quad F \leftarrow F + \operatorname{Attn}(F, T, T).$$

Two such layers, then the updated image embedding is upsampled four times and each mask token's MLP output $w_k \in \mathbb{R}^{32}$ is dotted with the upsampled embedding pixelwise to give logits $M_k = F_{\uparrow} w_k$. Three masks are produced; the IoU token predicts a score $\hat{\iota}_k$ for each.

**The ambiguity-aware loss.** For ground truth $M^{*}$ the loss on a prompt is taken over the closest of the three predictions,

$$\mathcal{L} = \min_{k \in \{1,2,3\}} \big[\, 20\, \mathcal{L}_{\text{focal}}(M_k, M^{*}) + \mathcal{L}_{\text{dice}}(M_k, M^{*}) \,\big] + \sum_{k} \big(\hat{\iota}_k - \operatorname{IoU}(M_k, M^{*})\big)^2,$$

so only the best-matching head receives a mask gradient, and the IoU head learns to rank the three. Training simulates an interactive session: a point sampled from the object, then up to eleven rounds of points sampled from the error region of the current prediction, with the previous mask logits fed back as a prompt.

**The automatic-mask filters.** For a point-grid mask with logits $\ell$, binarised at threshold $\tau$, the stability score is

$$s = \operatorname{IoU}\big(\mathbb{1}[\ell > \tau + \delta],\ \mathbb{1}[\ell > \tau - \delta]\big),$$

and a mask is kept when $\hat{\iota} > 0.88$ and $s > 0.95$: a confident mask whose boundary does not move when the threshold does.

**Memory attention in SAM 2.** For the current frame's features $F_t$ and the memory bank $\{(\tilde{F}_i, o_i)\}$ of $K$ stored frames' memory-encoded features and object pointers, the conditioned features are $L$ layers of self-attention on $F_t$ interleaved with cross-attention to the concatenated memory:

$$F_t \leftarrow F_t + \operatorname{Attn}\big(F_t,\ [\tilde{F}_1; \dots; \tilde{F}_K; o_1; \dots; o_K],\ \cdot\big),$$

with temporal position added to the recent frames' memories only, so the model knows how old a memory is but treats prompted frames as timeless anchors. The bank is a FIFO of the $N$ most recent frames plus up to $M$ prompted frames.
`,
            code: md`
The interactive pattern in a few lines: one encoder pass, many cheap decodes. The decoder below is a stand-in with the right shapes; the real one is two two-way layers.

\`\`\`python
import torch, torch.nn as nn

class TwoWayLayer(nn.Module):
    def __init__(self, d=256, heads=8):
        super().__init__()
        self.self_attn = nn.MultiheadAttention(d, heads, batch_first=True)
        self.t2i = nn.MultiheadAttention(d, heads, batch_first=True)   # tokens attend to image
        self.mlp = nn.Sequential(nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d))
        self.i2t = nn.MultiheadAttention(d, heads, batch_first=True)   # image attends to tokens
        self.n = nn.ModuleList([nn.LayerNorm(d) for _ in range(4)])

    def forward(self, tokens, image):                  # tokens (B, m, d), image (B, 4096, d)
        tokens = self.n[0](tokens + self.self_attn(tokens, tokens, tokens)[0])
        tokens = self.n[1](tokens + self.t2i(tokens, image, image)[0])
        tokens = self.n[2](tokens + self.mlp(tokens))
        image = self.n[3](image + self.i2t(image, tokens, tokens)[0])
        return tokens, image

def decode(image_emb, prompt_tokens, layers, mask_mlp, iou_mlp, out_tokens):
    tokens = torch.cat([out_tokens.expand(image_emb.shape[0], -1, -1), prompt_tokens], dim=1)
    image = image_emb
    for layer in layers:
        tokens, image = layer(tokens, image)
    mask_tok, iou_tok = tokens[:, :3], tokens[:, 3]          # three mask tokens, one IoU token
    up = upsample(image.transpose(1, 2).reshape(-1, 256, 64, 64))   # (B, 32, 256, 256)
    w = mask_mlp(mask_tok)                                   # (B, 3, 32)
    logits = torch.einsum("bkc,bchw->bkhw", w, up)           # (B, 3, 256, 256)
    return logits, iou_mlp(iou_tok)                          # pick the mask with the top IoU

with torch.no_grad():
    emb = image_encoder(image)                               # once per image, the slow part
    for prompt in session_prompts:                           # many times, a few ms each
        logits, scores = decode(emb, encode_prompt(prompt), layers, mask_mlp, iou_mlp, out_tokens)
\`\`\`

The thing to notice: nothing about the image is recomputed per prompt, and the three logits come from three learned tokens dotted against one shared pixel embedding, which is why the decoder is small.
`,
            whyNow: md`
Masks became an input to other systems rather than an end product. Open-vocabulary detectors hand their boxes to SAM for pixel-accurate regions (Grounded SAM); 3D pipelines lift SAM masks across views into object-level reconstructions; robot manipulation stacks use SAM 2 to track the object a policy is acting on; medical imaging groups fine-tune SAM on CT and MRI with a few thousand masks rather than training from scratch. The API — image, prompt, mask — is stable enough that products build on it, and the lineage of efficient variants (EfficientSAM, MobileSAM, HQ-SAM for sharper boundaries) are drop-in replacements behind the same call.

The data engine is the part that generalises. Every large vision dataset since has been built the same way: a model proposes, people correct in a tool measured in seconds per fix, the model is retrained, and automatic quality filters computed from the model's own confidence and stability decide what needs no person at all. Knowing the three stages and the two filters is knowing how to budget an annotation project.
`,
            pitfalls: md`
- **Ambiguity is a feature.** A single point returns three masks; taking the first instead of the one with the highest predicted IoU, or ignoring the multi-mask output for small objects, is the most common integration error.
- **The encoder is the cost.** ViT-H at 1024 pixels is about 0.4 seconds on a server GPU; the decoder is milliseconds. Cache embeddings; for video or realtime use SAM 2's Hiera encoder or an efficient variant.
- **Boundaries.** Masks are decoded at 256 by 256 and upsampled; thin structures and fine edges blur. HQ-SAM adds a high-quality output token trained on fine masks for that case.
- **Automatic masks are not semantic.** The point-grid output segments *everything* — parts, wholes, texture regions — with no labels. Pair it with a detector or a vision-language model for names.
- **SAM 2 memory on long videos.** The FIFO bank holds a handful of frames; an object that leaves for longer than the bank's horizon and returns is re-identified only through the prompted-frame memories and object pointers. Re-prompt on reappearance in production.
- **Licensing.** SA-1B's images are licensed for research; the model weights are Apache-2.0. Keep the two straight when shipping.
`,
        },
        sources: [
            {title: 'Segment Anything', url: 'https://arxiv.org/abs/2304.02643', kind: 'paper', year: 2023},
            {title: 'SAM 2: Segment Anything in Images and Videos', url: 'https://arxiv.org/abs/2408.00714', kind: 'paper', year: 2024},
            {title: 'Grounded SAM: Assembling Open-World Models for Diverse Visual Tasks', url: 'https://arxiv.org/abs/2401.14159', kind: 'paper', year: 2024},
            {title: 'Segment Anything in High Quality (HQ-SAM)', url: 'https://arxiv.org/abs/2306.01567', kind: 'paper', year: 2023},
            {title: 'EfficientSAM: Leveraged Masked Image Pretraining for Efficient Segment Anything', url: 'https://arxiv.org/abs/2312.00863', kind: 'paper', year: 2023},
            {title: 'Hiera: A Hierarchical Vision Transformer without the Bells-and-Whistles', url: 'https://arxiv.org/abs/2306.00989', kind: 'paper', year: 2023, note: 'The SAM 2 image encoder.'},
            {title: 'facebookresearch/sam2', url: 'https://github.com/facebookresearch/sam2', kind: 'code', year: 2024},
        ],
        cards: [
            {id: 'cv-segment-anything/three-parts', front: 'Name SAM\'s three components and say which one is slow.', back: 'A heavy image encoder (MAE-pretrained ViT-H at 1024 pixels, run once per image: the slow part), a light prompt encoder, and a two-way transformer mask decoder that runs in milliseconds per prompt.', tags: ['sam', 'architecture']},
            {id: 'cv-segment-anything/ambiguity', front: 'Why does SAM output three masks for one point, and how is that trained?', back: 'A point is ambiguous (part, object, whole). Three mask tokens produce three masks; the loss is the minimum over the three, so only the closest head gets the mask gradient, and an IoU head learns to rank them.', tags: ['sam', 'loss']},
            {id: 'cv-segment-anything/data-engine', front: 'What were the three stages of the SAM data engine?', back: 'Assisted (annotators correct SAM proposals, retrain), semi-automatic (SAM annotates confident objects, people add the rest), fully automatic (a 32 by 32 point grid, masks filtered by predicted IoU and stability, then NMS). 99.1 percent of SA-1B is automatic.', tags: ['data', 'annotation']},
            {id: 'cv-segment-anything/stability', front: 'What is the stability score of an automatic mask?', back: 'The IoU between the mask binarised at threshold plus delta and at threshold minus delta. A mask is kept when its boundary does not move with the threshold (score above 0.95) and its predicted IoU is above 0.88.', tags: ['filters']},
            {id: 'cv-segment-anything/memory', front: 'How does SAM 2 carry an object across frames?', back: 'A memory bank of recent and prompted frames\' encoder features fused with their masks (plus one object-pointer vector each); the current frame\'s features cross-attend to it in memory attention before the mask decoder runs. An occlusion head says whether the object is visible.', tags: ['sam2', 'video']},
            {id: 'cv-segment-anything/temporal-pos', front: 'Which memories in SAM 2 carry temporal position, and why the difference?', back: 'Only the recent-frame memories; prompted frames are anchors treated as timeless, so the model knows how old a recent memory is but does not discount a user\'s prompt by its distance in time.', tags: ['sam2']},
            {id: 'cv-segment-anything/cost', front: 'Where does the compute go in an interactive SAM session, and what follows for system design?', back: 'Almost all in the one encoder pass (about 0.4 s for ViT-H); each decode is a few ms. So cache the embedding per image and treat prompts as free; for video or realtime, use a lighter encoder.', tags: ['cost', 'systems']},
        ],
        problems: [
            {
                id: 'cv-segment-anything/p1',
                kind: 'quant',
                title: 'What memory attention attends over',
                statement: md`
A SAM 2 configuration stores spatial memory for the 6 most recent frames and 1 prompted frame. Each stored frame's memory is a 64 by 64 grid of memory-encoded features, and each stored frame also contributes one object-pointer token.

1. How many spatial memory tokens does the bank hold at most?
2. Including the object pointers, how many tokens does the current frame's memory attention cross-attend over at most?
3. The current frame itself is a 64 by 64 grid. By what factor is one cross-attention layer's score matrix larger than one self-attention layer's on the frame alone?

Give the second answer: the number of tokens cross-attended over, pointers included.
`,
                hints: ['A 64 by 64 grid is 4096 tokens, and there are 7 stored frames.', 'Add one pointer per stored frame to the spatial tokens.'],
                solution: md`
1. Seven frames of $64 \times 64 = 4096$ tokens each: $7 \times 4096 = 28{,}672$ spatial memory tokens.
2. Plus seven object pointers: $28{,}672 + 7 = 28{,}679$ tokens.
3. Self-attention on the frame scores $4096 \times 4096$ pairs; cross-attention scores $4096 \times 28{,}679$, so about $7.0$ times larger — which is why SAM 2 keeps the bank small and runs memory attention at the encoder's lowest resolution.
`,
                answer: '28679',
            },
        ],
    },
    {
        id: 'cv-diffusion-flow',
        track: 'cv',
        title: 'Diffusion to flow matching: DDPM, rectified flow, DiT, guidance, few-step distillation',
        oneLiner: 'Rectified flow on a transformer is the production recipe; the maths explains guidance scale, timestep shift and why few-step models exist.',
        readingMinutes: 30,
        prerequisites: ['cv-vit-dinov2'],
        sections: {
            idea: md`
A diffusion model learns to reverse a process that destroys data. **DDPM** defines a forward chain that adds Gaussian noise over $T$ steps until an image is indistinguishable from noise, and trains a network to predict the noise that was added at a random step; sampling runs the chain backwards, denoising a little at each of hundreds of steps. The score-based view (Song et al.) says the same thing in continuous time: the forward process is a stochastic differential equation, the network estimates the gradient of the log density of the noisy data (the *score*), and sampling integrates either the reverse SDE or an equivalent deterministic *probability-flow* ODE.

**Flow matching** and **rectified flow** arrive at a simpler recipe. Define a straight-line path between a noise sample and a data sample, $x_t = (1-t)\,x_0 + t\,\varepsilon$ with $t \in [0,1]$ (data at $t=0$, noise at $t=1$ in the convention used below), and train a network to predict the constant velocity of that line, $\varepsilon - x_0$. The training loss is a plain regression; sampling integrates the learned velocity field with an ODE solver. Straight paths mean fewer, larger steps work, and the scheme has no variance schedule to tune. Stable Diffusion 3 and FLUX train this way, with a *logit-normal* distribution over $t$ that spends most training steps in the middle of the path where the velocity is hardest to predict.

The backbone changed at the same time. The convolutional U-Net gave way to the **Diffusion Transformer (DiT)**: latents from a VAE are patchified into tokens, the timestep and the class or text conditioning enter through adaptive layer norm (adaLN) whose scale and shift are regressed from the conditioning vector, and the network is a plain stack of transformer blocks. DiT scales predictably with compute, which U-Nets did not, and the multimodal variant (MM-DiT) runs text and image tokens through separate weights joined by attention.

Two further ideas carry the rest of the recipe. **Classifier-free guidance** trains one network for both conditional and unconditional prediction (dropping the condition some fraction of the time) and at sampling time extrapolates from the unconditional prediction toward the conditional one, trading diversity for prompt adherence with a single scalar. And **distillation** — progressive distillation, consistency models, adversarial and rectifying variants — turns a model that needs 30 to 50 solver steps into one that needs 1 to 4, by training a student to jump along the teacher's trajectory.
`,
            maths: md`
**DDPM forward process.** With a variance schedule $\beta_1, \dots, \beta_T$, $\alpha_t = 1 - \beta_t$ and $\bar{\alpha}_t = \prod_{s \le t} \alpha_s$,

$$q(x_t \mid x_0) = \mathcal{N}\!\big(\sqrt{\bar{\alpha}_t}\, x_0,\ (1 - \bar{\alpha}_t) I\big), \qquad x_t = \sqrt{\bar{\alpha}_t}\, x_0 + \sqrt{1 - \bar{\alpha}_t}\, \varepsilon,$$

and the simplified training objective is $\mathbb{E}_{t, x_0, \varepsilon}\, \|\varepsilon - \varepsilon_\theta(x_t, t)\|^2$. The noise prediction is a scaled score: $\nabla_{x_t} \log q(x_t \mid x_0) = -\varepsilon / \sqrt{1 - \bar{\alpha}_t}$.

**Rectified flow.** On the linear path $x_t = (1-t) x_0 + t\, \varepsilon$ the target velocity is $v^{*} = \varepsilon - x_0$, and the loss is

$$\mathcal{L}_{\text{RF}} = \mathbb{E}_{t \sim p(t),\, x_0,\, \varepsilon}\, \big\| v_\theta(x_t, t) - (\varepsilon - x_0) \big\|^2 .$$

Sampling integrates $\frac{\mathrm{d}x}{\mathrm{d}t} = v_\theta(x, t)$ from $t=1$ to $t=0$; an Euler step is $x_{t - \Delta} = x_t - \Delta\, v_\theta(x_t, t)$. SD3 draws $t$ from a logit-normal, $\operatorname{logit}(t) \sim \mathcal{N}(m, s^2)$, and applies a **timestep shift** for higher resolutions: with $\sigma = t$ the noise level, the shifted level is

$$\sigma_{\text{shift}} = \frac{\alpha\, \sigma}{1 + (\alpha - 1)\, \sigma},$$

with $\alpha = \sqrt{n / n_{\text{ref}}}$ for $n$ latent tokens, because the same noise destroys less of a larger image, so the schedule must spend more steps at high noise.

**Classifier-free guidance.** With a conditional prediction $\varepsilon_\theta(x_t, c)$ and an unconditional one $\varepsilon_\theta(x_t, \varnothing)$, the guided prediction with scale $w$ is

$$\tilde{\varepsilon} = \varepsilon_\theta(x_t, \varnothing) + (1 + w)\,\big(\varepsilon_\theta(x_t, c) - \varepsilon_\theta(x_t, \varnothing)\big) = (1 + w)\, \varepsilon_\theta(x_t, c) - w\, \varepsilon_\theta(x_t, \varnothing),$$

which corresponds to sampling from $p(x \mid c)\, p(c \mid x)^{w}$: the conditional likelihood is sharpened by a power. $w = 0$ is the plain conditional model; typical values are 3 to 8, with saturation and oversmoothing above that.

**Progressive distillation.** A student with step size $2\Delta$ is trained to match two teacher steps of size $\Delta$: for $x_t$, compute the teacher's $x_{t - 2\Delta}$ in two steps, then regress the student's one-step prediction onto it. Halving the step count each round, $T \to T/2 \to \dots \to 4$. Consistency models instead learn a function $f_\theta(x_t, t)$ that maps any point on a trajectory to its endpoint, enforced by $f_\theta(x_t, t) \approx f_{\theta^{-}}(x_{t - \Delta}, t - \Delta)$ along adjacent points.
`,
            code: md`
Rectified-flow training and Euler sampling, with classifier-free guidance by condition dropout. The network is any $(x, t, c) \mapsto v$ with the same shape as $x$; a DiT in practice.

\`\`\`python
import torch

def rf_loss(net, x0, cond, p_uncond=0.1, m=0.0, s=1.0):
    B = x0.shape[0]
    t = torch.sigmoid(m + s * torch.randn(B, device=x0.device))      # logit-normal t in (0, 1)
    eps = torch.randn_like(x0)
    tt = t.view(B, *([1] * (x0.dim() - 1)))
    xt = (1 - tt) * x0 + tt * eps                                     # straight path
    drop = torch.rand(B, device=x0.device) < p_uncond                 # condition dropout
    cond = torch.where(drop.view(B, 1), torch.zeros_like(cond), cond) # a null embedding
    v = net(xt, t, cond)
    return ((v - (eps - x0)) ** 2).mean()

@torch.no_grad()
def sample(net, shape, cond, steps=28, w=4.0, shift=3.0):
    x = torch.randn(shape)
    ts = torch.linspace(1.0, 0.0, steps + 1)
    ts = shift * ts / (1 + (shift - 1) * ts)                          # timestep shift
    null = torch.zeros_like(cond)
    for i in range(steps):
        t, t_next = ts[i], ts[i + 1]
        tb = t.expand(shape[0])
        v_c, v_u = net(x, tb, cond), net(x, tb, null)
        v = v_u + (1 + w) * (v_c - v_u)                               # guidance
        x = x + (t_next - t) * v                                      # Euler, t decreasing
    return x
\`\`\`

Two things to notice: the loss is ordinary regression with no schedule beyond $p(t)$, and guidance doubles the cost of every sampling step because both predictions are needed.
`,
            whyNow: md`
Rectified flow on a transformer is the shared recipe of the current image and video generators: Stable Diffusion 3, FLUX, the Sora-class video models, and most open video models (the video unit). The ingredients that matter in practice are exactly the equations above — which $p(t)$ to train on, how to shift the schedule with resolution, what guidance scale to use, and how many steps the distilled variant needs — and they transfer across modalities because none of them is specific to images.

Distillation is where the cost went. A base model at 30 to 50 steps is a research artefact; the shipped product is a 4-step or 1-step student (adversarial diffusion distillation, latent consistency, rectified-flow re-flowing), and the quality gap between the two closed in 2024–25. Guidance has moved inside the student too: the distilled model is trained on the guided teacher, so it needs one forward pass per step rather than two.
`,
            pitfalls: md`
- **Conventions.** Papers disagree on whether $t = 0$ is data or noise, whether the network predicts $\varepsilon$, $x_0$, $v$ or the score, and whether the schedule is in $\beta$, $\bar{\alpha}$ or $\sigma$. Convert before comparing anything, including guidance scales.
- **Guidance too high** saturates colours and collapses diversity; **too low** ignores the prompt. The useful band is narrow and depends on the model; distilled models often take no guidance at all.
- **Few-step samplers on an undistilled model** give blurry or artefact-ridden output; the solver is not the bottleneck, the curvature of the learned trajectory is. Distill, or re-flow.
- **Timestep shift is not optional at high resolution.** A 1024-pixel model sampled with a 256-pixel schedule spends too few steps at high noise and loses global structure.
- **Latent space is the VAE's.** Artefacts that look like the diffusion model's are often the decoder's; check reconstructions of real images through the VAE first.
- **Evaluation.** FID on 50k samples measures distribution match, not prompt adherence or aesthetics; CLIP score measures text alignment on the same encoder family the model may have been trained toward. Read both, trust neither alone.
`,
        },
        sources: [
            {title: 'Denoising Diffusion Probabilistic Models', url: 'https://arxiv.org/abs/2006.11239', kind: 'paper', year: 2020},
            {title: 'Score-Based Generative Modeling through Stochastic Differential Equations', url: 'https://arxiv.org/abs/2011.13456', kind: 'paper', year: 2020},
            {title: 'Flow Matching for Generative Modeling', url: 'https://arxiv.org/abs/2210.02747', kind: 'paper', year: 2022},
            {title: 'Flow Straight and Fast: Learning to Generate and Transfer Data with Rectified Flow', url: 'https://arxiv.org/abs/2209.03003', kind: 'paper', year: 2022},
            {title: 'Scalable Diffusion Models with Transformers (DiT)', url: 'https://arxiv.org/abs/2212.09748', kind: 'paper', year: 2022},
            {title: 'Scaling Rectified Flow Transformers for High-Resolution Image Synthesis (Stable Diffusion 3)', url: 'https://arxiv.org/abs/2403.03206', kind: 'paper', year: 2024, note: 'The logit-normal timestep distribution and the resolution shift.'},
            {title: 'Classifier-Free Diffusion Guidance', url: 'https://arxiv.org/abs/2207.12598', kind: 'paper', year: 2022},
            {title: 'Consistency Models', url: 'https://arxiv.org/abs/2303.01469', kind: 'paper', year: 2023},
        ],
        cards: [
            {id: 'cv-diffusion-flow/rf-target', front: 'What does a rectified-flow network predict, and what is the training loss?', back: 'The constant velocity of the straight path between noise and data, $\\varepsilon - x_0$, by plain mean-squared regression at a random $t$ on the path; sampling integrates that velocity field with an ODE solver.', tags: ['flow', 'training']},
            {id: 'cv-diffusion-flow/score-noise', front: 'How is DDPM\'s noise prediction related to the score?', back: 'For $x_t = \\sqrt{\\bar\\alpha_t} x_0 + \\sqrt{1-\\bar\\alpha_t}\\varepsilon$, the score is $\\nabla \\log q(x_t|x_0) = -\\varepsilon/\\sqrt{1-\\bar\\alpha_t}$: predicting the noise is predicting a scaled score.', tags: ['ddpm', 'score']},
            {id: 'cv-diffusion-flow/cfg', front: 'Write classifier-free guidance and say what it samples from.', back: '$\\tilde\\varepsilon = (1+w)\\varepsilon(x_t,c) - w\\varepsilon(x_t,\\varnothing)$. It corresponds to $p(x|c)\\,p(c|x)^w$: the conditional likelihood sharpened by a power, trading diversity for adherence. Both predictions are needed, so each step costs two passes.', tags: ['guidance']},
            {id: 'cv-diffusion-flow/shift', front: 'Why does a higher-resolution model need a timestep shift?', back: 'The same noise level destroys less of a larger image, so the schedule must spend more steps at high noise: $\\sigma_{shift} = \\alpha\\sigma/(1+(\\alpha-1)\\sigma)$ with $\\alpha$ growing with the token count.', tags: ['schedule', 'resolution']},
            {id: 'cv-diffusion-flow/dit', front: 'How does conditioning enter a DiT block?', back: 'Through adaptive layer norm: the timestep and class or pooled text embedding regress a scale and shift (and a gate) for each normalisation; text tokens in MM-DiT run through their own weights and meet the image tokens in joint attention.', tags: ['dit', 'architecture']},
            {id: 'cv-diffusion-flow/logit-normal', front: 'Why train with a logit-normal distribution over $t$?', back: 'It concentrates training steps in the middle of the path, where the velocity is hardest to predict; the ends (near data, near noise) are easy and were over-sampled by a uniform $t$.', tags: ['training']},
            {id: 'cv-diffusion-flow/distillation', front: 'What do progressive distillation and consistency models each learn?', back: 'Progressive distillation: a student whose one step matches two teacher steps, halving the step count per round. Consistency models: a function mapping any point on a trajectory to its endpoint, enforced between adjacent points. Both exist because the base model\'s trajectory is curved and needs many solver steps.', tags: ['distillation']},
        ],
        problems: [
            {
                id: 'cv-diffusion-flow/p1',
                kind: 'quant',
                title: 'One guided coordinate',
                statement: md`
At some sampling step, along one coordinate, the conditional velocity prediction is $0.8$ and the unconditional prediction is $0.5$.

1. With guidance scale $w = 7.5$ in the form $\tilde{v} = (1 + w)\, v_c - w\, v_u$, what is the guided value?
2. In the equivalent form $\tilde{v} = v_u + s\,(v_c - v_u)$, what is $s$?
3. Each sampling step needs how many network passes with guidance on, and how many in a distilled student trained on the guided teacher?

Give the first answer.
`,
                hints: ['The guided value is the unconditional one plus (1 + w) times the gap.', 'The gap here is 0.3.'],
                solution: md`
1. $\tilde{v} = 0.5 + 8.5 \times (0.8 - 0.5) = 0.5 + 2.55 = 3.05$ — more than three times the conditional prediction itself, which is why high guidance saturates.
2. $s = 1 + w = 8.5$; some codebases and papers quote $s$ and others $w$, so a "guidance scale of 7.5" means $s = 8.5$ in one convention and $s = 7.5$ in the other.
3. Two passes (conditional and unconditional) with guidance on; one in a student distilled on the guided teacher, since the guidance is baked into its weights.
`,
                answer: '3.05',
                tolerance: 0.001,
            },
        ],
    },
    {
        id: 'cv-video-generation',
        track: 'cv',
        title: 'Video: 3D latents, spatiotemporal transformers, V-JEPA',
        oneLiner: 'Video is the largest unlabelled corpus; tokens over time is both the generation story and the world-model story.',
        readingMinutes: 26,
        prerequisites: ['cv-diffusion-flow'],
        sections: {
            idea: md`
Video generation in 2025–26 is the image recipe with a time axis. A **causal 3D variational autoencoder** compresses a clip spatially and temporally — typically 8 times in each spatial dimension and 4 times in time, with the first frame encoded alone so that an image is a one-frame video — into a latent volume. The latent volume is cut into spatiotemporal patches, flattened into a token sequence with 3D position information (3D rotary embeddings in most current models), and a **DiT** trained with rectified flow denoises the whole sequence at once with full attention across space and time. Text enters through a large text encoder, usually a T5 or a decoder-only language model, joined to the video tokens by cross-attention or by MM-DiT-style joint attention. Sora's report set the frame; CogVideoX, HunyuanVideo, Wan and Movie Gen published the details.

The cost structure is the whole engineering problem. A few seconds of video at modest resolution is tens of thousands of tokens, so attention — quadratic in sequence length — dominates, and the papers are largely about where to spend it: full 3D attention (best quality, highest cost), factorised spatial-then-temporal attention (cheaper, worse motion), windowed or sparse attention in the deeper layers, and sequence parallelism across GPUs to hold one clip's activations. The VAE's compression ratio is the other lever: every doubling of temporal compression halves the token count and loses fast motion.

The second story is **video as the pretraining corpus for representations**. V-JEPA (Video Joint-Embedding Predictive Architecture) masks large spatiotemporal blocks of a clip and trains a predictor to produce the *features* of the masked region from the features of the visible region, with a target encoder updated as an EMA of the context encoder, and no pixel reconstruction at all. Predicting in feature space lets the model ignore unpredictable pixel detail (leaf texture, sensor noise) and spend capacity on what is predictable: motion, object permanence, interactions. V-JEPA 2 scales the same objective to a million hours of internet video and then post-trains a small action-conditioned predictor on robot data, giving a model that plans manipulation by imagining the feature-space consequence of actions.

Both stories share one premise: the structure of the world is cheaper to learn from unlabelled video than from any labelled set, and the token-sequence abstraction lets the same transformer machinery serve generation, representation and prediction.
`,
            maths: md`
**Token count.** For $F$ frames at $H \times W$ pixels, a causal VAE with temporal stride $s_t$ and spatial stride $s_h = s_w = s$ gives a latent of

$$F' = 1 + \frac{F - 1}{s_t}, \qquad H' = \frac{H}{s}, \qquad W' = \frac{W}{s},$$

and patchifying the latent with a $p_t \times p \times p$ patch gives $N = \frac{F'}{p_t} \cdot \frac{H'}{p} \cdot \frac{W'}{p}$ tokens. Full attention costs $O(N^2 d)$ per layer; with $N$ in the tens of thousands this is where the FLOPs go.

**3D rotary position.** The head dimension is split into three groups of channels for $(t, h, w)$, and each group is rotated by its own coordinate:

$$\operatorname{RoPE}_{3D}(q)_{[i]} = q_{[i]} \odot e^{\,\mathrm{i}\, \theta_i\, c_{g(i)}}, \qquad c \in \{t, h, w\},$$

so attention scores depend on relative offsets along each axis separately, and a model trained on one clip length can be run on another by interpolating the temporal frequencies.

**Rectified flow on the latent volume.** Exactly the image loss over a video latent $z_0 \in \mathbb{R}^{F' \times H' \times W' \times C}$:

$$\mathcal{L} = \mathbb{E}_{t, z_0, \varepsilon} \big\| v_\theta\big((1-t) z_0 + t\varepsilon,\ t,\ c\big) - (\varepsilon - z_0) \big\|^2,$$

with the timestep shift scaled by the token count as in the image case — a video model's $\alpha$ is large because $N$ is.

**V-JEPA.** With context encoder $E_\theta$, EMA target encoder $E_{\bar\theta}$, predictor $P_\phi$, a mask $M$ of spatiotemporal blocks and positional tokens for the masked positions,

$$\mathcal{L}_{\text{JEPA}} = \big\| P_\phi\big(E_\theta(x_{\setminus M}),\ \text{pos}(M)\big) - \operatorname{sg}\big[E_{\bar\theta}(x)\big]_{M} \big\|_1,$$

where $\operatorname{sg}$ is a stop-gradient. Collapse — every feature constant — is avoided by the EMA target and the asymmetric predictor rather than by negatives or a centring trick. V-JEPA 2's action-conditioned predictor adds the action sequence $a_{1:k}$ to the predictor's input and is trained to predict the target features of future frames; planning minimises the predicted feature distance to a goal frame over candidate action sequences (model-predictive control with the cross-entropy method).
`,
            code: md`
The shapes end to end: a causal 3D VAE's output patchified into a token sequence for a video DiT, and a V-JEPA-style masked feature-prediction loss.

\`\`\`python
import torch, torch.nn.functional as F

def video_tokens(latent, pt=1, p=2):          # latent: (B, C, F', H', W') from the causal VAE
    B, C, Fp, Hp, Wp = latent.shape
    x = latent.unfold(2, pt, pt).unfold(3, p, p).unfold(4, p, p)   # (B, C, F'/pt, H'/p, W'/p, pt, p, p)
    x = x.permute(0, 2, 3, 4, 1, 5, 6, 7).reshape(B, -1, C * pt * p * p)
    return x                                   # (B, N, C*pt*p*p); N = (F'/pt)(H'/p)(W'/p)

def latent_shape(frames, H, W, st=4, s=8):
    return 1 + (frames - 1) // st, H // s, W // s

def jepa_loss(context_enc, target_enc, predictor, clip, mask):
    # clip: (B, 3, F, H, W); mask: (B, N) True where a tube of patches is hidden from the context.
    with torch.no_grad():
        target = target_enc(clip)                       # (B, N, D), the EMA encoder sees everything
    visible = context_enc(clip, keep=~mask)             # (B, N_vis, D)
    pred = predictor(visible, mask_positions=mask)      # (B, N_mask, D), queried at the hidden positions
    return F.l1_loss(pred, target[mask].view(pred.shape))

@torch.no_grad()
def ema_update(target_enc, context_enc, m=0.998):
    for pt, pc in zip(target_enc.parameters(), context_enc.parameters()):
        pt.mul_(m).add_(pc, alpha=1 - m)
\`\`\`

For a 49-frame 480 by 720 clip, \`latent_shape\` gives $13 \times 60 \times 90$, and a $1 \times 2 \times 2$ patch gives $13 \times 30 \times 45 = 17{,}550$ tokens — the number the attention budget is set by.
`,
            whyNow: md`
Open video models reached usable quality in 2025 (Wan, HunyuanVideo, CogVideoX, Open-Sora) and published their recipes in enough detail to reproduce, so the field's questions moved from "can it be done" to cost: how much temporal compression the VAE can take, which layers need full 3D attention, how to distil a 50-step video model to 4 steps, and how to serve a model whose single sample is a 20-thousand-token sequence. The same models are being turned into **world models** — conditioned on actions or camera poses, run autoregressively, used as simulators for robots and games — which is where generation meets prediction.

V-JEPA 2 is the clearest statement of the other direction: a representation trained only to predict features of masked video, with no labels and no pixels, that transfers to action recognition and, after a small amount of robot data, plans manipulation zero-shot in a new lab. Whether feature-space prediction or pixel-space generation is the right pretraining objective for embodied systems is the live argument; both camps now train on the same corpus.
`,
            pitfalls: md`
- **Temporal compression eats fast motion.** A stride-4 causal VAE blurs anything that changes within four frames; evaluate the VAE on reconstruction of high-motion clips before blaming the DiT.
- **Factorised attention is not free.** Spatial-then-temporal attention cuts cost but loses long-range motion coherence; the quality gap to full 3D attention is largest on camera motion and object interactions.
- **Length generalisation.** 3D RoPE lets a model run on longer clips than it trained on, but quality drops past about 1.5 times the training length without frequency interpolation.
- **Benchmarks.** VBench and FVD measure different things (prompt-aligned quality dimensions versus distribution distance on a video classifier's features); neither measures physical plausibility, which is what the world-model use needs.
- **JEPA collapse.** Without the EMA target and the predictor asymmetry the loss has a trivial constant solution; a flat feature norm in the first thousand steps is the sign.
- **Compute honesty.** Published training runs are thousands of GPU-days; a reproduction at a fraction of the compute is a different model, and conclusions about architecture drawn at small scale often invert at large scale.
`,
        },
        sources: [
            {title: 'Video generation models as world simulators (the Sora report)', url: 'https://openai.com/research/video-generation-models-as-world-simulators', kind: 'blog', year: 2024},
            {title: 'CogVideoX: Text-to-Video Diffusion Models with An Expert Transformer', url: 'https://arxiv.org/abs/2408.06072', kind: 'paper', year: 2024, note: 'The causal 3D VAE and the expert adaLN.'},
            {title: 'HunyuanVideo: A Systematic Framework For Large Video Generative Models', url: 'https://arxiv.org/abs/2412.03603', kind: 'paper', year: 2024},
            {title: 'Wan: Open and Advanced Large-Scale Video Generative Models', url: 'https://arxiv.org/abs/2503.20314', kind: 'paper', year: 2025},
            {title: 'Movie Gen: A Cast of Media Foundation Models', url: 'https://arxiv.org/abs/2410.13720', kind: 'paper', year: 2024},
            {title: 'Revisiting Feature Prediction for Learning Visual Representations from Video (V-JEPA)', url: 'https://arxiv.org/abs/2404.08471', kind: 'paper', year: 2024},
            {title: 'V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning', url: 'https://arxiv.org/abs/2506.09985', kind: 'paper', year: 2025},
        ],
        cards: [
            {id: 'cv-video-generation/latent-shape', front: 'A causal 3D VAE with temporal stride 4 and spatial stride 8 maps F frames at H by W to what latent shape?', back: '$F\' = 1 + (F-1)/4$ latent frames (the first frame encoded alone, so an image is a one-frame video), $H/8$ by $W/8$ spatially.', tags: ['vae', 'shapes']},
            {id: 'cv-video-generation/where-cost', front: 'Where does the compute go in a video DiT, and what are the two levers?', back: 'Attention, quadratic in the token count, which is tens of thousands for a few seconds of video. The levers: the VAE\'s compression ratio (fewer tokens, lost motion) and the attention pattern (full 3D, factorised, windowed or sparse).', tags: ['cost']},
            {id: 'cv-video-generation/rope3d', front: 'How does 3D rotary position embedding work?', back: 'The head dimension is split into three channel groups rotated by the t, h and w coordinates respectively, so scores depend on relative offsets along each axis; interpolating the temporal frequencies lets the model run on other clip lengths.', tags: ['position', 'architecture']},
            {id: 'cv-video-generation/factorised', front: 'What does factorised spatial-then-temporal attention trade away?', back: 'Long-range motion coherence: cost falls, but camera motion and object interactions degrade relative to full spatiotemporal attention.', tags: ['attention']},
            {id: 'cv-video-generation/jepa', front: 'What does V-JEPA predict, and why not pixels?', back: 'The target encoder\'s features of masked spatiotemporal blocks, from the visible region, with an EMA target and a stop-gradient. Predicting in feature space lets the model ignore unpredictable pixel detail and spend capacity on motion and object permanence.', tags: ['jepa', 'ssl']},
            {id: 'cv-video-generation/jepa-collapse', front: 'What stops a JEPA from collapsing to constant features?', back: 'The EMA target encoder and the asymmetric predictor (the context side must predict what the slowly moving target side computes); no negatives, no centring, no reconstruction.', tags: ['jepa']},
            {id: 'cv-video-generation/vjepa2-plan', front: 'How does V-JEPA 2 plan a robot action?', back: 'An action-conditioned predictor, post-trained on a little robot data, imagines the future features for candidate action sequences; planning picks the sequence whose predicted features are nearest a goal image\'s, by model-predictive control with the cross-entropy method.', tags: ['world-model', 'robotics']},
        ],
        problems: [
            {
                id: 'cv-video-generation/p1',
                kind: 'quant',
                title: 'The attention budget of one clip',
                statement: md`
A text-to-video DiT takes a 49-frame clip at 480 by 720 pixels through a causal 3D VAE with temporal stride 4 and spatial stride 8, then patchifies the latent with a $1 \times 2 \times 2$ patch.

1. What is the latent shape (frames, height, width)?
2. How many tokens does the DiT attend over?
3. By what factor does the attention score matrix exceed that of a single 480 by 720 image through the same VAE and patch?

Give the second answer: the token count.
`,
                hints: ['Latent frames are 1 + (49 − 1) / 4.', 'Each latent frame is 60 by 90; a 2 by 2 patch makes it 30 by 45.'],
                solution: md`
1. $F' = 1 + 48/4 = 13$ latent frames, $480/8 = 60$ by $720/8 = 90$.
2. With a $1 \times 2 \times 2$ patch: $13 \times 30 \times 45 = 17{,}550$ tokens.
3. One image is one latent frame, $30 \times 45 = 1{,}350$ tokens; the score matrix scales with $N^2$, so $(17{,}550 / 1{,}350)^2 = 13^2 = 169$ times larger. Thirteen times the tokens is 169 times the attention — the reason video models factorise, window or sparsify attention in most layers.
`,
                answer: '17550',
            },
        ],
    },
];
