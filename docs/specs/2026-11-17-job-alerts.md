# Job alerts — the owner is told when a job breaks

Status: implemented 2026-11-17

## Why

Twenty-odd scheduled jobs keep the accounts, the brains and the email going. A job's health was
only its completion stamp: one that failed stopped refreshing it, and the one place that showed
was the status strip on `/brain?view=system`, which someone had to open. With allowances of 30
to 80 hours, a daily job was not even marked overdue until its second missed run. No function
set `onFailure`, nothing listened for Inngest's failure event, and the repo had no error
tracking. Users met the effect first: a flat chart, no interest credited, no brief.

A second finding of the same audit is fixed here because it is the same kind of silence: the
daily brain update dropped the articles it had already tagged when a later batch's model call
failed, and nothing said so.

## What

- **A failed job mails the owner.** `watchJobs` (`lib/jobs/functions/alerts.ts`, job id
  `job-alerts`) is triggered by `inngest/function.failed`, which Inngest raises when any function
  has used its retries. The job's error is written on its `JobRun` row as one bounded line, and
  the owner list (`LAB_OWNER_EMAILS`) gets one mail: which job, when, the error, its last
  completed run, a link to the system view.
- **An overdue job mails the owner.** The same function's 09:00 ET cron lists every job whose
  last completed run is older than its own allowance, in one mail. A job that never fires raises
  no failure event; this is what catches it.
- **At most one mail per job per ET day**, claimed by a conditional update on the job's row. A
  mail that cannot be sent gives the claim back, and never throws: an alert that failed for a
  refused send would raise the event it listens for.
- **The strip shows the error** under a job whose failure is newer than its last completed run,
  until a completed run clears it.
- **A preview build does nothing**: it shares production's rows and mailer.
- **The brain update folds what it applied.** A failed batch ends the extraction loop, not the
  function; the stamp says at which batch it stopped.

## Known limits

- The alert job cannot report its own failure or lateness; its row on the strip is the check.
- A job that has never completed a run is not "overdue" (a job just added has not had its first
  run), so a job mis-wired from the start is caught by the strip's "never ran", not by a mail.
- The mail goes through the app's own Gmail sender: on a day its limit is spent, or with the
  mailer unset, the strip is still the only signal.
- Failures a job catches for itself and reports in its stamp (a skipped account, an enrolment
  held back) raise no alert; the stamps name them.

## Verification

`npm run check`, `npm run build:check`, and the browser suite `qa-job-alerts`.
