# Shared arcade rankings

The website host and arcade use the separate `jcw-arcade-rankings` version 1 protocol. Signed-in players have one best score per game at `arcadeRankings/<game>/<uid>`. The host chooses the account and profile name. Chess and Checkers favor fewer moves; the other 17 games favor higher scores. Reads return the top ten and the current player's own record. The existing locker, badge, play-counter and points code is unchanged.

The host rejects unknown games, invalid scores and requests from another frame or origin. Transactions preserve the better score when two devices update at once. Account changes cancel in-flight submissions. These remain browser-reported scores: database rules enforce ownership, data shape and improvement, but do not prove genuine gameplay.

## Test locally

Run `npm ci`, then `npm run test:rankings-rules`. This starts an isolated Firebase Realtime Database emulator with the `demo-jcw-arcade-rankings` project. It does not contact the live database. Java 21 is required. `node --test tests/ladder-achievements.test.mjs` checks the unchanged legacy website behavior.

## Activate in Firebase

The website code can be published before activation. Until the database rules are available, shared requests return `unavailable`; device scores continue working and no successful cloud save is claimed.

1. Sign into the Firebase project `jcw-lunacy` and select its `jcw-lunacy-default-rtdb` Realtime Database.
2. Retrieve the actual current live rules and save a dated backup outside the repository. Do not assume either existing repository-wide rules file matches production.
3. Prepare a new document with:
   ```sh
   node scripts/merge-arcade-ranking-rules.mjs LIVE-RULES.json NEW-MERGED-RULES.json
   ```
4. Review the diff. It must add only `rules.arcadeRankings`; all existing rules must remain unchanged. The helper stops if root-level grants would bypass the new restrictions or if a different rankings namespace already exists.
5. Publish the merged rules through the authenticated Firebase console or deployment tooling. **Never deploy `arcade-rankings.rules.json` alone:** it is a fragment, and replacing the entire live rules document with it would remove unrelated website permissions. The emulator configuration is for local tests only.
6. Verify an authenticated score submission and read it from a second signed-in device/session. Verify signed-out requests and writes to another player's record remain denied. Keep the live backup for rollback; rollback must remove only this namespace and preserve any subsequent unrelated rule changes.

No production login credentials or tokens belong in this repository. Activation requires an authenticated Firebase session and must not bypass an account-access approval rejection.

## Activation record

On November 1, 2026, the rankings namespace was merged into the actual live rules through the signed-in Firebase console. All 31 existing namespaces were checked for exact structural equality before publication. Reloading the console and copying the saved rules confirmed the entire published document matched the reviewed merge. The original backup, merged document and verification screenshot are retained outside this repository in the task's `outputs/firebase-rankings-activation-2026-11-01` folder.

The live rules are active. The website bridge and arcade client still need their coordinated release before an end-to-end production score can be verified. Automated authenticated submissions, cross-account reads, account-switch races and denied writes are covered against the isolated Realtime Database emulator; no fabricated score was added to the production leaderboard during activation.
