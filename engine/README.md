# engine/

School-agnostic app code — see the top-level `README.md` (one directory up)
for install, setup, running, and the full project layout. This file is
just a map of what's in this folder specifically.

- **`bells.js`** — entry point. Talks to the human: school picker, mode
  (single day / date range), date prompts, confirmation, progress display.
  No Playwright calls, no school data of its own — everything comes from
  `school-loader.js`.
- **`school-loader.js`** — discovers folders under `../schools/`, and for
  a chosen school loads its `schedules.js` / `colors.js` / `config.js` /
  `selectors.js`, picks the right `platforms/*.js` engine per that
  school's `school.json`, and hands back a ready `{ connect, createEvent }`.
- **`platforms/cyberdata.js`** — the actual CyberData/InformaCast
  automation engine (CDP attach, opening the New Event dialog, filling
  fields, retry-on-failure). Takes a school's selectors/colors/config as
  input; contains no school's data itself. Any school on CyberData reuses
  this same file.
- **`inspect.js`** — one-off helper: pick a school, then opens the
  Playwright Inspector against that school's real, logged-in CyberData
  page so you can confirm/correct its `selectors.js` with the element
  picker instead of guessing.
- **`school-selector.js`** — shared "pick a school, then prove you're
  allowed in" prompt used by both `bells.js` and `inspect.js`, so the
  password gate can't drift between them.
- **`school-auth.js`** — password hashing/verification (Node's built-in
  `crypto`, scrypt). `school.json` only ever holds a salt + hash, never a
  plaintext password.
- **`set-school-password.js`** — run this yourself to set or change a
  school's password (see the top-level README's "School passwords"
  section).
- **`masked-prompt.js`** / **`readline-compat.js`** — plumbing so password
  input doesn't echo to the terminal. `readline/promises`'s Interface
  turned out not to expose the hook this needs (confirmed by testing, not
  assumed), so these route through the classic `readline` module instead.

`PROJECT_SPEC.md` in this folder is the original single-school design doc
— useful for history, but some of it (e.g. the file layout section)
predates the multi-school restructure and no longer matches what's here.
