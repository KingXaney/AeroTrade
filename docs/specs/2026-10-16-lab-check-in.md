# Lab › Today as a daily check-in, and the game widgets arranged

**Date:** 2026-10-16
**Status:** Shipped 2026-10-16, merged from `feat/lab-check-in`; revised the same afternoon as the HUD
(below, PR #72); the check-in and the end of the day — the greeting, the date, the day's focus, yesterday,
the notes and the `LabNote` row — were removed that evening at the owner's request, the HUD and the games
from the list staying. Extends
[Lab › Today as a list](2026-10-15-learn-todo-streak.md).

## Why

The owner pasted a brief for "a clean, intuitive daily check-in page" — a greeting and the date, a
check-in question, a prioritised list with statuses and a way into each task's app, unfinished
items from the day before, an end-of-day reflection — and asked for it on the learning main page,
with three specific wants: choose a few games and add them to the screen, change them from the
account menu under the avatar, and move and resize the widgets.

Lab › Today was already the list: one item per thing the day holds, read from rows. What it
lacked was the frame around the list (who, what day, what the day is for), the statuses between
"to do" and "done", a look back at yesterday, a place to close the day, and any say over where the
game cards sit or how wide they are. The games hub's cards were picked with switches and laid out
in a fixed two-column grid.

Decisions, taken for the owner (the request arrived while they were away): the page stays the
owner's lab (`/learn`), since the list is derived from the lab's own rows; the widgets' arrangement
reuses the dashboard's editing pieces rather than a second drag grid; the account menu gets a
direct entry to the arranging view; the "apps" of the brief are the games and the sites outside
the app, which the list already opens, so there is no app-suggestion layer; a task is never
user-authored — the list stays derived — so there is no "add a task", and no snooze.

## What it is

- **The check-in** (`components/lab/CheckIn`, the pure `lib/lab/checkin`): Today opens on the
  date (`dayLabel`), a greeting by the Eastern hour (`periodOf`: morning, afternoon, evening),
  today's focus — one line the owner writes to "What would you like to accomplish today?"
  (`components/lab/DayFocus`, `saveDayFocus`) — and, until it is written, yesterday's note for
  today with one tap to make it the focus. Under it, yesterday: what counted (the unit studied,
  cards graded, the problem, the puzzle, rounds, ticks) and what was left of the widgets
  (`buildYesterday`), drawn only once the owner has a day behind them.
- **The list, grouped and with statuses** (`lib/lab/todo`): items carry a group — Study (the
  unit, the review, the problem, the papers), Play (the puzzle, the games, poker night),
  Elsewhere (the outside sites) — drawn as eyebrows when more than one group has items. Two
  states join done, to do and none: `started` (the quiz passed but the unit not yet marked, a
  review partly graded today, a puzzle attempted) and `overdue` (a review with overdue cards).
  A revealed puzzle is `none` with "Solution shown: no solve counted" — nothing more can be
  done with it today, so it is not counted either way.
- **End of day** (`components/lab/Reflection`, `saveReflection`): the day's done and open items
  as two lines, then notes on the day and tomorrow's focus, saved to the day's note. Tomorrow's
  line is what the next morning's check-in offers as the focus.
- **The notes' row** is `database/models/lab-note.model.ts`: one document per owner and ET day
  (`focus`, `notes`, `next`; unique on user and day), read for today and yesterday by
  `lib/lab/store.readLabNotes`, written by `writeLabNote` (a cleared field is unset). Notes are
  the owner's own text, stored trimmed and bounded (`FOCUS_MAX`, `NOTE_MAX`), rendered as text.
- **The layout** (`lib/lab/layout`, pure; the preference `learn.labLayout`): the widgets as
  `{id, span}` rows, each span one of `LAB_SPANS` (4, 6, 8 or 12 of 12 columns, labelled S, M,
  L, XL as on the dashboard; `DEFAULT_LAB_SPAN` 6). `readLabLayout` takes a stored layout, else
  the old `learn.labWidgets` list at the default span, else the puzzle alone; a save writes the
  layout and unsets the old list. The helpers mirror the dashboard's (`moveLabWidget`,
  `addLabWidget`, `removeLabWidget`, `setLabSpan`, `labLayoutsEqual`, `labLayoutFingerprint`,
  `missingLabWidgets`), each handing back the same reference for a no-op. A widget id is still
  the registry's, never renamed; each entry now carries an `icon`.
- *(Superseded the same day — see below.)* **Today's grid** (`components/lab/LabWidgets`, server): the cards on a twelve-column grid from
  the tablet width (`spanClass`), one column below it; each card a Panel with the widget's title
  and `components/lab/LabWidgetBody` (the games hub's card body, `GameCardBody`, which the hub's
  `GameCard` now wraps). An "Arrange" link leads to the arranging view.
- **Arranging** (`/learn?arrange=1`, `components/lab/LabArrange`, client): the dashboard's own
  pieces — `WidgetShell` (the handle, the arrow keys, the width picker, earlier and later, remove),
  `DragGhost`, `WidgetPlaceholder`, `DashboardToolbar` and `WidgetLibrary` — now take a
  structural definition and their words as props, so the lab's cards go through the same code.
  Add a game opens the library (in the app, then elsewhere; a card added shows "Save to load"
  until saved), Reset goes back to the puzzle alone, Cancel returns to Today, Save writes the
  layout through `saveLabLayout` (no revalidation: the view navigates to `/learn` itself, as the
  dashboard grid does) and lands on Today with the new grid. The account menu
  (`components/shell/UserDropdown`) carries "Lab layout" for the owner — the one entry that is
  not a page of `ACCOUNT_PAGES`, since the registry holds page files only.

## Revised the same day: Today as a HUD

The first cut arranged the game cards alone, on a separate view. The owner's answer: the layout
should be a live, editable HUD — the cards of the current page moved, removed and sized in place
— and the main want is adding a game to the checklist in a tap, opening it from there and
completing the day. So:

- **Every part of the day is a card** (`LAB_PANEL_IDS`: the check-in, the list, the streak, the
  unit, the review, the problem, the papers, the end of the day, the progress) beside the game
  cards, on one twelve-column grid in the owner's order and widths (`LAB_HUD` names each card's
  widths and default; `DEFAULT_LAB_LAYOUT` is the day as it comes, the unit beside the review,
  the puzzle after the papers). The layout is version 2; the morning's version-1 layouts and the
  older list read with their games in the games slot.
- **Arranging is in place** (`components/lab/LabHud`): Arrange on Today — or `/learn?arrange=1`
  from the account menu — turns every card into the dashboard's editing shell (handle, arrow
  keys, width picker, earlier/later, remove), with Add to Today (parts of the day, games in the
  app, elsewhere), Reset, Cancel and Save. Each body is its own Panel, un-framed inside the shell
  by one CSS rule while arranging. A part with nothing to show today is skipped viewing and a
  stand-in arranging, so it keeps its place.
- **Games join the list from the list**: "Games" in the list's header is one switch per game,
  saved at once (`setGameOnToday`); on puts the card at the end of Today and the item on the
  list, whose Open is the way in, and the round or tick counts the day. The HUD is keyed on the
  mode, not the layout, so the dialog stays open while the page follows each toggle.

## Not built

- A snooze, a user-written task, an app-suggestion layer (the list opens the one place each
  item is done). A Settings section for the lab's layout (Arrange is on the page and one tap from
  the menu). A ⌘K or drawer entry for the arranging (the nav registry lists page files only).

## Rules kept

Derived, never stored, but for the layout and the day's notes; the bank stays server-only; the
actions are owner-gated with zod on `unknown` and the one rate counter; every sentence is
`LAB_COPY` at the 'copy' tier; no "What these mean" or "Ask in chat" on a widget; no new
keyframe; the dashboard's grid is unchanged in behaviour.

## Tests and QA

Unit: `lib/lab/__tests__/layout.test.ts`, `checkin.test.ts`, `todo.test.ts` (groups, the new
states), `widgets.test.ts` (icons), the copy test, `lib/__tests__/dates.test.ts`
(`getEasternHour`). Browser: `qa-lab` — the check-in (the date, the focus written and edited,
tomorrow's note coming back as the morning's offer and taken), the list's groups and the overdue
state, the old `labWidgets` preference read as a layout, the arranging view (a game added from
the library, its width set, moved first, another removed, saved as `learn.labLayout` with the old
list unset, the grid and the list following), the account menu's entry for the owner and none for
another account, the words sweep and a phone width.
