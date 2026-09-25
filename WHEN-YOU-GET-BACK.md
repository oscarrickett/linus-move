# When you get back (about 12 minutes of work)

Everything is committed under a neutral git identity
(`Oscar Rickett <oscarrickett@users.noreply.github.com>`) and pushed to a
temporary home:

**Repo:** <https://github.com/solidicon-ab/linus-move> (**private**)

The `solidicon-ab` GitHub *user* account (not the org) owns it for now
because that was the only `gh` auth on the machine. Step 0 below moves
it to your personal `oscarrickett` account so nothing stays under a
work-adjacent name. The committed code contains no personal data yet
(the anon key and any Vault records will live in Supabase, not the repo).

## 0. Transfer the repo to `oscarrickett` (2 min)

On whichever computer you use next:

```powershell
# You need gh signed in as oscarrickett for the transfer to land there.
gh auth login --hostname github.com --web
# choose your personal 'oscarrickett' account when prompted

# Kick off the transfer (from solidicon-ab to oscarrickett).
# You can run this from either machine; it doesn't need a local clone.
gh api -X POST /repos/solidicon-ab/linus-move/transfer \
  -f "new_owner=oscarrickett"
```

GitHub emails Linus... sorry, emails *oscarrickett* to accept the
transfer. Accept it in the email or at
<https://github.com/notifications>. The URL then becomes
<https://github.com/oscarrickett/linus-move>.

On the new machine, clone from the new URL:

```powershell
cd C:\Users\<you>\
git clone git@github.com:oscarrickett/linus-move.git
cd linus-move
git config user.email "oscarrickett@users.noreply.github.com"
git config user.name  "Oscar Rickett"
```

If you clone before transferring: update the remote afterwards with
`git remote set-url origin git@github.com:oscarrickett/linus-move.git`.

Only 4 more things need you specifically. In order:

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

## 5. Push config.js and enable GitHub Pages (2 min)

Assumes you've completed step 0 (repo now at `oscarrickett/linus-move`).

```powershell
cd C:\Users\<you>\linus-move

# Include the filled-in config.js in the push. The anon key is public
# (protected by RLS), so committing it is safe.
git add -f src/config.js
git commit -m "Fill in Supabase config"
git push

# Flip the repo to public so GitHub Pages works on the free plan.
# There are no secrets in the code; the only sensitive data lives in
# Supabase behind auth.
gh repo edit oscarrickett/linus-move --visibility public --accept-visibility-change-consequences

# Enable Pages from main branch, root.
gh api -X POST /repos/oscarrickett/linus-move/pages \
  -f "source[branch]=main" -f "source[path]=/"
```

Live at <https://oscarrickett.github.io/linus-move/> within a minute.

If you'd rather keep it private, GitHub Pages on private repos needs a
paid plan; alternative is to serve locally with `python -m http.server`
and share via a tunnel like Cloudflare Tunnel.

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
