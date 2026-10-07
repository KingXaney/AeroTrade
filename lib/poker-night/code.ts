// A table's share code: six characters from an alphabet with no 0, O, 1 or I, so it can be read
// aloud and typed from a phone. 32^6 is about a billion codes; a unique index per env catches the
// rare repeat and the store draws again. Pure and client-safe: the randomness is the Web Crypto
// API's (globalThis.crypto), never node:crypto, so the lobby's "Join with a code" field can use
// normalizeCode too.

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

const webRandom = (bytes: Uint8Array): Uint8Array => globalThis.crypto.getRandomValues(bytes);

// Each byte picks a symbol with its low five bits: 256 is a multiple of 32, so every symbol is
// equally likely.
export const generateCode = (fill: (bytes: Uint8Array) => Uint8Array = webRandom): string => {
    const bytes = fill(new Uint8Array(CODE_LENGTH));
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] & 31];
    return code;
};

// Spaces and dashes of every width, which a code read aloud or pasted from a message may carry.
const SEPARATORS = /[\s\-\u2010-\u2015\u2212]/gu;

// A code as typed or found in a path, made canonical: compatibility forms folded (a fullwidth K
// is a K), upper case, spaces and dashes dropped. Anything that is not then six symbols of the
// alphabet is null.
export const normalizeCode = (raw: unknown): string | null => {
    if (typeof raw !== 'string' || raw.length > 64) return null;
    const code = raw.normalize('NFKC').toUpperCase().replace(SEPARATORS, '');
    return CODE_PATTERN.test(code) ? code : null;
};

export const isCode = (value: unknown): value is string => typeof value === 'string' && CODE_PATTERN.test(value);
