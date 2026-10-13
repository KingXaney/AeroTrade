// Who sees the owner's lab at /learn: the accounts whose email is listed in LAB_OWNER_EMAILS
// (comma-separated, compared lower-cased). Import-free and pure, so the (root) layout, the
// actions and the job read one rule. Unset means nobody: a deployment without the variable
// shows every account the games, and the lab's job spends nothing.

export const LAB_OWNER_ENV = 'LAB_OWNER_EMAILS';

type Env = Readonly<Record<string, string | undefined>>;

export const labOwnerEmails = (env: Env = process.env): string[] =>
    (env[LAB_OWNER_ENV] ?? '').split(',').map((email) => email.trim().toLowerCase()).filter((email) => email.length > 0);

export const isLabOwner = (email: string | null | undefined, env: Env = process.env): boolean =>
    typeof email === 'string' && email.trim().length > 0 && labOwnerEmails(env).includes(email.trim().toLowerCase());

export const labEnabled = (env: Env = process.env): boolean => labOwnerEmails(env).length > 0;
