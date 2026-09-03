# jcwlunacy.net — changed files

Everything in this archive is new or modified. Extracted from the live site
2026-08-26, edited through 2026-08-31.

**`roster/` is not included** — those 108 photos are untouched, and you
already have them (on the server, and in `~/Documents/jcwlunacy` from the
original extraction). Same for `config.json`, `episodes.json`,
`merch.json`, `ppv-tab.js`, `poop-dollar.png` and the 10 older
`article_imgs/`.

## Deploy

Upload this folder over your web root. It merges into the existing
structure. Two folders are **new** and `index.html` needs both:

- `lunatics/` — without it the Lunatics Only cards lose their icons. They
  degrade to plain text via `onerror`, so nothing breaks.
- `ui/` — without it the chat button is an invisible 64px square. It is a
  CSS background with no fallback.

`nav/` is a straight overwrite, same filenames.

## Contents

```
index.html          the whole site, ~4,900 lines, no build step
clips.json          TikTok handle, tag URL, 12 pinned clips
nav/                15 nav buttons (13 new art + About/Tickets)
ui/                 48 state icons, 3 of them wired      NEW FOLDER
lunatics/           7 Lunatics Only feature badges       NEW FOLDER
article_imgs/       5 new Konley photos
```

## Changes

1. **Konley article** — 5 new photos; inline floats widened 250→300px for
   the landscape crops.
2. **Trading cards** — `GAME_CHARS` limits the catalog to playable fighters
   (5 champions, **unverified**). 165 cards → 14. Also fixed `pickCard()`,
   which could deal short packs when a rarity tier was empty.
3. **Locker prune** — `PRUNE_MODE` strips retired cards from lockers.
   **Currently `'report'` (dry run).** Do not set `'on'` until `GAME_CHARS`
   is confirmed AND `lockers/` is exported from Firebase. Irreversible.
4. **Weekly update** — homepage card. `SPECIAL` in the self-dating script
   overrides the Thursday header for one-off shows and expires by itself.
   **The card body is hardcoded and still shows the 8/29 lineup.**
5. **Bloodymania rollover** — countdown repointed to BM20 (placeholder date;
   `BM_CONFIRMED=false` shows a "dates TBA" note), picks widget commented
   out, marquee / events / PPV / schedule de-staled.
6. **Lunatics Only** — emoji replaced with badge art in both the member and
   non-member card lists.
7. **Boldizar the Great Hunter** — badge 43, awarded at 30 badges, +500 pts.
   Backfills retroactively at load and after the cloud merge.
8. **Nav** — 13 new icons plus About/Tickets. Active-tab glow switched from
   `box-shadow` to `drop-shadow`, so transparent art glows around the
   artwork rather than around a blank box.
9. **Chat unread** — the FAB swaps inactive/active/notify off real unread
   state, using Firebase push keys as a high-water mark. Read state is
   per-device (`localStorage`).

## Open items

- `GAME_CHARS` is a guess from the game blurb — verify against the real
  fighter select before turning the prune on.
- Rarity collapsed: all 14 cards are Super Rare or Legendary, because
  tiering keys off champion status and every fighter is a champion.
  Re-tier by card *type* to restore a ladder.
- Weekly card body needs the next show's lineup.
- `nav-ppv.png` exists but nothing links to the working `#ppv` view.
- `arcade.html` and `admin.html` are on the server but were never
  extracted — they are not in this archive, and the weekly-update and
  article editors still need to be added to `admin.html`.
- 45 of the 48 `ui/` icons are unused (the News set, and the About/Tickets
  variants not chosen).
- About/Tickets nav art is unlabelled; the other 13 have labels baked in.

## Backend

Firebase RTDB + Auth, SDK 9.23.0 compat, `jcw-lunacy-default-rtdb`.
Refs: `lockers/`, `gifts/`, `trades/`, `relations/`, `dmIndex/`, `dm/`,
`walls/`, `stats/`, `polls/`, `notifications/`, `chat/`, `modchat/`,
`mods`, `presence/`, `premiumMembers/`, `premiumContent`, `siteEpisodes`,
`broadcast/latest`, `errors`.

## Gotcha

The sandbox egress proxy blocks jcwlunacy.net from both the cloud container
and the desktop VM shell. The site is only reachable through Chrome
(claude-in-chrome) or WebFetch.
