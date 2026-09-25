# Home Board

A private, calm task tracker for a two-person project. Static frontend on
GitHub Pages, Supabase for auth + Postgres + realtime.

## What it is

- **Home** — countdown to the move date, next 3 recommended actions, urgent
  and overdue tasks, tasks that need help, waiting-on-someone tasks, and a
  progress bar.
- **Board** — Tuesday-style dark board grouped by category, filterable by
  phase, status, priority, assignee, mode, and more.
- **Task detail** — slide-over drawer with everything about one task:
  status, priority, target date, assignee, mode, appointment, reference
  number, checklist, dependencies, links, and a shared comment thread.
- **Vault** — one place for the personal identity number, passport number,
  Swedish address, case numbers, contacts, and official links. Per-record
  visibility (`shared` or `private_to_linus`).

The "next 3 actions" helper is deterministic (no LLM). It scores every open
task by priority, urgency, whether it unlocks other tasks, whether the task
is waiting on someone else, and whether its own dependencies are met.

## Setup

### 1. Create a Supabase project

- <https://supabase.com/dashboard> → **New project**. Pick the EU region.
- Wait for it to provision.

### 2. Run the schema and seed

- In the Supabase dashboard, open **SQL editor**.
- Paste and run `supabase/schema.sql`.
- Paste and run `supabase/seed.sql`.

### 3. Invite the two initial users

- In the Supabase dashboard, open **Authentication → Users → Invite user**.
- Invite Oscar's email and Linus's email.
- Each user receives an email with a link to set a password.
- After they sign in for the first time, the app creates a `profiles` row
  automatically. To promote Linus so private records become visible to him,
  run this once in the SQL editor:

  ```sql
  update public.profiles
     set role = 'linus'
   where display_name ilike 'linus%';   -- or match by email via auth.users
  ```

  (Oscar stays as `helper`, which is the default.)

### 4. Point the app at your Supabase project

- Copy `src/config.example.js` to `src/config.js`.
- In `src/config.js`, fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`
  from Supabase → **Project settings → API**.
- Change `MOVE_DATE` if needed (default `2027-02-15`).

The anon key is a *public* key protected by Row Level Security, so it is
safe to commit. `src/config.js` is gitignored anyway so you can swap
projects without touching git history.

### 5. Publish to GitHub Pages

`src/config.js` is gitignored by default (so you can swap projects
locally). Before pushing, either delete the `src/config.js` line from
`.gitignore`, or run `git add -f src/config.js` once. The anon key is a
public key, so committing it is fine.

```powershell
cd C:\Users\or\linus-move
git init
git add .
git add -f src/config.js
git commit -m "Initial home board"
git branch -M main
git remote add origin git@github.com:oscarrickett/linus-move.git
git push -u origin main
```

- On GitHub, open the repo → **Settings → Pages**.
- Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
- Save. After a minute the site is live at
  `https://oscarrickett.github.io/linus-move/`.

### 6. Run locally

Any static server works. Two options:

```powershell
# Python
python -m http.server 8080

# or Node
npx http-server -p 8080 -c-1
```

Open <http://localhost:8080>.

## Project layout

```
index.html
styles.css
404.html                        # GH Pages SPA fallback
src/
  config.js                     # (gitignored) your Supabase URL + anon key
  config.example.js             # template
  supabase.js                   # Supabase client init
  store.js                      # data operations, one place per table
  helper.js                     # "next action" scorer
  util.js                       # DOM + date helpers
  app.js                        # router + boot
  views/
    auth.js
    home.js
    board.js
    task.js
    vault.js
supabase/
  schema.sql                    # tables, policies, triggers
  seed.sql                      # phases, categories, tasks, dependencies
seed/
  tasks.json                    # canonical task list (mirrors seed.sql)
```

## Security posture

- All data lives behind Supabase Auth. The published site itself has no
  data in it; nothing is exposed pre-sign-in.
- Row Level Security is on for every table. Reference and task data are
  readable by any signed-in user. `info_records` marked
  `visibility='private_to_linus'` are only readable/writable by the user
  whose profile has `role='linus'`.
- Attachments are not implemented in the MVP. If you add them, use
  Supabase Storage with a private bucket and signed URLs.

## Adding more people later

Invite them from the Supabase dashboard. They join with role `helper`
(same permissions as Oscar). To grant them Linus-only visibility, update
their profile row's `role` to `linus`. To restrict them, keep them as
`helper` or `family`.
