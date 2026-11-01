/* Shared arcade records only. This module never writes locker points, wins,
 * badges or play counters. Each signed-in member owns one best score per game. */
(function (global) {
  'use strict';
  const TYPE = 'jcw-arcade-rankings';
  const RESPONSE = TYPE + '-response';
  const GAMES = Object.freeze(Object.fromEntries([
    'poker', 'racing', 'pool', 'ladder', 'rumble', 'chicken', 'claw', 'shooter',
    'ttt', 'chess', 'checkers', 'pinball', 'faygo', 'bj', 'memory', 'camper',
    'solitaire', 'j31', 'hockey'
  ].map(game => [game, game !== 'chess' && game !== 'checkers'])));
  const own = (object, key) => Object.hasOwn(object, key);
  const validScore = value => Number.isSafeInteger(value) && value > 0 && value <= 1000000000;
  const text = (value, max) => typeof value === 'string' && value.length <= max;
  function fault(code, message) { return Object.assign(new Error(message), { code }); }
  const unavailable = () => fault('unavailable', 'Shared rankings are temporarily unavailable. Your device record is safe.');
  const signedOut = () => fault('signed-out', 'Sign into your Juggalo Locker on jcwlunacy.net to use website rankings.');
  function request(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.type !== TYPE || value.v !== 1 || !text(value.id, 80) || !value.id.length) return null;
    if (Object.keys(value).some(key => !['type', 'v', 'id', 'action', 'g', 'score', 'tag', 'initials'].includes(key))) return null;
    if (!['status', 'list', 'submit'].includes(value.action)) return null;
    if (value.action !== 'submit' && ['score', 'tag', 'initials'].some(key => value[key] !== undefined)) return null;
    if (value.action !== 'status' && !own(GAMES, value.g) || value.g !== undefined && !own(GAMES, value.g)) return null;
    if (value.action === 'submit' && (!validScore(value.score) || value.tag !== undefined && !text(value.tag, 120) || value.initials !== undefined && !text(value.initials, 3))) return null;
    return { id: value.id, action: value.action, g: value.g, score: value.score, tag: value.tag || '', initials: value.initials || '' };
  }
  function row(uid, value) {
    if (typeof uid !== 'string' || !uid.length || uid.length > 128 || !value || !validScore(value.v) || !text(value.name, 40) || !value.name.trim() || !text(value.tag, 120) || !Number.isSafeInteger(value.t) || value.t <= 0) return null;
    return { uid, name: value.name, v: value.v, tag: value.tag, t: value.t };
  }
  function install(options = {}) {
    const win = options.window || global, frame = options.frame;
    const firebaseReady = options.firebaseReady || win.__arcFirebase;
    const getFirebase = options.firebase || (() => win.firebase);
    const now = options.now || Date.now, timeoutMs = options.timeoutMs || 7000;
    if (!frame || typeof firebaseReady !== 'function') throw new Error('The arcade frame and Firebase loader are required.');
    const pending = new Map(), completed = new Map();
    let stopped = false;
    function authIdentity() { try { return getFirebase()?.auth?.().currentUser?.uid || null; } catch (_error) { return null; } }
    function bounded(work) {
      let timer;
      return Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), timeoutMs); })]).finally(() => clearTimeout(timer));
    }
    async function client() {
      await bounded(() => new Promise((resolve, reject) => firebaseReady(ok => ok ? resolve() : reject(unavailable()))));
      const firebase = getFirebase();
      if (!firebase || typeof firebase.auth !== 'function' || typeof firebase.database !== 'function') throw unavailable();
      const auth = firebase.auth();
      // Auth persistence can settle after the Firebase scripts load. Wait for
      // its initial callback instead of briefly treating a member as signed out.
      const user = await new Promise((resolve, reject) => {
        let done = false, unsubscribe = () => {};
        const timer = setTimeout(() => finish(null, unavailable()), timeoutMs);
        function finish(value, error) { if (done) return; done = true; clearTimeout(timer); queueMicrotask(() => unsubscribe()); error ? reject(error) : resolve(value); }
        try { unsubscribe = auth.onAuthStateChanged(value => finish(value), () => finish(null, unavailable())); }
        catch (_error) { finish(null, unavailable()); }
      });
      return { firebase, auth, user, db: firebase.database() };
    }
    function sameUser(context) {
      if (!context.user || context.auth.currentUser?.uid !== context.user.uid) throw signedOut();
    }
    async function readBoard(context, game) {
      sameUser(context);
      const base = context.db.ref('arcadeRankings/' + game);
      const query = base.orderByChild('v');
      const [top, personal] = await Promise.all([
        (GAMES[game] ? query.limitToLast(10) : query.limitToFirst(10)).once('value'),
        base.child(context.user.uid).once('value')
      ]);
      sameUser(context);
      const rows = [];
      top.forEach(child => { const item = row(child.key, child.val()); if (item) rows.push(item); });
      rows.sort((a, b) => (GAMES[game] ? b.v - a.v : a.v - b.v) || a.uid.localeCompare(b.uid));
      return { rows: rows.slice(0, 10), own: row(context.user.uid, personal.val()) };
    }
    async function displayName(context, initials) {
      const profile = await context.db.ref('lockers/' + context.user.uid + '/name').once('value').catch(() => null);
      sameUser(context);
      for (const value of [profile?.val(), context.user.displayName, initials]) {
        if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 40);
      }
      return 'Juggalo';
    }
    async function execute(input, operation) {
      const context = await client();
      const uid = context.user?.uid || null;
      if (operation.bound && operation.uid !== uid) throw signedOut();
      operation.uid = uid; operation.bound = true;
      if ((context.auth.currentUser?.uid || null) !== uid) throw signedOut();
      if (input.action === 'status') return { ok: true, signedIn: !!uid };
      sameUser(context);
      if (input.action === 'list') return { ok: true, signedIn: true, ...await readBoard(context, input.g) };
      const name = await displayName(context, input.initials);
      const candidate = { v: input.score, name, tag: input.tag, t: context.firebase.database.ServerValue.TIMESTAMP };
      sameUser(context);
      const outcome = await context.db.ref('arcadeRankings/' + input.g + '/' + context.user.uid).transaction(current => {
        if (context.auth.currentUser?.uid !== context.user.uid) return;
        if (current && validScore(current.v) && (GAMES[input.g] ? current.v >= input.score : current.v <= input.score)) return;
        return candidate;
      }, undefined, false);
      sameUser(context);
      return { ok: true, signedIn: true, accepted: outcome.committed === true, ...await readBoard(context, input.g) };
    }
    function send(event, body) {
      if (stopped || event.source !== frame.contentWindow) return;
      // The production arcade is a same-origin blob frame. Reply only to that
      // exact window and origin; this is not a generic cross-site score API.
      event.source.postMessage(body, event.origin);
    }
    function currentReply(operation, reply) {
      // A database promise may finish immediately before Auth changes. Check
      // again after awaiting it, including when a duplicate joins pending work.
      if (operation.bound && operation.uid !== authIdentity()) {
        return { ...operation.base, ok: false, signedIn: false, error: 'signed-out', message: signedOut().message };
      }
      return reply;
    }
    async function receive(event) {
      if (stopped || event.source !== frame.contentWindow || event.origin !== win.location.origin || event.data?.type !== TYPE) return;
      const input = request(event.data);
      if (!input) {
        if (text(event.data?.id, 80) && event.data.id) send(event, { type: RESPONSE, v: 1, id: event.data.id, action: typeof event.data.action === 'string' ? event.data.action.slice(0, 16) : '', ...(own(GAMES, event.data.g) ? { g: event.data.g } : {}), ok: false, signedIn: false, error: 'invalid-request', message: 'This ranking request was not valid.' });
        return;
      }
      const identity = JSON.stringify(input), base = { type: RESPONSE, v: 1, id: input.id, action: input.action, ...(input.g ? { g: input.g } : {}) };
      for (const [id, saved] of completed) if (now() - saved.time > 60000) completed.delete(id);
      if (completed.has(input.id) && completed.get(input.id).uid !== authIdentity()) completed.delete(input.id);
      const cached = completed.get(input.id), running = pending.get(input.id);
      if (cached || running) {
        if ((cached || running).identity !== identity) return send(event, { ...base, ok: false, signedIn: false, error: 'invalid-request', message: 'Use a fresh request ID.' });
        return send(event, cached ? cached.reply : currentReply(running, await running.promise));
      }
      if (pending.size >= 4) return send(event, { ...base, ok: false, signedIn: false, error: 'unavailable', message: 'Please wait for the current ranking request.' });
      const initialUid = authIdentity();
      const operation = { identity, base, uid: initialUid, bound: initialUid !== null, promise: null };
      operation.promise = bounded(() => execute(input, operation)).then(result => ({ ...base, ...result }), error => ({ ...base, ok: false, signedIn: error.code !== 'signed-out' && !!authIdentity(), error: error.code === 'signed-out' ? 'signed-out' : 'unavailable', message: error.code === 'signed-out' ? error.message : unavailable().message }));
      pending.set(input.id, operation);
      const reply = currentReply(operation, await operation.promise);
      pending.delete(input.id);
      if (operation.bound && operation.uid === authIdentity()) completed.set(input.id, { identity, reply, time: now(), uid: operation.uid });
      while (completed.size > 64) completed.delete(completed.keys().next().value);
      send(event, reply);
    }
    win.addEventListener('message', receive);
    return { destroy() { stopped = true; win.removeEventListener('message', receive); pending.clear(); completed.clear(); } };
  }
  global.JCW_ARCADE_RANKINGS = Object.freeze({ install, games: GAMES });
})(typeof window === 'object' ? window : globalThis);
