// Settings › Account: changing the password and deleting the account
// (components/settings/AccountSection.tsx, lib/actions/account.actions.ts). Pure; held to the
// 'copy' tier by account-copy.test.ts.

import {MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH} from "@/lib/auth/validation";
import {SITE_NAME} from "@/lib/site";

export const ACCOUNT_COPY = {
    logOut: 'Log out',
    password: {
        heading: 'Change password',
        current: 'Current password',
        next: 'New password',
        nextHint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
        submit: 'Change password',
        working: 'Changing…',
        done: 'Password changed. Other devices were signed out.',
        wrong: 'The current password is not right.',
        same: 'The new password is the same as the current one.',
        length: `A password is ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`,
        limited: 'That is more attempts than the limit allows. It can be tried again in a few minutes.',
        failed: 'The password could not be changed.',
    },
    remove: {
        heading: 'Delete account',
        open: 'Delete account…',
        title: `Delete this ${SITE_NAME} account`,
        body: 'This deletes the account and everything stored for it: every paper account with its trades, snapshots and income, the watchlist, the followed topics, friends, game records and settings. It cannot be undone.',
        confirmLabel: (email: string): string => `Type ${email} to confirm`,
        passwordLabel: 'Password',
        submit: 'Delete the account',
        working: 'Deleting…',
        done: 'The account was deleted.',
        mismatch: 'The address typed does not match this account.',
        wrong: 'The password is not right.',
        limited: 'That is more attempts than the limit allows. It can be tried again in an hour.',
        failed: 'The account could not be deleted. Nothing was removed that cannot be removed again: it can be tried once more.',
    },
    notAuthenticated: 'Not authenticated',
} as const;
