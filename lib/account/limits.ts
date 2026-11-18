// The account actions' limits and counter keys (lib/actions/account.actions.ts). Import-free.
// Both actions take the account's password, so each is a place to guess it: a handful of
// attempts per window, counted per account whether or not the attempt was right.

export const PASSWORD_CHANGE_LIMIT = 5;
export const PASSWORD_CHANGE_WINDOW_MS = 15 * 60_000;
export const passwordChangeKey = (userId: string): string => `account:password:${userId}`;

export const ACCOUNT_DELETE_LIMIT = 5;
export const ACCOUNT_DELETE_WINDOW_MS = 60 * 60_000;
export const accountDeleteKey = (userId: string): string => `account:delete:${userId}`;

// What a reader types to confirm a deletion: the account's own address, whatever its case or
// the spaces around it.
export const confirmsDeletion = (typed: unknown, email: string | null | undefined): boolean =>
    typeof typed === 'string' && typeof email === 'string' && email.trim() !== ''
    && typed.trim().toLowerCase() === email.trim().toLowerCase();
