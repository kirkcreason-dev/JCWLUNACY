# JCWLUNACY.NET — upload package
Build **b2026-07-19.128** · packaged Aug 7, 2026

Target repo: `kirkcreason-dev/JCWLUNACY`, branch `main`.

## What's in here and where it goes

| File / folder | Destination | Notes |
|---|---|---|
| `index.html` | repo root (replace) | Build .128 — **urgent data-loss fix**, badge paint order, Jeff Lane, 9 easter eggs, gift auto-claim, card picker, user search, vote banner |
| `episodes.json` | repo root (replace) | 101 entries, through **Episode 94** |
| `admin.html` | repo root (replace) | Broadcast box (Duke-only) + poll labels |
| `RESTORE-nocturnal-deadhead.json` | **not uploaded** | Paste into Firebase to restore his wiped locker — see below |
| `.nojekyll` | repo root (**new**) | Skips Jekyll on deploy — faster, fewer surprises |
| `roster/` — 16 files | merge into existing `roster/` | New shell photos, same filenames |
| `article_imgs/` — 6 files | merge into existing `article_imgs/` | Compressed (1.6MB, was 28MB) |


## Deliberately NOT included

These are already correct in your repo — re-uploading old copies would overwrite good files:

`CNAME`, `clips.json`, `config.json`, `merch.json`, `poop-dollar.png`, `audio/`,
and the ~100 existing `roster/` photos.

## Two repo fixes to do by hand

**1. Move the workflow.** `update-episodes.yml` is sitting at the repo root, so GitHub
has never run it — workflows only execute from `.github/workflows/`. Move it to:

    .github/workflows/update-episodes.yml

Build .113 now *merges* `episodes.json` with the built-in episode list instead of
replacing it, so hand-added episodes survive even if the Action regenerates the file.

**2. Your Firebase rules are fine — no change needed.**

Earlier I said the rules were blocking gifts. That was wrong. `gifts` is defined and
the write is permitted; my unauthenticated probe came back empty only because
`.read` sits at `gifts/$uid` rather than the root.

The actual cause was that the **Claim button only exists on the Cards page, which is
Lunatics-only**. Anyone outside the inner circle could be sent a card with no way to
accept it, so it sat in their inbox and never reached their locker. Build .121
auto-claims gifts on every page for every signed-in user.

## Jeff Lane — nothing to do but upload

UID `GZ4FzgT740gxOtiFUtBaxshngbi2`, verified against the live database as "Jeff Lane".
Build .125 gives him all three from the file alone — **no Firebase console step**:

- **MODERATOR** (added to the hardcoded mod list)
- **Violent Jeff** exclusive badge
- **Lunatics Only** access

## Promoting mods without a new build

Build .122 reads a live `/mods` node from the database, which your security rules
already honour. To make anyone a mod, set in the Firebase console:

    /mods/<their UID> = true

It takes effect on their next page load. The ten hardcoded mods still work as before,
so nothing changes for them. Use this for Jeff instead of editing the code.

## URGENT — read this first

Builds .126 and .127 could **wipe an account on login**. If someone logged out and back
in while those were live, their locker was overwritten with an empty one.

What happened: on a fresh login localStorage is empty. The `lkRender()` call I added
after auth triggered a save, which pushed that empty locker to Firebase *before* the
real data had been downloaded. Points, name, favourites and history were replaced.

Build .128 adds a hard guard — **nothing can write to the cloud until the cloud copy
has been read at least once**. Verified with the cloud responding 2.5s and 4s late:
zero premature writes, all 43,270 points and 20 badges intact. Upload .128 immediately.

### Restoring Nocturnal Deadhead

His account was hit (43,270 pts -> 5). I captured his full record earlier in the
session, so nothing is actually lost. `RESTORE-nocturnal-deadhead.json` in this zip has
all of it — 43,270 points, 11 wins, 71 episodes, 20 badges, his name, favourites,
entrance theme and 40 history lines.

1. Upload `index.html` (.128) **first**, so the guard is live
2. Firebase Console -> Realtime Database -> navigate to
   `lockers/TwkyqKXbJ6NV8VNewfofluB1sji2`
3. Import / paste the contents of `RESTORE-nocturnal-deadhead.json`
4. Have him hard-refresh

Do it in that order. Restoring before .128 is live risks it being overwritten again.

Jeff Lane's locker was checked and is undamaged (1,347 pts).

## Verify the deploy

Open `https://jcwlunacy.net/?v=128` (query string defeats the cache) and check:

- **9 new hidden words** to type anywhere: carnivalofcarnage, ringmaster, jeckelbrothers, shangrila, bizzar, bangpowboom, mightydeathpop, faygo, bloodymania
- Jeff Lane: mod + **Violent Jeff** badge + Lunatics, all from the file
- Mods can now be promoted from the database — no new build needed
- Gifted cards now **land automatically** — no Claim button, no Lunatics requirement
- **Search bars** on Locker, any profile page, and the chat Leaders tab — type a name, hit a locker page
- **News tab is gone** — Sean Oliver's story now lives on the home page
- Green **vote banner** pinned under the nav; casting a vote removes it permanently
- New **VOTE** tab in the nav with the belt poll + 4 match predictions
- Home page leads with **“Getting Real BIG!”** by Sean Oliver (the 7/30 preview is gone)
- “Next Up” strip reads **This Thursday · 8/13** (or **Tonight** on a Thursday) — auto-dates forever
- Footer shows a **DEVELOPED BY** row → Creaso·Norse Technologies + creaso-norsetech.com
- Episodes tab newest tile reads **Episode 94**
- View source, search `b2026` → should read `b2026-07-19.128`

## Roster filenames in this package

barnabas-the-bizarre · brothers-of-funstruction · choppa-city · cokane · dani-mo ·
donovan-dijak · father-bronson · george-ross · joel-gertner · josh-bishop ·
kerry-morton · krule · mr-happy · outbreak · shane-mercer · steven-flowe

---

## ADDENDUM — build b2026-08-08.129 (patched in Cowork, Aug 8)

`index.html` in this folder is now **.129**. Three fixes on top of .128:

**1. Card collection could still be wiped.** `pushCards()` wrote `lockers/<uid>/cards`
with no guard — a Cards-page action on a fresh login could push `{}` over a real
collection. It now refuses to write until the first cloud pull has landed (same
guard as the locker).

**2. A wiped cloud copy could erase good local data.** The login merge let empty
cloud strings overwrite real local values, so a victim's last surviving copy of
name/theme/pic/favorites was destroyed on their own device. Non-empty local values
now win over empty cloud ones.

**3. Wipe recovery.** The site now snapshots the best locker each device has seen
per account (`jcw_locker_best_<uid>`). If a login pulls a cloud copy with under a
tenth of the snapshot's points, a banner appears: **RESTORE MY LOCKER** — one tap
merges the snapshot back and pushes it to Firebase through the guarded path.

### Restoring weirdward27@gmail.com (the wiped mod)

His cloud record was overwritten while .126/.127 were live — logging out/in
anywhere (site or app) now just re-downloads the wiped copy. No capture of his
data exists in this package. In order of preference:

1. **Deploy .129, then have him open jcwlunacy.net in any browser he played in
   before** (not the app; without clearing storage or using incognito). If that
   device remembers his locker, the green restore banner appears — one tap and
   the cloud heals for every device including the app.
2. Firebase Console → check whether **Realtime Database backups** are enabled
   (Blaze plan). If yes, pull his `lockers/<uid>` node from a backup taken before
   Aug 7 and paste it back. Find his UID under Authentication → search his email.
3. Last resort: rebuild by hand — ask him his rough points/badges and write the
   node directly, same shape as `RESTORE-nocturnal-deadhead.json`.

### Mobile app

If the app is a webview of jcwlunacy.net, deploying .129 fixes it automatically.
If it has its own sync code, port the same two guards: no cloud write before the
first cloud read, and never let empty cloud fields overwrite local ones.
(The "WATCHE-D" label wrap in the app's stat card is app-side CSS — smaller
label font or `word-break: keep-all` on that element.)

### Verify

View source, search `b2026` → should read **b2026-08-08.129**.

## Changelog since .129 (all included in this package's index.html)

- **.130** — gift auto-claim also fires on late sign-in (was: gave up 2 min after page load)
- **.131** — DJ Clay added to JCW_VERIFIED (gold "JCW Roster · DJ Clay" badge; DB badge already set live)
- **.132** — gift toast now says the card lands next time the recipient is on the site
- **.133** — Open Graph meta tags: kills the og:type mobile error, proper link previews on socials

`database.rules.json` (in this zip) is the **published** ruleset + one pending change:
wiped shells under 1,000 pts can accept a big point jump so fans can self-restore via
the banner. Paste the whole file in Firebase Console → Realtime Database → Rules →
Publish. Console only — never upload it to the repo.

- **.134** — **Psychopathic Arcade** added to Games: new card linking to `arcade.html`
  (upload `arcade.html` from this zip to the **repo root**). 11 games, free for everyone,
  opens in its own tab. Games lede + home-page tile copy updated to match.

- **.135** — **black-screen hardening.** Chat, Leaders and Mod-chat now render each
  message in its own try/catch, so no single bad record can blank a whole panel; if a
  panel ever ends up empty it shows a "tap to reload" note instead of a black void.
  The signed-in auth handler is fully fault-isolated too. Root cause of weirdward27's
  report was a **stale cached build** (site rebuilt 4× today) — clearing Safari website
  data fixes it immediately; .135 makes a stale/partial state self-describe instead of
  going black. Verified against the live site: clean visitor loads chat (120 msgs),
  leaderboard, vote, presence (67 online) with zero console errors.

- **Arcade play counter** — `arcade.html` now logs each game open to
  `stats/arcade/<game>` (+ `stats/arcadeTotal`) in the jcw-lunacy database, and
  `admin.html` shows it as a new **"Arcade — games played"** card right under
  Episodes watched: total plays + a per-game breakdown across all 11 games. Firebase
  loads lazily on first game open, so the arcade still runs offline (it just won't
  count when there's no connection). Re-upload both `arcade.html` and `admin.html`.

- **.136** — episode-number fixes from Jeff Lane. The 10 tour shows that were missing
  numbers are now titled **Episode 9–18** ("Episode 9 — Nashville 10/23" … "Episode 18
  — St. Louis 12/5"), matching the site's "Episode N — Location" style. Added the
  missing **Episode 48** (video `ojuPkl8RGJA`, verified as "JCW Lunacy Episode 48")
  between Powder Keg and 2 Day War — Night 1. Applied to BOTH `episodes.json` and the
  inline EPS backup in `index.html`. Episodes 1–94 are now all present, no duplicates.

- **.137** — added Jeff Lane's **"This Thursday's Card" (8/13)** preview block on the
  home page, directly under the Next Up strip (Sean Oliver's editorial stays as the
  featured News story). Scannable card: Gore Games build, Mr. Happy vs Kerry Morton,
  Storm & Cokane vs Choppa City for the tag titles, Jasmin/Dijak, Barnabas/Outbreak/
  Dani Mo, Alice Crowley. Note: this is dated for one week — swap or remove it after 8/13.

- **.138/.139** — **JCW Lunacy Radio.** New 📻 button, bottom-left (opposite the chat
  button). Tap it and it shuffle-plays every roster entrance theme in the audio folder,
  auto-advancing track to track, with play/pause, skip and a now-playing name. Reuses
  the existing THEME_MAP (same audio the profile "Entrance theme" buttons use), dedupes
  shared tracks, and pauses itself if someone plays a single wrestler's theme so audio
  never layers. Needs the `audio/` folder in the repo (already there). index.html only.

- **.139** — moved the Lunacy Radio button out of the bottom-left (it was colliding
  with the subscribe control) to sit stacked just above the chat button on the right,
  with an iPhone safe-area inset so it clears the home bar.

- **.140** — added Sean Oliver's second editorial, **"Sorry, Caleb Konley Is Not a
  Dick."**, placed ABOVE "Getting Real BIG!" in the News section (belt-photo banner +
  4 Konley promo shots woven through, web-optimized into article_imgs/). Also updated
  the arcade to **v17-recut** (`arcade.html`) with the play counter re-applied.
  Upload `index.html`, `arcade.html`, and the new `article_imgs/article-konley-*.jpg`.

- **.141** — **PPV tab wired in.** Applied the 5 site edits: new **PPV** nav link
  (after Events), #ppv route, the view-ppv purchase/player section, and the
  `ppv-tab.js` include. Upload `index.html` AND the new `ppv-tab.js` (repo root).
  STILL TO DO BY YOU (backend — needs your accounts): deploy the Cloudflare Worker,
  set up Stripe + Cloudflare Stream, then put the Worker URL into `ppv-tab.js`
  (`PPV_API`) and set `DEFAULT_EVENT`. Until then the PPV tab shows the ticket card
  but the Buy button can't complete. Full steps in the backend package's README-SETUP.md.

- **.142** — **Radio is now Lunatics Only.** The 📻 button still shows for everyone
  (advertises the perk), but non-members get a "🔒 Lunatics Only / JOIN →" prompt
  linking to #lunatics instead of playback. Gated on the same `__lkPremOn` flag as the
  cards and the game. Also ran a full CARDS audit (see below).

### Cards audit (build .142) — all green
Verified the card economy over 20,000 simulated packs: every pack = 5 cards with a
guaranteed rare-or-better, 150-pt cost deducts correctly, the full set is collectible,
foil rate ~8%, rarity mix matches 58/27/12/3. Gating confirmed: the Cards tab, pack
buying, card sending/trading, the game, and now the radio all require signed-in +
Lunatic (`__lkPremOn`); non-members see the join prompt. Gift send/refund and the
auto-claim path are intact.

### Before you flip the subscription on — two things
1. **Paste your Stripe Payment Link** into `JCW_STRIPE_LINK` (index.html, ~line 2367).
   While it's empty the "Join The Lunatics Only" button shows "Coming soon".
2. **Granting access after payment:** the `premiumMembers` node is `.write:false` by
   design (so nobody can self-grant). After someone pays you must set
   `premiumMembers/<their-uid> = true` — either by hand in the Firebase console, or via
   a Stripe webhook. Add `?client_reference_id=<uid>` is already appended to the
   checkout link so you can see who paid. Without this step, paying won't unlock cards/
   radio/game automatically.

- **.143** — **PPV tab rebranded to Bloodymania 19 with a "COMING 8/20" state.** The
  PPV tab now leads with "Bloodymania 19 · Live Pay-Per-View," a big COMING 8/20, the
  two-nights/Gathering details, and a disabled "Tickets coming soon" button (no live
  checkout yet). All the player IDs (ppv-video/ppv-frame/ppv-msg) are kept, so when the
  Cloudflare/Stripe backend is ready you just swap the disabled button back to a live
  Purchase button. `ppv-tab.js` DEFAULT_EVENT is set to `bloodymania-19` — use that same
  key in the worker's EVENTS block. Upload index.html + ppv-tab.js.
