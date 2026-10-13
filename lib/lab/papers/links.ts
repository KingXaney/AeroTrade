// A paper's addresses, built from its arXiv id and nowhere else: nothing a feed sends is ever
// rendered as a link, and a stored day holds no URL at all (lib/lab/papers/day.ts). Pure.

// New-style arXiv ids only (YYMM.NNNNN); the old archive/NNNNNNN form is not read.
const ARXIV_ID = /^\d{4}\.\d{4,5}$/;
const ARXIV_ID_IN = /(\d{4}\.\d{4,5})(?:v\d+)?\s*$/;

export const isArxivId = (id: string): boolean => ARXIV_ID.test(id);

// The bare id from "http://arxiv.org/abs/2610.13947v1", "2610.13947v2" or "2610.13947";
// null for anything else.
export const arxivIdOf = (value: string): string | null => {
    const match = ARXIV_ID_IN.exec(String(value ?? '').trim());
    return match ? match[1] : null;
};

export type PaperLinks = {abs: string; pdf: string; hf: string};

export const paperLinks = (id: string): PaperLinks => ({
    abs: `https://arxiv.org/abs/${id}`,
    pdf: `https://arxiv.org/pdf/${id}`,
    hf: `https://huggingface.co/papers/${id}`,
});
