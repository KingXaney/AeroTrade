// Pure text rules and limits for the second opinion. Deliberately import-free:
// scripts/second-opinion-local.mjs loads this directly under Node's TypeScript
// stripping, so the Max-plan path applies the same caps and sanitising as the
// server paths instead of a drifting copy.

export const SECOND_OPINION_MAX_CHARS = 8000;

// Provenance labels shown next to a stored opinion.
export const CLI_MODEL_LABEL = 'Claude Code (Max plan)';
export const MANUAL_MODEL_LABEL = 'Claude (pasted from claude.ai)';

// A markdown link could smuggle a phishing URL sourced from scraped headlines
// into the rendered opinion — keep the text, drop the target. Bare URLs go too.
export const stripMarkdownLinks = (md: string): string =>
    md.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '');
