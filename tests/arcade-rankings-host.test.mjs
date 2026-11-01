import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { mergeRules } from '../scripts/merge-arcade-ranking-rules.mjs';

const source = readFileSync(new URL('../arcade-rankings.js', import.meta.url), 'utf8');
const fragment = JSON.parse(readFileSync(new URL('../arcade-rankings.rules.json', import.meta.url), 'utf8'));
// The site's existing public profile-name read is preserved. Nothing here
// grants a ranking writer access to locker totals, badges or other site data.
const rules = JSON.stringify({ rules: { ...fragment.rules, lockers: { '.read': true, '.write': false } } });
let env, sequence = 0;
before(async () => {
  const endpoint = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  assert.match(endpoint || '', /^(127\.0\.0\.1|localhost):\d+$/);
  const [host, port] = endpoint.split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-jcw-arcade-rankings', database: { host, port: Number(port), rules } });
});
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.database().ref('lockers').set({ alice: { name: 'Alice the Juggalo', pts: 42, arcade: { wins: 7, records: 3 }, badges: ['unchanged'] }, bob: { name: 'Bob the Juggalo' } });
  });
});
after(async () => env?.cleanup());

function harness(uid = 'alice', options = {}) {
  const db = uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();
  const paths = [], responses = [], listeners = new Map();
  let activeAuthListeners = 0;
  const auth = {
    currentUser: uid ? { uid, displayName: 'Auth fallback' } : null,
    onAuthStateChanged(callback) {
      activeAuthListeners++;
      let cancelled = false;
      queueMicrotask(() => { if (!cancelled) callback(auth.currentUser); });
      return () => { if (!cancelled) { cancelled = true; activeAuthListeners--; } };
    },
  };
  const database = () => ({ ref(path) { paths.push(path); return options.ref ? options.ref(path, db) : db.ref(path); } });
  database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
  const firebase = { auth: () => auth, database };
  const child = { postMessage(body, origin) { responses.push({ body: JSON.parse(JSON.stringify(body)), origin }); } };
  const frame = { contentWindow: child };
  const win = { location: { origin: 'https://jcwlunacy.net' }, firebase,
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); } };
  vm.runInNewContext(source, { window: win, setTimeout, clearTimeout, queueMicrotask });
  const installed = win.JCW_ARCADE_RANKINGS.install({ window: win, frame, firebaseReady: options.firebaseReady || (callback => callback(true)), timeoutMs: options.timeoutMs || 3000 });
  async function send(value, event = {}) {
    const count = responses.length;
    await listeners.get('message')?.({ source: child, origin: win.location.origin, data: { type: 'jcw-arcade-rankings', v: 1, id: 'host-test-' + (++sequence), ...value }, ...event });
    return responses.length === count ? null : responses.at(-1).body;
  }
  return { send, auth, paths, responses, frame, installed, db, games: Object.keys(win.JCW_ARCADE_RANKINGS.games), authListeners: () => activeAuthListeners };
}
async function allData() {
  let data;
  await env.withSecurityRulesDisabled(async ctx => { data = (await ctx.database().ref().once('value')).val(); });
  return data;
}

test('the real host bridge saves all 19 games and another signed-in device reads the same rows', async () => {
  const first = harness(), second = harness();
  const before = (await allData()).lockers;
  assert.equal(first.games.length, 19);
  for (const game of first.games) {
    const saved = await first.send({ action: 'submit', g: game, score: 123, tag: 'CPU match', initials: 'ICP' });
    assert.equal(saved.ok, true, JSON.stringify(saved)); assert.equal(saved.signedIn, true); assert.equal(saved.accepted, true);
    assert.equal(saved.own.uid, 'alice'); assert.equal(saved.own.name, 'Alice the Juggalo'); assert.equal(saved.own.v, 123); assert.ok(saved.own.t > 0);
    const remote = await second.send({ action: 'list', g: game });
    assert.equal(remote.ok, true); assert.deepEqual(remote.own, saved.own); assert.deepEqual(remote.rows, [saved.own]);
  }
  assert.deepEqual((await allData()).lockers, before);
  assert.ok(first.paths.every(path => path === 'lockers/alice/name' || path.startsWith('arcadeRankings/')));
  assert.equal(first.authListeners(), 0); assert.equal(second.authListeners(), 0);
});

test('top-ten ordering and best-score transactions work in both score directions', async () => {
  const alice = harness(), bob = harness('bob');
  assert.equal((await alice.send({ action: 'submit', g: 'racing', score: 100 })).accepted, true);
  assert.equal((await alice.send({ action: 'submit', g: 'racing', score: 90 })).accepted, false);
  assert.equal((await alice.send({ action: 'submit', g: 'racing', score: 100, tag: 'equal score' })).accepted, false);
  assert.equal((await bob.send({ action: 'submit', g: 'racing', score: 200 })).accepted, true);
  assert.deepEqual((await alice.send({ action: 'list', g: 'racing' })).rows.map(r => r.v), [200, 100]);
  assert.equal((await alice.send({ action: 'submit', g: 'chess', score: 12 })).accepted, true);
  assert.equal((await alice.send({ action: 'submit', g: 'chess', score: 15 })).accepted, false);
  assert.equal((await alice.send({ action: 'submit', g: 'chess', score: 8 })).accepted, true);
  await bob.send({ action: 'submit', g: 'chess', score: 10 });
  assert.deepEqual((await bob.send({ action: 'list', g: 'chess' })).rows.map(r => r.v), [8, 10]);
});

test('a player outside the top ten still receives their own cross-device best', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    const entries = Object.fromEntries(Array.from({ length: 15 }, (_, i) => ['leader-' + i, { v: 1000 + i, name: 'Leader ' + i, tag: '', t: Date.now() }]));
    await ctx.database().ref('arcadeRankings/poker').set(entries);
  });
  const user = harness();
  const result = await user.send({ action: 'submit', g: 'poker', score: 10 });
  assert.equal(result.ok, true); assert.equal(result.accepted, true); assert.equal(result.rows.length, 10);
  assert.equal(result.own.v, 10); assert.ok(result.rows.every(row => row.uid !== 'alice'));
});

test('signed-out readers/writers receive an explicit response and never write', async () => {
  const user = harness(null);
  assert.deepEqual(await user.send({ action: 'status', id: 'status' }), { type: 'jcw-arcade-rankings-response', v: 1, id: 'status', action: 'status', ok: true, signedIn: false });
  for (const action of ['list', 'submit']) {
    const result = await user.send({ action, g: 'pool', ...(action === 'submit' ? { score: 100 } : {}) });
    assert.equal(result.ok, false); assert.equal(result.error, 'signed-out'); assert.equal(result.signedIn, false);
  }
  assert.equal((await allData()).arcadeRankings, undefined);
});

test('wrong windows/origins and requests with forged identity or bad scores cannot access the service', async () => {
  const user = harness();
  const input = { action: 'submit', g: 'pool', score: 100 };
  assert.equal(await user.send(input, { source: {} }), null);
  assert.equal(await user.send(input, { origin: 'https://evil.example' }), null);
  for (const change of [{ uid: 'bob' }, { g: '__proto__' }, { score: -1 }, { score: 1.5 }, { score: 1000000001 }, { tag: 'x'.repeat(121) }, { action: 'list', score: 100 }]) {
    const result = await user.send({ ...input, ...change }); assert.equal(result.error, 'invalid-request');
  }
  assert.deepEqual(user.paths, []); assert.equal((await allData()).arcadeRankings, undefined);
});

test('request retries are idempotent and cached authenticated data cannot outlive sign-out', async () => {
  const user = harness(), input = { action: 'submit', g: 'poker', score: 100, id: 'same-request' };
  const first = await user.send(input), second = await user.send(input);
  assert.deepEqual(second, first);
  assert.equal((await user.send({ ...input, score: 200 })).error, 'invalid-request');
  user.auth.currentUser = null;
  const signedOut = await user.send(input);
  assert.equal(signedOut.error, 'signed-out'); assert.equal(signedOut.own, undefined);
  assert.equal((await allData()).arcadeRankings.poker.alice.v, 100);
});

test('a known account switch during Firebase initialization cannot assign an old score to the new account', async () => {
  let release, announce;
  const loading = new Promise(resolve => { announce = resolve; });
  const bob = env.authenticatedContext('bob').database();
  let user;
  user = harness('alice', {
    firebaseReady(callback) { release = callback; announce(); },
    ref(path, alice) { return (user.auth.currentUser?.uid === 'bob' ? bob : alice).ref(path); },
  });
  const work = user.send({ action: 'submit', g: 'poker', score: 999 });
  await loading; user.auth.currentUser = { uid: 'bob', displayName: 'Bob' }; release(true);
  const result = await work;
  assert.equal(result.error, 'signed-out'); assert.equal(result.accepted, undefined);
  assert.equal((await allData()).arcadeRankings, undefined);
});

test('an account switch at the final read cannot send or cache the prior account’s result, including pending retries', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.database().ref('arcadeRankings/poker').set({
      alice: { v: 123, name: 'Alice', tag: '', t: Date.now() },
      bob: { v: 321, name: 'Bob', tag: '', t: Date.now() },
    });
  });
  const bob = env.authenticatedContext('bob').database();
  let user, switchOnRead = true;
  user = harness('alice', {
    ref(path, alice) {
      const ref = (user.auth.currentUser?.uid === 'bob' ? bob : alice).ref(path);
      if (path !== 'arcadeRankings/poker') return ref;
      return {
        orderByChild: key => ref.orderByChild(key),
        child(uid) {
          return { async once(event) {
            const snapshot = await ref.child(uid).once(event);
            return { val() {
              if (uid === 'alice' && switchOnRead) {
                switchOnRead = false;
                // This runs after readBoard's last database identity check,
                // but before its caller can send/cache the resolved result.
                queueMicrotask(() => { user.auth.currentUser = { uid: 'bob', displayName: 'Bob' }; });
              }
              return snapshot.val();
            } };
          } };
        },
      };
    },
  });
  const input = { action: 'list', g: 'poker', id: 'account-bound-read' };
  await Promise.all([user.send(input), user.send(input)]);
  assert.equal(user.responses.length, 2);
  for (const { body } of user.responses) {
    assert.equal(body.error, 'signed-out');
    assert.equal(body.own, undefined); assert.equal(body.rows, undefined);
  }
  const retry = await user.send(input);
  assert.equal(retry.ok, true); assert.equal(retry.own.uid, 'bob'); assert.equal(retry.own.v, 321);
  assert.equal(user.authListeners(), 0);
});

test('sign-out while profile loading cancels submission before the transaction', async () => {
  let release;
  const delay = new Promise(resolve => { release = resolve; });
  const user = harness('alice', { ref(path, db) { return path.endsWith('/name') ? { once: async () => { await delay; return { val: () => 'Alice' }; } } : db.ref(path); } });
  const work = user.send({ action: 'submit', g: 'racing', score: 100 });
  await new Promise(resolve => setTimeout(resolve, 10));
  user.auth.currentUser = null; release();
  assert.equal((await work).error, 'signed-out'); assert.equal((await allData()).arcadeRankings, undefined);
});

test('unpublished ranking permissions fail closed without altering any website data', async () => {
  const before = await allData();
  const user = harness('alice', { ref(path, db) { return db.ref(path.replace(/^arcadeRankings\//, 'notYetActivatedRankings/')); } });
  for (const action of ['list', 'submit']) {
    const result = await user.send({ action, g: 'racing', ...(action === 'submit' ? { score: 100 } : {}) });
    assert.equal(result.ok, false); assert.equal(result.error, 'unavailable'); assert.equal(result.accepted, undefined);
  }
  assert.deepEqual(await allData(), before);
});

test('Firebase failures and timeouts return unavailable without claiming a save', async () => {
  for (const firebaseReady of [callback => callback(false), () => {}]) {
    const user = harness('alice', { firebaseReady, timeoutMs: 20 });
    const result = await user.send({ action: 'submit', g: 'racing', score: 100 });
    assert.equal(result.ok, false); assert.equal(result.error, 'unavailable'); assert.equal(result.accepted, undefined);
    user.installed.destroy();
  }
  assert.equal((await allData()).arcadeRankings, undefined);
});

test('host page installs the separate bridge without altering the legacy badge listener', () => {
  const html = readFileSync(new URL('../arcade.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="arcade-rankings\.js\?v=1"><\/script>/);
  assert.match(html, /JCW_ARCADE_RANKINGS\.install\(\{frame:document\.getElementById\('arcade'\),firebaseReady:window\.__arcFirebase\}\)/);
  assert.ok(!source.includes("ref('lockers/' + context.user.uid + '/arcade')"));
  assert.ok(!source.includes("type:'jcw-arcade'"));
});


test('activation helper preserves every existing permission and refuses unsafe ancestor grants', () => {
  const live = { rules: { '.read': false, '.write': false, lockers: { '$uid': { '.write': 'auth.uid === $uid' } }, stats: { '.read': true } } };
  const merged = mergeRules(live, fragment);
  assert.deepEqual(merged.rules.lockers, live.rules.lockers); assert.deepEqual(merged.rules.stats, live.rules.stats);
  assert.equal(live.rules.arcadeRankings, undefined); assert.deepEqual(merged.rules.arcadeRankings, fragment.rules.arcadeRankings);
  assert.deepEqual(mergeRules(merged, fragment), merged);
  assert.throws(() => mergeRules({ rules: { '.write': true } }, fragment), /parent grants/);
  assert.throws(() => mergeRules({ rules: { '.read': 'auth != null' } }, fragment), /parent grants/);
  assert.throws(() => mergeRules({ rules: { arcadeRankings: { '.write': true } } }, fragment), /already differs/);
});
