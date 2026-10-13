// The lab's syllabus: thirty units, ten a track, in reading order (prerequisites first), from
// the foundations that still matter to the frontier. An id is a stamp and an address, never
// renamed; a row is authored when lib/learn/copy/lab/units/<track>.ts carries a unit with its id,
// and planned (greyed on the library, never today's unit) until then. Append past thirty; never
// reorder — lib/lab/__tests__/curriculum.test.ts pins the list.

import type {LabPlanRow} from "@/lib/learn/copy/lab/types";

export const LAB_PLAN: readonly LabPlanRow[] = [
    // ---- computer vision ----------------------------------------------------------------------
    {id: 'cv-vit-dinov2', track: 'cv', title: 'ViT and self-supervised features: DINOv2', oneLiner: 'Frozen patch features are the default backbone for depth, segmentation, retrieval and robots; what the tokens encode and why registers fixed the artefacts.'},
    {id: 'cv-clip-vlm', track: 'cv', title: 'Contrastive vision–language: CLIP, SigLIP and the VLM recipe', oneLiner: 'Every product VLM is a vision tower, a projector and a language model; the alignment loss and how pixels become tokens decide cost and hallucination.'},
    {id: 'cv-open-vocab-detection', track: 'cv', title: 'DETR and open-vocabulary detection', oneLiner: 'Set prediction with Hungarian matching replaced anchors; text queries replaced fixed class heads, and the labelling budget moved to prompts.'},
    {id: 'cv-segment-anything', track: 'cv', title: 'Promptable segmentation: SAM and SAM 2', oneLiner: 'Masks are an API; the model-labels, human-fixes, retrain loop is the template for building any vision dataset.'},
    {id: 'cv-diffusion-flow', track: 'cv', title: 'Diffusion to flow matching: DDPM, rectified flow, DiT, guidance, few-step distillation', oneLiner: 'Rectified flow on a transformer is the production recipe; the maths explains guidance scale, timestep shift and why few-step models exist.'},
    {id: 'cv-video-generation', track: 'cv', title: 'Video: 3D latents, spatiotemporal transformers, V-JEPA', oneLiner: 'Video is the largest unlabelled corpus; tokens over time is both the generation story and the world-model story.'},
    {id: 'cv-nerf-gaussian-splatting', track: 'cv', title: 'Radiance fields: NeRF to 3D Gaussian splatting', oneLiner: 'Real-time photoreal 3D from photos became practical; splats are the de facto scene representation.'},
    {id: 'cv-geometry-foundation', track: 'cv', title: 'Feed-forward geometry: Depth Anything, DUSt3R, VGGT', oneLiner: 'One transformer pass now regresses point maps and camera poses; per-scene optimisation is becoming optional.'},
    {id: 'cv-efficient-vision', track: 'cv', title: 'Efficient vision: distillation, token merging, quantisation, packing', oneLiner: 'Inference cost, not accuracy, decides deployment; a four-times cheaper ViT at equal accuracy is a product.'},
    {id: 'cv-evaluation-pitfalls', track: 'cv', title: 'Evaluating vision honestly: label noise, shortcuts, contamination', oneLiner: 'Web-scale pretraining made every public benchmark a possible training set; reading a leaderboard means knowing what the number can mean.'},
    // ---- machine learning ---------------------------------------------------------------------
    {id: 'ml-transformer-internals', track: 'ml', title: 'The transformer block as shipped: pre-norm, RoPE, SwiGLU, GQA, 6ND', oneLiner: 'FLOP arithmetic is the lingua franca of budgets; everything later is a correction to this block.'},
    {id: 'ml-scaling-laws-data', track: 'ml', title: 'Scaling laws and data: Chinchilla, overtraining for inference, mixtures, repetition', oneLiner: 'Model size against tokens against inference load is where the money goes; overtrained small models follow directly.'},
    {id: 'ml-moe', track: 'ml', title: 'Mixture of experts: routing, load balancing, fine-grained and shared experts', oneLiner: 'Frontier open models are MoE; capacity and per-token cost came apart.'},
    {id: 'ml-long-context-attention', track: 'ml', title: 'Attention variants and long context: FlashAttention, MQA/GQA/MLA, RoPE extension', oneLiner: 'Context length is a memory-bandwidth problem; the KV cache, not FLOPs, is the limit.'},
    {id: 'ml-state-space-models', track: 'ml', title: 'State-space and linear-attention models: S4, Mamba, hybrids', oneLiner: 'Hybrids give long context at constant memory per token; knowing where they lose (exact recall) matters.'},
    {id: 'ml-post-training', track: 'ml', title: 'Post-training: SFT, reward models, RLHF, DPO and its relatives', oneLiner: 'The alignment stack is what you touch when you fine-tune; DPO\'s closed form explains most of it.'},
    {id: 'ml-rl-reasoning-agents', track: 'ml', title: 'RL for reasoning and agents: verifiable rewards, GRPO and its fixes, tool loops', oneLiner: 'The recent capability jump came from RL on verifiable tasks; the maths is small and the failure modes are real.'},
    {id: 'ml-inference-optimisation', track: 'ml', title: 'Inference: KV-cache arithmetic, paged attention, speculative decoding, quantisation', oneLiner: 'Cost per token is the product; the arithmetic decides the hardware.'},
    {id: 'ml-evals-contamination', track: 'ml', title: 'Evals and contamination: overlap, held-out dynamics, judges, variance', oneLiner: 'Public numbers are compromised by default; an honest eval is a methods problem.'},
    {id: 'ml-interpretability', track: 'ml', title: 'Mechanistic interpretability: induction heads, superposition, sparse autoencoders', oneLiner: 'Sparse features made circuits legible; interpretability is becoming an engineering tool for auditing and steering.'},
    // ---- quantitative finance -----------------------------------------------------------------
    {id: 'quant-factor-models', track: 'quant', title: 'Factor models and cross-sectional alpha', oneLiner: 'The frame everything else is measured in: alpha means the residual to a factor model, and published factors decay.'},
    {id: 'quant-portfolio-construction', track: 'quant', title: 'From signal to weights: shrinkage, risk parity, Kelly, drawdown control', oneLiner: 'The weighting step destroys or preserves most of an edge.'},
    {id: 'quant-transaction-costs', track: 'quant', title: 'Transaction costs and market impact: the square-root law, Almgren–Chriss, capacity', oneLiner: 'Net of costs is the only Sharpe that exists; capacity decides what a strategy is.'},
    {id: 'quant-backtest-overfitting', track: 'quant', title: 'Backtest overfitting: multiple testing, deflated Sharpe, CPCV, purging', oneLiner: 'With compute this plentiful most backtests are selection; the statistics of selection are the defence.'},
    {id: 'quant-volatility-regimes', track: 'quant', title: 'Volatility and regimes: realised estimators, GARCH and HAR, hidden Markov models, vol targeting', oneLiner: 'Volatility is the most forecastable quantity in markets; sizing by it is how risk is actually controlled.'},
    {id: 'quant-microstructure', track: 'quant', title: 'Market microstructure: order books, adverse selection, the microprice, queues', oneLiner: 'Where prices come from and why fills cost; needed to read any intraday data.'},
    {id: 'quant-ml-for-alpha', track: 'quant', title: 'Machine learning for alpha: gradient boosting, ranking losses, leakage, meta-labelling', oneLiner: 'The industry default is boosted trees on engineered features; the failure modes are leakage and non-stationarity, not capacity.'},
    {id: 'quant-options-vol-surface', track: 'quant', title: 'Options and the volatility surface: Black–Scholes as a quoting convention, skew, Greeks, SVI', oneLiner: 'The surface is the market\'s risk-neutral density; volatility is traded as an asset.'},
    {id: 'quant-risk-management', track: 'quant', title: 'Risk management: VaR and expected shortfall, factor decomposition, stress tests, limits', oneLiner: 'Survival is the precondition for compounding; limits are hard rails, not advice.'},
    {id: 'quant-llm-nlp-finance', track: 'quant', title: 'Language models in finance: embeddings for filings and news, event studies, look-ahead from training cutoffs', oneLiner: 'Ties to the app\'s own news brain; a model trained through last year already knows the year before.'},
];
