// Outta Here local runtime.
// The app was first built as a Claude artifact, which reaches its database, AI,
// uploads and identity through `window.claude.use(name)`. This file provides the
// same interface backed by this project's own server, so app.js runs unchanged.
(() => {
  'use strict';

  /* ---------- identity: join with a name ---------- */
  const LS_ID = 'outta_uid', LS_NAME = 'outta_name';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const randomId = (n = 20) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  let uid = store.get(LS_ID);
  // no id yet: make one now, as before (it may be swapped for one this browser already owns, below)
  const fresh = !uid || !/^u_[a-z0-9]{8,40}$/.test(uid);
  if (fresh) { uid = 'u_' + randomId(); store.set(LS_ID, uid); }

  // The server has to recognise this browser as the owner of its id (lib/identity.ts): it keeps
  // a secret for each id in an HttpOnly cookie. Before anything else:
  // - a sign-in link (#claim=…) from whoever runs the app puts you back in your own identity;
  // - if this browser forgot its id but still has its cookie, the server says which id it owns;
  // - otherwise the id is claimed: fine if it's this browser's or brand new. If it belongs to
  //   someone (your sign-in was cleared, or you're from before this existed), you're told how to
  //   get back in, rather than quietly becoming someone new.
  let idProblem = null;
  const me = (method, body) => fetch('/api/me', { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
  const ready = (async () => {
    const link = (location.hash || '').match(/^#claim=([A-Za-z0-9_\-]{20,80})$/);
    if (link) {
      history.replaceState(null, '', location.pathname + location.search);
      const r = await me('POST', { code: link[1] }).catch(() => ({}));
      if (r.ok && r.id) { uid = r.id; store.set(LS_ID, uid); return; }
      idProblem = r.message || 'That sign-in link didn’t work. Ask for a new one.';
    }
    if (fresh && !link) { const r = await me('GET').catch(() => ({})); if (Array.isArray(r.ids) && r.ids.length) { uid = r.ids[0]; store.set(LS_ID, uid); } }
    const r = await me('POST', { id: uid }).catch(() => ({ message: 'Couldn’t reach the app to check who you are. Is it still running?' }));
    if (!r.ok) idProblem = r.message || 'This browser can’t prove who you are.';
  })();
  ready.then(() => {
    if (!idProblem) return;
    const show = () => {
      const wrap = document.createElement('div');
      wrap.className = 'join-screen';
      wrap.innerHTML = `<div class="join-card"><span class="label">Outta Here</span><h1>Sign back in</h1><p class="muted"></p>
          <button class="btn big" type="button" data-new>Start as someone new</button></div>`;
      wrap.querySelector('p').textContent = idProblem;
      // only on purpose: your existing plans stay with your old identity
      wrap.querySelector('[data-new]').addEventListener('click', () => { store.set(LS_ID, 'u_' + randomId()); location.reload(); });
      document.body.appendChild(wrap);
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', show) : show();
  });

  // First visit on this browser: ask for a name before the app loads its data. Opened from a plan's
  // invite link, this screen is the invitation itself: the plan, your name and your answer in one go.
  // The answer is handed to the app (sessionStorage outta_join), which joins you with its usual join
  // (joinPlan) instead of asking again.
  const tripLink = (location.hash || '').slice(1).match(/^([a-z0-9]{6,20})(?:\.([a-z0-9]{4,12}))?$/);
  const nameReady = new Promise(resolve => {
    const existing = store.get(LS_NAME);
    if (existing) return resolve(existing);
    const show = () => {
      const wrap = document.createElement('div');
      wrap.className = 'join-screen';
      wrap.innerHTML = tripLink ? `<form class="join-card jp-card">
          <div class="jp" aria-live="polite"><div class="jp-loading"><i></i><i></i><i></i><span class="sr-only">Opening the plan</span></div></div>
          <label class="jp-name"><span>Your name</span><input id="join-name" maxlength="30" autocomplete="given-name" autocapitalize="words" enterkeyhint="go" placeholder="What your friends call you" required></label>
          <button class="btn primary big jp-in" type="submit" data-ans="in">I’m in 🙌</button>
          <div class="jp-alt"><button class="btn ghost" type="button" data-ans="maybe">Maybe</button><button class="btn ghost" type="button" data-ans="out">Can’t make it</button></div>
          <p class="small muted jp-note">No app, no sign-up. Just your name.</p>
        </form>` : `<form class="join-card">
          <span class="label">Outta Here</span>
          <h1>What do your friends call you?</h1>
          <p class="muted">That’s all we need. This browser remembers you next time.</p>
          <input id="join-name" maxlength="30" autocomplete="given-name" autocapitalize="words" enterkeyhint="go" placeholder="Your name" required>
          <button class="btn primary big" type="submit">Let’s go</button>
        </form>`;
      document.body.appendChild(wrap);
      const form = wrap.querySelector('form'), input = wrap.querySelector('#join-name');
      let ans = 'in', invitable = !!tripLink;
      if (tripLink) showPlan(wrap, tripLink[1]).then(ok => { invitable = ok; }); else showInvite(wrap);
      input.focus();
      wrap.querySelectorAll('button[type=button][data-ans]').forEach(b => b.addEventListener('click', () => { ans = b.dataset.ans; form.requestSubmit(); }));
      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = input.value.trim().slice(0, 30);
        if (!name) { input.focus(); return; }
        store.set(LS_NAME, name);
        if (tripLink && invitable) try { sessionStorage.setItem('outta_join', JSON.stringify({ tid: tripLink[1], ans })); } catch {}
        wrap.remove();
        resolve(name);
      });
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', show) : show();
  });
  const escH = x => String(x).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';');
  // The plan, as the invitation shows it: who invited you, its name, and only what's decided (or a small
  // plan's city), with how many are in. A link that's been turned off or a plan that's gone says so.
  async function showPlan(wrap, tid) {
    const box = wrap.querySelector('.jp'), MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d => { const [, m, x] = String(d).split('-').map(Number); return MON[m - 1] ? `${MON[m - 1]} ${x}` : ''; };
    const COLOR = { hangout: '#14915F', day: '#1098AD', weekend: '#E8590C', trip: '#D41C78', bachelorette: '#E64980', bachelor: '#3B5BDB', birthday: '#F08C00', couples: '#C2255C', family: '#0E9F6E', college: '#1098AD', festival: '#7048E8', sports: '#E8590C', work: '#5C6A7A' };
    const off = (h, p) => { box.innerHTML = `<div class="jp-off"><h1>${h}</h1><p class="muted">${p}</p></div>`; wrap.querySelector('.jp-in').textContent = 'Continue'; wrap.querySelector('.jp-alt')?.remove(); };
    try {
      const t = await call('get', 'trips/' + tid);
      if (!t.exists) { off('This plan isn’t here anymore', 'It may have been deleted. Ask whoever sent the link what’s up.'); return false; }
      if (t.data.inviteOk === false || t.data.invitesOff) { off('This invite link was turned off', 'Ask whoever sent it for a fresh link.'); return false; }
      const d = t.data, small = d.size === 'hangout' || d.size === 'day';
      const ms = await call('list', `trips/${tid}/members`).then(r => r.docs || []).catch(() => []);
      const host = ms.find(m => m.id === d.createdBy)?.data?.nick || '', going = ms.filter(m => ['in', 'confirmed', 'booked'].includes(m.data?.status) && !m.data?.removed).length;
      const city = (d.destinations || []).find(x => x && x.id === d.lockedDest)?.city || (small ? d.city || '' : '');
      const L = d.lockedDates, when = L && L.start ? (L.start === L.end ? day(L.start) : `${day(L.start)} – ${day(L.end)}`) : '';
      const facts = [when, city].filter(Boolean).join(' · ');
      box.style.setProperty('--pc', (d.mode && d.mode !== 'friends' && COLOR[d.mode]) || COLOR[d.size] || '#D41C78');
      box.innerHTML = `<div class="jp-cover"><span class="jp-from">${host ? `<b>${escH(host)}</b> invited you` : 'You’re invited'}</span>
          <h1>${escH(d.name || 'A plan')}</h1>${facts ? `<span class="jp-facts">${escH(facts)}</span>` : `<span class="jp-facts soft">${small ? 'Picking the day together' : 'Picking where and when together'}</span>`}
          ${going > 1 ? `<span class="jp-going">${going} already in</span>` : ''}</div>`;
      return true;
    } catch { box.innerHTML = '<p class="muted">Couldn’t open the plan right now. Add your name and we’ll try again.</p>'; return true; }
  }

  // Opened from a crew's invite link: say who invited you to what, above the name box.
  async function showInvite(wrap) {
    const crew = (location.hash || '').slice(1).match(/^c-([a-z0-9]{6,20})$/);
    if (!crew) return;
    try {
      const c = await call('get', 'crews/' + crew[1]); if (!c.exists) return;
      const what = c.data.name, host = c.data.profiles?.[c.data.by]?.nick || '';
      const label = wrap.querySelector('.label');
      if (label && what) label.outerHTML = `<p class="join-invite">${host ? `<b>${escH(host)}</b> invited you to` : 'You’re invited to'} <b>${escH(what)}</b></p>`;
    } catch {}
  }

  const user = Object.freeze({
    id: async () => { await nameReady; await ready; return uid; },
    me: async () => ({ id: (await ready, uid), name: await nameReady, avatarUrl: '', color: '', email: null, isOwner: false, canEdit: true }),
    // Everyone who can open the page can edit, but nobody is the page's owner:
    // only the person who made a plan or crew can delete it.
    isOwner: async () => false,
    canEdit: async () => true,
    can: async () => true,
    profiles: async ids => Object.fromEntries([].concat(ids).map(id => [id, { id, name: '', avatarUrl: '', color: '', email: null, isMe: id === uid, guest: false }])),
  });

  /* ---------- db ---------- */
  // An invite link can carry a key (#plan.key). The server checks it when you join, so the
  // key is remembered for that plan and sent along with its requests.
  const inviteKeys = (() => { try { return JSON.parse(sessionStorage.getItem('outta_invites') || '{}'); } catch { return {}; } })();
  const noteInvite = () => {
    const m = (location.hash || '').slice(1).match(/^([a-z0-9]{6,20})\.([a-z0-9]{4,12})$/);
    if (m && inviteKeys[m[1]] !== m[2]) { inviteKeys[m[1]] = m[2]; try { sessionStorage.setItem('outta_invites', JSON.stringify(inviteKeys)); } catch {} }
  };
  noteInvite(); window.addEventListener('hashchange', noteInvite);
  const err = (code, message) => Object.assign(new Error(message || code), { code, message: message || code });
  async function call(op, path, data) {
    await ready;
    let res;
    try {
      const tid = (String(path).match(/^trips\/([^/]+)/) || [])[1], key = tid && inviteKeys[tid];
      // keepalive lets a small write sent as the page closes still arrive (browsers cap keepalive bodies near 64 KB)
      const body = JSON.stringify({ op, path, data });
      res = await fetch('/api/db', { method: 'POST', keepalive: body.length < 60000, headers: { 'Content-Type': 'application/json', 'x-outta-user': uid, ...(key ? { 'x-outta-invite': key } : {}) }, body });
    } catch { throw err('unavailable', 'Can’t reach the local server. Is it still running?'); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw err(body.code || 'unavailable', body.message);
    return body;
  }
  const META = Object.freeze({ fromCache: false, hasPendingWrites: false });
  const docSnap = (id, r) => Object.freeze({ id, exists: !!r.exists, data: () => (r.exists ? r.data : undefined), metadata: META });
  const segCount = p => String(p).split('/').length;
  const checkPath = (p, parity) => {
    const n = segCount(p);
    if (!p || String(p).split('/').some(s => !/^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$/.test(s))) throw new TypeError('Bad path: ' + p);
    if ((n % 2 === 0) !== (parity === 'doc')) throw new TypeError(`Wrong segment count (${n}) for a ${parity}: ${p}`);
  };

  // Live updates: one stream per tab says which path changed; subscriptions re-read.
  const subs = new Set();
  let es = null;
  function ensureStream() {
    if (es) return;
    es = { close() {} }; // placeholder until the id is checked
    ready.then(() => openStream());
  }
  function openStream() {
    es = new EventSource('/api/db/stream?u=' + encodeURIComponent(uid));
    es.onmessage = e => {
      let path; try { ({ path } = JSON.parse(e.data)); } catch { return; }
      // when you join a plan, everything under it becomes readable: re-read all of it
      const joined = String(path).match(/^(trips\/[^/]+)\/members\/(.+)$/);
      const scope = joined && joined[2] === uid ? joined[1] + '/' : null;
      // joining or leaving a crew changes which plans you can see
      const crew = /^crews\/[^/]+$/.test(path);
      for (const s of subs) if (s.matches(path) || (scope && s.under(scope)) || (crew && s.base === 'trips')) s.refresh();
    };
    // catch up after a dropped connection: now, and again once it's back (reads made while
    // offline fail, so the first catch-up alone can leave the page out of date)
    let dropped = false;
    es.onerror = () => { dropped = true; for (const s of subs) s.refresh(); };
    es.onopen = () => { if (!dropped) return; dropped = false; for (const s of subs) s.refresh(); };
  }
  function subscribe(matches, read, next, error, base = '') {
    let timer = null, alive = true;
    const s = {
      matches, base, under: prefix => base.startsWith(prefix) || (base + '/').startsWith(prefix),
      refresh() {
        clearTimeout(timer);
        timer = setTimeout(() => { if (alive) read().then(v => alive && next(v), e => alive && error && error(e)); }, 40);
      },
    };
    subs.add(s); ensureStream(); s.refresh();
    return () => { alive = false; clearTimeout(timer); subs.delete(s); };
  }

  function docRef(path) {
    checkPath(path, 'doc');
    const id = path.split('/').pop();
    return Object.freeze({
      id, path,
      get: async () => docSnap(id, await call('get', path)),
      set: async data => { await call('set', path, data); },
      update: async data => { await call('update', path, data); },
      delete: async () => { await call('delete', path); },
      acquire: async () => ({ acquired: true }),
      onSnapshot: (next, error) => subscribe(p => p === path, async () => docSnap(id, await call('get', path)), next, error, path),
      collection: sub => collRef(path + '/' + sub),
    });
  }

  function query(path, opts) {
    const run = async () => {
      let docs = (await call('list', path)).docs;
      for (const [f, op, v] of opts.where) docs = docs.filter(d => test(d.data[f], op, v));
      if (opts.order) {
        const [f, dir] = opts.order, k = dir === 'desc' ? -1 : 1;
        docs.sort((a, b) => {
          const x = a.data[f], y = b.data[f];
          if (x === undefined) return 1; if (y === undefined) return -1;
          return x < y ? -k : x > y ? k : 0;
        });
      } else docs.sort((a, b) => (a.id < b.id ? -1 : 1));
      if (opts.limit) docs = docs.slice(0, opts.limit);
      const snaps = docs.map(d => docSnap(d.id, { exists: true, data: d.data }));
      return Object.freeze({ docs: snaps, size: snaps.length, empty: !snaps.length, docChanges: () => [], metadata: META });
    };
    const depth = segCount(path) + 1;
    return Object.freeze({
      where: (f, op, v) => query(path, { ...opts, where: [...opts.where, [f, op, v]] }),
      orderBy: (f, dir = 'asc') => query(path, { ...opts, order: [f, dir] }),
      limit: n => query(path, { ...opts, limit: n }),
      get: run,
      onSnapshot: (next, error) => subscribe(p => p.startsWith(path + '/') && segCount(p) === depth, run, next, error, path),
    });
  }
  function test(a, op, b) {
    switch (op) {
      case '==': return a === b; case '!=': return a !== b;
      case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
      case 'in': return b.includes(a); case 'not-in': return !b.includes(a);
      case 'array-contains': return Array.isArray(a) && a.includes(b);
      default: return false;
    }
  }
  function collRef(path) {
    checkPath(path, 'collection');
    const q = query(path, { where: [], order: null, limit: 0 });
    return Object.freeze({
      ...q, path,
      doc: id => docRef(path + '/' + (id || randomId(20))),
      add: async data => { const r = docRef(path + '/' + randomId(20)); await r.set(data); return r; },
    });
  }
  const db = Object.freeze({ doc: docRef, collection: collRef });

  /* ---------- AI (sample) ---------- */
  const aiStatus = fetch('/api/ai/status').then(r => r.json()).catch(() => ({ enabled: false }));
  function parseJson(text) {
    const tries = [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1]];
    const a = text.search(/[[{]/), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
    for (const t of tries) { if (!t) continue; try { return JSON.parse(t); } catch {} }
    throw Object.assign(err('invalid_json', 'The AI reply wasn’t valid JSON'), { text });
  }
  async function sample(input, opts = {}) {
    let res;
    await ready;
    try {
      res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': uid }, body: JSON.stringify({ input, ...(opts.tid ? { tid: opts.tid } : {}) }), signal: opts.signal });
    } catch (e) {
      if (opts.signal?.aborted) throw err('cancelled', 'Stopped');
      throw err('upstream_error', 'Can’t reach the local server.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw err(body.code || 'upstream_error', body.message);
    if (opts.onText) opts.onText({ text: body.text, delta: body.text });
    return { text: body.text, truncated: !!body.truncated };
  }
  sample.json = async (input, opts = {}) => {
    const r = await sample(input, opts);
    if (r.truncated) throw Object.assign(err('invalid_json', 'The AI reply was cut short'), { text: r.text });
    return parseJson(r.text);
  };
  sample.limits = async () => ({ inputBytes: 256 * 1024 });

  /* ---------- uploads (assets) ---------- */
  const assets = Object.freeze({
    async upload(blob, options = {}) {
      await ready;
      const type = options.type || blob.type;
      const res = await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': type, 'x-outta-user': uid, ...(options.tid ? { 'x-outta-plan': options.tid } : {}) }, body: blob });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw err(body.code || 'store_unavailable', body.message);
      return body;
    },
    async delete(ref) {
      await ready;
      const id = typeof ref === 'string' ? ref : ref?.id;
      const res = await fetch('/api/assets/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'x-outta-user': uid } });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw err(body.code || 'store_unavailable', body.message); }
    },
    async list() { return { assets: [], usage: {} }; },
  });

  /* ---------- downloads ---------- */
  const downloads = Object.freeze({
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: filename || 'download' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
  });

  /* ---------- window.claude.use ---------- */
  const caps = {
    db: async () => (await nameReady, await ready, db),
    user: async () => user,
    sample: async () => ((await aiStatus).enabled ? sample : null),
    assets: async () => assets,
    downloads: async () => downloads,
  };
  const cache = {};
  window.claude = Object.freeze({
    use(name) {
      if (!caps[name]) return Promise.resolve(null);
      return (cache[name] ||= caps[name]().catch(() => null));
    },
  });
})();
