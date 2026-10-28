// The harness's owners — the app's admin (lib/lab/owner.ts), who alone has the lab, both brains,
// the trading agent world and the strategies. Every address here is in LAB_OWNER_EMAILS: run.sh
// reads the list from this file. The lab's owner is the one the lab, broker and agent world suites
// share; any other user a suite needs as the owner is signed up under its own tag here, so no two
// share an owner's state (a checklist, a follow, a dashboard). Import-free.

export const LAB_OWNER_EMAIL = 'qa-lab-owner@example.com';

export const OWNER_TAGS = ['shell', 'styles', 'chat', 'trading', 'strategies', 'learn-a', 'learn-b', 'learn-c', 'learn-e', 'learn-f', 'culture'];

const emailOf = (tag) => `qa-owner-${tag}@example.com`;

// An owner's address for signUp's `email`; a tag not listed above throws, since its user would not be the owner.
export const ownerEmail = (tag) => {
    if (!OWNER_TAGS.includes(tag)) throw new Error(`no owner tagged '${tag}' in scripts/qa/owners.mjs`);
    return emailOf(tag);
};

export const OWNER_EMAILS = [LAB_OWNER_EMAIL, ...OWNER_TAGS.map(emailOf)];
