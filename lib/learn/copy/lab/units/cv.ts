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

$$\hat{\sigma} = \arg\min_{\sigma \in \mathfrak{S}_M} \sum_{i=1}^{M} \mathcal{C}_{\text{match}}\big(y_i, \hat{y}_{\sigma(i)}\big), \qquad
\mathcal{C}_{\text{match}} = -\mathbb{1}_{\{c_i \neq \varnothing\}}\,\hat{p}_{\sigma(i)}(c_i) + \mathbb{1}_{\{c_i \neq \varnothing\}}\,\mathcal{L}_{\text{box}}(b_i, \hat{b}_{\sigma(i)}),$$

found by the Hungarian algorithm in $O(M^3)$. The training loss is then applied to the matched pairs only:

$$\mathcal{L} = \sum_{i=1}^{M}\Big[-\log \hat{p}_{\hat\sigma(i)}(c_i) + \mathbb{1}_{\{c_i \neq \varnothing\}}\,\mathcal{L}_{\text{box}}(b_i, \hat{b}_{\hat\sigma(i)})\Big],
\qquad \mathcal{L}_{\text{box}} = \lambda_{\text{iou}}\,\mathcal{L}_{\text{GIoU}} + \lambda_{L1}\,\|b - \hat{b}\|_1.$$

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
];
