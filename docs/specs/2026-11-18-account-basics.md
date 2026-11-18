# Account basics — change the password, leave the daily brief, delete the account

Status: implemented 2026-11-18

## Why

Settings › Account showed a name, an address and "Log out". Nothing in the app let a reader
change their password while signed in or delete their account. The daily brief was on for every
new account and its only way out was a settings page behind a sign-in: someone who received it
at an address typed by mistake could not stop it without resetting the password of an account
they never made.

## What

- **Change password.** The current password, then the new one. Every other device is signed
  out; the session that made the change stays on the page.
- **Unsubscribe without signing in.** The brief's footer carries the reader's own signed link,
  and the mail itself the two headers a mail client turns into its own Unsubscribe button. The
  link opens a public page with one button. Only a POST changes anything, because mail scanners
  and link previewers follow every GET in a message. The signature is an HMAC of the user id; it
  does one thing, names one account and does not expire.
- **Delete account.** The reader types the account's own address and its password. Everything
  stored for the account goes first, in an order that stops whatever trades in it before the
  books go, then the user, its credentials and its sessions. A cascade that fails leaves the
  account in place to try again.
- **Every model is sorted.** `lib/account/user-data.ts` lists each stored model as a reader's
  own data, with the field that names them, or as not theirs, with the reason. A test fails when
  a model file is in neither list.

## Not built

- Changing the account's email address, and verifying an address at sign-up. Both need a
  verification mail and a route to receive its link; this app serves no auth route handler by
  design. Until then an address typed by mistake is left by the unsubscribe link or by deleting
  the account.
- An export of a reader's data. The trade history is already a CSV.
- A poker night table keeps a departed player's display name and look until the table expires
  (it names players by a random id, not by account).

## Verification

`npm run check` (4,260 unit tests) and the browser suite `qa-account` (28 checks): a wrong
password refused, a second device signed out, the old password dead; the link inert on GET,
refused with a wrong or another reader's signature, working by its button and by one-click
post; after a deletion no row of the reader's left in any listed collection, read by each
model's own collection name, and the other reader's rows untouched.
