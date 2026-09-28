# When you get back (about 12 minutes of work)

The full app is committed locally in `C:\Users\or\linus-move` on branch
`main` under a neutral git identity
(`Oscar Rickett <oscarrickett@users.noreply.github.com>`). It has NO
remote — the earlier push to a work-account namespace was archived at
your request and needs one manual click to fully delete (see step 0).

## 0. Delete the archived `solidicon-ab/linus-move` (30 sec)

I created it earlier because that was the only `gh` auth on this
machine, then archived it when you asked me to remove it. My token was
missing `delete_repo` scope so I couldn't finish the delete. Either:

- Open <https://github.com/solidicon-ab/linus-move/settings> → scroll to
  **Danger Zone** → **Delete this repository**, OR
- Run:
  ```powershell
  gh auth refresh -h github.com -s delete_repo
  gh repo delete solidicon-ab/linus-move --yes
  ```

The repo is private, archived (read-only), and contains no personal data
(only the app code and the `alomimvbbovjjjlwfxyq` Supabase project ID,
which is a URL not a secret).

## 1. Get the code onto your other computer

The local repo lives at `C:\Users\or\linus-move`. Pick whichever
transport suits: zip and email/USB it to yourself, sync via any cloud
folder, or push to a temporary private location first. If you already
sync your home directory to a personal cloud drive, it's probably
already there.

Once on the other machine, from the folder root:

```powershell
git remote -v          # should be empty (no origin yet)
git log --oneline      # should show the two commits below
```

Expected commits:
```
0a10f4d Add hand-off checklist
03deb53 Initial home board: static SPA + Supabase schema and seed
```

## 2. Create the repo under `oscarrickett` and push (2 min)

On whichever machine has the code:

```powershell
# One-time: sign in as your personal account
gh auth login --hostname github.com --web
# When prompted, pick 'oscarrickett'. Grant the 'repo' scope.

cd <path-to>\linus-move

# Create repo and push. Public because GitHub Pages needs paid plan for
# private repos; there are no secrets in the tree.
gh repo create oscarrickett/linus-move --public --source=. --remote=origin --push

# Enable GitHub Pages from main branch, root.
gh api -X POST /repos/oscarrickett/linus-move/pages \
  -f "source[branch]=main" -f "source[path]=/"
```

Live at <https://oscarrickett.github.io/linus-move/> within a minute.

If you'd rather it stays private, GitHub Pages on private repos needs a
paid plan. Alternative: serve locally with `python -m http.server` and
share via a tunnel like Cloudflare Tunnel.

## 3. Run the two SQL files in Supabase (2 min)

Open <https://supabase.com/dashboard/project/alomimvbbovjjjlwfxyq/sql/new>

- Paste the contents of `supabase/schema.sql`, click **Run**.
- Open a fresh SQL query, paste `supabase/seed.sql`, click **Run**.

Both files are idempotent, so a re-run is safe.

## 4. Paste the anon key into `src/config.js` (30 sec)

Open <https://supabase.com/dashboard/project/alomimvbbovjjjlwfxyq/settings/api>

Copy the **anon public** key (the long JWT, NOT the `service_role` key).
Open `src/config.js` and replace `PASTE-ANON-KEY-HERE` with the key.
The URL is already filled in.

Commit and push:
```powershell
git add -f src/config.js
git commit -m "Fill in Supabase config"
git push
```

(`config.js` is gitignored by default, hence the `-f`.)

## 5. Test locally (1 min)

```powershell
cd <path-to>\linus-move
python -m http.server 8080
```

Open <http://localhost:8080>. You should see the sign-in screen.

## 6. Invite yourself + Linus, then promote Linus (3 min)

Open <https://supabase.com/dashboard/project/alomimvbbovjjjlwfxyq/auth/users>

Click **Add user → Invite user**, invite your own email first. Set the
display name to "Oscar" when you sign up. Then invite Linus at his email.

After Linus signs in for the first time, run this once in the SQL editor
so his role changes from `helper` to `linus` (unlocks private records):

```sql
update public.profiles
   set role = 'linus'
 where display_name ilike 'linus%';   -- or match on the exact display name
```

## Notes

- Nothing is on Solidicon infrastructure or the Solidicon GitHub org.
- The Supabase anon key is a public key protected by Row Level Security.
  Committing it is safe. The `service_role` key is not; never commit that.
- File attachments are not wired up yet. Add them from Supabase Storage
  when you actually need them.
- The move date is in `src/config.js` as `MOVE_DATE = "2027-02-15"`.
  Update if it firms up differently.

## What I verified before you left

- All 11 JS modules parse cleanly (`node --check --input-type=module`).
- `seed/tasks.json` is valid JSON.
- Static server returns 200 for every file in the tree.
- `src/config.js` is not in the committed git tree (only
  `config.example.js` is), so the anon key you paste won't leak until you
  explicitly `git add -f` it.
- No references to `solidicon` anywhere in the repo.
