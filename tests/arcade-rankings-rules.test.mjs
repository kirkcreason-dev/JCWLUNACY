import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

const games = ['poker', 'racing', 'pool', 'ladder', 'rumble', 'chicken', 'claw', 'shooter', 'ttt', 'chess', 'checkers', 'pinball', 'faygo', 'bj', 'memory', 'camper', 'solitaire', 'j31', 'hockey'];
const lower = new Set(['chess', 'checkers']);
const serverTimestamp = { '.sv': 'timestamp' };
const row = (v = 100, extra = {}) => ({ v, name: 'Test Rider', tag: 'CPU victory', t: serverTimestamp, ...extra });
const rules = readFileSync(new URL('../arcade-rankings.rules.json', import.meta.url), 'utf8');
let env, alice, bob, visitor;

before(async () => {
  const endpoint = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  assert.match(endpoint || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Run through test:rankings-rules; a local emulator is mandatory.');
  const [host, rawPort] = endpoint.split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-jcw-arcade-rankings', database: { host, port: Number(rawPort), rules } });
  alice = env.authenticatedContext('alice').database();
  bob = env.authenticatedContext('bob').database();
  visitor = env.unauthenticatedContext().database();
});
beforeEach(async () => env.clearDatabase());
after(async () => env?.cleanup());

function top(db, game, count = 10) {
  const query = db.ref('arcadeRankings/' + game).orderByChild('v');
  return lower.has(game) ? query.limitToFirst(count) : query.limitToLast(count);
}

async function seedRows(game, count = 20) {
  await env.withSecurityRulesDisabled(async context => {
    const entries = Object.fromEntries(Array.from({ length: count }, (_, i) => ['rider-' + String(i + 1).padStart(2, '0'), row(i + 1)]));
    await context.database().ref('arcadeRankings/' + game).set(entries);
  });
}

test('the fragment grants permissions only beneath the rankings namespace', () => {
  const fragment = JSON.parse(rules);
  assert.deepEqual(Object.keys(fragment), ['rules']);
  assert.deepEqual(Object.keys(fragment.rules), ['arcadeRankings']);
  assert.deepEqual(fragment.rules.arcadeRankings.$game['.indexOn'], ['v']);
});

test('each of the 19 games accepts a signed-in player’s own row and own-row transaction read', async () => {
  for (const game of games) {
    await assertSucceeds(alice.ref('arcadeRankings/' + game + '/alice').set(row()));
    const snap = await assertSucceeds(alice.ref('arcadeRankings/' + game + '/alice').once('value'));
    assert.equal(snap.val().v, 100);
    assert.equal(typeof snap.val().t, 'number');
    await assertSucceeds(top(bob, game).once('value'));
  }
});

test('signed-out clients cannot read or write shared rankings', async () => {
  await seedRows('racing');
  await assertFails(top(visitor, 'racing').once('value'));
  await assertFails(visitor.ref('arcadeRankings/racing/alice').once('value'));
  await assertFails(visitor.ref('arcadeRankings/racing/alice').set(row()));
});

test('a player cannot write, delete, directly read or transact on another player’s row', async () => {
  const own = alice.ref('arcadeRankings/poker/alice');
  await assertSucceeds(own.set(row()));
  await assertFails(bob.ref('arcadeRankings/poker/alice').set(row(200)));
  await assertFails(bob.ref('arcadeRankings/poker/alice').remove());
  await assertFails(bob.ref('arcadeRankings/poker/alice').once('value'));
  await assertFails(bob.ref('arcadeRankings/poker/alice').transaction(() => row(300)));
  await assertFails(alice.ref('arcadeRankings/poker').update({ alice: row(200), bob: row(200) }));
  assert.equal((await own.once('value')).val().v, 100);
});

test('only the correct, bounded top-ten query is readable', async () => {
  for (const game of ['racing', 'chess', 'checkers']) {
    await seedRows(game);
    const snapshot = await assertSucceeds(top(alice, game).once('value'));
    const values = []; snapshot.forEach(child => { values.push(child.val().v); });
    assert.deepEqual(values, lower.has(game) ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const ref = alice.ref('arcadeRankings/' + game);
    await assertFails(ref.once('value'));
    await assertFails(ref.orderByChild('v').once('value'));
    await assertFails(top(alice, game, 11).once('value'));
    await assertFails(top(alice, game, 9).once('value'));
    await assertFails((lower.has(game) ? ref.orderByChild('v').limitToLast(10) : ref.orderByChild('v').limitToFirst(10)).once('value'));
    await assertFails(ref.orderByKey().limitToFirst(10).once('value'));
    await assertFails(top(alice, game).startAt(2).once('value'));
    await assertFails(top(alice, game).endAt(19).once('value'));
    await assertFails(top(alice, game).equalTo(5).once('value'));
  }
  await assertFails(alice.ref('arcadeRankings').once('value'));
});

test('unknown game keys cannot acquire write or read permissions', async () => {
  for (const game of ['unknown', 'Racing', 'race', 'racing2', 'constructor', '__proto__']) {
    await assertFails(alice.ref('arcadeRankings/' + game + '/alice').set(row()));
    await assertFails(alice.ref('arcadeRankings/' + game + '/alice').once('value'));
    await assertFails(alice.ref('arcadeRankings/' + game).orderByChild('v').limitToLast(10).once('value'));
  }
});

test('higher-score games accept improvements and reject losses, ties and deletions', async () => {
  const ref = alice.ref('arcadeRankings/racing/alice');
  await assertSucceeds(ref.set(row(100)));
  await assertFails(ref.set(row(99)));
  await assertFails(ref.set(row(100, { name: 'Renamed same score' })));
  await assertFails(ref.remove());
  await assertSucceeds(ref.set(row(200, { name: 'New record', tag: '' })));
  assert.equal((await ref.once('value')).val().v, 200);
});

test('chess and checkers accept only improvements toward fewer moves', async () => {
  for (const game of lower) {
    const ref = alice.ref('arcadeRankings/' + game + '/alice');
    await assertSucceeds(ref.set(row(30)));
    await assertFails(ref.set(row(31)));
    await assertFails(ref.set(row(30, { tag: 'Equal score cannot rewrite its timestamp' })));
    await assertSucceeds(ref.set(row(29)));
    assert.equal((await ref.once('value')).val().v, 29);
  }
});

test('a transaction safely preserves a better record when two devices race to update it', async () => {
  const first = env.authenticatedContext('same-player').database();
  const second = env.authenticatedContext('same-player').database();
  const path = 'arcadeRankings/pinball/same-player';
  await assertSucceeds(first.ref(path).set(row(10)));
  const submit = (db, score) => db.ref(path).transaction(current => !current || score > current.v ? row(score) : undefined, undefined, false);
  await Promise.all([assertSucceeds(submit(first, 250)), assertSucceeds(submit(second, 500))]);
  assert.equal((await first.ref(path).once('value')).val().v, 500);
  const unchanged = await assertSucceeds(submit(first, 400));
  assert.equal(unchanged.committed, false);
});

test('score bounds and integer type are enforced on the server', async () => {
  const ref = alice.ref('arcadeRankings/claw/alice');
  for (const value of [0, -1, .5, 1000000001, '500', null, true, { score: 500 }]) await assertFails(ref.set(row(value)));
  await assertSucceeds(ref.set(row(1)));
  await assertSucceeds(ref.set(row(1000000000)));
});

test('record names, tags, required fields and priorities cannot bypass the schema', async () => {
  const ref = alice.ref('arcadeRankings/claw/alice');
  for (const extra of [{ name: '' }, { name: 'x'.repeat(41) }, { name: 7 }, { tag: 'x'.repeat(121) }, { tag: [] }, { uid: 'alice' }, { role: 'admin' }, { badges: ['winner'] }]) await assertFails(ref.set(row(100, extra)));
  for (const missing of ['v', 'name', 'tag', 't']) { const value = row(); delete value[missing]; await assertFails(ref.set(value)); }
  await assertFails(ref.setWithPriority(row(), 1));
  await assertSucceeds(ref.set(row(100, { name: 'x'.repeat(40), tag: 'x'.repeat(120) })));
});

test('timestamps must be recent server-compatible integer values', async () => {
  const ref = alice.ref('arcadeRankings/pool/alice');
  for (const t of [0, -1, 'now', Date.now() - 120000, Date.now() + 120000, Date.now() + .5]) await assertFails(ref.set(row(100, { t })));
  await assertSucceeds(ref.set(row()));
  const value = (await ref.once('value')).val();
  assert.ok(value.t > Date.now() - 10000 && value.t <= Date.now());
});

test('the fragment adds no locker, badge, stats or unrelated database writes', async () => {
  for (const path of ['lockers/alice/arcade/wins', 'lockers/alice/badges', 'stats/arcade/racing', 'mods/alice', 'other/alice']) await assertFails(alice.ref(path).set(1));
});
