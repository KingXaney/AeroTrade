// An account's epoch: the moment its current history starts. A reset re-anchors inceptionAt;
// accounts from before inceptionAt existed fall back to createdAt. Every reader that dates an
// account's history (income, snapshots, the summary the UI carries, the learn reads) asks
// here. Pure and client-safe.

type Dated = Date | string | number;

export const accountEpoch = (account: {inceptionAt?: Dated | null; createdAt: Dated}): Date =>
    new Date(account.inceptionAt ?? account.createdAt);
