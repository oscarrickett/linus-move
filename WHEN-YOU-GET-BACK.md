# When you get back (about 10 minutes of work)

Everything is committed locally in `C:\Users\or\linus-move` on branch `main`
under a neutral git identity (`Oscar Rickett <oscarrickett@users.noreply.github.com>`).
Nothing has been pushed to any remote yet.

Only 4 things need you specifically. In order:

## 1. Run the two SQL files in Supabase (2 min)

Open <https://supabase.com/dashboard/project/xmqlbsouvpltxntdvfss/sql/new>

- Paste the contents of `supabase/schema.sql`, click **Run**.
- Open a fresh SQL query, paste `supabase/seed.sql`, click **Run**.

Expected result: no errors. If you re-run either, they're idempotent so
they won't duplicate anything.

## 2. Paste the anon key into `src/config.js` (30 sec)

Open <https://supabase.com/dashboard/project/xmqlbsouvpltxntdvfss/settings/api>

Copy the **anon public** key (the long JWT, NOT the `service_role` key).
Open `C:\Users\or\linus-move\src\config.js` and replace
`PASTE-ANON-KEY-HERE` with the key. The URL is already filled in.

## 3. Test locally (1 min)

```powershell
cd C:\Users\or\linus-move
python -m http.server 8080
```

Open <http://localhost:8080>. You should see the sign-in screen.

## 4. Invite yourself + Linus, then promote Linus (3 min)

Open <https://supabase.com/dashboard/project/xmqlbsouvpltxntdvfss/auth/users>

Click **Add user > Invite user**, invite your own email first. Set a
display name of "Oscar" when you sign up. Then invite Linus at his email.

After Linus signs in for the first time, run this once in the SQL editor
so his role changes from `helper` to `linus` (unlocks private records):

```sql
update public.profiles
   set role = 'linus'
 where display_name ilike 'linus%';   -- or match on the exact display name
```

## 5. Push to GitHub Pages (2 min)

Your current `gh` session is signed in as **solidicon-ab** (work account).
I did not push because the commits would be tagged with your work email
and the repo trail would sit under your work token. Switch identities:

```powershell
gh auth login --hostname github.com --web
# choose your personal 'oscarrickett' account when prompted
gh auth switch --user oscarrickett      # if you already have it added
```

Then:

```powershell
cd C:\Users\or\linus-move

# Include the filled-in config.js in the initial push (anon key is a public key)
git add -f src/config.js
git commit -m "Fill in Supabase config"

# Create the repo and push. Private is fine but GH Pages needs a paid plan on
# private repos, so use public. There are no secrets in the code.
gh repo create oscarrickett/linus-move --public --source=. --push

# Enable GitHub Pages from main branch, root
gh api -X POST /repos/oscarrickett/linus-move/pages \
  -f "source[branch]=main" -f "source[path]=/"
```

Live at <https://oscarrickett.github.io/linus-move/> within a minute.

## Notes

- Nothing here is on Solidicon infrastructure or the Solidicon GitHub org.
- The Supabase anon key is a public key protected by Row Level Security.
  Committing it is safe. The `service_role` key is not; never commit that.
- File attachments are not wired up yet. Add them from Supabase Storage
  when you actually need them.
- The move date is in `src/config.js` as `MOVE_DATE = "2027-02-15"`.
  Update if it firms up differently.

## What I verified before you left

- All 11 JS modules parse cleanly (node --check --input-type=module).
- `seed/tasks.json` is valid JSON.
- Static server returns 200 for every file in the tree.
- `src/config.js` is not in the committed git tree (only
  `config.example.js` is), so the anon key you paste won't leak until you
  explicitly `git add -f` it.
- No references to `solidicon` anywhere in the repo.
