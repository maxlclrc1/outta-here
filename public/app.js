// Outta Here app. Runs on the window.claude runtime: Claude's own, or public/shim.js on localhost.
// Built from src/app/*.js by scripts/build.mjs. Edit those files, not this one.
(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = $('#app');
// Night (the club look) unless someone picked day mode.
try { document.documentElement.dataset.theme = localStorage.getItem('outta_theme') === 'light' ? 'light' : 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }

/* ---------- dates ---------- */
const D = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const add = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const span = (a, b) => { const o = []; if (!a || !b) return o; for (let s = a; s <= b && o.length < 92; s = add(s, 1)) o.push(s); return o; };
// Date labels are formatted constantly while drawing; formatters are reused and results kept.
const DTF = {}, FMT = new Map(), FMT_DEF = { weekday: 'short', month: 'short', day: 'numeric' };
const fmt = (s, o = FMT_DEF) => {
  const ok = o === FMT_DEF ? 'd' : JSON.stringify(o), key = ok + s;
  let v = FMT.get(key);
  if (v === undefined) {
    v = (DTF[ok] ||= new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' })).format(D(s));
    if (FMT.size > 3000) FMT.clear();
    FMT.set(key, v);
  }
  return v;
};
const short = s => fmt(s, { month: 'short', day: 'numeric' });
const dow = s => fmt(s, { weekday: 'short' });
// Today in the viewer's own time zone (plan dates are plain calendar days). Rolls over at
// midnight if the app stays open.
const calDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let TODAY = calDay(new Date());
setInterval(() => { const t = calDay(new Date()); if (t !== TODAY) { TODAY = t; if (typeof render === 'function') render(); } }, 60000);
const money = n => fmtMoney(Math.round(n), cur());

/* ---------- state ---------- */
const S = {
  db: null, user: null, sample: null, loading: true,
  uid: null, myName: '',
  trips: [], tripsLoaded: false,
  tid: null, trip: null, members: [], demo: false, tab: 'crew',
  busy: {}, unsub: [], meDirty: false, readOnly: false,
  expenses: [], packing: [], downloads: null,
  cardUrl: null, cardBlob: null, feed: [], bucket: [], photos: [], crews: [], pot: [], mySpend: [], creating: null, newMode: null, lostOpen: false, pinSel: null, hangPlan: null, wrapI: 0, secTab: {}, realId: null, img: null, show: null, newCrew: null, copyText: '', editDeposit: false, split: null,
};
const QUIZ = [
  { k: 'night', q: 'Perfect night out?', o: ['Big club', 'Bar hop', 'Rooftop cocktails', 'Dive bar', 'Low-key dinner'] },
  { k: 'music', q: 'What’s playing?', o: ['Hip-hop', 'EDM', 'Latin', 'Live band', 'Whatever’s on'] },
  { k: 'late', q: 'You head home…', o: ['Before 1am', '2–3am', 'At sunrise'] },
  { k: 'spend', q: 'Spending style', o: ['Saver', 'Middle', 'Ballin’'] },
  { k: 'day', q: 'Daytime is for…', o: ['Pool or beach', 'Exploring & eating', 'Sleeping it off', 'Activities'] },
];
const PERSONA_LATE = { 'Before 1am': 'Early-Bird', '2–3am': 'Late-Night', 'At sunrise': 'Sunrise' };
const PERSONA_NIGHT = { 'Big club': 'Club', 'Bar hop': 'Bar-Hop', 'Rooftop cocktails': 'Rooftop', 'Dive bar': 'Dive Bar', 'Low-key dinner': 'Supper' };
const VIBES = ['Big clubs', 'Dive bars', 'Rooftops', 'Cocktail bars', 'Live music', 'Hip-hop', 'EDM', 'Latin', 'Day parties', 'Low-key'];
const COLORS = ['#D41C78', '#3B5BDB', '#0E9F6E', '#E8590C', '#7048E8', '#1098AD', '#C2255C', '#5C940D'];
const colorFor = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const segSafe = s => String(s).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 120);
const rid = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

/* ---------- toast ---------- */
let toastT;
function flash(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('out'); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.classList.add('out'); toastT = setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, 260); }, 4200); }
function writeErr(e) {
  if (e && e.code === 'invalid_argument' && !IN_CLAUDE) return /256 KiB/.test(e.message || '') ? 'This plan has gotten too big to save more. Remove some old items and try again.' : 'That didn’t save. Try again.';
  if (e && e.code === 'invalid_argument') { S.readOnly = true; return "You can view this plan but not edit it. Ask the owner to share it with you as a Contributor."; }
  if (e && e.code === 'permission_denied') return e.message || 'You don’t have access to change this.';
  if (e && e.code === 'quota_exceeded') return 'Storage is full. Delete an old trip and try again.';
  return 'Couldn’t save that. Check your connection and try again.';
}
function aiErr(e) {
  const c = e && e.code;
  if (c === 'not_granted') return IN_CLAUDE ? 'Claude wasn’t allowed for this page, so AI picks are off for now.' : 'Your Anthropic API key was rejected. Check .env.local.';
  if (c === 'sampling_disabled') return 'AI is off. Add your Anthropic API key to .env.local and restart the app.';
  if (c === 'refused') return 'Claude declined that one. Try rewording it.';
  if (c === 'rate_limited') return 'Too many requests at once. Give it a minute.';
  if (c === 'invalid_json' || c === 'empty_completion') return 'The answer came back garbled. Try again.';
  if (c === 'cancelled') return 'Stopped.';
  return 'Couldn’t reach Claude right now. Try again in a bit.';
}

/* ---------- derived ---------- */
const active = () => S.members.filter(m => m.status !== 'out');
const meDoc = () => S.members.find(m => m.id === S.uid);
// Can this person make these days? All of them, or all but the first (arrives a day late)
// or the last (leaves a day early) if they said they're flexible that way.
// Some derived values (best dates, the journey) are read many times while drawing one
// screen. During a paint they're worked out once and reused; outside a paint, always fresh.
let MEMO = null;
const memo = (k, f) => { if (!MEMO) return f(); if (!MEMO.has(k)) MEMO.set(k, f()); return MEMO.get(k); };
// a member's free days as a Set, built once per days array (saving replaces the array)
const DAYSETS = new WeakMap(), NO_DAYS = new Set();
const daySet = arr => { if (!arr || !arr.length) return NO_DAYS; let s = DAYSETS.get(arr); if (!s) DAYSETS.set(arr, s = new Set(arr)); return s; };
function fitOf(m, d) {
  const has = daySet(m.days);
  if (d.every(x => has.has(x))) return 'full';
  if (d.length > 1) {
    const f = m.flex || {};
    if (f.late && !has.has(d[0]) && d.slice(1).every(x => has.has(x))) return 'late';
    if (f.early && !has.has(d[d.length - 1]) && d.slice(0, -1).every(x => has.has(x))) return 'early';
  }
  return null;
}
function bestWindows(nights) {
  const t = S.trip, len = (nights ?? nightsSet(t)) + 1;
  return memo('bw' + len, () => bestWindowsNow(len));
}
function bestWindowsNow(len) {
  const t = S.trip; const days = span(t.winStart, t.winEnd); const ms = active();
  const out = [];
  for (let i = 0; i + len <= days.length; i++) {
    const d = days.slice(i, i + len), fit = new Map(ms.map(m => [m, fitOf(m, d)]));
    const ok = ms.filter(m => fit.get(m));
    if (!ok.length) continue;
    const pref = ms.filter(m => d.some(x => daySet(m.pref).has(x)));
    const prefN = ms.reduce((n, m) => n + d.filter(x => daySet(m.pref).has(x)).length, 0);
    out.push({ start: d[0], end: d[len - 1], ok, full: ok.filter(m => fit.get(m) === 'full'), late: ok.filter(m => fit.get(m) === 'late'), early: ok.filter(m => fit.get(m) === 'early'), pref, prefN, miss: ms.filter(m => !fit.get(m)) });
  }
  // most people first, then most people for the whole thing, then most preferred
  out.sort((a, b) => b.ok.length - a.ok.length || b.full.length - a.full.length || b.prefN - a.prefN || (a.start < b.start ? -1 : 1));
  // drop heavily overlapping windows so the top 3 are real alternatives
  const picked = [];
  for (const w of out) { if (picked.every(p => Math.abs(D(p.start) - D(w.start)) >= 2 * 864e5)) picked.push(w); if (picked.length === 3) break; }
  return picked;
}
function shorterFit() {
  for (let n = nightsSet(S.trip) - 1; n >= 1; n--) { const w = bestWindows(n)[0]; if (w) return { n, w }; }
  return null;
}
function votesFor(id) { return active().filter(m => (m.votes || []).includes(id)); }
function leaderDest() {
  const ds = S.trip.destinations || [];
  if (!ds.length) return null;
  return [...ds].sort((a, b) => votesFor(b.id).length - votesFor(a.id).length)[0];
}
const dest = () => (S.trip.destinations || []).find(d => d.id === S.trip.lockedDest) || leaderDest();
function dates() {
  if (S.trip.lockedDates) return { ...S.trip.lockedDates, locked: true };
  const w = bestWindows()[0]; return w ? { start: w.start, end: w.end, locked: false } : null;
}
// the lowest budget set in the crew: the one number about budgets everyone sees
function budgetCap() { return budgetCapShared(); }
const nightsOf = d => d ? Math.round((D(d.end) - D(d.start)) / 864e5) : 0;
const homes = () => [...new Set(active().map(m => (m.home || '').trim()).filter(Boolean))];
const nameOf = id => id === 'ai' ? 'Outta Here AI' : (S.members.find(m => m.id === id) || {}).nick || 'Someone';
const handle = s => (s || '').trim().replace(/^[@$]/, '');
function countdown() {
  const d = dates(); if (!d) return null;
  const n = Math.round((D(d.start) - D(TODAY)) / 864e5);
  if (n > 1) return { n, text: n + ' days' };
  if (n === 1) return { n, text: 'Tomorrow' };
  if (TODAY <= d.end) return { n: 0, text: 'Happening now' };
  return { n: -1, text: 'Done' };
}
function tickets() {
  const tk = S.trip.tickets || {}, ins = S.members.filter(going);
  const have = ins.filter(m => tk[m.id]);
  return { tk, ins, have, goal: ins.length, on: ins.length > 0 && have.length === ins.length };
}
const booking_time = () => !!(S.trip.lockedDates && S.trip.lockedDest);
function nudges() {
  const tk = S.trip.tickets || {}, hasDest = (S.trip.destinations || []).length;
  return active().map(m => {
    const todo = [];
    if (m.status === 'maybe') todo.push('say if you’re in');
    if (!(m.days || []).length && !S.trip.lockedDates) todo.push(isSmall() ? 'say which days work' : 'pick your dates');
    if (!m.budget && !m.budgetSet) todo.push('set your budget');
    if (hasDest && !(m.votes || []).length && !S.trip.lockedDest) todo.push(isSmall() ? 'vote on the plan' : 'vote on where');
    if (size() === 'trip' && booking_time() && going(m) && !tk[m.id]) todo.push('book your flight and upload your boarding pass');
    if (!m.quiz || Object.keys(m.quiz).length < QUIZ.length) todo.push('take the vibe quiz');
    return { m, todo };
  }).filter(x => x.todo.length);
}
function settle() {
  const net = {};
  for (const e of S.expenses) {
    let split = (e.split || []).filter(Boolean); if (honoreeFree() && split.length > 1) split = split.filter(id => id !== S.trip.honoree); if (!split.length || !(e.amount > 0)) continue;
    net[e.paidBy] = (net[e.paidBy] || 0) + e.amount;
    for (const id of split) net[id] = (net[id] || 0) - e.amount / split.length;
  }
  const cred = Object.entries(net).filter(([, v]) => v > 0.005).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const debt = Object.entries(net).filter(([, v]) => v < -0.005).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(debt[i].v, cred[j].v);
    if (x >= 0.01) out.push({ from: debt[i].id, to: cred[j].id, amt: Math.round(x * 100) / 100 });
    debt[i].v -= x; cred[j].v -= x;
    if (debt[i].v < 0.01) i++; if (cred[j].v < 0.01) j++;
  }
  return { net, out };
}
function blend() {
  const takers = S.members.filter(m => m.status !== 'out' && m.quiz && Object.keys(m.quiz).length);
  if (!takers.length) return null;
  const res = {}, win = {};
  for (const q of QUIZ) {
    const counts = {}; let n = 0;
    for (const m of takers) { const a = m.quiz[q.k]; if (a) { counts[a] = (counts[a] || 0) + 1; n++; } }
    const list = Object.entries(counts).map(([a, c]) => ({ a, c, pct: Math.round(c / n * 100) })).sort((x, y) => y.c - x.c || q.o.indexOf(x.a) - q.o.indexOf(y.a));
    res[q.k] = list;
    win[q.k] = tiebreak(q, list, takers);
  }
  const persona = `The ${PERSONA_LATE[win.late?.a] || 'Wild'} ${PERSONA_NIGHT[win.night?.a] || 'Party'} Crew`;
  return { res, win, n: takers.length, persona };
}
// A tie at the top goes to a runoff between the tied answers; if the runoff ties too
// (or nobody has voted in it), a coin flip seeded by the trip decides, so everyone sees the same result.
function tiebreak(q, list, takers) {
  if (!list.length) return null;
  const tied = list.filter(x => x.c === list[0].c).map(x => x.a);
  if (tied.length < 2) return { a: tied[0], how: 'majority', tied };
  const rv = {}; let votes = 0;
  for (const m of takers) { const v = (m.runoff || {})[q.k]; if (tied.includes(v)) { rv[v] = (rv[v] || 0) + 1; votes++; } }
  const best = Math.max(0, ...Object.values(rv)), leaders = tied.filter(a => (rv[a] || 0) === best);
  if (votes && leaders.length === 1) return { a: leaders[0], how: 'runoff', tied, rv, votes };
  let h = 0; for (const ch of (S.tid || '') + q.k + leaders.join()) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return { a: leaders[h % leaders.length], how: 'coin', tied, rv, votes };
}
function blendText() {
  const b = blend(); if (!b) return '';
  return QUIZ.map(q => `${q.q} ` + b.res[q.k].map(x => `${x.pct}% ${x.a}`).join(', ') + (b.win[q.k] ? ` → crew pick: ${b.win[q.k].a}` : '')).join('\n');
}
const rkey = s => 'k' + String(s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
function score(key) {
  const r = (S.trip.reactions || {})[key] || {};
  let up = 0, down = 0; for (const v of Object.values(r)) { if (v > 0) up++; else if (v < 0) down++; }
  return { up, down, mine: r[S.uid] || 0, net: up - down };
}
function voteBtns(key) {
  const s = score(key);
  return `<span class="votes"><button class="chip ${s.mine > 0 ? 'up' : ''}" data-react="${key}|1" aria-label="Thumbs up">▲ ${s.up}</button><button class="chip ${s.mine < 0 ? 'down' : ''}" data-react="${key}|-1" aria-label="Thumbs down">▼ ${s.down}</button></span>`;
}

/* ---------- writes ---------- */
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
// a list from AI or older saved data that might not be a list
const arr = v => Array.isArray(v) ? v : [];
function merge(t, p) { const o = { ...t }; for (const [k, v] of Object.entries(p)) o[k] = isObj(v) && isObj(o[k]) ? merge(o[k], v) : v; return o; }
// Changes show right away and are written in the background. Every write goes to the plan it
// was made in, even if you've moved on by the time it runs. If a write fails, the screen is
// put back to what's actually saved, so it never shows something the crew can't see.
// Whole lists (itinerary, destinations, pitches) say which items they started from and which
// ones this save changed, so the server can merge with anyone else's edits (lib/merge.ts).
function listBase(patch) {
  if (IN_CLAUDE || S.demo || !S.trip) return {};
  const base = {}, one = (key, next, cur) => {
    if (!Array.isArray(next)) return;
    const was = new Map((cur || []).filter(x => x && x.id != null).map(x => [String(x.id), JSON.stringify(x)]));
    base[key] = { ids: [...was.keys()], changed: next.filter(x => x && x.id != null && was.get(String(x.id)) !== JSON.stringify(x)).map(x => String(x.id)) };
  };
  one('itinerary', patch.itinerary, S.trip.itinerary);
  one('destinations', patch.destinations, S.trip.destinations);
  one('pitches.items', patch.pitches?.items, S.trip.pitches?.items);
  return Object.keys(base).length ? { _base: base } : {};
}
async function saveTrip(patch, tid = S.tid) {
  if (!tid) return false;
  const here = tid === S.tid && S.trip, send = here ? { ...patch, ...listBase(patch) } : patch;
  if (here) { S.trip = merge(S.trip, patch); render(); }
  if (S.demo) return true;
  if (!S.db) return false;
  try { await S.db.doc('trips/' + tid).update(send); return true; }
  catch (e) { flash(writeErr(e)); if (here) resync(tid); return false; }
}
async function resync(tid) {
  try { const snap = await S.db.doc('trips/' + tid).get(); if (S.tid === tid && snap.exists) { S.trip = { ...snap.data() }; render(); } } catch {}
}
async function putSub(coll, id, data, partial) {
  const tid = S.tid, list = S[coll], i = list.findIndex(x => x.id === id), before = i >= 0 ? list[i] : null;
  if (i >= 0) list[i] = partial ? { ...list[i], ...data } : { id, ...data }; else list.push({ id, ...data });
  render();
  if (S.demo || !S.db || !tid) return true;
  const ref = S.db.doc(`trips/${tid}/${coll}/${id}`);
  try { partial ? await ref.update(data) : await ref.set(data); return true; }
  catch (e) {
    flash(writeErr(e));
    if (S.tid === tid) { S[coll] = before ? S[coll].map(x => x.id === id ? before : x) : S[coll].filter(x => x.id !== id); render(); }
    return false;
  }
}
async function delSub(coll, id) {
  const tid = S.tid, before = S[coll].find(x => x.id === id);
  S[coll] = S[coll].filter(x => x.id !== id); render();
  if (S.demo || !S.db || !tid) return;
  try { await S.db.doc(`trips/${tid}/${coll}/${id}`).delete(); }
  catch (e) { flash(writeErr(e)); if (S.tid === tid && before) { S[coll].push(before); render(); } }
}
// One at a time: a second tap while the first is still saving does nothing.
const INFLIGHT = new Set();
async function once(key, fn) {
  if (INFLIGHT.has(key)) return;
  INFLIGHT.add(key); S.busy[key] = true;
  const job = fn(); render(); // fn reads its form fields before the busy state is drawn
  try { return await job; } finally { INFLIGHT.delete(key); S.busy[key] = false; render(); }
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); flash('Copied. Paste it in the group chat.'); S.copyText = ''; }
  catch { S.copyText = text; flash('Select the text below and copy it.'); }
  render();
  const ta = $('#copybox'); if (ta) { ta.focus(); ta.select(); }
}
// Your own details are saved field by field: only what you changed is sent, so a save never
// puts back something stale (like your status after an organizer counted you out).
let meT, meWriting = false, meSeq = 0, meFields = new Set(), meSending = new Set(), meSaved = false;
function saveMe(patch, now, quiet) {
  let m = meDoc();
  if (!m) { m = { id: S.uid, nick: S.myName || 'Me', home: '', budget: 0, status: 'in', days: [], votes: [] }; S.members.push(m); }
  Object.assign(m, patch); Object.keys(patch).forEach(k => meFields.add(k)); if (!quiet) render();
  if (S.demo) return;
  S.meDirty = true; meSeq++; clearTimeout(meT); meT = setTimeout(flushMe, now ? 0 : 600);
}
async function flushMe() {
  clearTimeout(meT);
  const m = meDoc(); if (!m || !S.db || S.demo || !S.tid) return;
  const fields = [...meFields].filter(k => k !== 'id'); meFields = new Set(); fields.forEach(k => meSending.add(k));
  const { id, ...full } = m, changed = Object.fromEntries(fields.map(k => [k, m[k] === undefined ? null : m[k]]));
  const job = { tid: S.tid, full, changed, fields, seq: meSeq, joined: !!(S.trip?.people || {})[S.uid] && !(S.trip?.left || {})[S.uid] };
  while (meWriting) await new Promise(r => setTimeout(r, 120));
  meWriting = true;
  const ref = S.db.doc(`trips/${job.tid}/members/${S.uid}`);
  try {
    // only what changed; the whole record only the first time (when it doesn't exist yet)
    const whole = () => ref.set({ ...job.full, updatedAt: Date.now() }).then(() => { meSaved = true; });
    if (!meSaved) await whole();
    else try { await ref.update({ ...job.changed, updatedAt: Date.now() }); }
    catch (e) { if (IN_CLAUDE || /does not exist/i.test(e?.message || '')) await whole(); else throw e; }
    if (!job.joined) S.db.doc('trips/' + job.tid).update({ people: { [S.uid]: true }, left: { [S.uid]: null } }).catch(() => {});
  }
  catch (e) {
    if (S.tid === job.tid) { flash(writeErr(e)); job.fields.forEach(k => meFields.add(k)); }
    else flash('Your last change to the other plan didn’t save. Open it and try again.');
  }
  job.fields.forEach(k => meSending.delete(k));
  meWriting = false; if (job.seq === meSeq && S.tid === job.tid && !meFields.size) S.meDirty = false;
}

/* ---------- AI ---------- */
async function askAI(kind, prompt, done) {
  if (!S.sample) { flash(IN_CLAUDE ? 'AI picks need this page opened in Claude.' : 'AI is off. Add your Anthropic API key to .env.local and restart the app.'); return; }
  S.busy[kind] = true; render();
  if (S.trip) { const nt = needsText(); if (nt) prompt += '\n\n' + nt; }
  if (S.trip) prompt += `\n\nGive every price in ${cur()} (${curSymbol(cur())}), not in any other currency, and use that symbol in price text.`;
  const tid = S.tid;
  try {
    const data = await S.sample.json(prompt, { modelTier: 'default', ...(IN_CLAUDE ? {} : { tid }) });
    if (S.tid !== tid) { flash('An AI answer came back after you left that plan. Open it and ask again.'); return; }
    await done(data);
  }
  catch (e) { if (S.tid === tid) flash(aiErr(e)); }
  finally { if (S.tid === tid) { S.busy[kind] = false; render(); } }
}
function context() {
  const d = dates(), ds = dest(), b = budgetCap();
  const days = d ? span(d.start, d.end).map(x => `${x} (${dow(x)})`).join(', ') : 'not set';
  if (isSmall()) return `Plan type: ${size() === 'hangout' ? 'one evening out' : 'a day out'} with friends. ${mode().label !== 'Friends trip' ? mode().ai : ''}
City: ${S.trip.city || 'not set'}
The plan: ${ds ? ds.city : 'not decided'}${S.trip.venue ? ' at ' + S.trip.venue : ''}
Day: ${d ? `${d.start} (${dow(d.start)})` : 'not set'}${S.trip.time ? ', starting ' + S.trip.time : ''}
Group size: ${active().length} adults
Max spend per person: ${b ? `${b.label} (the tightest budget in the group is in this range; stay at or under ${money(b.cap)})` : 'not given'}${blend() ? `
Crew vibe quiz results (${blend().n} answered):
${blendText()}` : ''}`;
  return `Trip type: ${mode().label}. ${mode().ai}${size() === 'weekend' ? ' It is a weekend getaway (1–2 nights), likely by car.' : ''}
Destination: ${ds ? ds.city + (ds.code ? ' (' + ds.code + ')' : '') : 'not set'}
Trip days: ${days} — ${nightsOf(d)} nights
Group size: ${active().length} adults
${size() === 'trip' ? 'Flying from' : 'Coming from'}: ${homes().join(', ') || 'unknown'}
Per-person total budget (everything${size() === 'trip' ? ' incl. flights' : ''}): ${b ? `${b.label} (the tightest budget in the group is in this range; stay at or under ${money(b.cap)})` : 'not given'}
Group vibe: ${(S.trip.vibes || []).join(', ') || 'mixed, fun'}${blend() ? `
Crew vibe quiz results (${blend().n} answered):
${blendText()}` : ''}`;
}
function buildPacking() {
  const ds = dest(), d = dates(); if (!ds || !d) return;
  const dress = [...new Set((S.trip.spots?.items || []).map(s => s.dress).filter(Boolean))].join('; ');
  const plans = (S.trip.itinerary || []).map(i => i.title).slice(0, 30).join('; ');
  const prompt = `Make a packing list for this group trip.
${context()}
Dress codes at the planned spots: ${dress || 'unknown'}
Planned activities: ${plans || 'not planned yet'}

Think about typical weather in ${ds.city} on those dates. Split items into "group" (one person brings it for everyone: speaker, phone chargers, games, first aid, hangover kit, etc.) and "personal" (everyone packs their own). 6–8 group items, 12–16 personal items, specific to this trip.
Reply with only JSON: {"weather":"one line on expected weather","items":[{"text":"short item","kind":"group|personal"}]}`;
  askAI('pack', prompt, async data => {
    const items = Array.isArray(data?.items) ? data.items.filter(x => x && x.text).slice(0, 30) : [];
    if (!items.length) { flash('No list came back. Try again.'); return; }
    const have = new Set(S.packing.map(p => p.text.toLowerCase()));
    if (data.weather) await saveTrip({ weather: String(data.weather).slice(0, 200) });
    let t = Date.now();
    for (const it of items) {
      const text = String(it.text).slice(0, 80);
      if (have.has(text.toLowerCase())) continue;
      await putSub('packing', rid(8), { text, kind: it.kind === 'group' ? 'group' : 'personal', claimedBy: null, ai: true, at: t++ });
    }
  });
}
function findSpots() {
  const prompt = `You're a nightlife scout planning ${isSmall() ? 'a night out for a friend group' : 'a group trip'}. Recommend real, well-known venues that are open as of your latest knowledge.
${context()}

Give 9 picks that fit the trip type and vibe. For nightlife trips: mostly clubs and bars, plus at least one rooftop or lounge and one late-night food spot. For family or work trips: activities, good restaurants and relaxed evening spots instead of clubs. Favor places that work for a group this size (table or guestlist options for clubs). Match the night each place is best to the trip days.
Reply with only JSON: {"items":[{"name":"","type":"club|bar|rooftop|lounge|live music|late-night food","area":"neighborhood","why":"one sentence on why this group would like it","price":"$|$$|$$$|$$$$","cover":"e.g. $20–40, Free, or Table min ~$500","bestNight":"e.g. Fri","dress":"short dress code","tip":"one practical insider tip","lat":0,"lng":0}]}
lat/lng: your best estimate of the venue's coordinates.`;
  askAI('spots', prompt, data => {
    const items = Array.isArray(data?.items) ? data.items.slice(0, 12) : [];
    if (!items.length) { flash('No picks came back. Try again.'); return; }
    return saveTrip({ spots: { city: dest()?.city || '', items, at: Date.now() } });
  });
}
function findDeals() {
  const prompt = `You're a budget travel planner. Estimate typical current prices for this group trip and how to keep it cheap.
${context()}

Be realistic and give ranges. Reply with only JSON:
{"flights":[{"from":"origin city","roundTrip":"$180–260","tip":"best airport/airline/time tip"}],
 "stay":{"areas":[{"name":"neighborhood","why":"one line","perNight":"$X–Y per room or per house"}],"groupPlay":"one or two sentences: rooms vs one big rental for this group size, and per-person cost"},
 "perPerson":{"flights":"$","stay":"$","food":"$","nightlife":"$","total":"$"},
 "verdict":"fits|tight|over",
 "savings":["3 to 5 short, specific money-saving moves for this trip"]}`;
  askAI('deals', prompt, data => {
    if (!data || typeof data !== 'object') { flash('No estimate came back. Try again.'); return; }
    return saveTrip({ deals: { city: dest()?.city || '', start: dates()?.start || '', data, at: Date.now() } });
  });
}
function draftPlan() {
  const d = dates(); if (!d) return;
  const spots = (S.trip.spots?.items || []).map(s => `${s.name} (${s.type}, best ${s.bestNight})`).join('; ');
  if (isSmall()) return draftNight();
  const prompt = `Build a fun, realistic day-by-day itinerary for this group trip.
${context()}
Nightlife picks the group already likes: ${spots || 'none yet — suggest real venues'}
${S.trip.crewId ? dnaText(S.trip.crewId) : ''}

Arrival and departure days are lighter. Mix food, daytime activities, recovery time, and nights out (use the picks on their best nights). 3–5 items per day.
Reply with only JSON: {"days":[{"date":"YYYY-MM-DD","items":[{"time":"HH:MM","title":"short title with the place name","kind":"food|activity|nightlife|travel|chill","note":"one short line"}]}]}`;
  askAI('plan', prompt, data => {
    const days = Array.isArray(data?.days) ? data.days : [];
    const valid = new Set(span(d.start, d.end));
    const items = [];
    for (const day of days) for (const it of (day.items || [])) if (valid.has(day.date) && it.title) items.push({ id: rid(6), date: day.date, time: String(it.time || '').slice(0, 5), title: String(it.title).slice(0, 120), kind: it.kind || 'activity', note: String(it.note || '').slice(0, 200), ai: true });
    if (!items.length) { flash('No plan came back. Try again.'); return; }
    const keep = (S.trip.itinerary || []).filter(i => !i.ai);
    return saveTrip({ itinerary: [...keep, ...items] });
  });
}

/* ---------- links ---------- */
const isCode = s => /^[A-Za-z]{3}$/.test((s || '').trim());
function gFlights(from, d, ds) { return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(`Flights from ${from} to ${ds.code || ds.city} on ${d.start} through ${d.end}`); }
function kayak(from, d, ds) { return `https://www.kayak.com/flights/${from.toUpperCase()}-${ds.code.toUpperCase()}/${d.start}/${d.end}?sort=price_a`; }
function airbnb(ds, d, n, perNight) { return `https://www.airbnb.com/s/${encodeURIComponent(ds.city)}/homes?checkin=${d.start}&checkout=${d.end}&adults=${n}` + (perNight ? `&price_max=${Math.round(perNight)}` : ''); }
function booking(ds, d, n) { return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(ds.city)}&checkin=${d.start}&checkout=${d.end}&group_adults=${n}&no_rooms=${Math.max(1, Math.ceil(n / 2))}&order=price`; }
function gHotels(ds, d) { return 'https://www.google.com/travel/search?q=' + encodeURIComponent(`cheap hotels in ${ds.city} ${d.start} to ${d.end}`); }
const maps = (name, city) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + city);

/* ---------- currency ---------- */
// Each plan has one currency everyone spends in. Each person can also pick their own,
// and big totals then show roughly what that is for them. Rates come from a free,
// keyless rates API, cached for 12 hours, with approximate built-in rates as a fallback.
const CURRENCIES = [['USD', 'US dollar'], ['EUR', 'Euro'], ['JPY', 'Japanese yen'], ['GBP', 'British pound'], ['CNY', 'Chinese yuan'], ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'], ['CHF', 'Swiss franc'], ['HKD', 'Hong Kong dollar'], ['SGD', 'Singapore dollar'],
  ['SEK', 'Swedish krona'], ['KRW', 'South Korean won'], ['NOK', 'Norwegian krone'], ['NZD', 'New Zealand dollar'], ['INR', 'Indian rupee'], ['MXN', 'Mexican peso'], ['TWD', 'New Taiwan dollar'], ['ZAR', 'South African rand'], ['BRL', 'Brazilian real'], ['DKK', 'Danish krone']];
const CUR_CODES = CURRENCIES.map(c => c[0]);
// approximate USD rates, used only if the live rates can't be loaded
const FX_FALLBACK = { USD: 1, EUR: 0.92, JPY: 150, GBP: 0.79, CNY: 7.2, AUD: 1.52, CAD: 1.37, CHF: 0.88, HKD: 7.8, SGD: 1.34, SEK: 10.5, KRW: 1380, NOK: 10.7, NZD: 1.66, INR: 84, MXN: 18.5, TWD: 32, ZAR: 18.3, BRL: 5.6, DKK: 6.85 };
const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ');
const REGION_CUR = { US: 'USD', GB: 'GBP', JP: 'JPY', CN: 'CNY', AU: 'AUD', CA: 'CAD', CH: 'CHF', HK: 'HKD', SG: 'SGD', SE: 'SEK', KR: 'KRW', NO: 'NOK', NZ: 'NZD', IN: 'INR', MX: 'MXN', TW: 'TWD', ZA: 'ZAR', BR: 'BRL', DK: 'DKK' };
function guessCur() {
  const region = (navigator.language || 'en-US').split('-')[1]?.toUpperCase() || '';
  return REGION_CUR[region] || (EURO.includes(region) ? 'EUR' : 'USD');
}
const lsGetC = (k, d) => { try { const v = localStorage.getItem(k); return v || d; } catch { return d; } };
const myCur = () => { const c = lsGetC('outta_mycur', ''); return CUR_CODES.includes(c) ? c : guessCur(); };
const cur = () => S.trip && CUR_CODES.includes(S.trip.currency) ? S.trip.currency : 'USD';
const noCents = c => ['JPY', 'KRW', 'TWD'].includes(c);
function fmtMoney(n, c, cents) {
  const dec = cents && !noCents(c) && Math.round(n * 100) % 100 ? 2 : 0;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n); }
  catch { return c + ' ' + Math.round(n).toLocaleString('en-US'); }
}
const curSymbol = c => fmtMoney(0, c).replace(/[\d.,\s]/g, '') || c;
let FX = null; try { FX = JSON.parse(localStorage.getItem('outta_fx') || 'null'); } catch {}
const fxRate = c => (FX && FX.rates && FX.rates[c]) || FX_FALLBACK[c];
const convert = (n, from, to) => from === to ? n : n / fxRate(from) * fxRate(to);
async function loadRates() {
  if (FX && FX.live && Date.now() - FX.got < 12 * 36e5) return;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD'), j = await r.json();
    if (j && j.result === 'success' && j.rates) { FX = { rates: j.rates, day: (j.time_last_update_utc || '').slice(5, 16), got: Date.now(), live: true }; try { localStorage.setItem('outta_fx', JSON.stringify(FX)); } catch {} render(); }
  } catch {}
}
const fxNote = () => FX && FX.live ? `rate from ${FX.day}` : 'approximate rate';
// "≈ $1,240" in your own currency, when it differs from the plan's
function alsoMine(lo, hi = lo) {
  const me = myCur(), c = cur(); if (me === c || !fxRate(me) || !fxRate(c)) return '';
  const a = fmtMoney(convert(lo, c, me), me), b = fmtMoney(convert(hi, c, me), me);
  return `<span class="fx" title="${fxNote()}">≈ ${a}${b !== a ? '–' + b : ''}</span>`;
}
setTimeout(() => loadRates(), 1500);
// a USD amount as a round number in the plan's currency (for presets and placeholders)
function niceIn(usd, c = cur()) {
  const v = convert(usd, 'USD', c), mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.round(v / mag) * mag;
}
const curOptions = sel => CURRENCIES.map(([c, n]) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c} · ${n}</option>`).join('');

/* ---------- render ---------- */
/* ---------- rendering: patch the page in place so things can animate ---------- */
// Replacing all of #app on every change made the app feel static: nothing could transition,
// and new items just appeared. morph() keeps existing elements and only changes what differs.
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Rows carry their item's id on their buttons (data-delexp="…", data-open="…"), so a row
// whose buttons all point at one id is keyed by it. That way adding or deleting an item
// animates that item instead of shuffling the content of every row below it.
const ID_ATTRS = ['data-open', 'data-crew', 'data-pickcrew', 'data-share', 'data-homedel', 'data-pack', 'data-claim', 'data-lockpitch', 'data-found', 'data-reveal', 'data-delfeed', 'data-delpack', 'data-delspend', 'data-delpot', 'data-delphoto', 'data-delitem', 'data-delexp', 'data-deldest', 'data-delbk'];
const ID_SEL = ID_ATTRS.map(a => `[${a}]`).join(',');
function keyOf(n) {
  if (n.nodeType !== 1) return '';
  const k = n.getAttribute('data-key') || n.id;
  if (k) return k;
  const vals = new Set();
  for (const el of [n, ...n.querySelectorAll(ID_SEL)]) for (const a of ID_ATTRS) { const v = el.getAttribute(a); if (v) vals.add(v); }
  return vals.size === 1 ? '~' + [...vals][0] : '';
}
function patchKids(parent, next, born) {
  const kids = [...next.childNodes], keys = kids.map(keyOf), want = new Set(keys.filter(Boolean));
  let cur = parent.firstChild;
  kids.forEach((nk, i) => {
    const k = keys[i];
    let m = null;
    if (k) for (let c = cur; c; c = c.nextSibling) if (c.nodeName === nk.nodeName && keyOf(c) === k) { m = c; break; }
    if (!m && cur && cur.nodeType === nk.nodeType && cur.nodeName === nk.nodeName && (!k || k[0] === '~')) {
      const ck = keyOf(cur);
      if (!ck || (ck[0] === '~' && !want.has(ck))) m = cur;
    }
    if (m) { if (m !== cur) parent.insertBefore(m, cur); else cur = cur.nextSibling; patchNode(m, nk, born); }
    else { parent.insertBefore(nk, cur); if (nk.nodeType === 1) born.push(nk); }
  });
  while (cur) { const n = cur.nextSibling; cur.remove(); cur = n; }
}
function morph(root, html) {
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const born = [];
  patchKids(root, tpl.content, born);
  return born;
}
function patchNode(el, nk, born) {
  if (el.nodeType !== 1) { if (el.nodeValue !== nk.nodeValue) el.nodeValue = nk.nodeValue; return; }
  for (const { name, value } of [...nk.attributes]) if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  for (const { name } of [...el.attributes]) if (!nk.hasAttribute(name) && !(name === 'open' && el.tagName === 'DETAILS')) el.removeAttribute(name);
  const tag = el.tagName;
  // never change the field someone is typing in; their draft wins until they leave it
  if (el === document.activeElement && (tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'file'].includes(el.type)))) return;
  if (tag === 'TEXTAREA') { if (el.value !== nk.value) el.value = nk.value; return; }
  if (tag === 'INPUT') {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = nk.hasAttribute('checked');
    else if (el.type !== 'file' && el.value !== (nk.getAttribute('value') || '')) el.value = nk.getAttribute('value') || '';
    return;
  }
  if (tag === 'IFRAME' || tag === 'CANVAS' || tag === 'VIDEO') return;
  patchKids(el, nk, born);
  if (tag === 'SELECT') { const o = [...el.options].findIndex(o => o.hasAttribute('selected')); el.selectedIndex = o < 0 ? 0 : o; }
}
// motion helpers (Web Animations, so nothing lingers in the markup)
const EASE = 'cubic-bezier(.2,.8,.2,1)';
function enter(els, step = 32) {
  if (calm()) return;
  els.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: Math.min(i, 8) * step, easing: EASE, fill: 'backwards' }));
}
function popIn(els) {
  if (calm()) return;
  for (const el of els) {
    if (!el.isConnected || el.closest('[data-noanim]') || getComputedStyle(el).display.startsWith('inline') && !el.matches('.chip,.pill,.btn')) continue;
    el.animate([{ opacity: 0, transform: 'translateY(6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE });
  }
}
let lastView = '';
const viewKey = () => S.tid && S.trip ? `t:${S.tid}:${S.tab}${S.setup ? ':setup' + S.setup.step : ''}` : `h:${S.loading ? 'load' : ''}:${S.creating && S.creating !== 'newCrew' ? S.creating : ''}:${S.crewView || ''}:${homeMode}`;

function render() {
  // switching menus cross-fades; going into or out of Live fades slower so the dark mode eases in
  const next = S.tid && S.trip ? secOf(TAB_ALIAS[S.tab] || S.tab).k : 'none', prev = app.dataset.sec;
  if (prev && next !== prev && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.dataset.vt = next === 'live' || prev === 'live' ? 'live' : 'sec';
    document.startViewTransition(paint).finished.finally(() => { delete document.documentElement.dataset.vt; });
    return;
  }
  paint();
}
function paint() {
  MEMO = new Map();
  try { paintNow(); } finally { MEMO = null; }
}
function paintNow() {
  try { if (S.tid && S.trip) announceChanges(); } catch {}
  const a = document.activeElement, fid = (a && a !== document.body && a.id) || (lastDown && Date.now() - lastDown.at < 800 ? lastDown.id : ''), sel = a && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  const scrollTabs = $('.tabs')?.scrollLeft;
  const vk = viewKey(), fresh = vk !== lastView || !app.firstChild; lastView = vk;
  if (S.tid && S.trip && !S.demo) try { sessionStorage.setItem('outta_tab_' + S.tid, S.tab); } catch {}
  let html;
  try { html = S.tid && S.trip ? tripView() : homeView(); }
  catch (e) {
    // one broken screen shouldn't take the whole app down
    console.error(e);
    html = `${topBar()}<section class="card stack" style="margin-top:20px"><h2>This screen hit a problem</h2><p class="muted">Something in this ${S.tid ? planWord() : 'page'} couldn’t be shown. Your data is safe.</p>
      <div class="row" style="gap:8px"><button class="btn primary" data-act="reloadView">Try again</button><button class="btn" data-act="home">Back home</button></div></section>`;
  }
  let born = [];
  if (fresh) app.innerHTML = html; else born = morph(app, html);
  const sk = S.tid && S.trip ? secOf(S.tab).k : 'none';
  app.dataset.sec = sk; document.body.dataset.sec = sk;
  for (const [id, v] of Object.entries(DRAFT)) { const el = document.getElementById(id); if (el && el.tagName !== 'BUTTON') el.value = v; }
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch {} } }
  if (scrollTabs) { const t = $('.tabs'); if (t) t.scrollLeft = scrollTabs; }
  bindSwipe();
  // a sheet that just opened takes focus, so keyboard and screen reader users land in it
  const dlg = $('.sheet[role=dialog], .show[role=dialog]');
  if (dlg && !dlg.contains(document.activeElement)) (dlg.querySelector('input, button:not([disabled])') || dlg).focus({ preventScroll: true });
  applyBeacon(); checkMilestones();
  const stb = $('.subtabs'), son = $('.subtab.on'); if (stb && son) stb.scrollLeft = son.offsetLeft - stb.clientWidth / 2 + son.clientWidth / 2;
  const fd = $('#feed'); if (fd) fd.scrollTop = fd.scrollHeight;
  syncPulse(); rememberSeen();
  if (fresh) enter([...app.children].filter(el => !el.matches('.top,.bottomnav,.subtabs,.mini,.fab-lost,script')));
  else popIn(born);
}

// Placeholders shaped like what's coming, so the screen doesn't jump when it arrives.
const skel = (kind = 'plan') => kind === 'rows'
  ? `<div class="skel-list" aria-busy="true" aria-label="Loading your plans">${'<div class="skel skel-row"></div>'.repeat(3)}</div>`
  : `<div class="skel-list" aria-busy="true" aria-label="Loading">${'<div class="skel skel-strip"></div><div class="skel skel-hero"></div><div class="skel skel-card"></div>'}</div>`;
function topBar() {
  const day = document.documentElement.dataset.theme === 'light';
  return `<div class="top"><button class="logo" data-act="home">Outta<span>/</span>Here</button>
    <div class="row" style="gap:10px;flex-wrap:nowrap">${S.tid ? `<span class="label">Code <span class="mono">${esc(S.demo ? 'DEMO' : S.tid)}</span></span>` : ''}<button class="theme-t" data-act="theme" aria-label="${day ? 'Switch to night mode' : 'Switch to day mode'}" title="${day ? 'Night mode' : 'Day mode'}">${day ? '☾' : '☀'}</button></div></div>`;
}

function pass() {
  if (isSmall()) return passSmall();
  const d = dates(), ds = dest(), b = budgetCap(), ms = active();
  const from = homes().map(h => isCode(h) ? h.toUpperCase() : h).slice(0, 3);
  const inN = S.members.filter(going).length;
  return `<section class="pass">
    <div class="pass-main">
      <div class="row" style="justify-content:space-between"><span class="label">${esc(S.trip.name)}</span>
        ${planOn() ? `<span class="on-pill">${size() === 'trip' ? 'Trip' : 'Weekend'} is on</span>` : booking_time() ? `<span class="pill in">${size() === 'trip' ? 'Booking flights' : 'Booking'}</span>` : stagePill(S.trip, S.members)}</div>
      <div class="route">
        <span class="code ${from.length ? '' : 'code-tbd'}">${from.length ? esc(homes().length > 1 ? homes().length + ' CITIES' : from[0]) : 'US'}</span>
        <span class="plane" aria-hidden="true">${size() === 'trip' ? '✈' : '→'}</span>
        <span class="code ${ds ? '' : 'code-tbd'}" style="color:var(--accent)">${ds ? esc(ds.code ? ds.code.toUpperCase() : ds.city) : 'TBD'}</span>
      </div>
      <div class="facts">
        <div><span class="label">Dates${d && !d.locked ? ' · best so far' : ''}</span><b>${d ? short(d.start) + ' → ' + short(d.end) : 'TBD'}</b></div>
        <div><span class="label">Nights</span><b>${d ? nightsOf(d) : S.trip.nights}</b></div>
        <div><span class="label">Budget cap / person</span><b>${b ? b.label : 'TBD'}</b></div>
        ${(() => { const c = countdown(); return c ? `<div><span class="label">Countdown</span><b style="color:var(--accent)">${c.text}</b></div>` : ''; })()}
      </div>
      ${(() => { const t = tickets(); if (size() !== 'trip' || (!booking_time() && !t.have.length)) return ''; return `<button class="stack" data-tab="tickets" style="gap:6px;background:none;border:0;padding:0;text-align:left;color:inherit;font:inherit;cursor:pointer">
        <div class="row" style="justify-content:space-between"><span class="small"><b>${t.have.length}/${t.goal}</b> boarding passes in</span>${t.on ? '<span class="small" style="color:var(--good)">Everyone’s booked</span>' : `<span class="small muted">${t.goal - t.have.length} more to make it official</span>`}</div>
        <div class="bigbar"><i style="width:${t.goal ? Math.min(100, t.have.length / t.goal * 100) : 0}%"></i></div></button>`; })()}
      <div class="row" style="gap:6px"><button class="btn sm" data-act="card">Make story card</button></div>
      ${S.cardUrl ? `<div class="row" style="align-items:flex-end;gap:14px"><img class="cardimg" src="${S.cardUrl}" alt="Story card for ${esc(S.trip.name)}">
        <div class="stack" style="gap:8px">${S.downloads ? `<button class="btn primary sm" data-act="saveCard">Save image</button>` : `<span class="small muted">Press and hold the image to save it.</span>`}<button class="btn sm ghost" data-act="closeCard">Close</button></div></div>` : ''}
    </div>
    <div class="pass-stub">
      <div><span class="label">Crew</span><div class="code" style="font-size:40px">${inN}<span class="muted" style="font-size:22px">/${S.members.length}</span></div><span class="small muted">going</span></div>
      ${commitLadder()}
    </div>
  </section>`;
}

function crewTab() {
  const m = meDoc() || { nick: S.myName, home: '', budget: '' };
  const ns = nudges();
  return `${inviteCard()}
  ${rsvpCard()}
  <section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Who’s holding things up</h2>
      ${ns.length ? `<button class="btn primary sm" data-act="copyNudge">Copy nudge for the group chat</button>` : ''}</div>
    ${ns.length ? `<div>${ns.map(x => `<div class="nudge"><b>${esc(x.m.nick || 'Someone')}${x.m.id === S.uid ? ' (you)' : ''}</b><span class="small muted">${x.todo.join(' · ')}</span></div>`).join('')}</div>`
      : `<p class="small" style="color:var(--good)">Nobody. Everyone’s done their part.</p>`}
    ${S.copyText ? `<textarea aria-label="Text to copy" id="copybox" readonly>${esc(S.copyText)}</textarea>` : ''}
  </section>
  <section class="card stack">
    <h2>Your details</h2>
    <p class="small muted">Your budget is never shown to the group. They only see the cap that works for everyone.</p>
    <div class="row">
      <label class="field"><span class="label">Name</span><input id="me-nick" maxlength="30" value="${esc(m.nick)}" placeholder="What the crew calls you"></label>
      ${isSmall() ? '' : `<label class="field"><span class="label">${size() === 'trip' ? 'Flying from' : 'Coming from'}</span><input id="me-home" maxlength="40" value="${esc(m.home)}" placeholder="${size() === 'trip' ? 'JFK or New York' : 'Your city or neighborhood'}"></label>`}
      <label class="field"><span class="label">${isSmall() ? `Max you’ll spend (${cur()})` : `Max you’ll spend (total, ${cur()})`}</span><input id="me-budget" type="number" min="0" step="${isSmall() ? 5 : 50}" inputmode="numeric" value="${m.budget ? esc(m.budget) : ''}" placeholder="${isSmall() ? '60' : size() === 'weekend' ? '400' : '800'}"></label>
    </div>
    <div class="row">
      <label class="field"><span class="label">Venmo</span><input id="me-venmo" maxlength="40" value="${esc(m.venmo || '')}" placeholder="@your-handle"></label>
      <label class="field"><span class="label">Cash App</span><input id="me-cash" maxlength="40" value="${esc(m.cashapp || '')}" placeholder="$yourtag"></label>
    </div>
    <p class="small muted">Payment handles are shown to the crew so they can pay you back.</p>
      ${myPrivacy()}
  </section>
  ${myLimits()}
  ${myNeeds()}
  <section class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:6px"><h2>The crew</h2><span class="small muted">Invite more with the card above</span></div>
    ${S.members.length ? S.members.filter(x => !x.removed).map(x => `<div class="crew-row">
      <div class="av" style="background:${colorFor(x.id)}">${esc((x.nick || '?')[0].toUpperCase())}</div>
      <div style="min-width:0"><b>${esc(x.nick || 'Someone')}${x.id === S.uid ? ' <span class="muted small">(you)</span>' : ''}</b>
        <div class="small muted">${x.home && !isSmall() ? (size() === 'trip' ? '✈ ' : 'from ') + esc(x.home) + ' · ' : ''}${(x.days || []).length} ${(x.days || []).length === 1 ? 'day' : 'days'} free · ${(x.votes || []).length ? 'voted' : 'no vote yet'}${x.budget || x.budgetSet ? ' · budget set' : ''}</div></div>
      <div class="cr-side"><span class="pill lvl-${x.status || 'maybe'}">${LEVEL_LABEL[x.status || 'maybe']}</span>${x.id === S.trip.createdBy || (S.trip.orgs || {})[x.id] ? '<span class="small muted">Organizer</span>' : ''}
        ${isOrganizer() && !S.demo && x.id !== S.uid && x.id !== S.trip.createdBy ? (S.confirmRm === x.id ? `<span class="row" style="gap:4px"><button class="btn sm danger-fill" data-rmdo="${esc(x.id)}">Remove</button><button class="btn sm ghost" data-act="rmCancel">Cancel</button></span>` : `<span class="row" style="gap:8px"><button class="linkbtn small" data-mkorg="${esc(x.id)}">${(S.trip.orgs || {})[x.id] ? 'Not organizer' : 'Make organizer'}</button><button class="linkbtn small" data-rmmember="${esc(x.id)}">Remove</button></span>`) : ''}</div>
    </div>`).join('') : `<p class="muted">Nobody yet. Add your details above.</p>`}
  </section>`;
}

const monthName = d => D(d).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
function datesTab() {
  if (!S.trip.lockedDates || S.demo) return datesBody();
  const d = S.trip.lockedDates, ms = active(), can = ms.filter(m => fitOf(m, span(d.start, d.end)));
  return `<section class="card stack decided-sum"><div class="row" style="justify-content:space-between"><span class="on-pill">Decided</span>${S.readOnly ? '' : '<button class="btn sm ghost" data-act="unlockDates">Change it</button>'}</div>
    <h2>${dayRange(d.start, d.end)}</h2><span class="small muted">${can.length === ms.length ? 'Everyone can make it.' : `${can.length} of ${ms.length} marked these days as free.`}</span></section>
  <details class="card more-opts"><summary>See everyone’s days and other options</summary><div class="stack" style="margin-top:12px">${datesBody()}</div></details>`;
}
function datesBody() {
  const t = S.trip, days = span(t.winStart, t.winEnd), ms = active(), mine = new Set(meDoc()?.days || []), myPref = new Set(meDoc()?.pref || []), flex = meDoc()?.flex || {};
  const best = bestWindows(), bestSet = new Set(best[0] ? span(best[0].start, best[0].end) : []);
  const max = Math.max(1, ms.length);
  const cells = days.map((d, i) => {
    const head = i === 0 ? '<span></span>'.repeat((D(d).getUTCDay() + 6) % 7) : D(d).getUTCDate() === 1 ? `<span class="cal-month">${monthName(d)}</span>${'<span></span>'.repeat((D(d).getUTCDay() + 6) % 7)}` : '';
    const n = ms.filter(m => (m.days || []).includes(d)).length, np = ms.filter(m => (m.pref || []).includes(d)).length;
    const pct = Math.round(n / max * 70);
    return `${head}<button class="day ${mine.has(d) ? 'mine' : ''} ${myPref.has(d) ? 'pref' : ''} ${bestSet.has(d) ? 'best' : ''}" data-day="${d}" aria-pressed="${mine.has(d)}" title="${fmt(d)} · ${n} free${np ? ` · ${np} prefer it` : ''}"
      style="background:color-mix(in oklab,var(--accent) ${pct}%,var(--surface));${pct > 40 ? 'color:var(--accent-ink)' : ''}">${D(d).getUTCDate()}<small style="${pct > 40 ? 'color:inherit' : ''}">${n ? n + '/' + ms.length : ''}</small>${myPref.has(d) ? '<i class="star" aria-hidden="true">★</i>' : ''}</button>`;
  });
  return `<section class="grid2">
    <div class="card stack">
      <div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px"><h2>${isSmall() ? 'Which days work for you?' : 'Tap the days you’re free'}</h2><span class="small muted">Tap once: works. Twice: best for you ★. Three times: clear.</span></div>
        <div class="row" style="gap:6px"><button class="btn sm ghost" data-act="allDays">All</button><button class="btn sm ghost" data-act="weekends">Fri–Sun</button><button class="btn sm ghost" data-act="noDays">Clear</button></div></div>
      <div class="cal">${days.length ? `<span class="cal-month first">${monthName(days[0])}</span>` : ''}${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x => `<span class="dow">${x}</span>`).join('')}${cells.join('')}</div>
      <div class="legend"><span><i class="sw" style="background:var(--accent)"></i>More people free</span><span><i class="sw" style="outline:2px solid var(--ink)"></i>You</span><span>★ Best for you</span><span><i class="sw" style="box-shadow:inset 0 -3px 0 var(--gold)"></i>${isSmall() ? 'Best day' : 'Best window'}</span></div>
      ${isSmall() ? '' : `<div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:12px"><span class="label">How flexible are you?</span>
        <div class="row" style="gap:6px"><button class="chip ${flex.late ? 'on' : ''}" data-flex="late" aria-pressed="${!!flex.late}">I can arrive a day late</button><button class="chip ${flex.early ? 'on' : ''}" data-flex="early" aria-pressed="${!!flex.early}">I can leave a day early</button></div>
        <span class="small muted">Counts you in for dates where you’d miss the first or last day.</span></div>`}
      <div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:12px">
        <span class="label">${isSmall() ? 'Days that could work' : 'Trip window'}</span>
        <div class="win-edit">
          <label class="field"><span class="small muted">Earliest</span><input id="win-start" type="date" value="${t.winStart}"></label>
          <label class="field"><span class="small muted">Latest</span><input id="win-end" type="date" value="${t.winEnd}"></label>
          <label class="field" ${isSmall() ? 'hidden' : ''}><span class="small muted">Trip length</span><select id="nights">${(isSmall() ? [0] : [1,2,3,4,5,6,7,10,14]).map(n => `<option value="${n}" ${n === nightsSet(t) ? 'selected' : ''}>${n === 0 ? 'Same day' : n + ' night' + (n === 1 ? '' : 's')}</option>`).join('')}</select></label>
        </div>
        <span class="small muted">Change these any time. Days people already tapped are kept.</span>
      </div>
    </div>
    <div class="card stack">
      <h2>${isSmall() ? 'Best day' : 'Best dates'}</h2>${S.demo ? '' : ruleLine()}
      ${t.lockedDates ? `<div class="banner"><span><b>Locked:</b> ${dayRange(t.lockedDates.start, t.lockedDates.end)}</span><button class="btn sm" data-act="unlockDates">Unlock</button></div>` : ''}
      ${best.length ? best.map((w, i) => `<div class="stack" style="gap:6px;${i ? 'border-top:1px solid var(--line);padding-top:12px' : ''}">
        <div class="row" style="justify-content:space-between"><b class="mono">${dayRange(w.start, w.end)}</b><span class="small"><b>${w.ok.length}/${ms.length}</b> can go</span></div>
        <div class="bar"><i style="width:${Math.round(w.ok.length / max * 100)}%"></i></div>
        ${w.miss.length ? `<span class="small muted">Missing: ${w.miss.map(m => esc(m.nick || 'Someone')).join(', ')}</span>` : `<span class="small" style="color:var(--good)">Everyone can make it</span>`}
        ${w.late.length || w.early.length || w.pref.length ? `<span class="small muted">${[w.late.length && `${esc(listNames(w.late))} ${w.late.length === 1 ? 'arrives' : 'arrive'} a day late`, w.early.length && `${esc(listNames(w.early))} ${w.early.length === 1 ? 'leaves' : 'leave'} a day early`, w.pref.length && `★ ${w.pref.length === ms.length ? 'everyone prefers' : w.pref.length + ' prefer'} ${isSmall() ? 'this day' : 'these dates'}`].filter(Boolean).join(' · ')}</span>` : ''}
        ${t.lockedDates && t.lockedDates.start === w.start && t.lockedDates.end === w.end ? '' : ruleChip('dates', w.start + '|' + w.end)}
        <div>${t.lockedDates && t.lockedDates.start === w.start && t.lockedDates.end === w.end ? '<span class="pill in">Locked</span>' : `<button class="btn sm ${i === 0 && !t.lockedDates ? 'primary' : ''}" data-lockdates="${w.start}|${w.end}">${t.lockedDates ? 'Switch to these' : isSmall() ? 'Lock this day' : 'Lock these dates'}</button>`}</div>
      </div>`).join('') : `<div class="empty">${(() => { const f = shorterFit(); return f
        ? `<b>No ${nightsSet(t) ? nightsSet(t) + '-night stretch' : 'day'} works yet</b><span>But a ${f.n}-night trip, ${fmt(f.w.start)} → ${fmt(f.w.end)}, works for ${f.w.ok.length} of ${ms.length}.</span><button class="btn sm primary" data-setnights="${f.n}">Switch to ${f.n} night${f.n === 1 ? '' : 's'}</button>`
        : `<span>No ${nightsSet(t) ? nightsSet(t) + '-night stretch' : 'day'} overlaps yet. Once people tap their free days, the best windows show up here.</span>`; })()}</div>`}
    </div>
  </section>`;
}

function whereTab() {
  const ds = S.trip.destinations || [], my = new Set(meDoc()?.votes || []), max = Math.max(1, active().length);
  const sorted = [...ds].sort((a, b) => votesFor(b.id).length - votesFor(a.id).length);
  return `<section class="card stack own-picks">
    <div class="stack" style="gap:2px"><h2>${isSmall() ? 'Your own ideas' : 'Your own picks'}</h2><span class="small muted">${S.sample === null ? `Add ${isSmall() ? 'ideas' : 'cities'}, vote for every one you’d do, and lock the winner.` : `Not feeling the pitches? Add your own ${isSmall() ? 'ideas' : 'cities'}, vote for every one you’d do, and lock one in.`}</span></div>
    ${S.trip.lockedDest ? `<div class="banner"><span><b>Locked:</b> ${esc(dest()?.city || '')}</span><button class="btn sm" data-act="unlockDest">Unlock</button></div>` : ''}
    ${sorted.length ? sorted.map(d => { const v = votesFor(d.id); return `<div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:12px">
      <div class="row" style="justify-content:space-between"><div class="row" style="gap:8px"><h3>${esc(d.city)}</h3>${d.code ? `<span class="mono small muted">${esc(d.code.toUpperCase())}</span>` : ''}</div>
        <div class="row" style="gap:6px"><button class="chip ${my.has(d.id) ? 'on' : ''}" data-vote="${esc(d.id)}">${my.has(d.id) ? '✓ Voted' : 'Vote'}</button>
        ${S.trip.lockedDest !== d.id ? `<button class="btn sm ghost" data-lockdest="${esc(d.id)}">Lock</button>` : ''}
        <button class="x" data-deldest="${esc(d.id)}" aria-label="Remove ${esc(d.city)}">×</button></div></div>
      <div class="bar"><i style="width:${Math.round(v.length / max * 100)}%"></i></div>
      <span class="small muted">${v.length} vote${v.length === 1 ? '' : 's'}${v.length ? ': ' + v.map(m => esc(m.nick || 'Someone')).join(', ') : ''}</span>${S.trip.lockedDest === d.id ? '' : ruleChip('dest', d.id)}
    </div>`; }).join('') : `<div class="empty"><span>No ideas yet. Throw one out.</span></div>`}
    <form id="addDest" class="row" style="border-top:1px solid var(--line);padding-top:14px;align-items:flex-end">
      <label class="field" style="flex:2 1 200px"><span class="label">${isSmall() ? 'Idea' : 'City'}</span><input id="ad-city" maxlength="50" required placeholder="${isSmall() ? 'Tacos + karaoke' : size() === 'weekend' ? 'Catskills' : 'Miami'}"></label>
      <label class="field" style="flex:0 1 110px" ${size() === 'trip' ? '' : 'hidden'}><span class="label">Airport (optional)</span><input id="ad-code" maxlength="3" placeholder="MIA"></label>
      <button class="btn primary" type="submit">Add</button>
    </form>
  </section>`;
}

function needDestDates(what, need = 'both') {
  const small = isSmall(), noDest = need !== 'dates' && !dest(), noDates = need !== 'dest' && !dates();
  const W = small ? 'the plan' : 'where you’re going', N = small ? 'the day' : 'your dates';
  const title = noDest && noDates ? (small ? 'First, pick the plan and the day' : 'First, decide where and when') : noDest ? `First, pick ${W}` : `First, pick ${N}`;
  return `<div class="empty"><b>${title}</b>
    <span>${esc(what)} ${/s$/.test(what) ? 'show' : 'shows'} up once you have ${noDest && noDates ? `${W} and ${N}` : noDest ? W : N}. ${small ? 'Plan Match settles it: the AI pitches plans' : 'Trip Match settles both: the AI pitches trips'} that fit everyone and the crew swipes.</span>
    <div class="row" style="gap:6px"><button class="btn sm primary" data-tab="match">Open ${small ? 'Plan' : 'Trip'} Match</button>${noDates ? `<button class="btn sm" data-tab="dates">${small ? 'Pick the day' : 'Pick dates'}</button>` : ''}</div></div>`;
}

function ticketsSection() {
  const t = tickets(), me = meDoc(), mine = t.tk[S.uid], imIn = going(me);
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Boarding passes</h2>${t.on ? '<span class="on-pill">Trip is on</span>' : `<span class="pill maybe">${t.have.length}/${t.goal} in</span>`}</div>
    <p class="small muted">The trip is official once everyone who’s in has booked a flight and sent in their boarding pass or confirmation.${booking_time() ? '' : ' Lock the dates and the destination first so nobody books the wrong flight.'}</p>
    <div class="bigbar"><i style="width:${t.goal ? Math.min(100, t.have.length / t.goal * 100) : 0}%"></i></div>
    <div>${t.ins.map(m => { const x = t.tk[m.id]; return `<div class="nudge"><b>${esc(m.nick || 'Someone')}${m.id === S.uid ? ' (you)' : ''}</b><span class="row" style="gap:8px">${x ? `${x.flight ? `<span class="small mono">${esc(x.flight)}</span>` : ''}<span class="pill in">✓ Booked</span>` : '<span class="pill out">Not yet</span>'}</span></div>`; }).join('') || '<p class="small muted">Nobody has tapped “I’m in” yet.</p>'}</div>
    ${imIn ? (mine ? `<div class="card stack" style="background:var(--bg)"><b>Your boarding pass is in ✓</b>
        ${mine.asset ? (mine.type === 'application/pdf' ? `<div><a class="btn sm" href="/_blob/${esc(mine.asset)}" target="_blank" rel="noopener">View your PDF</a></div>` : `<img class="ticket-img" src="/_blob/${esc(mine.asset)}" alt="Your boarding pass">`) : ''}
        <span class="small muted">Only you see the file. The crew just sees that you’re booked${mine.flight ? ', plus your flight number' : ''}.</span>
        <div><button class="btn sm danger" data-act="delTicket">Remove</button></div></div>`
      : `<form id="tkForm" class="card stack" style="background:var(--bg)">
        <b>Booked your flight? Send it in.</b>
        <div class="row" style="align-items:flex-end">
          ${S.assets || S.demo ? `<label class="field" style="flex:2 1 220px"><span class="label">Boarding pass or confirmation</span><input id="tk-file" type="file" accept="image/*,application/pdf"></label>` : ''}
          <label class="field"><span class="label">Flight number</span><input id="tk-flight" maxlength="20" placeholder="B6 1123"></label>
          <label class="field" style="flex:0 1 140px"><span class="label">What you paid</span><input id="tk-price" type="number" min="0" inputmode="numeric" placeholder="Optional"></label>
        </div>
        ${S.tkFile ? `<span class="small">Selected: <b>${esc(S.tkFile.name)}</b></span>` : ''}
        <div><button class="btn primary" type="submit" ${S.busy.ticket ? 'disabled' : ''}>${S.busy.ticket ? '<i class="spin"></i>Uploading…' : 'Send it in'}</button></div>
        ${S.assets || S.demo ? '<span class="small muted">A photo, screenshot or PDF works.</span>' : '<span class="small muted">File uploads aren’t available for you here, so add your flight number to mark yourself booked.</span>'}
      </form>`) : `<p class="small muted">Tap “I’m in” on the pass above, then send in your boarding pass here.</p>`}
  </section>`;
}
function dealsBody(x, cap) {
  const v = { fits: ['in', 'Fits the budget'], tight: ['maybe', 'Tight'], over: ['out', 'Over budget'] }[x.verdict] || null;
  const pp = x.perPerson || {};
  return `${v ? `<div class="row"><span class="pill ${v[0]}">${v[1]}</span>${cap ? `<span class="small muted">vs. ${money(cap)} cap</span>` : ''}</div>` : ''}
    <div class="split">${['flights', 'stay', 'food', 'nightlife', 'total'].filter(k => pp[k]).map(k => `<div><span class="label">${k}</span><b style="font-size:16px">${esc(pp[k])}</b></div>`).join('')}</div>
    ${(x.flights || []).length ? `<div><span class="label">Typical round trips</span>${x.flights.map(f => `<div class="linkrow"><div style="min-width:0"><b>${esc(f.from)}</b><div class="small muted">${esc(f.tip)}</div></div><span class="mono">${esc(f.roundTrip)}</span></div>`).join('')}</div>` : ''}
    ${x.stay?.areas?.length ? `<div><span class="label">Where to stay cheap</span>${x.stay.areas.map(a => `<div class="linkrow"><div style="min-width:0"><b>${esc(a.name)}</b><div class="small muted">${esc(a.why)}</div></div><span class="mono small">${esc(a.perNight)}</span></div>`).join('')}
      ${x.stay.groupPlay ? `<p class="small" style="margin-top:6px">${esc(x.stay.groupPlay)}</p>` : ''}</div>` : ''}
    ${(x.savings || []).length ? `<div><span class="label">Save money</span><ul style="margin:6px 0 0;padding-left:18px">${x.savings.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    <p class="small muted">AI estimates from typical prices, not live fares. Check the search links before booking.</p>`;
}

function spotsTab() {
  const d = dates(), ds = dest();
  if (!ds) return needDestDates(isSmall() ? 'Spot picks' : 'Nightlife picks', 'dest');
  const spots = S.trip.spots && S.trip.spots.city === ds.city ? S.trip.spots.items : null;
  const mq = meDoc()?.quiz || {}, b = blend();
  const ranked = spots ? spots.map((s, i) => ({ s, i, sc: score(rkey('sp' + s.name)) })).sort((a, b) => b.sc.net - a.sc.net || a.i - b.i) : [];
  return `<section class="grid2">
    <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:4px"><h2>Vibe quiz</h2><span class="label">${Object.keys(mq).length}/${QUIZ.length}</span></div>
      ${QUIZ.map(q => `<div class="q"><span class="small"><b>${esc(q.q)}</b></span><div class="row" style="gap:6px">${q.o.map(o => `<button class="chip ${mq[q.k] === o ? 'on' : ''}" data-quiz="${q.k}|${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`).join('')}
    </div>
    ${b ? `<div class="blend">
      <span class="label">${b.n} of ${active().length} took the quiz</span>
      <h2>${esc(b.persona)}</h2>
      ${QUIZ.map(q => { const top = b.res[q.k].slice(0, 3), w = b.win[q.k]; if (!top.length) return '';
        const myRun = (meDoc()?.runoff || {})[q.k];
        return `<div class="stack" style="gap:4px"><div class="row" style="justify-content:space-between"><span class="label">${esc(q.q)}</span>${w.how !== 'majority' ? `<span class="tie">Tie</span>` : ''}</div>
        ${top.map(x => `<div class="row" style="gap:8px;flex-wrap:nowrap"><span class="small" style="flex:0 0 46%">${x.a === w.a ? '<b>★ ' : ''}${x.pct}% ${esc(x.a)}${x.a === w.a ? '</b>' : ''}</span><div class="bar" style="flex:1"><i style="width:${x.pct}%"></i></div></div>`).join('')}
        ${w.how !== 'majority' ? `<div class="runoff"><span class="small">${w.how === 'runoff' ? `Runoff winner: <b>${esc(w.a)}</b> (${w.tied.map(a => (w.rv[a] || 0)).join('–')})` : w.votes ? `Runoff is tied too, so a coin flip picked <b>${esc(w.a)}</b>` : `Coin flip picked <b>${esc(w.a)}</b> for now. Vote in the runoff to decide it yourselves.`}</span>
          <div class="row" style="gap:6px">${w.tied.map(a => `<button class="chip ${myRun === a ? 'on' : ''}" data-qrunoff="${q.k}|${esc(a)}">${esc(a)}</button>`).join('')}</div></div>` : ''}</div>`; }).join('')}
      <span class="small" style="opacity:.75">Screenshot this and drop it in the chat.</span>
    </div>` : `<div class="empty"><b>Your crew’s vibe shows up here.</b><span>Answer the 5 questions. Once friends answer too, you’ll see the blend, like “60% Big club, 40% Rooftop cocktails”, and the AI uses it for its picks.</span></div>`}
  </section>
  <section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Where we’re going out in ${esc(ds.city)}</h2></div>
    ${S.sample !== null ? `<div><button class="btn primary" data-act="spots" ${S.busy.spots ? 'disabled' : ''}>${S.busy.spots ? '<i class="spin"></i>Scouting spots…' : spots ? 'Find new spots' : 'Find our spots'}</button></div>` : `<p class="small muted">${IN_CLAUDE ? "AI picks aren’t available for you right now." : "AI picks are off. Add your Anthropic API key to turn them on."}</p>`}
  </section>
  ${spots ? `<section class="grid2">${ranked.map(({ s, i }) => `<article class="card spot">
      <div class="spot-head"><div style="min-width:0"><span class="kind">${esc(s.type)}</span><h3>${esc(s.name)}</h3><span class="small muted">${esc(s.area)}</span></div><span class="mono" style="color:var(--accent)">${esc(s.price)}</span></div>
      <p class="small">${esc(s.why)}</p>
      <div class="meta">${s.cover ? `<span>Cover <b>${esc(s.cover)}</b></span>` : ''}${s.bestNight ? `<span>Best <b>${esc(s.bestNight)}</b></span>` : ''}${s.dress ? `<span>Dress <b>${esc(s.dress)}</b></span>` : ''}</div>
      ${s.tip ? `<p class="small muted">Tip: ${esc(s.tip)}</p>` : ''}
      <div class="row" style="gap:6px;margin-top:auto">${voteBtns(rkey('sp' + s.name))}<a class="btn sm" href="${maps(s.name, ds.city)}" target="_blank" rel="noopener">Map</a>${d ? `<button class="btn sm" data-addspot="${i}">Add to itinerary</button>` : ''}</div>
    </article>`).join('')}</section>
    <p class="small muted">AI picks. Check hours, covers and age rules before you go.</p>`
  : `<div class="empty"><span>${isSmall() ? 'Take the vibe quiz, then let AI pull spots that fit your crew, budget and the day.' : 'Take the vibe quiz, then let AI pull clubs, bars, rooftops and a late-night food spot that fit your crew, budget and the nights you’re there.'}</span></div>`}`;
}

function planTab() {
  const d = dates();
  if (!d) return needDestDates(isSmall() ? 'The plan' : 'The itinerary', 'dates');
  const days = span(d.start, d.end), items = visItems();
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>${isSmall() ? 'The plan' : 'Itinerary'}</h2>
      <div class="row" style="gap:6px">${items.some(i => i.ai) ? `<button class="btn sm ghost" data-act="clearAI">Remove AI items</button>` : ''}
      ${S.sample !== null ? `<button class="btn primary" data-act="plan" ${S.busy.plan ? 'disabled' : ''}>${S.busy.plan ? '<i class="spin"></i>Drafting…' : items.some(i => i.ai) ? 'Redraft with AI' : 'Draft it with AI'}</button>` : ''}</div></div>
    ${S.trip.itinTpl && S.trip.itinTpl.length && !S.readOnly ? `<div class="cost-flag soft row" style="justify-content:space-between;gap:8px"><span><b>Last time’s outline</b> · ${S.trip.itinTpl.length} stop${S.trip.itinTpl.length === 1 ? '' : 's'}${S.trip.repeatOf?.name ? ` from ${esc(S.trip.repeatOf.name)}` : ''}</span><span class="row" style="gap:6px"><button class="btn sm primary" data-act="applyOutline">Put it on these dates</button><button class="btn sm ghost" data-act="dropOutline">Skip it</button></span></div>` : ''}
    ${!d.locked ? `<p class="small muted">Using the best dates so far. ${isSmall() ? 'Lock the day in When so the plan doesn’t shift.' : 'Lock dates in Dates so the plan doesn’t shift.'}</p>` : ''}
  </section>
  ${needsCard('plan')}
  ${days.map((day, i) => { const list = items.filter(x => x.date === day).sort(byTime); return `<section class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:4px"><h3>${days.length === 1 ? fmt(day) : `Day ${i + 1} · ${fmt(day)}`}</h3>${days.length === 1 ? '' : i === 0 ? `<span class="label">${size() === 'trip' ? 'Arrive' : 'Head out'}</span>` : i === days.length - 1 ? '<span class="label">Head home</span>' : ''}</div>
    ${list.length ? list.map(x => S.editItem === x.id ? editItemForm(x, days) : `<div class="tline"><span class="mono small">${esc(tShow(x.time) || '—')}</span><div style="min-width:0"><span class="kind">${esc(x.kind || '')}</span> <b>${esc(x.title)}</b>${x.secret && !x.hidden ? (x.revealed ? ' <span class="secret-tag">Revealed surprise</span>' : ` <span class="secret-tag">Surprise · hidden from the ${esc(mode().honoree || 'guest')}</span> <button class="linkbtn small" data-reveal="${esc(x.id)}">Reveal</button>`) : ''}${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</div>${x.hidden ? '<span></span>' : `<div class="row" style="gap:4px;flex-wrap:nowrap">${voteBtns(rkey('it' + x.id))}${S.readOnly ? '' : `<button class="x" data-edititem="${esc(x.id)}" aria-label="Move or edit ${esc(x.title)}" title="Move or edit">✎</button>`}<button class="x" data-delitem="${esc(x.id)}" aria-label="Remove">×</button></div>`}</div>`).join('') : `<p class="small muted">Nothing planned yet.</p>`}
    <form class="row addItem" data-date="${day}" style="margin-top:8px;gap:6px">
      <input id="ai-time-${day}" type="time" style="width:auto;flex:0 0 auto" aria-label="Time">
      <input id="ai-title-${day}" maxlength="120" placeholder="Add something" style="flex:1 1 160px" aria-label="What">
      <button class="btn sm" type="submit">Add</button>
      ${honoreeMode() && !isHonoree() ? `<label class="row small" style="gap:6px;flex:1 1 100%"><input type="checkbox" id="ai-secret-${day}" style="width:auto"> Surprise (hidden from the ${esc(mode().honoree)})</label>` : ''}
    </form>
  </section>`; }).join('')}`;
}

const money2 = n => fmtMoney(Math.round(n * 100) / 100, cur(), true);
const byAt = (a, b) => (a.at || 0) - (b.at || 0);
function payLinks(toId, amt, note) {
  const m = S.members.find(x => x.id === toId) || {};
  const v = handle(m.venmo), c = handle(m.cashapp), a = Math.round(amt * 100) / 100;
  const out = [];
  if (v) out.push(`<a class="btn sm" href="https://venmo.com/${encodeURIComponent(v)}?txn=pay&amount=${a}&note=${encodeURIComponent(note)}" target="_blank" rel="noopener">Venmo @${esc(v)}</a>`);
  if (c) out.push(`<a class="btn sm" href="https://cash.app/$${encodeURIComponent(c)}/${a}" target="_blank" rel="noopener">Cash App $${esc(c)}</a>`);
  return out.length ? out.join('') : `<span class="small muted">${esc(nameOf(toId))} hasn’t added Venmo or Cash App yet (Crew tab)</span>`;
}

function moneyTab() {
  const ms = active();
  const split = S.split || new Set(ms.map(m => m.id).filter(id => !(honoreeFree() && id === S.trip.honoree)));
  const { out } = settle();
  const total = S.expenses.reduce((a, e) => a + (+e.amount || 0), 0);
  const exps = [...S.expenses].sort((a, b) => (b.at || 0) - (a.at || 0));
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>${isSmall() ? 'Expenses' : 'Trip expenses'}</h2><span class="mono">${money2(total)} total ${alsoMine(total)}</span></div>
    <form id="expForm" class="stack">
      <div class="row" style="align-items:flex-end">
        <label class="field" style="flex:2 1 180px"><span class="label">What</span><input id="ex-what" maxlength="60" required placeholder="Dinner at Catch"></label>
        <label class="field"><span class="label">Amount</span><input id="ex-amt" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="340"></label>
        <label class="field"><span class="label">Paid by</span><select id="ex-by">${ms.map(m => `<option value="${esc(m.id)}" ${m.id === S.uid ? 'selected' : ''}>${esc(m.nick || 'Someone')}</option>`).join('')}</select></label>
      </div>
      <div><span class="label">Split between</span><div class="row" style="gap:6px;margin-top:6px">${ms.map(m => `<button type="button" class="chip ${split.has(m.id) ? 'on' : ''}" data-split="${esc(m.id)}">${esc(m.nick || 'Someone')}</button>`).join('')}</div></div>
      <div><button class="btn primary" type="submit">Add expense</button></div>
    </form>
    ${exps.length ? `<div>${exps.map(e => `<div class="linkrow"><div style="min-width:0"><b>${esc(e.title)}</b><div class="small muted">${esc(nameOf(e.paidBy))} paid · split ${(e.split || []).length} ways · ${money2(e.amount / Math.max(1, (e.split || []).length))} each</div></div>
      <div class="row" style="gap:6px"><span class="mono">${money2(e.amount)}</span><button class="x" data-delexp="${esc(e.id)}" aria-label="Remove ${esc(e.title)}">×</button></div></div>`).join('')}</div>`
      : `<p class="small muted">No expenses yet. Log anything someone pays for the group.</p>`}
  </section>
  ${exps.length ? `<section class="card stack"><h2>Settle up</h2>
    ${out.length ? `<div>${out.map(t => `<div class="linkrow"><div><b>${esc(nameOf(t.from))}</b> pays <b>${esc(nameOf(t.to))}</b> <span class="mono">${money2(t.amt)}</span></div>${t.from === S.uid ? `<div class="row" style="gap:6px">${payLinks(t.to, t.amt, S.trip.name)}</div>` : ''}</div>`).join('')}</div>` : '<p class="small" style="color:var(--good)">Everyone’s even.</p>'}
    <p class="small muted">The fewest payments that square everyone up.</p></section>` : ''}`;
}

function packTab() {
  const ds = dest(), d = dates();
  const group = S.packing.filter(p => p.kind === 'group').sort(byAt), personal = S.packing.filter(p => p.kind !== 'group').sort(byAt);
  const packed = new Set(meDoc()?.packed || []);
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Packing list</h2>
      ${S.sample !== null && ds && d ? `<button class="btn primary" data-act="pack" ${S.busy.pack ? 'disabled' : ''}>${S.busy.pack ? '<i class="spin"></i>Building…' : S.packing.length ? 'Add AI suggestions' : 'Build it with AI'}</button>` : ''}</div>
    ${S.trip.weather ? `<p class="small"><span class="label">Weather</span> ${esc(S.trip.weather)}</p>` : ''}
    <form id="packForm" class="row" style="align-items:flex-end">
      <label class="field" style="flex:2 1 180px"><span class="label">Item</span><input id="pk-text" maxlength="80" required placeholder="Bluetooth speaker"></label>
      <label class="field" style="flex:1 1 170px"><span class="label">Type</span><select id="pk-kind"><option value="group">Group (one person brings)</option><option value="personal">Everyone packs</option></select></label>
      <button class="btn" type="submit">Add</button>
    </form>
  </section>
  <section class="grid2">
    <div class="card"><h3>Group stuff</h3><p class="small muted" style="margin-bottom:6px">Claim it so nobody brings three speakers.</p>
      ${group.length ? group.map(p => `<div class="check"><span class="txt"><b>${esc(p.text)}</b><div class="small ${p.claimedBy ? '' : 'muted'}">${p.claimedBy ? esc(nameOf(p.claimedBy)) + ' is bringing it' : 'Nobody yet'}</div></span>
        ${!p.claimedBy ? `<button class="btn sm" data-claim="${esc(p.id)}">I got it</button>` : p.claimedBy === S.uid ? `<button class="btn sm ghost" data-unclaim="${esc(p.id)}">Unclaim</button>` : ''}
        <button class="x" data-delpack="${esc(p.id)}" aria-label="Remove ${esc(p.text)}">×</button></div>`).join('') : '<p class="small muted">Nothing yet.</p>'}
    </div>
    <div class="card"><h3>Everyone packs</h3><p class="small muted" style="margin-bottom:6px">Tick things off as you pack.${personal.length ? ` ${personal.filter(p => packed.has(p.id)).length}/${personal.length} packed.` : ''}</p>
      ${personal.length ? personal.map(p => `<div class="check"><button class="box ${packed.has(p.id) ? 'on' : ''}" data-pack="${esc(p.id)}" aria-pressed="${packed.has(p.id)}" aria-label="Packed ${esc(p.text)}">${packed.has(p.id) ? '✓' : ''}</button><span class="txt ${packed.has(p.id) ? 'done' : ''}">${esc(p.text)}</span><button class="x" data-delpack="${esc(p.id)}" aria-label="Remove ${esc(p.text)}">×</button></div>`).join('') : '<p class="small muted">Nothing yet.</p>'}
    </div>
  </section>`;
}

const canDelete = t => S.demo || S.isOwner || (t && t.createdBy && t.createdBy === S.uid);
async function deleteTrip(tid) {
  if (S.demo) { goHome(); return; }
  if (!S.db || !tid) return;
  if (S.tid === tid) stop();
  try {
    const t = (await S.db.doc('trips/' + tid).get()).data() || {};
    const word = SIZES[t.size] ? SIZES[t.size].label : 'Trip';
    if (S.assets) for (const x of Object.values(t.tickets || {})) if (x && x.asset) await S.assets.delete(x.asset).catch(() => {});
    if (S.assets) { const ph = await S.db.collection(`trips/${tid}/photos`).get(); for (const d of ph.docs) { const a = d.data().asset; if (a) await S.assets.delete(a).catch(() => {}); } }
    for (const c of ['members', 'expenses', 'packing', 'feed', 'bucket', 'photos', 'pot', 'songs']) {
      const snap = await S.db.collection(`trips/${tid}/${c}`).get();
      for (const d of snap.docs) await S.db.doc(`trips/${tid}/${c}/${d.id}`).delete();
    }
    await S.db.doc('trips/' + tid).delete();
    S.confirmHome = null; S.confirm = null;
    if (S.tid === tid) goHome(); else render();
    flash(word + ' deleted.');
  } catch (e) { flash(writeErr(e)); if (S.tid === tid) openTrip(tid, 'crew'); }
}
async function leaveTrip() {
  if (!S.db || S.demo) return;
  const tid = S.tid, mine = tickets().tk[S.uid];
  stop(); clearTimeout(meT); S.meDirty = false;
  try {
    if (mine) { if (mine.asset && S.assets) await S.assets.delete(mine.asset).catch(() => {}); await S.db.doc('trips/' + tid).update({ tickets: { [S.uid]: null } }); }
    const word = planWord();
    try { sessionStorage.removeItem('outta_tab_' + tid); } catch {}
    await S.db.doc('trips/' + tid).update({ people: { [S.uid]: null }, left: { [S.uid]: true } }).catch(() => {});
    await S.db.doc(`trips/${tid}/members/${S.uid}`).delete();
    goHome(); flash(`You left the ${word}.`);
  } catch (e) { flash(writeErr(e)); openTrip(tid, 'crew'); }
}
async function sendTicket() {
  const flight = ($('#tk-flight')?.value || '').trim().slice(0, 20), file = S.tkFile, price = Math.max(0, Math.round(+($('#tk-price')?.value || 0)));
  if (!file && !flight) { flash('Add your boarding pass or your flight number.'); return; }
  const tid = S.tid;
  if (file && file.size > 20 * 1024 * 1024) { flash('That file is over 20 MB. Try a screenshot instead.'); return; }
  let asset = null, type = '';
  if (file && S.assets && !S.demo) {
    S.busy.ticket = true; render();
    try { const r = await S.assets.upload(file); asset = r.id; type = r.contentType; }
    catch (e) { S.busy.ticket = false; render(); flash(e && e.code === 'unsupported_type' ? 'Use a photo, screenshot or PDF.' : 'Upload failed. Try again, or just add your flight number.'); return; }
    S.busy.ticket = false;
  }
  if (S.tid !== tid) { flash('Your boarding pass upload finished after you left that plan. Open it and send it again.'); return; }
  S.tkFile = null;
  if (!await saveTrip({ tickets: { [S.uid]: { asset, type, flight, ...(price ? { price } : {}), at: Date.now() } } })) return;
  if (meDoc()?.status !== 'booked') saveMe({ status: 'booked', seen: true }, true);
  flash(tickets().on ? 'That’s everyone. The trip is ON.' : 'Boarding pass in. You’re marked as booked.');
}
async function delTicket() {
  const mine = tickets().tk[S.uid]; if (!mine) return;
  if (mine.asset && S.assets && !S.demo) await S.assets.delete(mine.asset).catch(() => {});
  saveTrip({ tickets: { [S.uid]: null } });
}

/* ---------- your details first ---------- */
// Creating or joining a plan starts with a short setup, one question per screen,
// before the full plan with every tab opens up.
const showWelcome = () => S.membersIn && !S.demo && !S.readOnly && (!meDoc() || (meDoc().status === 'maybe' && !meDoc().seen));
const setupSteps = () => ['days', ...(isSmall() ? [] : ['home']), 'budget', 'vibe'];
const BUDGETS = { hangout: [30, 60, 100], day: [50, 100, 200], weekend: [250, 450, 700], trip: [600, 1000, 1600] };
function dayPicker() {
  const t = S.trip, days = span(t.winStart, t.winEnd), mine = new Set(meDoc()?.days || []), pref = new Set(meDoc()?.pref || []);
  const pad = d => '<span></span>'.repeat((D(d).getUTCDay() + 6) % 7);
  const cells = days.map((d, i) => `${i === 0 ? pad(d) : D(d).getUTCDate() === 1 ? `<span class="cal-month">${monthName(d)}</span>${pad(d)}` : ''}<button class="day ${mine.has(d) ? 'mine' : ''} ${pref.has(d) ? 'pref' : ''} ${d === TODAY ? 'is-today' : ''}" data-day="${d}" aria-pressed="${mine.has(d)}" aria-label="${fmt(d)}${pref.has(d) ? ', best for you' : mine.has(d) ? ', works' : ''}">${D(d).getUTCDate()}${pref.has(d) ? '<i class="star" aria-hidden="true">★</i>' : ''}</button>`);
  return `<div class="cal">${days.length ? `<span class="cal-month first">${monthName(days[0])}</span>` : ''}${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<span class="dow">${x}</span>`).join('')}${cells.join('')}</div>`;
}
function setupView() {
  const steps = setupSteps(), i = Math.min(S.setup.step, steps.length - 1), k = steps[i], m = meDoc(), last = i === steps.length - 1;
  const nDays = (m.days || []).length, mq = m.quiz || {};
  const step = {
    days: { h: isSmall() ? 'Which days work for you?' : 'When are you free?',
      p: `Tap every ${isSmall() ? 'day' : 'day you could be away'} between ${short(S.trip.winStart)} and ${short(S.trip.winEnd)}. Tap twice for the ones that are best for you ★.`,
      c: `<div class="row" style="gap:6px"><button class="btn sm" data-act="allDays">All of them</button><button class="btn sm" data-act="weekends">Fri–Sun</button><button class="btn sm ghost" data-act="noDays">Clear</button></div>
        ${dayPicker()}<span class="small muted">${nDays ? `${nDays} day${nDays === 1 ? '' : 's'} picked` : 'Nothing picked yet'}</span>` },
    home: { h: size() === 'trip' ? 'Where are you flying from?' : 'Where are you coming from?',
      p: size() === 'trip' ? 'Your home airport or city. It’s used for flight prices and to pitch places that are easy for everyone to reach.' : 'Your city or neighborhood, so pitches stay within reach for everyone.',
      c: `<input id="me-home" aria-label="${size() === 'trip' ? 'Home airport or city' : 'Your city or neighborhood'}" class="big-input" maxlength="40" value="${esc(m.home || '')}" placeholder="${size() === 'trip' ? 'JFK or New York' : 'Brooklyn'}" autocomplete="address-level2" enterkeyhint="next">` },
    budget: { h: 'What’s your max?',
      p: isSmall() ? 'The most you’d spend on this, all in. Pitches stay under the lowest budget in the crew.' : 'The most you’d spend in total, travel included. Pitches stay under the lowest budget in the crew.',
      c: `<div class="row" style="gap:6px">${BUDGETS[size()].map(u => niceIn(u)).map(v => `<button class="chip big-chip ${+m.budget === v ? 'on' : ''}" data-budget="${v}">${money(v)}</button>`).join('')}</div>
        <label class="field"><span class="label">Or type it (${cur()})</span><input id="me-budget" class="big-input" type="number" min="0" step="${isSmall() ? 5 : 50}" inputmode="numeric" value="${m.budget ? esc(m.budget) : ''}" placeholder="${niceIn(BUDGETS[size()][1])}" enterkeyhint="next"></label>` },
    vibe: { h: 'Quick vibe check',
      p: 'A few taps. It shapes what the AI pitches and the crew’s vibe.',
      c: QUIZ.map(q => `<div class="q"><span class="small"><b>${esc(q.q)}</b></span><div class="row" style="gap:6px">${q.o.map(o => `<button class="chip ${mq[q.k] === o ? 'on' : ''}" data-quiz="${q.k}|${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`).join('') },
  }[k];
  return `${topBar()}
  <section class="setup">
    <div class="setup-top"><span class="label">${esc(S.trip.name)} · Step ${i + 1} of ${steps.length}</span><button class="linkbtn small muted" data-act="setupLater">Do this later</button></div>
    <div class="setup-prog" aria-hidden="true">${steps.map((s, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div>
    <h1>${step.h}</h1>
    <p class="muted">${step.p}</p>
    <div class="stack setup-body">${step.c}</div>
  </section>
  <div class="setup-nav"><div class="setup-nav-in">
    ${i ? '<button class="btn ghost big" data-act="setupBack">Back</button>' : ''}<span style="flex:1"></span>
    <button class="btn primary big" data-act="setupNext">${last ? 'Done' : 'Next'}</button>
  </div></div>`;
}
function setupSave() {
  const h = $('#me-home'), b = $('#me-budget');
  if (h) saveMe({ home: h.value.trim().slice(0, 40) }, true, true);
  if (b && b.value !== '') saveMe({ budget: Math.max(0, Math.round(+b.value || 0)) }, true, true);
  delete DRAFT['me-home']; delete DRAFT['me-budget'];
}
function setupGo(dir) {
  setupSave();
  const n = setupSteps().length, next = S.setup.step + dir;
  if (next >= n) { S.setup = null; S.tab = 'overview'; flash(`You’re all set. Here’s the ${planWord()}.`); }
  else S.setup.step = Math.max(0, next);
  render(); window.scrollTo({ top: 0 });
}
function startSetup() {
  if (S.demo || S.readOnly) return;
  S.setup = { step: 0 }; render(); window.scrollTo({ top: 0 });
}

/* ---------- invites ---------- */
// Phones get the native share sheet (Messages, WhatsApp, Instagram…). Desktop, or a
// browser that blocks sharing, copies the message instead.
async function sendInvite(text, url, title) {
  const phone = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && innerWidth < 820);
  if (navigator.share && phone) {
    try { await navigator.share({ title, text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  return copy(`${text}\n${url}`);
}
const noSignup = () => IN_CLAUDE ? '' : ' No app, no sign-up.';
function inviteText(t) {
  const w = SIZES[sizeOf(t)].label.toLowerCase(), when = t.lockedDates ? planWhen(t) : '';
  return `Join our ${w}: ${t.name}${when ? ` (${when})` : ''}. Tap the link and say if you’re in.${noSignup()}`;
}
const crewInviteText = c => `Join ${c?.name || 'our crew'} on Outta Here. It’s where we plan everything, from Friday dinners to trips.${noSignup()}`;
async function joinCrewQuiet(cid) {
  const c = S.crews.find(x => x.id === cid);
  if (!S.db || S.demo || !cid || (c && crewMembers(c).includes(S.uid))) return;
  try { await S.db.doc('crews/' + cid).update({ people: { [S.uid]: true }, profiles: { [S.uid]: { nick: S.myName || 'Someone' } } }); } catch {}
}
// First thing someone sees when they open an invite: what it is, who's in, and one tap to answer.
function welcomeCard() {
  const t = S.trip, host = S.members.find(m => m.id === t.createdBy), ins = S.members.filter(going);
  const crew = S.crews.find(c => c.id === t.crewId), ds = dest(), sz = SIZES[size()];
  const when = t.lockedDates ? planWhen(t) : `Picking ${isSmall() ? 'a day' : 'dates'} together`;
  return `<section class="card welcome" style="--pc:${sz.color}">
    <span class="label">${host ? `${esc(host.nick || 'A friend')} invited you` : 'You’re invited'}</span>
    <h1>${esc(t.name)}</h1>
    <p class="muted">${esc(sz.label)}${crew ? ' with ' + esc(crew.name) : ''} · ${esc(when)}${ds ? ' · ' + esc(ds.city) : ''}</p>
    ${ins.length ? `<div class="row" style="gap:8px;align-items:center"><div class="avs">${ins.slice(0, 7).map(m => `<span class="av-sm" style="background:${colorFor(m.id)}" title="${esc(m.nick || 'Someone')}">${esc((m.nick || '?')[0].toUpperCase())}</span>`).join('')}</div><span class="small muted">${ins.length} in so far</span></div>` : ''}
    ${S.trip.rsvpBy && TODAY <= S.trip.rsvpBy ? `<span class="small"><b>Answer by ${fmt(S.trip.rsvpBy)}</b> so the crew knows how many to plan for.</span>` : ''}
    <div class="welcome-acts"><button class="btn primary big" data-join="in">I’m in</button><button class="btn big" data-join="maybe">Maybe</button><button class="btn ghost big" data-join="out">Can’t make it</button></div>
    ${t.crewId ? `<span class="small muted">Saying you’re in also adds you to ${crew ? esc(crew.name) : 'the crew'}, so you’re part of their next plans too.</span>` : ''}
  </section>`;
}
function joinPlan(status) {
  saveMe({ status, seen: true }, true);
  if (status !== 'out') { joinCrewQuiet(S.trip.crewId); startSetup(); }
  flash(status === 'in' ? 'You’re in. A few quick questions first.' : status === 'maybe' ? 'Marked as maybe. A few quick questions so the plan fits you too.' : 'Got it. The crew will see you can’t make it.');
}

/* ---------- plan match: learning and settling disagreements ---------- */
const pName = p => p.small ? p.title : p.city;
const yesOf = p => active().filter(m => swipeOf(p.id, m.id) === 1).length;
function swipeSummary() {
  const vs = active();
  return (S.trip.pitches?.items || []).map(p => ({ n: pName(p), y: yesOf(p), w: workableOf(p), x: vs.filter(m => swipeOf(p.id, m.id) === -1).length })).filter(h => h.y || h.w || h.x);
}
const nextHistory = () => [...swipeSummary(), ...(S.trip.pitchHistory || [])].slice(0, 16);
// What the AI should learn before pitching again: the crew's own request, how they swiped, what they've done before.
function pitchMemory() {
  const t = S.trip, hist = nextHistory(), lines = [];
  const past = S.trips.filter(x => x.id !== S.tid && t.crewId && x.crewId === t.crewId && x.lockedDest).map(x => (x.destinations || []).find(d => d.id === x.lockedDest)?.city || x.name).slice(0, 8);
  if (t.pitchNote) lines.push(`The crew asked for: "${t.pitchNote}". Treat this as a requirement.`);
  if (hist.length) lines.push(`How the crew (${active().length} people) swiped on earlier pitches. Lean toward what got yeses, steer away from what most people passed on, and don't repeat any of these:\n${hist.map(h => `- ${h.n}: ${h.y} yes, ${h.w || 0} could work, ${h.x} pass`).join('\n')}`);
  if (t.crewId) { const dna = dnaText(t.crewId); if (dna) lines.push(dna); }
  if (past.length) lines.push(`Plans this crew already locked before: ${past.join(', ')}. Don't repeat them; use them as a hint about their taste.`);
  return lines.join('\n');
}
function takeNote() {
  const el = $('#pitch-note'); if (!el) return;
  const note = el.value.trim().slice(0, 120);
  if (note !== (S.trip.pitchNote || '')) saveTrip({ pitchNote: note });
}
function steerField() {
  if (S.sample === null || S.readOnly) return '';
  const hist = nextHistory().length;
  return `<div class="steer"><label class="field"><span class="label">Steer the pitches (optional)</span><input id="pitch-note" maxlength="120" value="${esc(S.trip.pitchNote || '')}" placeholder="${isSmall() ? 'Cheap, near the L train, no karaoke' : 'Somewhere warm, no red-eyes, under $800'}"></label>
    ${hist ? `<span class="small muted">New pitches learn from how you swiped on the last ${hist === 1 ? 'one' : hist}.</span>` : ''}</div>`;
}
function runoffState() {
  const r = S.trip.runoff; if (!r || !r.key) return null;
  const items = S.trip.pitches?.items || [], ps = (r.ids || []).map(id => items.find(x => x.id === id)).filter(Boolean);
  if (ps.length < 2) return null;
  const vs = active(), votes = (S.trip.roVotes || {})[r.key] || {};
  const count = id => vs.filter(m => votes[m.id] === id).length, waiting = vs.filter(m => !votes[m.id]);
  const ranked = [...ps].sort((a, b) => count(b.id) - count(a.id) || fitScore(b) - fitScore(a) || (b.vibeMatch || 0) - (a.vibeMatch || 0));
  const winner = !waiting.length || count(ranked[0].id) > vs.length / 2 ? ranked[0] : null;
  return { key: r.key, ps, count, waiting, winner, mine: votes[S.uid] };
}
const lockedOn = p => S.trip.lockedDest && dest()?.city === p.city && S.trip.lockedDates?.start === p.start;
function runoffCard() {
  const ro = runoffState(); if (!ro) return '';
  const other = ro.winner && ro.ps.find(p => p !== ro.winner);
  return `<section class="card runoff stack">
    <div class="row" style="justify-content:space-between"><span class="label" style="color:var(--accent)">Final vote</span>${S.readOnly ? '' : '<button class="linkbtn small muted" data-act="endRunoff">Cancel</button>'}</div>
    <h2>${ro.winner ? `${esc(pName(ro.winner))} wins` : 'Pick one'}</h2>
    <p class="small muted">${ro.winner ? `${ro.count(ro.winner.id)} to ${ro.count(other.id)}.` : 'Nothing got a yes from everyone, so the top two go head to head. Most votes wins.'}</p>
    <div class="ro-opts">${ro.ps.map(p => `<button class="ro-opt ${ro.mine === p.id ? 'on' : ''} ${ro.winner === p ? 'win' : ''}" data-runoff="${esc(p.id)}" aria-pressed="${ro.mine === p.id}" ${ro.winner || S.readOnly ? 'disabled' : ''}>
      <b>${esc(pName(p))}</b><span class="small">${p.start === p.end ? fmt(p.start) + (p.time ? ' · ' + t12(p.time) : '') : short(p.start) + ' – ' + short(p.end)} · ${esc(p.perPerson || '?')}</span>
      <span class="ro-count">${ro.count(p.id)} vote${ro.count(p.id) === 1 ? '' : 's'}${ro.mine === p.id ? ' · yours' : ''}</span></button>`).join('')}</div>
    ${ro.winner ? (lockedOn(ro.winner) ? '<span class="pill in" style="align-self:flex-start">Locked in</span>' : `<div><button class="btn primary" data-lockpitch="${esc(ro.winner.id)}">Lock in ${esc(pName(ro.winner))}</button></div>`)
      : `<span class="small muted">${ro.mine ? 'Waiting on ' + ro.waiting.map(m => esc(m.nick || 'Someone')).join(', ') : 'Tap the one you’d rather do.'}</span>`}
  </section>`;
}
// Everyone has swiped and nothing got a yes from all of them: show the closest pick and ways out.
function settleCard(items) {
  const vs = active(), n = vs.length;
  const waiting = vs.filter(m => items.some(p => !swipeOf(p.id, m.id)));
  if (waiting.length) return `<div class="empty"><b>You’ve swiped them all.</b><span>Waiting on ${waiting.map(m => esc(m.nick || 'Someone')).join(', ')}. Results are below, and you can lock one in any time.</span>${S.readOnly ? '' : '<button class="btn sm" data-act="nudgeSwipe">Nudge them</button>'}</div>`;
  if (runoffState()) return '';
  const ranked = [...items].sort((a, b) => fitScore(b) - fitScore(a) || (b.vibeMatch || 0) - (a.vibeMatch || 0)), top = ranked[0], y = yesOf(top);
  const second = ranked[1] && fitScore(ranked[1]) ? ranked[1] : null, liveWith = items.filter(okForAll).sort((a, b) => fitScore(b) - fitScore(a))[0];
  if (liveWith) return `<section class="card settle stack"><span class="label">No perfect match, but</span><h2>Everyone can live with ${esc(pName(liveWith))}</h2>
    <p class="small muted">${yesOf(liveWith)} said yes and the rest said it could work. Nobody passed.</p>${fitChips(liveWith)}
    <div class="row" style="gap:6px"><button class="btn primary" data-lockpitch="${esc(liveWith.id)}">Go with ${esc(pName(liveWith))}</button>${second ? '<button class="btn" data-act="startRunoff">Final vote: top two</button>' : ''}</div></section>`;
  if (!fitScore(top)) return `<section class="card settle stack"><h2>Nobody loved these</h2><p class="small muted">Every pitch got passed. Say what you want in “Steer the pitches” and get a new round. It learns from what you passed on.</p>
    ${S.sample ? `<div><button class="btn primary" data-act="genPitches">Pitch a new round</button></div>` : ''}</section>`;
  const passers = vs.filter(m => swipeOf(top.id, m.id) === -1);
  return `<section class="card settle stack">
    <span class="label">No perfect match</span>
    <h2>Closest: ${esc(pName(top))}</h2>
    <p class="small muted">${y} of ${n} said yes${workableOf(top) ? `, ${workableOf(top)} said it could work` : ''}${passers.length ? `. ${passers.map(m => esc(m.nick || 'Someone')).join(', ')} passed` : ''}.${second ? ` Runner-up: ${esc(pName(second))}.` : ''}</p>
    ${fitChips(top)}
    <div class="row" style="gap:6px">
      ${y > n / 2 && ruleCheck(optOf('pitch', top.id)).ok ? `<button class="btn primary" data-lockpitch="${esc(top.id)}">Go with ${esc(pName(top))} (majority)</button>` : ''}
      ${second ? `<button class="btn ${y > n / 2 && ruleCheck(optOf('pitch', top.id)).ok ? '' : 'primary'}" data-act="startRunoff">Final vote: top two</button>` : ''}
      ${S.sample ? '<button class="btn ghost" data-act="genPitches">Pitch a new round</button>' : ''}
    </div>
  </section>`;
}
function startRunoff() {
  const items = S.trip.pitches?.items || [], ranked = [...items].sort((a, b) => fitScore(b) - fitScore(a) || (b.vibeMatch || 0) - (a.vibeMatch || 0));
  if (ranked.length < 2) return;
  saveTrip({ runoff: { key: rid(6), ids: [ranked[0].id, ranked[1].id], by: S.uid, at: Date.now() } });
  flash('Final vote started. Everyone picks one of the top two.');
}

/* ---------- group fit: evidence, not a score ---------- */
// For any option: does it fit people's budgets, can they make the dates, and how did
// they rate it. Shown as plain facts so the trade-offs are visible.
const WORKABLE = 0.5;
const workableOf = p => active().filter(m => swipeOf(p.id, m.id) === WORKABLE).length;
const rated = p => active().filter(m => swipeOf(p.id, m.id));
const okForAll = p => { const vs = active(); return vs.length >= 2 && vs.every(m => swipeOf(p.id, m.id) >= WORKABLE); };
const fitScore = p => yesOf(p) * 2 + workableOf(p);
function groupFit(p) {
  const vs = active(), out = [], r = moneyRange(p.perPerson);
  const nB = vs.filter(m => +m.budget > 0 || m.budgetSet).length, f = r && nB ? (p.id && (S.trip.pitches?.items || []).some(x => x.id === p.id) ? bq({ pitch: p.id }) || NO_FIT : budgetFit({ low: r[0], high: r[1] })) : null;
  if (f && f.pending) out.push({ ok: 'meh', text: 'Checking budgets…' });
  else if (f && f.n) {
    const { over, stretch } = f;
    out.push(over.length ? { ok: false, text: `Over budget for ${budgetWho(over)}` } : stretch.length ? { ok: 'meh', text: `A stretch for ${budgetWho(stretch)}` } : { ok: true, text: f.n === vs.length ? `Fits ${vs.length}/${vs.length} budgets` : `Fits every budget set (${f.n} of ${vs.length})` });
  } else out.push({ ok: 'meh', text: nB ? 'No price to check yet' : 'Nobody set a budget yet' });
  const days = span(p.start, p.end), can = vs.filter(m => fitOf(m, days)), cant = vs.filter(m => !fitOf(m, days)), picked = vs.filter(m => (m.days || []).length);
  if (picked.length) out.push(cant.filter(m => (m.days || []).length).length ? { ok: false, text: `${listNames(cant.filter(m => (m.days || []).length))} can’t make ${p.start === p.end ? 'that day' : 'those dates'}` } : { ok: true, text: `Free: ${can.length}/${vs.length}` });
  const rs = rated(p);
  if (rs.length) {
    const no = rs.filter(m => swipeOf(p.id, m.id) === -1);
    out.push(okForAll(p) ? { ok: true, text: yesOf(p) === vs.length ? 'Everyone said yes' : 'Everyone rated it at least workable' } : no.length ? { ok: false, text: `${listNames(no)} passed` } : { ok: 'meh', text: `${yesOf(p)} yes · ${workableOf(p)} could work` });
  }
  return out;
}
const fitChips = p => `<div class="fit">${groupFit(p).map(f => `<span class="fit-c ${f.ok === true ? 'y' : f.ok === false ? 'n' : 'm'}">${f.ok === true ? '✓' : f.ok === false ? '✕' : '~'} ${esc(f.text)}</span>`).join('')}</div>`;

/* ---------- trip match (swipe) ---------- */
const GRADS = [['#FF4FA3', '#7048E8'], ['#FF8A3D', '#D41C78'], ['#12B5A6', '#3B5BDB'], ['#F2B32B', '#E8590C'], ['#7048E8', '#1098AD'], ['#E5484D', '#7A1FA2']];
const hashStr = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const swipeOf = (pid, uid) => ((S.trip.swipes || {})[pid] || {})[uid] || 0;
function matchedPitch() {
  const p = S.trip.pitches?.items || [], vs = active();
  if (vs.length < 2) return null;
  return p.find(x => vs.every(m => swipeOf(x.id, m.id) === 1)) || null;
}
function dateOptions() {
  const t = S.trip, len = nightsSet(t) + 1, days = span(t.winStart, t.winEnd), ms = active(), out = [];
  for (let i = 0; i + len <= days.length; i++) {
    const d = days.slice(i, i + len), ok = ms.filter(m => fitOf(m, d)).length;
    out.push({ start: d[0], end: d[len - 1], ok });
  }
  out.sort((a, b) => b.ok - a.ok || (a.start < b.start ? -1 : 1));
  const picked = [];
  for (const w of out) { if (picked.every(p => Math.abs(D(p.start) - D(w.start)) >= 3 * 864e5)) picked.push(w); if (picked.length === 4) break; }
  return picked;
}
function genPitches() {
  takeNote();
  if (isSmall()) return genPlanPitches();
  const opts = dateOptions(); if (!opts.length) { flash('Set a date window first.'); return; }
  const b = budgetCap();
  const prompt = `You're pitching ${size() === 'weekend' ? 'weekend getaways (1–2 nights, ideally a few hours’ drive or a short flight away)' : 'group trips'} to a friend group. They will each swipe yes or no on every pitch, like a dating app, so make each pitch exciting, specific and honest.
Trip type: ${mode().label}. ${mode().ai}
Crew: ${active().length} people ${size() === 'trip' ? 'flying' : 'coming'} from ${homes().join(', ') || 'unknown cities'}.
Per-person budget cap (all-in, flights included): ${b ? `${b.label}. That's the range the tightest budget in the crew falls in; keep every pitch at or under ${money(b.cap)}` : 'not set, assume moderate'}.
Trip length: ${nightsSet(S.trip)} nights.
${blend() ? 'Crew vibe quiz:\n' + blendText() : 'Vibe: fun, social, nightlife'}
Destinations already suggested by the crew: ${(S.trip.destinations || []).map(d => d.city).join(', ') || 'none'}
${pitchMemory()}
Date options (each pitch must use one of these exactly):
${opts.map((o, i) => `${i + 1}) ${o.start} to ${o.end} (${o.ok}/${active().length} free)`).join('\n')}

Give 6 pitches with 6 different destinations: include the crew's suggestions that fit, plus fresh ideas that fit the budget from those home cities. Every pitch must work for the lowest budget in the crew. Make them genuinely different from each other so the swipes tell us something. Prefer the date options most people can make. Be realistic about prices.
Reply with only JSON: {"pitches":[{"city":"","code":"IATA airport code","start":"YYYY-MM-DD","end":"YYYY-MM-DD","tagline":"punchy, 4-9 words","why":"1-2 sentences on why THIS crew would love it","perPerson":"$650–800 all-in","vibeMatch":87,"highlights":["3 short, specific highlights"],"weather":"short"}]}`;
  askAI('pitch', prompt, data => {
    const valid = new Map(opts.map(o => [o.start, o]));
    const items = (Array.isArray(data?.pitches) ? data.pitches : []).filter(p => p && p.city).slice(0, 8).map(p => {
      const o = valid.get(p.start) || opts[0];
      return { id: rid(6), city: String(p.city).slice(0, 40), code: isCode(p.code) ? p.code.toUpperCase() : '', start: o.start, end: o.end,
        tagline: String(p.tagline || '').slice(0, 80), why: String(p.why || '').slice(0, 300), perPerson: String(p.perPerson || '').slice(0, 30),
        vibeMatch: Math.max(0, Math.min(100, Math.round(+p.vibeMatch || 0))), highlights: arr(p.highlights).slice(0, 3).map(h => String(h).slice(0, 80)), weather: String(p.weather || '').slice(0, 60) };
    });
    if (!items.length) { flash('No pitches came back. Try again.'); return; }
    return saveTrip({ pitches: { items, at: Date.now() }, pitchHistory: nextHistory(), runoff: null });
  });
}
async function swipe(pid, v) {
  await saveTrip({ swipes: { [pid]: { [S.uid]: v } } });
  const m = matchedPitch();
  if (m && v === 1 && m.id === pid) flash(`It’s a match! Everyone’s down for ${m.city}.`);
}
function lockPitch(pid) {
  const p = (S.trip.pitches?.items || []).find(x => x.id === pid); if (!p) return;
  if (p.small) return lockSmallPitch(p);
  const ds = [...(S.trip.destinations || [])];
  let d = ds.find(x => x.city.toLowerCase() === p.city.toLowerCase());
  if (!d) { d = { id: rid(6), city: p.city, code: p.code }; ds.push(d); }
  saveTrip(withLog({ destinations: ds, lockedDest: d.id, lockedDates: { start: p.start, end: p.end } }, { area: 'dest', text: `Locked in: ${p.city}, ${dayRange(p.start, p.end)}`, act: 'all', undo: { k: 'set', patch: { lockedDest: S.trip.lockedDest || null, lockedDates: S.trip.lockedDates || null } } }));
  flash(`Locked: ${p.city}, ${short(p.start)} – ${short(p.end)}. Time to book flights.`);
}
// Once a place is locked, lead with it and the next step; the votes and other options
// are one tap away instead of competing for attention.
function matchTab() {
  if (!S.trip.lockedDest || S.demo) return matchBody();
  const ds = dest(), d = S.trip.lockedDates, p = (S.trip.pitches?.items || []).find(lockedOn);
  return `<section class="card stack decided-sum"><div class="row" style="justify-content:space-between"><span class="on-pill">Decided</span>${S.readOnly ? '' : '<button class="btn sm ghost" data-act="unlockDest">Change it</button>'}</div>
    <h2>${esc(ds?.city || '')}</h2><span class="small muted">${[d && dayRange(d.start, d.end), p && p.perPerson && p.perPerson + ' each', p && p.tagline].filter(Boolean).map(esc).join(' · ')}</span></section>
  <details class="card more-opts"><summary>See the votes and other options</summary><div class="stack" style="margin-top:12px">${matchBody()}</div></details>`;
}
function matchBody() {
  const items = S.trip.pitches?.items || [], vs = active(), m = matchedPitch();
  const next = items.find(x => !swipeOf(x.id, S.uid));
  const pitchCard = p => { const [c1, c2] = GRADS[hashStr(p.city) % GRADS.length];
    return `<article class="pitch" id="pitch" data-key="pitch-${esc(p.id)}" data-pid="${esc(p.id)}">
      <span class="stamp yes" id="stamp-yes">I'D GO</span><span class="stamp no" id="stamp-no">PASS</span>
      <div class="pitch-top" style="background:linear-gradient(135deg,${c1},${c2})">
        <span class="label" style="color:rgba(255,255,255,.8)">${items.indexOf(p) + 1} of ${items.length}</span>
        ${p.small ? `<h2 style="color:#fff;font-size:34px">${esc(p.title)}</h2>${p.where ? `<span style="color:rgba(255,255,255,.85)">${esc(p.where)}</span>` : ''}` : `<span class="code" style="color:#fff">${esc(p.code || p.city.slice(0, 3).toUpperCase())}</span>
        <h2 style="color:#fff">${esc(p.city)}</h2>`}
        <span style="color:#fff;font-weight:600">${esc(p.tagline)}</span>
      </div>
      <div class="pitch-body">
        <div class="facts"><div><span class="label">${p.small ? 'When' : 'Dates'}</span><b>${p.small ? fmt(p.start) + (p.time ? ' · ' + t12(p.time) : '') : short(p.start) + ' → ' + short(p.end)}</b></div><div><span class="label">Per person</span><b>${esc(p.perPerson || '?')}</b></div></div>
        ${fitChips(p)}
        <p>${esc(p.why)}</p>
        ${arr(p.highlights).length || p.weather ? `<details class="p-more"><summary class="small">See details</summary>${p.weather ? `<p class="small" style="margin:6px 0 0"><b>Weather:</b> ${esc(p.weather)}</p>` : ''}${arr(p.highlights).length ? `<ul style="margin:6px 0 0;padding-left:18px">${arr(p.highlights).map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</details>` : ''}
      </div>
    </article>`; };
  return `${S.sample === null ? whereTab() : ''}<section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px"><h2>${isSmall() ? 'Plan Match' : 'Trip Match'}</h2><span class="small muted">The AI pitches ${isSmall() ? 'whole plans' : 'complete trips'} that fit everyone’s budget, free days and vibe. Everyone swipes. If you all say yes to the same one, it’s a match. Not feeling them? Add your own picks below.</span></div>
      ${S.sample !== null ? `<button class="btn ${items.length ? '' : 'primary'}" data-act="genPitches" ${S.busy.pitch ? 'disabled' : ''}>${S.busy.pitch ? '<i class="spin"></i>Pitching…' : items.length ? 'New pitches' : isSmall() ? 'Pitch us some plans' : 'Pitch us some trips'}</button>` : ''}</div>
    ${steerField()}
    ${S.demo ? '' : ruleLine()}
    ${(() => { const c = S.crews.find(x => x.id === S.trip.crewId); return c && !S.demo ? dnaCard(c, true) : ''; })()}
  </section>
  ${runoffCard()}
  ${m ? `<section class="match"><span class="label" style="color:rgba(255,255,255,.85)">Everyone swiped yes</span><h1 style="color:#fff">It’s a match!</h1>
      <p style="font-size:17px">${esc(m.city)} · ${dayRange(m.start, m.end)}${m.time ? ' · ' + t12(m.time) : ''} · ${esc(m.perPerson)}</p>
      <div>${S.trip.lockedDest && dest()?.city === m.city && S.trip.lockedDates?.start === m.start ? `<span class="on-pill" style="background:#fff;color:#151A33">Locked in</span>` : `<button class="btn" data-lockpitch="${esc(m.id)}">Lock it in</button>`}</div></section>` : ''}
  ${!items.length && S.sample === null ? ''
  : !items.length ? `<div class="empty"><b>No pitches yet.</b><span>The more the crew fills in (${size() === 'trip' ? 'home airports, ' : size() === 'weekend' ? 'where everyone’s coming from, ' : ''}budgets, free days, the vibe quiz), the better the pitches get.</span></div>`
  : next ? `<section class="stack" style="align-items:center">${pitchCard(next)}
      <div class="row" style="justify-content:center;gap:22px"><button class="swipe-btn no" data-swipe="${esc(next.id)}|-1" aria-label="Pass">✕</button><button class="swipe-btn meh" data-swipe="${esc(next.id)}|0.5" aria-label="Could work">≈</button><button class="swipe-btn yes" data-swipe="${esc(next.id)}|1" aria-label="I'd go">♥</button></div>
      <span class="small muted">Swipe right if you’re in, left to pass. ≈ means it could work.</span></section>`
  : !m && active().length >= 2 ? settleCard(items) : `<div class="empty"><b>You’ve swiped them all.</b><span>Pick one from the scoreboard below and lock it in.</span></div>`}
  ${items.length ? `<section class="card"><h3 style="margin-bottom:6px">Scoreboard</h3>
    ${[...items].sort((a, b) => fitScore(b) - fitScore(a)).map(p => {
      const yes = vs.filter(x => swipeOf(p.id, x.id) === 1), waiting = vs.filter(x => !swipeOf(p.id, x.id)), mine = swipeOf(p.id, S.uid);
      return `<div class="linkrow"><div style="min-width:0"><b>${esc(p.city)}</b> <span class="small muted">${p.start === p.end ? short(p.start) : short(p.start) + ' – ' + short(p.end)} · ${esc(p.perPerson)}</span>
        <div class="small muted">${yes.length} yes · ${workableOf(p)} could work${waiting.length ? ` · waiting on ${waiting.map(x => esc(x.nick || 'Someone')).join(', ')}` : ''}</div>${fitChips(p)}${lockedOn(p) ? '' : ruleChip('pitch', p.id)}</div>
        <div class="row" style="gap:6px">${mine ? `<button class="chip ${mine === 1 ? 'on' : ''}" data-swipe="${esc(p.id)}|${mine === 1 ? -1 : 1}" title="Tap to change">${mine === 1 ? '♥ Yes' : mine === WORKABLE ? '≈ Could work' : '✕ Pass'}</button>` : ''}<div class="bar" style="width:80px"><i style="width:${yes.length / Math.max(1, vs.length) * 100}%"></i></div>${lockedOn(p) ? '<span class="pill lvl-confirmed">Locked</span>' : S.readOnly ? '' : `<button class="btn sm ${yes.length && !S.trip.lockedDest ? 'primary' : ''}" data-lockpitch="${esc(p.id)}">Lock it in</button>`}</div></div>`; }).join('')}
  </section>` : ''}
  ${S.sample === null ? '' : whereTab()}`;
}
function bindSwipe() {
  const el = document.getElementById('pitch'); if (!el || el._swipe) return; el._swipe = true;
  let x0 = null, dx = 0;
  const yes = document.getElementById('stamp-yes'), no = document.getElementById('stamp-no');
  el.addEventListener('pointerdown', e => { if (e.button || e.target.closest('summary,details')) return; x0 = e.clientX; dx = 0; el.classList.add('dragging'); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (x0 === null) return; dx = e.clientX - x0; el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; yes.style.opacity = Math.max(0, Math.min(1, dx / 100)); no.style.opacity = Math.max(0, Math.min(1, -dx / 100)); });
  const end = () => {
    if (x0 === null) return; x0 = null; el.classList.remove('dragging');
    if (Math.abs(dx) > 100) { el.style.transform = `translateX(${dx > 0 ? 600 : -600}px) rotate(${dx > 0 ? 30 : -30}deg)`; const pid = el.dataset.pid; setTimeout(() => swipe(pid, dx > 0 ? 1 : -1), 180); }
    else { el.style.transform = ''; yes.style.opacity = 0; no.style.opacity = 0; }
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

/* ---------- arrival board ---------- */
const tFmt = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const dFmt = s => s ? fmt(s.slice(0, 10)) : '';
function rides(list) {
  const by = {}; for (const m of list) (by[(m.arrAirport || '').toUpperCase() || '?'] ||= []).push(m);
  const out = [];
  for (const [apt, ms] of Object.entries(by)) {
    ms.sort((a, b) => a.arrive < b.arrive ? -1 : 1);
    let g = [];
    for (const m of ms) {
      if (g.length && (new Date(m.arrive) - new Date(g[0].arrive)) / 6e4 > 60) { if (g.length > 1) out.push({ apt, g }); g = []; }
      g.push(m);
    }
    if (g.length > 1) out.push({ apt, g });
  }
  return out;
}
function arrivalsSection(compact) {
  const ds = dest(), me = meDoc() || {}, list = active().filter(m => m.arrive).sort((a, b) => a.arrive < b.arrive ? -1 : 1);
  const tk = S.trip.tickets || {}, missing = active().filter(m => !m.arrive);
  const rs = rides(list);
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Arrival board</h2><span class="small muted">${list.length}/${active().length} posted</span></div>
    ${list.length ? `<div class="board"><div class="board-row head"><span>Lands</span><span>Who</span><span>Flight</span><span>At</span></div>
      ${list.map(m => `<div class="board-row"><span class="t">${tFmt(m.arrive)}<br><small>${dFmt(m.arrive)}</small></span><span>${esc(m.nick || 'Someone')}</span><span>${esc(m.flight || tk[m.id]?.flight || '—')}</span><span>${esc((m.arrAirport || '').toUpperCase() || '—')}</span></div>`).join('')}</div>` : `<p class="small muted">Nobody has posted when they land yet.</p>`}
    ${rs.length ? `<div><span class="label">Share a ride from the airport</span>${rs.map(r => { const wait = Math.round((new Date(r.g[r.g.length - 1].arrive) - new Date(r.g[0].arrive)) / 6e4);
      return `<div class="linkrow"><span><b>${r.g.map(m => esc(m.nick || 'Someone')).join(' + ')}</b> at ${esc(r.apt)}</span><span class="small muted">${tFmt(r.g[0].arrive)}–${tFmt(r.g[r.g.length - 1].arrive)}${wait ? ` · first one waits ${wait} min` : ''}</span></div>`; }).join('')}</div>` : ''}
    ${!compact && missing.length && list.length ? `<span class="small muted">Still missing: ${missing.map(m => esc(m.nick || 'Someone')).join(', ')}</span>` : ''}
    ${!compact && meDoc() ? `<form id="arrForm" class="row" style="align-items:flex-end;border-top:1px solid var(--line);padding-top:12px">
      <label class="field"><span class="label">You land</span><input id="arr-time" type="datetime-local" value="${esc(me.arrive || (dates() ? dates().start + 'T15:00' : ''))}"></label>
      <label class="field" style="flex:0 1 100px"><span class="label">Airport</span><input id="arr-apt" maxlength="3" value="${esc(me.arrAirport || ds?.code || '')}" placeholder="LAS"></label>
      <label class="field" style="flex:0 1 120px"><span class="label">Flight</span><input id="arr-flight" maxlength="20" value="${esc(me.flight || tk[S.uid]?.flight || '')}" placeholder="B6 1123"></label>
      <button class="btn primary" type="submit">${me.arrive ? 'Update' : 'Post'}</button></form>` : ''}
  </section>`;
}

/* ---------- live trip mode ---------- */
const CHECKINS = ['At the hotel', 'At the pool', 'Getting food', 'Out out', 'Heading back', 'Asleep'];
function ago(at) { const m = Math.round((Date.now() - at) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; }
// live only once the dates are actually locked, never from a best guess
const isLive = () => { const L = S.trip?.lockedDates; return !!L && TODAY >= L.start && TODAY <= L.end; };
function liveTab() {
  const d = dates(); if (!d) return needDestDates('Live mode', 'dates');
  const live = isLive(), days = span(d.start, d.end);
  const day = live ? TODAY : d.start, idx = days.indexOf(day);
  const now = new Date().toTimeString().slice(0, 5);
  const items = visItems().filter(i => i.date === day).sort(byTime);
  const nextId = live ? (items.find(i => timeKey(i.time) >= timeKey(now)) || {}).id : items[0]?.id;
  const meet = S.trip.meet, myCi = meDoc()?.checkin;
  return `${live ? '' : `<div class="banner"><span><b>Preview.</b> Live mode switches on by itself on ${fmt(d.start)}. This is what Day 1 will look like.</span></div>`}
  <section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="row" style="gap:8px">${live ? '<i class="live-dot" aria-hidden="true"></i><span class="label">Live</span>' : ''}<h2>${days.length === 1 ? (live ? 'Today · ' : '') + fmt(day) : `Day ${idx + 1} of ${days.length} · ${fmt(day)}`}</h2></div></div>
  </section>
  ${live ? liveQuick() : ''}
  ${recapCard(day)}
  ${isSmall() ? '' : hangoverCard(day)}
  <section class="grid2">
    <div class="card stack"><h3>Today’s plan</h3>
      ${items.length ? `<div>${items.map(i => `<div class="tline ${i.id === nextId ? 'today-next' : ''}"><span class="mono small">${esc(tShow(i.time) || '—')}</span><div style="min-width:0">${i.id === nextId ? '<span class="kind">Up next</span> ' : ''}<b>${esc(i.title)}</b>${i.note ? `<div class="small muted">${esc(i.note)}</div>` : ''}</div><span></span></div>`).join('')}</div>`
        : `<p class="small muted">Nothing on the itinerary for today. <button class="btn sm ghost" data-tab="plan">Plan it</button></p>`}
    </div>
    <div class="card stack"><h3>Meet-up</h3>
      ${meet && meet.text ? `<div class="stack" style="gap:2px"><b style="font-size:18px">${esc(meet.text)}</b><span class="small muted">${meet.time ? 'at ' + esc(tShow(meet.time)) + ' · ' : ''}set by ${esc(nameOf(meet.by))} ${ago(meet.at)}</span>
        <div class="row" style="gap:6px"><a class="btn sm" href="${maps(meet.text, dest()?.city || '')}" target="_blank" rel="noopener">Map</a><button class="btn sm ghost" data-act="clearMeet">Clear</button></div></div>` : `<p class="small muted">No meet-up set.</p>`}
      <form id="meetForm" class="row" style="gap:6px;align-items:flex-end">
        <label class="field" style="flex:2 1 150px"><span class="label">Where</span><input id="meet-where" maxlength="80" placeholder="Hotel lobby"></label>
        <label class="field" style="flex:0 1 110px"><span class="label">When</span><input id="meet-time" type="time"></label>
        <button class="btn sm" type="submit">Set</button></form>
    </div>
  </section>
  <section class="card stack"><div class="row" style="justify-content:space-between"><h3>Where’s everyone</h3>${myCi ? `<span class="small muted">You: ${esc(myCi.text)} · ${ago(myCi.at)}</span>` : ''}</div>
    <div class="row" style="gap:6px">${(isSmall() ? CHECKINS_SMALL : CHECKINS).map(c => `<button class="chip ${myCi?.text === c ? 'on' : ''}" data-checkin="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <form id="ciForm" class="row" style="gap:6px"><input aria-label="Where you are" id="ci-text" maxlength="60" placeholder="Or type it: “at the bar by the pool”" style="flex:1 1 200px"><button class="btn sm" type="submit">Check in</button></form>
    <div>${active().map(m => `<div class="nudge"><b>${esc(m.nick || 'Someone')}</b><span class="small ${m.checkin ? '' : 'muted'}">${m.checkin ? (m.hideLoc && m.id !== S.uid ? 'Checked in' : esc(m.checkin.text)) + ' · ' + ago(m.checkin.at) : 'No check-in yet'}</span></div>`).join('')}</div>
  </section>
  ${mapPoints().length ? `<section class="card stack"><div class="row" style="justify-content:space-between"><h3>Map</h3><button class="btn sm ghost" data-tab="map">Full map</button></div>${mapView(300)}</section>` : ''}
  ${idx === 0 && size() === 'trip' ? arrivalsSection(true) : ''}`;
}

/* ---------- bucket list ---------- */
const PTS = { 1: 'Easy', 2: 'Bold', 3: 'Legendary' };
function bucketSection() {
  const items = [...S.bucket].sort((a, b) => (b.points || 1) - (a.points || 1) || (a.at || 0) - (b.at || 0));
  const score = {}; for (const i of items) for (const id of (i.doneBy || [])) score[id] = (score[id] || 0) + (i.points || 1);
  const board = active().map(m => ({ m, p: score[m.id] || 0 })).sort((a, b) => b.p - a.p);
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Bucket list</h2><span class="small muted">Do it, check it off, get points</span></div>
    ${board.some(x => x.p) ? `<div class="row" style="gap:8px">${board.map((x, i) => `<span class="chip ${i === 0 && x.p ? 'on' : ''}">${i === 0 && x.p ? '♛ ' : ''}${esc(x.m.nick || 'Someone')} <b class="mono">${x.p}</b></span>`).join('')}</div>` : ''}
    <div>${items.length ? items.map(i => { const done = (i.doneBy || []).includes(S.uid); return `<div class="check">
      <button class="box ${done ? 'on' : ''}" data-bkdone="${esc(i.id)}" aria-pressed="${done}" aria-label="I did ${esc(i.text)}">${done ? '✓' : ''}</button>
      <span class="txt"><b>${esc(i.text)}</b> <span class="pill ${i.points === 3 ? 'in' : 'maybe'}">${PTS[i.points] || 'Easy'} · ${i.points || 1}pt</span>
        ${(i.doneBy || []).length ? `<div class="small muted">Done by ${(i.doneBy || []).map(id => esc(nameOf(id))).join(', ')}</div>` : ''}</span>
      <button class="x" data-delbk="${esc(i.id)}" aria-label="Remove ${esc(i.text)}">×</button></div>`; }).join('') : '<p class="small muted">Add the stuff the crew wants to do: “Get on stage at karaoke”, “Watch the sunrise”, “Talk our way into VIP”.</p>'}</div>
    <form id="bkForm" class="row" style="gap:6px;align-items:flex-end">
      <label class="field" style="flex:2 1 180px"><span class="label">Add a challenge</span><input id="bk-text" maxlength="80" required placeholder="Karaoke solo"></label>
      <label class="field" style="flex:0 1 140px"><span class="label">Points</span><select id="bk-pts"><option value="1">Easy · 1</option><option value="2">Bold · 2</option><option value="3">Legendary · 3</option></select></label>
      <button class="btn" type="submit">Add</button></form>
  </section>`;
}

/* ---------- hype feed ---------- */
const HYPES = ['LET’S GOOO', 'Outfit check tonight?', 'Who’s packing already?', 'I just booked!'];
const HYPES_LIVE = ['LET’S GOOO', 'Where is everyone?', 'Who’s still up?', 'Best night yet'];
const tShow = t => /^\d{1,2}:\d{2}$/.test(t || '') ? t12(t) : t;
const linkify = t => esc(t).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
function hypeTab() {
  const cd = countdown(), ds = dest();
  const feed = [...S.feed].filter(f => !(f.secret && isHonoree())).sort((a, b) => (a.at || 0) - (b.at || 0));
  return `<section class="hype-hero"><span class="label" style="color:inherit;opacity:.8">${esc(S.trip.name)}</span>
      <h1>${cd && cd.n > 0 ? `${cd.n} day${cd.n === 1 ? '' : 's'} till ${esc(ds?.city || 'takeoff')}` : cd ? esc(cd.text) : 'Hype starts here'}</h1></section>
  <section class="card stack">
    <div class="feed" id="feed">${feed.length ? feed.map(f => `<div class="bubble ${f.by === S.uid ? 'mine' : ''} ${f.by === 'ai' ? 'ai' : ''}">${f.secret ? '<span class="secret-tag">Planners only</span><br>' : ''}${f.by !== S.uid ? `<span class="small" style="font-weight:700">${esc(nameOf(f.by))}</span><br>` : ''}${linkify(f.text)}
      <span class="small" style="opacity:.7;display:block;margin-top:2px">${ago(f.at)}${f.by === S.uid ? ` · <button class="linkbtn" data-delfeed="${esc(f.id)}">delete</button>` : ''}</span></div>`).join('') : '<p class="small muted">Drop links, outfit ideas and hype here so they don’t get buried in the group chat.</p>'}</div>
    <div class="row" style="gap:6px">${(isLive() ? HYPES_LIVE : isSmall() ? HYPES_SMALL : HYPES).map(h => `<button class="chip" data-hype="${esc(h)}">${esc(h)}</button>`).join('')}</div>
    <form id="feedForm" class="row" style="gap:6px"><input aria-label="Message to the crew" id="fd-text" maxlength="500" placeholder="Say something…" style="flex:1 1 200px" autocomplete="off"><button class="btn primary" type="submit">Send</button>
      ${honoreeMode() && !isHonoree() ? `<label class="row small" style="gap:6px;flex:1 1 100%"><input type="checkbox" id="fd-secret" style="width:auto"> Planners only (hidden from the ${esc(mode().honoree)})</label>` : ''}</form>
  </section>`;
}
function postFeed(text, secret) { text = String(text || '').trim().slice(0, 500); if (!text) return; putSub('feed', rid(10), { by: S.uid, text, at: Date.now(), ...(secret ? { secret: true } : {}) }); }

/* ---------- recap: superlatives + album ---------- */
const SUPERS = ['MVP', 'Most likely to lose their ID', 'Biggest spender', 'Best dressed', 'First to fall asleep', 'Last one standing', 'Main character', 'Most likely to miss the flight'];
function superResults() {
  const sv = S.trip.superVotes || {}, ids = new Set(S.members.map(m => m.id));
  return (isSmall() ? SUPERS_SMALL : (mode().supers || SUPERS).map(x => size() !== 'trip' && /flight/.test(x) ? 'Most likely to oversleep' : x)).map((c, i) => {
    const votes = sv['s' + i] || {}, cnt = {};
    for (const v of Object.values(votes)) if (v && ids.has(v)) cnt[v] = (cnt[v] || 0) + 1;
    const top = Math.max(0, ...Object.values(cnt));
    return { c, key: 's' + i, cnt, total: Object.values(cnt).reduce((a, b) => a + b, 0), winners: top ? Object.keys(cnt).filter(id => cnt[id] === top) : [], mine: votes[S.uid] };
  });
}
let showTimer = null;
function openShow(i) {
  S.show = i; clearInterval(showTimer);
  showTimer = setInterval(() => { if (S.show === null || S.tab !== 'recap') { clearInterval(showTimer); return; } S.show = (S.show + 1) % Math.max(1, S.photos.length); render(); }, 2800);
  render();
}
function closeShow() { S.show = null; clearInterval(showTimer); render(); }
async function uploadPhotos(files) {
  if (!S.assets || !files.length) return;
  const list = [...files].slice(0, 30), tid = S.tid; let n = 0;
  for (const f of list) {
    if (S.tid !== tid) { flash(`Stopped adding photos: you left that plan. ${n} of ${list.length} went in.`); return; }
    S.busy.photos = `${++n}/${list.length}`; render();
    if (f.size > 20 * 1024 * 1024) { flash(`${f.name} is over 20 MB, skipped.`); continue; }
    try { const r = await S.assets.upload(f); await putSub('photos', rid(10), { asset: r.id, by: S.uid, at: Date.now() }); }
    catch (e) { flash(e && e.code === 'unsupported_type' ? `${f.name} isn’t a supported image.` : 'An upload failed. Try again.'); }
  }
  S.busy.photos = null; render();
}
async function delPhoto(id) {
  const p = S.photos.find(x => x.id === id); if (!p) return;
  if (S.assets) await S.assets.delete(p.asset).catch(() => {});
  delSub('photos', id);
}
function imgPanel() {
  return `<div class="row" style="align-items:flex-end;gap:14px"><img class="cardimg" src="${S.img.url}" alt="${S.img.kind === 'awards' ? 'Trip awards card' : 'Photo collage'}">
    <div class="stack" style="gap:8px">${S.downloads ? `<button class="btn primary sm" data-act="saveImg">Save image</button>` : `<span class="small muted">Press and hold the image to save it.</span>`}<button class="btn sm ghost" data-act="closeImg">Close</button></div></div>`;
}
function setImg(kind, canvas, name) {
  canvas.toBlob(blob => { if (!blob) { flash('Couldn’t draw the image.'); return; } if (S.img) URL.revokeObjectURL(S.img.url); S.img = { kind, blob, url: URL.createObjectURL(blob), name }; render(); }, 'image/png');
}
async function saveImg() {
  if (!S.downloads || !S.img) return;
  try { await S.downloads.save({ filename: S.img.name, data: S.img.blob }); } catch (e) { if (e && e.code !== 'declined') flash('Couldn’t save the image here. Press and hold it instead.'); }
}
const slug = s => (s || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CF = (w, s, fam) => `${w} ${s}px ${fam === 'mono' ? '"JetBrains Mono", monospace' : fam === 'body' ? 'Figtree, sans-serif' : 'Anybody, "Arial Narrow", sans-serif'}`;
function cfit(ctx, text, max, size, w, fam) { let s = size; do { ctx.font = CF(w, s, fam); s -= 3; } while (ctx.measureText(text).width > max && s > 18); }
async function makeAwards() {
  try { await Promise.all(['900 120px Anybody', '700 40px Figtree'].map(f => document.fonts.load(f))); } catch {}
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0C0F21'); g.addColorStop(1, '#2B0B3A'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(W * .15, H * .1, 0, W * .15, H * .1, 700); r.addColorStop(0, 'rgba(255,201,77,.45)'); r.addColorStop(1, 'rgba(255,201,77,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H);
  x.fillStyle = '#FFC94D'; x.font = CF(900, 120); x.fillText(isSmall() ? 'NIGHT' : 'TRIP', 80, 260); x.fillStyle = '#fff'; x.fillText('AWARDS', 80, 380);
  x.fillStyle = 'rgba(255,255,255,.75)'; cfit(x, S.trip.name, W - 160, 48, 700, 'body'); x.fillText(S.trip.name, 80, 460);
  let y = 590;
  for (const res of superResults()) {
    x.fillStyle = '#FF4FA3'; x.font = CF(600, 30, 'mono'); x.fillText(res.c.toUpperCase(), 80, y);
    const who = res.winners.length ? res.winners.map(nameOf).join(' & ') : '—';
    x.fillStyle = '#fff'; cfit(x, who, W - 160, 64, 900); x.fillText(who, 80, y + 72);
    y += 158;
  }
  x.fillStyle = 'rgba(255,255,255,.7)'; x.font = CF(700, 38, 'body'); x.fillText('Planned on Outta Here', 80, H - 90);
  setImg('awards', c, slug(S.trip.name) + '-awards.png');
}
async function makeCollage() {
  const ps = [...S.photos].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 9).reverse(); if (!ps.length) return;
  try { await document.fonts.load('900 80px Anybody'); } catch {}
  const imgs = (await Promise.all(ps.map(p => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = '/_blob/' + p.asset; })))).filter(Boolean);
  if (!imgs.length) { flash('Couldn’t load the photos.'); return; }
  const W = 1080, H = 1350, top = 190, gap = 8, n = imgs.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#0C0F21'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff'; cfit(x, S.trip.name.toUpperCase(), W - 80, 80, 900); x.fillText(S.trip.name.toUpperCase(), 40, 105);
  const d = dates(); x.fillStyle = '#FF4FA3'; x.font = CF(600, 30, 'mono'); x.fillText(`${dest()?.city || ''}${d ? ' · ' + short(d.start) + ' – ' + short(d.end) : ''}`.toUpperCase(), 40, 155);
  const cw = (W - gap * (cols + 1)) / cols, ch = (H - top - gap * (rows + 1)) / rows;
  imgs.forEach((im, i) => {
    const cx = gap + (i % cols) * (cw + gap), cy = top + gap + Math.floor(i / cols) * (ch + gap);
    const s = Math.max(cw / im.width, ch / im.height), sw = cw / s, sh = ch / s;
    x.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, cx, cy, cw, ch);
  });
  setImg('collage', c, slug(S.trip.name) + '-collage.png');
}

/* ---------- crews ---------- */
async function saveCrew(name) {
  const ms = S.members.filter(m => m.status !== 'out');
  const profiles = {}; for (const m of ms) profiles[m.id] = { nick: m.nick || '', home: m.home || '', venmo: m.venmo || '', cashapp: m.cashapp || '' };
  const cid = S.trip.crewId || rid(10);
  const body = { name: name.slice(0, 40), ids: ms.map(m => m.id), profiles, by: S.uid, at: Date.now() };
  if (S.demo) { S.crews = [...S.crews.filter(c => c.id !== cid), { id: cid, ...body }]; await saveTrip({ crewId: cid }); flash('Crew saved.'); return; }
  try {
    if (S.trip.crewId && S.crews.some(c => c.id === cid)) { const { by, ...rest } = body; await S.db.doc('crews/' + cid).update({ ...rest, people: Object.fromEntries(body.ids.map(id => [id, true])) }); flash(`Updated “${body.name}”.`); return; }
    await S.db.doc('crews/' + cid).set({ ...body, people: Object.fromEntries(body.ids.map(id => [id, true])) }); await saveTrip({ crewId: cid }); flash(`Saved “${body.name}”. Start the next trip from the home screen.`);
  }
  catch (e) { flash(writeErr(e)); }
}
function crewSection() {
  const crew = S.crews.find(c => c.id === S.trip.crewId);
  return `<section class="card stack"><h3>Recurring crew</h3>
    ${crew ? `<p class="small">This ${planWord()} belongs to <b>${esc(crew.name)}</b>. Start the next plan from their crew page in one tap.</p>
      <div><button class="btn sm" data-act="syncCrew">Update crew with these people</button></div>`
    : `<p class="small muted">Save this group as a crew so the next plan starts with everyone already added, and keep a history of your plans together.</p>
      <form id="crewForm" class="row" style="gap:6px"><input aria-label="Crew name" id="crew-name" maxlength="40" placeholder="The Vegas Six" style="flex:1 1 180px" required><button class="btn sm primary" type="submit">Save crew</button></form>`}
  </section>`;
}
/* ---------- trip modes ---------- */
const SUPERS_DEFAULT = ['MVP', 'Most likely to lose their ID', 'Biggest spender', 'Best dressed', 'First to fall asleep', 'Last one standing', 'Main character', 'Most likely to miss the flight'];
const MODES = {
  friends: { label: 'Friends trip', desc: 'Your friends, somewhere new.', color: '#D41C78', ai: 'A friend group trip.', supers: SUPERS_DEFAULT },
  bachelorette: { label: 'Bachelorette', desc: 'Brunch, a big dinner, one wild night.', color: '#E64980', honoree: 'bride',
    ai: 'A bachelorette party. Think brunch, a nice dinner, one wild night out, matching outfits and photo moments. The bride is the guest of honor.',
    supers: ['Best bridesmaid energy', 'Most likely to cry at the wedding', 'Most likely to get us kicked out', 'Best dressed', 'First one asleep', 'Hype queen', 'Main character', 'Best dance moves'] },
  bachelor: { label: 'Bachelor', desc: 'A steak, a day out, a long night.', color: '#3B5BDB', honoree: 'groom',
    ai: 'A bachelor party. Think steakhouse, golf or a day activity, a big night out, sports bars, a casino or a boat. The groom is the guest of honor.',
    supers: ['Best man energy', 'Most likely to lose the groom', 'Biggest spender', 'Worst decision', 'First one asleep', 'Last one standing', 'Best wingman', 'Most likely to miss the flight'] },
  birthday: { label: 'Birthday trip', desc: 'Planned around one dinner and one big night.', color: '#F08C00', honoree: 'birthday star',
    ai: 'A birthday trip. Plan one special birthday dinner and one big birthday night. The birthday person is the guest of honor.',
    supers: ['Best birthday toast', 'Most likely to forget whose birthday it is', 'Biggest spender', 'Best dressed', 'First one asleep', 'Last one standing', 'Main character', 'Best gift'] },
  couples: { label: 'Couples trip', desc: 'Good dinners, nice views, real downtime.', color: '#C2255C',
    ai: 'A trip with several couples. Favor great dinners, wine and cocktail bars, scenic spots, one fun night out, and real downtime.',
    supers: ['Cutest couple', 'Most likely to argue about directions', 'Best dinner pick', 'Best dressed couple', 'First couple asleep', 'Most PDA', 'Best photographer', 'Most likely to miss the flight'] },
  family: { label: 'Family trip', desc: 'All ages. Easy days, early nights.', color: '#0E9F6E', nightlife: 'Things to do',
    ai: 'A family trip with mixed ages, possibly kids. Keep everything family-friendly: no clubs. Favor activities, parks, easy food spots and early evenings.',
    supers: ['Trip MVP', 'Best snack supply', 'Most likely to get lost', 'Best navigator', 'First one asleep', 'Most photos taken', 'Best attitude', 'Funniest moment'] },
  college: { label: 'Spring break', desc: 'Tight budget, beach, happy hours.', color: '#1098AD',
    ai: 'A spring break or college trip on a tight budget. Favor cheap eats, beach or pool parties, happy hours, and budget stays like hostels or shared rentals.',
    supers: SUPERS_DEFAULT },
  festival: { label: 'Festival or concert', desc: 'Planned around the set times.', color: '#7048E8',
    ai: 'A trip built around a music festival or concert. Favor pre-game spots, after-parties, easy transport to the venue, and recovery brunches.',
    supers: ['Best festival outfit', 'Most likely to lose the group', 'Front row energy', 'Best set pick', 'First one asleep', 'Last one standing', 'Main character', 'Most likely to miss the flight'] },
  sports: { label: 'Sports trip', desc: 'The game, the tailgate, the night after.', color: '#E8590C',
    ai: 'A trip built around a sports game or event. Favor sports bars, tailgates, a great steak or BBQ dinner, and a fun night out after the game.',
    supers: ['Loudest fan', 'Worst bet', 'Biggest spender', 'Best jersey', 'First one asleep', 'Last one standing', 'Best tailgate snack', 'Most likely to miss the flight'] },
  work: { label: 'Team offsite', desc: 'Team dinners, one activity, time to work.', color: '#5C6A7A', nightlife: 'Things to do',
    ai: 'A work team offsite. Keep it professional but fun: team dinners, one group activity, a nice bar for the evening, and quiet time to work.',
    supers: ['Team MVP', 'Best idea of the trip', 'Most likely to answer email at dinner', 'Best dressed', 'First one asleep', 'Best karaoke', 'Most likely to miss the flight', 'Best team spirit'] },
};
const mode = () => MODES[S.trip?.mode] || MODES.friends;
const modeLabel = (v, sz) => sz === 'weekend' ? v.label.replace(/ trip$/, ' weekend') : v.label;
const honoreeMode = () => !!mode().honoree;
const isHonoree = () => honoreeMode() && S.trip.honoree && S.trip.honoree === S.uid;
const honoreeFree = () => honoreeMode() && S.trip.honoree && S.trip.honoreeFree !== false;
const visItems = () => (S.trip.itinerary || []).map(i => i.secret && !i.revealed && isHonoree() ? { ...i, title: 'Surprise', note: 'Your crew planned something. No peeking.', kind: 'surprise', hidden: true } : i);

/* ---------- layout: sections ---------- */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  plan: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  book: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  live: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  money: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
  memories: '<path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
function sections() {
  return [
    { k: 'home', label: 'Home', tabs: [['overview', 'Overview'], ['crew', 'Crew'], ['tasks', 'To-dos'], ['log', 'Changes'], ['settings', 'Settings']] },
    { k: 'plan', label: 'Plan', tabs: [['match', isSmall() ? 'Plan Match' : 'Trip Match'], ['dates', isSmall() ? 'When' : 'Dates'], ['whatif', 'What if'], ['spots', isSmall() ? 'Spots' : (mode().nightlife || 'Nightlife')], ['plan', isSmall() ? 'The plan' : 'Itinerary']] },
    { k: 'book', label: 'Book', tabs: [['flights', 'Flights'], ['stays', 'Stays'], ['tickets', 'Boarding passes'], ['pack', 'Packing']] },
    { k: 'live', label: 'Live', tabs: [['live', 'Today'], ['map', 'Map'], ['bucket', 'Bucket list'], ['hype', 'Hype']] },
    { k: 'money', label: 'Money', tabs: [['cost', 'All-in cost'], ['meter', 'My spend'], ['pot', 'Group pot'], ['money', 'Expenses']] },
    { k: 'memories', label: 'Memories', tabs: [['wrapped', isSmall() ? 'Recap' : 'Wrapped'], ['recap', 'Photos'], ['awards', 'Awards']] },
  ].map(s => ({ ...s, tabs: s.tabs.filter(([k]) => !HIDE_TABS[size()].includes(k)) })).filter(s => s.tabs.length);
}
const TAB_ALIAS = { deals: 'flights', where: 'match' };
const secOf = tab => sections().find(s => s.tabs.some(t => t[0] === tab)) || sections()[0];
const TABFN = () => ({ log: logTab, overview: overviewTab, crew: crewTab, tasks: tasksTab, cost: costTab, whatif: whatifTab, settings: settingsTab, match: matchTab, dates: datesTab, where: whereTab, spots: spotsTab, plan: planTab,
  flights: flightsTab, stays: staysTab, tickets: ticketsTab, pack: packTab, live: liveTab, map: mapTab, bucket: bucketSection, hype: hypeTab,
  meter: meterTab, pot: potTab, money: moneyTab, wrapped: wrappedTab, recap: photosTab, awards: awardsTab });
function tripView() {
  if (S.membersIn && accessState() !== 'ok') return blockedView(accessState());
  if (S.setup && S.membersIn && meDoc()) return setupView();
  if (TAB_ALIAS[S.tab]) S.tab = TAB_ALIAS[S.tab];
  const fns = TABFN(); if (!fns[S.tab]) S.tab = 'overview';
  const sec = secOf(S.tab), cd = countdown(), m = mode(), gd = guide(), crumbTab = gd && !gd.wait && gd.tab !== S.tab ? gd.tab : null;
  const head = S.tab === 'overview' ? '' : `<div class="mini"><span class="sec-eyebrow">${esc(sec.label)}</span><button class="mini-name" data-tab="overview">${esc(S.trip.name)}</button>
      ${isSmall() ? `<span class="mode-chip" style="--mc:${SIZES[size()].color}">${esc(SIZES[size()].label)}</span>` : `<span class="mode-chip" style="--mc:${m.color}">${esc(modeLabel(m, size()))}</span>`}${cd ? `<span class="small muted">${esc(cd.n > 0 ? cd.text + ' to go' : cd.text)}</span>` : ''}</div>`;
  return `${topBar()}
  ${S.demo ? `<div class="banner"><span><b>Demo trip.</b> Sample crew, nothing is saved. Try switching the trip type in Home › Settings.</span><button class="btn sm" data-act="home">Back</button></div>` : ''}
  ${S.readOnly ? `<div class="banner"><span>You can view this plan but not edit it. Ask the owner to share it with you as a Contributor.</span></div>` : ''}
  ${lostBanner()}
  ${head}
  ${liveBanner()}
  ${journeyPill()}
  ${sec.tabs.length > 1 ? `<nav class="subtabs" aria-label="${esc(sec.label)}">${sec.tabs.map(([k, l]) => `<button class="subtab ${S.tab === k ? 'on' : ''}" data-tab="${k}" aria-current="${S.tab === k}">${esc(l)}${crumbTab === k ? '<i class="crumb" aria-hidden="true"></i>' : ''}${k === 'log' && !S.demo && logList().some(x => needsMe(x)) ? ` <span class="count">${logList().filter(x => needsMe(x)).length}</span>` : ''}</button>`).join('')}</nav>` : ''}
  ${fns[S.tab]()}
  ${isLive() && !S.lostOpen && !['live', 'map', 'overview'].includes(S.tab) ? '<button class="fab-lost" data-act="lostOpen" aria-label="I’m lost: send the crew my spot">SOS</button>' : ''}
  ${S.lostOpen ? lostSheet() : ''}
  <nav class="bottomnav" aria-label="Trip sections"><div class="bn-inner" style="grid-template-columns:repeat(${sections().length},1fr)">${sections().map(s => `<button class="bn ${s.k === sec.k ? 'on' : ''}" data-sec="${s.k}" aria-current="${s.k === sec.k}">${icon(s.k)}${crumbTab && secOf(crumbTab).k === s.k && s.k !== sec.k ? '<i class="crumb" aria-hidden="true"></i>' : ''}<span>${s.label}${s.k === 'live' && isLive() ? ' ●' : ''}</span></button>`).join('')}</div></nav>`;
}

/* ---------- home: overview ---------- */
/* ---------- home: overview ----------
   The journey leads. Everything else on the plan home is secondary: the pass, recent changes,
   "something changed?", and the crew at a glance. Booking, money and the rest stay one tap
   away in the bottom menu. */
function overviewTab() {
  const t = S.trip, ns = nudges(), welcome = showWelcome();
  return `${welcome ? welcomeCard() : journeyCard()}
  ${isLive() ? '<div class="row" style="gap:8px"><button class="btn lost-btn" data-act="lostOpen">I’m lost</button><span class="small muted">Sends the crew your spot.</span></div>' : ''}
  ${welcome ? '' : changesCard()}
  ${STAGES.findIndex(([k]) => k === stageOf(t, S.members)) >= 2 ? passport() : pass()}
  ${welcome ? '' : recoveryCard()}
  <section class="card stack">
    <div class="row" style="justify-content:space-between"><h3>Crew</h3><button class="btn sm" data-tab="crew">Invite & manage</button></div>
    <div class="row" style="gap:6px">${S.members.map(m => `<span class="av-sm" title="${esc(m.nick || 'Someone')}" style="background:${colorFor(m.id)};${m.status === 'out' ? 'opacity:.35' : ''}">${esc((m.nick || '?')[0].toUpperCase())}</span>`).join('')}</div>
    ${ns.length ? `<span class="small muted">${ns.length} ${ns.length === 1 ? 'person has' : 'people have'} stuff to do. <button class="linkbtn" data-tab="crew">See who</button></span>` : '<span class="small" style="color:var(--good)">Everyone’s done their part.</span>'}
  </section>`;
}
function settingsTab() {
  const m = mode();
  return `<section class="card stack"><h3>Plan size</h3><div class="row" style="gap:6px">${Object.entries(SIZES).map(([k, v]) => `<button class="chip ${size() === k ? 'on' : ''}" data-setsize="${k}">${esc(v.label)}</button>`).join('')}</div><p class="small muted">Changing the size keeps everyone’s votes and free days.</p></section>
  <section class="card stack"><h3>Currency</h3><label class="field" style="flex:none;max-width:280px"><span class="label">Everyone spends in</span><select id="set-cur" ${S.readOnly ? 'disabled' : ''}>${curOptions(cur())}</select></label><p class="small muted">All amounts in this ${planWord()} show in this currency, and the AI prices in it. Changing it doesn’t convert amounts people already typed in.</p></section>
  ${isSmall() ? '' : `<section class="card stack"><h3>Type</h3>
    <div class="modes compact">${Object.entries(MODES).map(([k, v]) => `<button class="mode ${S.trip.mode === k || (!S.trip.mode && k === 'friends') ? 'on' : ''}" data-setmode="${k}" style="--mc:${v.color}"><b>${esc(modeLabel(v, size()))}</b></button>`).join('')}</div>
    ${m.honoree ? `<div class="row" style="gap:10px">
      <label class="field"><span class="label">The ${esc(m.honoree)}</span><select id="set-honoree"><option value="">Pick someone</option>${S.members.map(x => `<option value="${esc(x.id)}" ${S.trip.honoree === x.id ? 'selected' : ''}>${esc(x.nick || 'Someone')}</option>`).join('')}</select></label>
      <label class="row small" style="gap:8px;flex:1 1 200px"><input type="checkbox" id="set-free" style="width:auto" ${S.trip.honoreeFree !== false ? 'checked' : ''}> The ${esc(m.honoree)} pays nothing (their share is split across everyone else)</label></div>
      <p class="small muted">Surprise plans and the planners-only chat are hidden from the ${esc(m.honoree)} in the app.</p>` : ''}
  </section>`}
  ${decideCard()}
  ${S.demo ? '' : S.repeat ? repeatDialog() : `<section class="card row repeat-cta"><span><b>Do this again?</b> <span class="small muted">Start a new ${planWord()} with the same to-dos, outline and packing list. Dates, prices and who’s coming start fresh.</span></span><button class="btn" data-act="repeatOpen">Repeat this ${planWord()}</button></section>`}
  ${templateCard()}
  ${SETTINGS_HTML()}`;
}

/* ---------- plan status + the move ---------- */
// Every plan moves through the same stages, computed from what has actually happened.
// "The move" is the one next thing the plan needs: from you if you owe something,
// otherwise from whoever the group is waiting on.
const STAGES = [['draft', 'Draft'], ['gathering', 'Gathering votes'], ['decided', 'Decided'], ['organizing', 'Organizing'], ['confirmed', 'Confirmed'], ['happening', 'Happening'], ['memories', 'Memories']];
const STAGE_LABEL = Object.fromEntries(STAGES);
const going = m => m && ['in', 'confirmed', 'booked'].includes(m.status);
const listNames = ms => { const n = ms.map(m => m.nick || 'Someone'); return n.length <= 2 ? n.join(' and ') : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`; };
const people = n => `${n} ${n === 1 ? 'person' : 'people'}`;
// "Jay hasn’t voted", "Jay and Kim haven’t voted", "4 people haven’t voted"
const whoHas = (w, one, many, rest) => `${w.length <= 2 ? listNames(w) : people(w.length)} ${w.length === 1 ? one : many} ${rest}`;

// Works from the plan document alone (home page) or with its members (inside the plan).
function stageOf(t, ms) {
  const d = t.lockedDates, sz = sizeOf(t);
  if (d && TODAY > d.end) return 'memories';
  if (d && TODAY >= d.start) return 'happening';
  const ins = ms ? ms.filter(going).length : Object.values(t.people || {}).filter(Boolean).length;
  if (!t.lockedDest || !d) return ins >= 2 || (t.pitches?.items || []).length || (t.destinations || []).length ? 'gathering' : 'draft';
  const goers = ms ? ms.filter(going).map(m => m.id) : Object.keys(t.people || {}).filter(k => t.people[k]);
  const booked = goers.length > 0 && goers.every(id => (t.tickets || {})[id]);
  const tasks = Object.values(t.tasks || {}).filter(Boolean), tasksDone = tasks.every(x => x.done);
  const done = (sz !== 'trip' || booked) && (['hangout', 'day'].includes(sz) || !!t.stay) && (t.itinerary || []).length > 0 && tasksDone;
  if (done) return 'confirmed';
  const started = Object.keys(t.tickets || {}).length || t.stay || (t.itinerary || []).length || tasks.some(x => x.done || x.owner);
  return started ? 'organizing' : 'decided';
}

// The step the plan is waiting on, the same for everyone looking (unlike the guide's focus,
// which leads with your own move). Used for the home rows and the nudge wording.
function groupStep() {
  const j = journey(), live = j.steps.filter(s => s.status === 'ready' || s.status === 'waiting');
  const order = s => JSTAGES.findIndex(([k]) => k === s.stage) * 10 + ((s.who || []).length ? 0 : 1);
  return [...live].sort((a, b) => order(a) - order(b))[0] || null;
}
// The plan's current move is saved on the plan, so the home page can show it without
// loading every plan's members. Written only when it changes.
let pulseT = 0;
function syncPulse() {
  if (!S.trip || S.demo || !S.db || !S.membersIn || S.readOnly) return;
  const b = groupStep(), st = stageOf(S.trip, S.members);
  const pulse = { stage: st, k: b?.k || '', text: b ? b.group || b.title : (st === 'confirmed' ? 'All set' : ''), mine: b?.mineText || '', who: (b?.who || []).map(m => m.id), und: undecided().map(m => m.id) };
  const old = S.trip.pulse || {}, miles = syncMilestones();
  const same = old.stage === pulse.stage && old.k === pulse.k && old.text === pulse.text && old.mine === pulse.mine && (old.who || []).join() === pulse.who.join() && (old.und || []).join() === pulse.und.join();
  if (same && !miles) return;
  clearTimeout(pulseT); const tid = S.tid;
  pulseT = setTimeout(() => { if (S.tid === tid) S.db.doc('trips/' + tid).update({ ...(same ? {} : { pulse: { ...pulse, at: Date.now() } }), ...(miles ? { miles } : {}) }).catch(() => {}); }, 1200);
}
function stagePill(t, ms) {
  const st = stageOf(t, ms);
  return `<span class="stage-pill s-${st}">${STAGE_LABEL[st]}</span>`;
}
// One line for a plan on the home page: your move if it's on you, otherwise what it's waiting on.
function moveLine(t) {
  const p = t.pulse, st = stageOf(t);
  if (st === 'memories') return isSmall(t) ? 'Recap ready' : 'Wrapped is ready';
  if (!p || !p.text) return planStatus(t);
  if ((p.who || []).includes(S.uid) && p.mine) return `<b class="your-move">Your move:</b> ${esc(p.mine)}`;
  return esc(p.text);
}

/* ---------- commitment levels + RSVP deadlines ---------- */
// How sure each person is, from "into it" to "already booked". Older plans stored
// in / maybe / out, which map to Going / Interested / Can't go.
const LEVELS = [['maybe', 'Interested'], ['in', 'Going'], ['confirmed', 'Confirmed'], ['booked', 'Booked']];
const LEVEL_LABEL = { ...Object.fromEntries(LEVELS), out: 'Can’t go' };
const LEVEL_HELP = { maybe: 'Into it, not sure yet', in: 'Planning to come', confirmed: 'Count me in for real', booked: 'I’ve booked my part' };
const isOrganizer = () => S.demo || S.trip?.createdBy === S.uid || !!(S.trip?.orgs || {})[S.uid];
const undecided = () => S.members.filter(m => !m.status || m.status === 'maybe');
const NUDGE_REST = 12 * 36e5;
function headcount() {
  const c = k => S.members.filter(m => (m.status || 'maybe') === k).length;
  const h = { booked: c('booked'), confirmed: c('confirmed'), going: c('in'), interested: c('maybe'), out: c('out') };
  return { ...h, firm: h.booked + h.confirmed, max: h.booked + h.confirmed + h.going };
}
function commitLadder() {
  const m = meDoc(), cur = m ? m.status || 'maybe' : null, i = LEVELS.findIndex(([k]) => k === cur);
  return `<div class="ladder-wrap"><div class="ladder" role="group" aria-label="How sure are you?">${LEVELS.map(([k, l], j) => `<button class="rung ${j <= i ? 'on' : ''} ${j === i ? 'cur' : ''}" data-status="${k}" aria-pressed="${j === i}" title="${LEVEL_HELP[k]}">${l}</button>`).join('')}</div>
    <div class="row" style="justify-content:space-between;gap:8px"><span class="small muted">${cur && cur !== 'out' ? esc(LEVEL_HELP[cur]) : cur === 'out' ? 'You said you can’t go.' : 'How sure are you?'}</span><button class="linkbtn small muted" data-status="out">${cur === 'out' ? '' : 'Can’t make it'}</button></div></div>`;
}
function rsvpCard() {
  const t = S.trip, und = undecided(), org = isOrganizer(), by = t.rsvpBy, late = by && TODAY > by, h = headcount();
  const since = t.rsvpNudge ? Date.now() - t.rsvpNudge : Infinity, canNudge = since > NUDGE_REST;
  const blocks = [['booked', h.booked], ['confirmed', h.confirmed], ['in', h.going], ['maybe', h.interested], ['out', h.out]];
  return `<section class="card stack rsvp">
    <div class="row" style="justify-content:space-between"><h2>Who’s coming</h2>${by ? `<span class="pill ${late ? 'out' : 'maybe'}">${late ? 'Answers closed ' + short(by) : 'Answer by ' + short(by)}</span>` : ''}</div>
    ${meDoc() && !S.readOnly && STAGES.findIndex(([k]) => k === stageOf(S.trip, S.members)) >= 2 ? commitLadder() : ''}
    <div class="hc">${blocks.map(([k, n]) => `<div class="hc-b lvl-${k} ${n ? '' : 'zero'}"><b>${n}</b><span>${LEVEL_LABEL[k]}</span></div>`).join('')}</div>
    <p class="small muted">${h.firm ? `Plan for <b>${h.firm}</b> ${h.firm === 1 ? 'person' : 'people'}${h.going ? `, up to <b>${h.max}</b> if everyone going confirms` : ''}.` : h.going ? `Nobody has confirmed yet. <b>${h.going}</b> ${h.going === 1 ? 'is' : 'are'} planning to come.` : 'Nobody has said they’re coming yet.'} Stays and costs use this number.</p>
    ${condLines()}
    ${org ? `<div class="stack" style="gap:10px;border-top:1px solid var(--line);padding-top:12px">
      <div class="row" style="gap:8px;align-items:flex-end"><label class="field" style="flex:0 1 190px"><span class="label">Everyone answers by</span><input id="rsvp-by" type="date" value="${by || ''}" min="${TODAY}"></label>${by ? '<button class="btn sm ghost" data-act="rsvpClear">No deadline</button>' : ''}</div>
      ${und.length ? `<span class="label">Still undecided · ${und.length}</span>
        <div class="row" style="gap:6px">${und.map(m => `<span class="chip" style="cursor:default"><span class="av" style="width:18px;height:18px;font-size:9px;background:${colorFor(m.id)}">${esc((m.nick || '?')[0].toUpperCase())}</span>${esc(m.nick || 'Someone')}</span>`).join('')}</div>
        <div class="row" style="gap:6px;align-items:center">${canNudge ? `<button class="btn sm primary" data-act="rsvpNudge">Nudge them</button>` : `<span class="small muted">Nudged ${ago(t.rsvpNudge)}. The button rests for ${Math.ceil((NUDGE_REST - since) / 36e5)}h so nobody gets spammed.</span>`}
        ${late ? `<button class="btn sm" data-act="rsvpCountOut">Count them out</button>` : ''}</div>`
      : '<span class="small" style="color:var(--good)">Everyone has answered.</span>'}
    </div>` : und.some(m => m.id === S.uid) && by ? `<p class="small"><b>Answer by ${fmt(by)}</b> so the crew knows how many to plan for.</p>` : ''}
  </section>`;
}
function rsvpNudge() {
  const und = undecided(); if (!und.length) return;
  const by = S.trip.rsvpBy;
  sendInvite(`${und.map(m => m.nick || 'Someone').join(', ')}: are you in for ${S.trip.name}?${by ? ` We need to know by ${fmt(by)}.` : ''} One tap to answer.`, inviteLink(), S.trip.name)
    .then(() => saveTrip({ rsvpNudge: Date.now() }));
}
async function rsvpCountOut() {
  const und = undecided(); if (!und.length) return;
  if (S.demo) { und.forEach(m => { m.status = 'out'; }); render(); return; }
  try {
    for (const m of und) await S.db.doc(`trips/${S.tid}/members/${m.id}`).update({ status: 'out', countedOut: true });
    flash(`${listNames(und)} counted out. They can still join if they change their mind.`);
  } catch (e) { flash(writeErr(e)); }
}
function setStatus(st) {
  const m = meDoc(), fresh = !m || (!(m.days || []).length && !m.budget);
  if (st === 'booked' && size() === 'trip' && !(S.trip.tickets || {})[S.uid]) {
    S.tab = 'tickets'; render(); window.scrollTo({ top: 0 });
    flash('Send your boarding pass or flight number here. That marks you as booked.'); return;
  }
  if (st === 'out' && going(m)) logDrop(S.uid);
  saveMe({ status: st, seen: true, countedOut: false }, true);
  if (['in', 'confirmed'].includes(st) && fresh) startSetup();
  else if (st === 'confirmed') flash('Confirmed. The crew is counting on you now.');
  else if (st === 'booked') flash('Marked as booked.');
}

/* ---------- to-dos: who's doing what ---------- */
// Each job has an owner and a due date, so the organizer isn't doing everything.
// Stored on the plan as tasks: { id: { title, owner, due, done, by, at } }.
const TASK_IDEAS = {
  hangout: ['Book the table', 'Pick where we meet', 'Send everyone the final details'],
  day: ['Check how we get there', 'Buy the tickets', 'Book lunch', 'Send everyone the final details'],
  weekend: ['Research stays', 'Book the stay', 'Sort out the drive', 'Plan the big night', 'Send everyone the final details'],
  trip: ['Research stays', 'Book the stay', 'Check airport transport', 'Book the big dinner', 'Send everyone the final details'],
};
const taskList = () => Object.entries(S.trip.tasks || {}).filter(([, x]) => x).map(([id, x]) => ({ id, ...x }))
  .sort((a, b) => (a.done - b.done) || ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (a.at || 0) - (b.at || 0)));
function tasksTab() {
  const list = taskList(), ms = S.members.filter(m => m.status !== 'out'), open = list.filter(x => !x.done);
  const load = ms.map(m => [m, open.filter(x => x.owner === m.id).length]).sort((a, b) => b[1] - a[1]);
  const lopsided = load.length > 1 && load[0][1] >= 3 && load[0][1] - load[load.length - 1][1] >= 3;
  const ideas = TASK_IDEAS[size()].filter(t => !list.some(x => x.title.toLowerCase() === t.toLowerCase()));
  const row = x => {
    const late = !x.done && x.due && x.due < TODAY;
    return `<div class="task ${x.done ? 'is-done' : ''}" data-key="task-${esc(x.id)}">
      <button class="box ${x.done ? 'on' : ''}" data-taskdone="${esc(x.id)}" aria-pressed="${!!x.done}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}: ${esc(x.title)}">${x.done ? '✓' : ''}</button>
      <div class="task-main" data-task="${esc(x.id)}">
        <b>${esc(x.title)}</b>
        <div class="task-meta">
          <select id="task-owner-${esc(x.id)}" aria-label="Who’s on it"><option value="">Nobody yet</option>${ms.map(m => `<option value="${esc(m.id)}" ${x.owner === m.id ? 'selected' : ''}>${esc(m.nick || 'Someone')}${m.id === S.uid ? ' (you)' : ''}</option>`).join('')}</select>
          <input id="task-due-${esc(x.id)}" type="date" value="${esc(x.due || '')}" aria-label="Due date">
          ${late ? '<span class="pill out" style="color:#D63B3B">Overdue</span>' : ''}
          ${!x.owner && !x.done ? `<button class="btn sm primary" data-taketask="${esc(x.id)}">I’ll take it</button>` : ''}
        </div>
      </div>
      <button class="x" data-deltask="${esc(x.id)}" aria-label="Delete ${esc(x.title)}">×</button>
    </div>`;
  };
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px"><h2>Who’s doing what</h2><span class="small muted">Give every job an owner and a date so it doesn’t all land on one person.</span></div>
      <span class="small muted">${list.filter(x => x.done).length}/${list.length} done</span></div>
    ${lopsided ? `<div class="banner"><span><b>${esc(load[0][0].nick || 'Someone')} has ${load[0][1]} open jobs.</b> ${esc(listNames(load.filter(([, n]) => n === 0).map(([m]) => m)))} ${load.filter(([, n]) => n === 0).length === 1 ? 'has' : 'have'} none. Spread it out.</span></div>` : ''}
    ${list.length ? `<div class="tasks">${list.map(row).join('')}</div>` : '<div class="empty"><span>No to-dos yet. Add the jobs that need doing, or start from the suggestions below.</span></div>'}
    <form id="addTask" class="row" style="gap:6px;align-items:flex-end"><label class="field" style="flex:1 1 220px"><span class="label">New to-do</span><input id="task-title" maxlength="80" required placeholder="${esc(TASK_IDEAS[size()][0])}"></label><button class="btn primary" type="submit">Add</button></form>
    ${ideas.length ? `<div class="stack" style="gap:6px"><span class="label">Suggestions</span><div class="row" style="gap:6px">${ideas.map(t => `<button class="chip" data-taskidea="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div></div>` : ''}
  </section>`;
}
function addTask(title) {
  title = String(title || '').trim().slice(0, 80); if (!title) return;
  const id = rid(6);
  saveTrip({ tasks: { [id]: { title, owner: '', due: '', done: false, by: S.uid, at: Date.now() } } });
}
const patchTask = (id, patch) => {
  const x = (S.trip.tasks || {})[id]; if (!x) return;
  const handed = patch.owner && patch.owner !== S.uid && patch.owner !== x.owner;
  saveTrip(handed ? withLog({ tasks: { [id]: patch } }, { area: 'tasks', text: `${nameOf(patch.owner)} is on “${x.title}”`, act: 'some', who: [patch.owner] }) : { tasks: { [id]: patch } });
};

/* ---------- all-in cost: the real price of saying yes ---------- */
// Per person, low–high, line by line, built from the most real number available:
// what's already paid or booked, then quotes someone found, then estimates (yours or
// the AI's). Every number says where it came from, and lines nobody has filled in are
// called out instead of quietly counting as $0.
const COST_LINES = {
  hangout: [['getting', 'Getting there', 'Rides or transit, both ways', true], ['food', 'Food & drinks', 'Dinner, rounds, tip', true], ['fun', 'Activities', 'Tickets, cover, bowling…', false], ['fees', 'Fees', 'Booking fees, deposits', false]],
  day: [['getting', 'Getting there', 'Train, gas, parking, both ways', true], ['fun', 'Tickets & activities', 'Entry, rentals, tours', true], ['food', 'Food & drinks', 'Lunch, snacks, dinner', true], ['fees', 'Fees', 'Booking fees', false]],
  weekend: [['travel', 'Getting there', 'Gas, tolls, train or a short flight', true], ['stay', 'Stay', 'Your share, all nights', true], ['local', 'Getting around', 'Ubers, parking', false], ['food', 'Food & drinks', 'Every meal and night out', true], ['fun', 'Activities', 'Tickets, cover, rentals', false], ['fees', 'Fees', 'Cleaning, resort and booking fees', false]],
  trip: [['travel', 'Flights', 'Round trip from your city', true], ['stay', 'Stay', 'Your share, all nights', true], ['local', 'Getting around', 'Airport transfer, Ubers', true], ['food', 'Food & drinks', 'Every meal and night out', true], ['fun', 'Activities', 'Tickets, tours, cover charges', false], ['fees', 'Fees', 'Cleaning, resort, baggage, booking fees', false]],
};
const SRC_LABEL = { estimate: 'Estimate', ai: 'AI estimate', quote: 'Real quote', booked: 'Booked', paid: 'Paid' };
// "$650–800 all-in" → [650, 800]; "$180/night" → [180, 180]
function moneyRange(s) {
  const n = String(s || '').replace(/,/g, '').match(/\d+(\.\d+)?/g); if (!n) return null;
  const v = n.map(Number).filter(x => x > 0).slice(0, 2); if (!v.length) return null;
  return [Math.min(...v), Math.max(...v)];
}
const planHeads = () => { const h = headcount(); return Math.max(1, h.firm || h.max || active().length); };
// Sort a logged expense into a cost line by what it was for.
const CAT_RX = [['travel', /flight|airline|plane|train|bus|amtrak|gas|toll|rental car|car rental/i], ['stay', /airbnb|hotel|hostel|motel|stay|cabin|lodg|vrbo|rent\b/i], ['local', /uber|lyft|taxi|cab\b|transfer|parking|metro|subway/i],
  ['fun', /ticket|tour|cover|club|show|museum|boat|bowling|karaoke|class|entry/i], ['fees', /fee|deposit|cleaning/i], ['food', /dinner|lunch|breakfast|brunch|food|drink|bar|groceries|restaurant|coffee|tab|round|pizza|taco|snack/i]];
function lineFor(title) {
  const keys = COST_LINES[size()].map(l => l[0]), hit = (CAT_RX.find(([, rx]) => rx.test(title)) || [])[0];
  if (!hit) return null;
  if (keys.includes(hit)) return hit;
  return ['travel', 'local'].includes(hit) && keys.includes('getting') ? 'getting' : null;
}
// What each line has actually cost so far: shared expenses (your share, or the
// average share) plus, for flights, the price on your boarding pass or in My spend.
function paidSoFar(who) {
  const out = {}, other = { n: 0 }, heads = planHeads();
  for (const e of S.expenses) {
    const split = e.split || active().map(m => m.id);
    const share = who === 'me' ? (split.includes(S.uid) ? e.amount / split.length : 0) : e.amount / heads;
    if (!share) continue;
    const k = lineFor(e.title || ''); if (k) out[k] = (out[k] || 0) + share; else other.n += share;
  }
  return { by: out, other: Math.round(other.n) };
}
function myFlight() {
  const tk = (S.trip.tickets || {})[S.uid]; if (!tk) return null;
  const spent = (S.mySpend || []).filter(x => /flight|airline|plane|✈/i.test(x.note || '')).reduce((n, x) => n + (+x.amount || 0), 0);
  const price = +tk.price || spent || 0;
  return { booked: true, price: price ? Math.round(price) : 0, from: +tk.price ? 'your boarding pass' : spent ? 'My spend' : '' };
}
function crewFlights() {
  const tks = Object.values(S.trip.tickets || {}).filter(Boolean), prices = tks.map(x => +x.price).filter(x => x > 0);
  return { booked: tks.length, prices };
}
// Estimates the app already has from earlier AI searches (flights, stays).
function costHints() {
  const t = S.trip, d = dates(), nights = Math.max(1, nightsOf(d)), out = {};
  const fl = (t.deals?.data?.flights || []).map(f => moneyRange(f.roundTrip)).filter(Boolean);
  if (fl.length && size() === 'trip') out.travel = { low: Math.min(...fl.map(r => r[0])), high: Math.max(...fl.map(r => r[1])), src: 'ai', note: 'From the flight search estimates' };
  if (t.stay && +t.stay.total && !isSmall()) { const n = planHeads(); out.stay = { low: Math.round(t.stay.total / n), high: Math.round(t.stay.total / n), src: t.stay.booked ? 'booked' : 'quote', note: `${t.stay.name}, ${money(t.stay.total)} total ${n === 1 ? "for 1 person" : `split ${n} ways`}` }; return out; }
  const stays = t.stay ? [t.stay] : (t.stays?.items || []);
  const pn = stays.map(s => moneyRange(s.perNight)).filter(Boolean);
  if (pn.length && !isSmall()) { const n = planHeads(); out.stay = { low: Math.round(Math.min(...pn.map(r => r[0])) * nights / n), high: Math.round(Math.max(...pn.map(r => r[1])) * nights / n), src: t.stay ? 'quote' : 'ai', note: `${t.stay ? t.stay.name : 'Stay ideas'}, ${nights} night${nights === 1 ? '' : 's'} ${n === 1 ? "for 1 person" : `split ${n} ways`}` }; }
  return out;
}
// who: 'crew' (a typical person's range) or 'me' (your own, using your real numbers)
function costSummary(t = S.trip, who = 'crew') {
  const lines = COST_LINES[sizeOf(t)], saved = t.costs || {}, hints = t === S.trip ? costHints() : {};
  const paid = t === S.trip ? paidSoFar(who) : { by: {}, other: 0 }, fl = t === S.trip && size() === 'trip' ? (who === 'me' ? myFlight() : crewFlights()) : null;
  const rows = lines.map(([k, label, hint, major]) => {
    const s = saved[k], h = hints[k];
    let v = s && (s.low || s.high) ? { low: +s.low || +s.high || 0, high: +s.high || +s.low || 0, src: s.src || 'estimate', note: s.note || '' } : h ? { ...h } : null;
    const auto = !(s && (s.low || s.high)) && !!h;
    let booked = null;
    if (k === 'travel' && fl) {
      if (who === 'me' && fl.price) v = { low: fl.price, high: fl.price, src: 'booked', note: `Your flight, from ${fl.from}` };
      else if (who === 'me' && fl.booked) booked = 'noprice';
      else if (who === 'crew' && fl.prices.length) { const all = fl.prices.length >= planHeads(); if (all) v = null; const lo = Math.min(...fl.prices, ...(v ? [v.low] : [])), hi = Math.max(...fl.prices, ...(v ? [v.high] : [])); v = { low: lo, high: hi, src: v && fl.prices.length < planHeads() ? v.src : 'booked', note: `${fl.prices.length} booked flight price${fl.prices.length === 1 ? '' : 's'}${v && fl.prices.length < planHeads() ? ' plus the estimate for the rest' : ''}` }; }
    }
    const p = Math.round(paid.by[k] || 0);
    if (p) v = v ? { ...v, low: Math.max(v.low, p), high: Math.max(v.high, p), paid: p } : { low: p, high: p, src: 'paid', note: 'From logged expenses', paid: p };
    return { k, label, hint, major, v, auto, booked };
  });
  const buffer = t.costBuffer ?? 10, other = paid.other;
  const low = rows.reduce((n, r) => n + (r.v ? r.v.low : 0), other), high = rows.reduce((n, r) => n + (r.v ? r.v.high : 0), other);
  const withBuf = x => Math.round(x * (1 + buffer / 100));
  const missing = rows.filter(r => r.major && !r.v && !r.booked), estimates = rows.filter(r => r.v && ['estimate', 'ai'].includes(r.v.src));
  return { rows, buffer, other, low: withBuf(low), high: withBuf(high), missing, estimates, any: rows.some(r => r.v) || other > 0 };
}
/* ---------- budget fit ----------
   Other people's budgets never reach this browser. "Does lo–hi fit the crew?" goes to
   /api/budget, which answers with counts and only names people who chose to be named (or
   you). Answers are kept until the crew's details change. The demo and the Claude version
   have no server of their own, so there it's worked out here from the data the page has.
   Budget ≥ high fits, between low and high is a stretch, below low is over. */
const BQ = { tid: null, cache: new Map(), queue: new Map(), cap: undefined, t: 0 };
const NO_FIT = { n: 0, unknown: 0, fits: [], stretch: [], over: [], hard: [], hardOpen: [], pending: true };
const budgetsHere = () => S.demo || IN_CLAUDE;
function budgetReset() { BQ.cache.clear(); BQ.cap = undefined; }
function bq(check) {
  if (BQ.tid !== S.tid) { BQ.tid = S.tid; budgetReset(); BQ.queue.clear(); }
  if (budgetsHere()) return budgetLocal(check);
  // only people in the plan can ask, so wait until joining has actually been saved
  const me = meDoc(); if (!me || !(me.updatedAt || (S.trip.people || {})[S.uid] || S.trip.createdBy === S.uid)) return { ...NO_FIT, pending: false };
  const k = JSON.stringify(check);
  if (BQ.cache.has(k)) return BQ.cache.get(k);
  if (!BQ.queue.has(k)) { BQ.queue.set(k, check); clearTimeout(BQ.t); BQ.t = setTimeout(budgetFetch, 0); }
  return null;
}
async function budgetFetch() {
  const tid = S.tid, items = [...BQ.queue]; BQ.queue.clear();
  if (!tid || !items.length) return;
  let data = null;
  try {
    const r = await fetch('/api/budget', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': S.uid }, body: JSON.stringify({ tid, checks: items.map(([, c]) => c) }) });
    if (r.ok) data = await r.json();
  } catch {}
  if (S.tid !== tid) return;
  // a failed check counts as "no budgets to compare" rather than retrying in a loop
  items.forEach(([k], i) => BQ.cache.set(k, data ? budgetShape(data.results[i]) : { ...NO_FIT, pending: false }));
  if (data) BQ.cap = data.band; else if (BQ.cap === undefined) BQ.cap = null;
  render();
}
// counts from the server → lists the UI can use: named people, then anonymous stand-ins
function budgetShape(r) {
  const list = g => [...g.ids.map(id => S.members.find(m => m.id === id) || { id, nick: 'Someone' }), ...Array.from({ length: Math.max(0, g.count - g.ids.length) }, (_, i) => ({ id: 'anon-' + i, nick: 'Someone' }))];
  return { n: r.n, unknown: r.total - r.n, fits: list(r.fits), stretch: list(r.stretch), over: list(r.over), hard: list(r.hard), hardOpen: list(r.hardOpen) };
}
function budgetLocal({ lo = 0, hi = 0, key = '', pitch }) {
  if (pitch) { const r = moneyRange((S.trip.pitches?.items || []).find(x => x.id === pitch)?.perPerson); lo = r ? r[0] : 0; hi = r ? r[1] : 0; }
  const ms = active().filter(m => +m.budget > 0), h = Math.max(lo, hi || lo), consent = ((S.trip.consent || {})[key]) || {};
  const hard = lo ? ms.filter(m => m.hard?.budget && lo > +m.budget) : [];
  return { n: ms.length, unknown: active().length - ms.length, fits: ms.filter(m => +m.budget >= h), stretch: ms.filter(m => +m.budget < h && +m.budget >= lo), over: ms.filter(m => +m.budget < lo), hard, hardOpen: hard.filter(m => !consent[m.id]) };
}
// extra: { exclude: [ids], myBudget } for "what if" questions (someone drops out, my budget changes)
function budgetFit(sum, extra) { return bq({ lo: Math.round(sum.low || 0), hi: Math.round(sum.high || 0), ...(extra || {}) }) || NO_FIT; }
// The tightest budget in the crew, as a band ("€250–300"), never the exact number. `cap` is
// the low end, which is what the AI and the suggested splits plan around.
const BAND_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
function bandOf(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), g = [0.1, 1, 10].flatMap(m => BAND_STEPS.map(x => x * e * m)); return { lo: Math.round(Math.max(...g.filter(x => x <= v))), hi: Math.round(Math.min(...g.filter(x => x > v))) }; }
function budgetCapShared() {
  let b;
  if (budgetsHere()) { const v = active().map(m => +m.budget || 0).filter(x => x > 0); b = v.length ? { ...bandOf(Math.min(...v)), n: v.length } : null; }
  else { bq({}); b = BQ.cap || null; }
  return b ? { cap: b.lo, lo: b.lo, hi: b.hi, n: b.n, label: `${money(b.lo)}–${money(b.hi)}` } : null;
}
const rangeText = (lo, hi) => `${money(lo)}${hi !== lo ? '–' + money(hi) : ''}`;
function costTab() {
  const sum = costSummary(), me = costSummary(S.trip, 'me'), fit = budgetFit(sum), ro = S.readOnly, mine = meDoc(), myB = +mine?.budget || 0;
  const differs = me.low !== sum.low || me.high !== sum.high;
  const empty = sum.rows.filter(r => !r.v || ['estimate', 'ai'].includes(r.v.src)).length;
  return `<section class="card stack cost">
    <div class="stack" style="gap:2px"><h2>The cost of saying yes</h2><span class="small muted">Per person, all in. Built from what’s booked or paid first, then quotes, then estimates.</span></div>
    <div class="cost-totals">
      <div class="cost-total"><span class="label">${differs ? 'You, all in' : 'Each person, all in'}</span><b>${me.any ? rangeText(me.low, me.high) : '—'}</b>${me.any ? alsoMine(me.low, me.high) : ''}
        <span class="small muted">${myB && me.any ? (me.high <= myB ? `Fits your ${money(myB)} budget.` : me.low <= myB ? `Could go over your ${money(myB)} budget.` : `Over your ${money(myB)} budget.`) + ' ' : ''}Includes a ${sum.buffer}% buffer.</span></div>
      ${differs && sum.any ? `<div class="cost-total soft"><span class="label">Typical for the crew</span><b>${rangeText(sum.low, sum.high)}</b>${alsoMine(sum.low, sum.high)}<span class="small muted">Everyone’s flights and shares differ a bit.</span></div>` : ''}
    </div>
    ${S.sample !== null && !ro ? `<div class="row" style="gap:8px;align-items:center"><button class="btn ${sum.any ? '' : 'primary'}" data-act="costAI" ${S.busy.cost || !dest() ? 'disabled' : ''}>${S.busy.cost ? '<i class="spin"></i>Estimating…' : sum.any ? 'Estimate the rest with AI' : 'Estimate it with AI'}</button>
      <span class="small muted">${!dest() ? `Pick ${isSmall() ? 'the plan' : 'where you’re going'} first.` : empty ? 'Fills only lines without a real quote or booking.' : 'Every line has a real number. Nice.'}</span></div>`
      : S.sample === null ? `<span class="small muted">AI estimates are off ${IN_CLAUDE ? 'for you right now' : 'until you add your Anthropic API key'}. Type in numbers below.</span>` : ''}
    ${sum.missing.length ? `<div class="cost-flag"><b>Not included yet:</b> ${sum.missing.map(r => esc(r.label.toLowerCase())).join(', ')}. The real total is higher than this.</div>` : ''}
    ${sum.estimates.length ? `<div class="cost-flag soft">${sum.estimates.length === 1 ? `${esc(sum.estimates[0].label)} is an estimate` : `${sum.estimates.length} lines are estimates`}, not live prices. Swap in a real quote when you have one.</div>` : ''}
    ${fit.n && sum.any ? `<div class="row" style="gap:6px">${fit.fits.length ? `<span class="pill lvl-in">Fits ${fit.fits.length}/${fit.n} budget${fit.n === 1 ? '' : 's'}</span>` : ''}${fit.stretch.length ? `<span class="pill lvl-maybe">A stretch for ${esc(budgetWho(fit.stretch))}</span>` : ''}${fit.over.length ? `<span class="pill out" style="color:#D63B3B">Over budget for ${esc(budgetWho(fit.over))}</span>` : ''}${fit.unknown ? `<span class="pill out">${fit.unknown} without a budget</span>` : ''}</div>` : ''}
    <div class="cost-rows">${sum.rows.map(r => { const m = me.rows.find(x => x.k === r.k), shown = m && m.v && m.v.src === 'booked' ? m : r;
      return `<div class="cost-row ${shown.v || m?.booked ? '' : 'empty-line'}">
      <div class="cost-what"><b>${esc(r.label)}${r.major && !shown.v && !m?.booked ? ' <span class="small" style="color:#D63B3B">· missing</span>' : ''}</b>
        <span class="small muted">${esc(shown.v?.note || r.hint)}</span>${S.trip.lastCosts?.[r.k] ? `<span class="small muted last-time">Last time: ${rangeText(Math.round(S.trip.lastCosts[r.k].low), Math.round(S.trip.lastCosts[r.k].high))}. Prices change, so check again.</span>` : ''}
        ${shown.v ? `<span class="cost-val"><b>${rangeText(Math.round(shown.v.low), Math.round(shown.v.high))}</b> <span class="src-tag s-${shown.v.src}">${esc(SRC_LABEL[shown.v.src] || shown.v.src)}</span>${shown.v.paid ? ` <span class="small muted">· ${money(shown.v.paid)} paid so far</span>` : ''}</span>` : ''}
      </div>
      ${m?.booked === 'noprice' ? `<div class="cost-in"><span class="src-tag s-booked">You’re booked</span><label style="flex:1 1 120px"><span class="sr-only">What you paid for your flight</span><input id="my-flight-price" type="number" min="0" inputmode="numeric" placeholder="What you paid"></label></div>`
      : shown.v && shown.v.src === 'booked' && r.k === 'travel' ? '' : ro ? '' : `<details class="cost-edit"><summary class="small">${r.v && !r.auto && r.v.src !== 'paid' ? 'Change' : 'Add a number'}</summary>
        <div class="cost-in">
          <label><span class="sr-only">${esc(r.label)} low</span><input id="cost-low-${r.k}" type="number" min="0" inputmode="numeric" placeholder="Low" value="${r.v && !r.auto && r.v.src !== 'paid' && r.v.src !== 'ai' ? Math.round(r.v.low) : ''}"></label>
          <span class="muted">–</span>
          <label><span class="sr-only">${esc(r.label)} high</span><input id="cost-high-${r.k}" type="number" min="0" inputmode="numeric" placeholder="High" value="${r.v && !r.auto && r.v.src !== 'paid' && r.v.src !== 'ai' ? Math.round(r.v.high) : ''}"></label>
          <select id="cost-src-${r.k}" aria-label="Where this number comes from">${[['estimate', 'My estimate'], ['quote', 'Real quote'], ['booked', 'Booked']].map(([k, l]) => `<option value="${k}" ${(r.v?.src || 'estimate') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>${r.auto ? `<button class="linkbtn small" data-costkeep="${r.k}">Keep the ${esc(SRC_LABEL[r.v.src].toLowerCase())} as the plan</button>` : ''}</details>`}
    </div>`; }).join('')}
    ${sum.other ? `<div class="cost-row"><div class="cost-what"><b>Other spending</b><span class="small muted">Logged expenses that don’t fit a line</span><span class="cost-val"><b>${money(sum.other)}</b> <span class="src-tag s-paid">Paid</span></span></div></div>` : ''}
    </div>
    <label class="row small" style="gap:8px;align-items:center">Buffer <select id="cost-buffer" style="width:auto" ${ro ? 'disabled' : ''}>${[0, 5, 10, 15, 20].map(n => `<option value="${n}" ${n === sum.buffer ? 'selected' : ''}>${n}%</option>`).join('')}</select> on top for surprises</label>
  </section>`;
}
// waits a beat so typing low then high saves both together; the values are read
// right away, since the tab may be gone by the time the save runs
const costT = {}, costPending = {};
function saveCostLine(k) {
  const el = id => $('#cost-' + id + '-' + k);
  costPending[k] = { low: el('low') ? el('low').value : costPending[k]?.low, high: el('high') ? el('high').value : costPending[k]?.high, src: el('src') ? el('src').value : costPending[k]?.src, tid: S.tid };
  clearTimeout(costT[k]); costT[k] = setTimeout(() => saveCostLineNow(k), 350);
}
function saveCostLineNow(k) {
  const { low, high, src = 'estimate', tid } = costPending[k] || {}; delete costPending[k];
  const l = Math.max(0, Math.round(+low || 0)), h = Math.max(0, Math.round(+high || 0));
  delete DRAFT['cost-low-' + k]; delete DRAFT['cost-high-' + k];
  if (!l && !h) return saveTrip({ costs: { [k]: null } }, tid);
  saveTrip({ costs: { [k]: { low: l || h, high: Math.max(l, h), src, by: S.uid, at: Date.now() } } }, tid);
}
// AI fills only the lines that don't have a real quote or booking yet.
function estimateCosts() {
  const lines = COST_LINES[size()], saved = S.trip.costs || {}, heads = planHeads();
  // skip what's already real: paid expenses, and flights once everyone's has a price
  const paid = paidSoFar('crew').by, fl = size() === 'trip' ? crewFlights() : null;
  const open = lines.filter(([k]) => (!saved[k] || ['estimate', 'ai'].includes(saved[k].src) && saved[k].by === 'ai') && !paid[k] && !(k === 'travel' && fl && fl.prices.length >= heads));
  if (!open.length) { flash('Every line already has a real number.'); return; }
  const sum = costSummary();
  const known = sum.rows.filter(r => r.v && !open.some(o => o[0] === r.k)).map(r => `${r.label}: $${Math.round(r.v.low)}–${Math.round(r.v.high)} (${SRC_LABEL[r.v.src] || r.v.src})`);
  askAI('cost', `${context()}
Home cities: ${homes().join(', ') || 'unknown'}. Planning for ${heads} ${heads === 1 ? 'person' : 'people'}.
Estimate what this costs PER PERSON in ${cur()}, as a realistic low–high range for each of these lines:
${open.map(([k, l, hint]) => `- ${k}: ${l} (${hint})`).join('\n')}
${known.length ? `Already known (don't change these): ${known.join('; ')}` : ''}
Be honest: no live prices, so give typical ranges for these dates and this group. Shared costs (like the stay) are per person after splitting.
Reply with only JSON: {"lines":{"${open[0][0]}":{"low":0,"high":0,"note":"what this covers, under 60 characters"}}}`, data => {
    const got = data && data.lines || {}, patch = {};
    for (const [k] of open) { const x = got[k]; if (!x) continue; const lo = Math.max(0, Math.round(+x.low || 0)), hi = Math.max(lo, Math.round(+x.high || 0)); if (!hi) continue; patch[k] = { low: lo, high: hi, src: 'ai', note: String(x.note || 'AI estimate').slice(0, 80), by: 'ai', at: Date.now() }; }
    if (!Object.keys(patch).length) { flash('No estimates came back. Try again.'); return; }
    flash(`Estimated ${Object.keys(patch).length} line${Object.keys(patch).length === 1 ? '' : 's'}. They’re marked as AI estimates.`);
    return saveTrip({ costs: patch });
  });
}

/* ---------- what if we changed this? ---------- */
// Compare alternatives side by side without touching the plan: a different start day,
// a different length, another destination or another kind of stay. Nothing is saved
// until someone taps "Make this the plan".
const STAY_KINDS = { hotel: 'Hotel', rental: 'Apartment / house', hostel: 'Hostel' };
function scenarioEval(sc = {}) {
  const t = S.trip, base = dates(), n0 = nightsSet(t), n = sc.nights ?? n0, vs = active();
  const start = sc.start || base?.start || null, end = start ? add(start, n) : null, days = start ? span(start, end) : [];
  const can = days.length ? vs.filter(m => fitOf(m, days)) : [];
  const prefer = days.length ? vs.filter(m => days.some(x => (m.pref || []).includes(x))) : [];
  const curDest = dest(), dsel = sc.dest ? (t.destinations || []).find(d => d.id === sc.dest) : curDest;
  let low = 0, high = 0, note = '';
  if (sc.dest && dsel && dsel.id !== curDest?.id) {
    // a different destination: only priced if a pitch for it has a price
    const p = (t.pitches?.items || []).find(x => !x.small && x.city.toLowerCase() === dsel.city.toLowerCase()), r = p && moneyRange(p.perPerson);
    if (r) { low = r[0]; high = r[1]; note = 'AI pitch estimate'; } else note = 'No price for this one yet';
  } else {
    const sum = costSummary(), dayF = (n + 1) / (n0 + 1), nightF = n0 ? n / n0 : 1, heads = planHeads();
    for (const r of sum.rows) {
      let v = r.v;
      if (r.k === 'stay' && sc.stay) {
        const pn = (t.stays?.items || []).filter(s => s.kind === sc.stay).map(s => moneyRange(s.perNight)).filter(Boolean);
        v = pn.length ? { low: Math.min(...pn.map(x => x[0])) * n0 / heads, high: Math.max(...pn.map(x => x[1])) * n0 / heads } : v;
      }
      if (!v) continue;
      const f = r.k === 'stay' ? nightF : ['food', 'local', 'fun', 'getting'].includes(r.k) ? dayF : 1;
      low += v.low * f; high += v.high * f;
    }
    low = Math.round(low * (1 + sum.buffer / 100)); high = Math.round(high * (1 + sum.buffer / 100));
    if (!sum.any) note = 'Fill in All-in cost to compare prices';
  }
  const priced = low || high, fit = priced ? budgetFit({ low, high }) : null;
  return { start, end, n, can, prefer, dest: dsel, low, high, priced, fit, note, stay: sc.stay || '' };
}
function whatifTab() {
  const t = S.trip, small = isSmall(), base = scenarioEval({}), scs = S.whatif || [{}];
  const cols = [{ label: 'Now', r: base, cur: true }, ...scs.map((sc, i) => ({ label: `What if ${String.fromCharCode(65 + i)}`, r: scenarioEval(sc), sc, i }))];
  const vs = active(), starts = span(t.winStart, t.winEnd), dests = t.destinations || [], kinds = [...new Set((t.stays?.items || []).map(s => s.kind))];
  const diff = (a, b, fmtd, better) => a === b ? '' : `<span class="wi-d ${better(a, b) ? 'up' : 'down'}">${fmtd(a, b)}</span>`;
  // spell out the current plan: what's locked, and what's only the best guess so far
  const nowText = () => {
    const ld = t.lockedDest ? dest() : null, lean = !ld && dest(), dd = t.lockedDates, r = base;
    const when = r.start ? (small ? fmt(r.start) : dayRange(r.start, r.end)) : '';
    return `<div class="wi-now">
      <span><b>${small ? 'Plan' : 'Where'}:</b> ${ld ? `${esc(ld.city)} <em class="lk">locked</em>` : lean ? `${esc(lean.city)} <em>leading, not locked</em>` : '<em>not picked yet</em>'}</span>
      <span><b>${small ? 'Day' : 'Dates'}:</b> ${dd ? `${esc(when)} <em class="lk">locked</em>` : when ? `${esc(when)} <em>best so far, not locked</em>` : '<em>not picked yet</em>'}</span>
      ${small ? '' : `<span><b>Length:</b> ${nightsSet(t)} night${nightsSet(t) === 1 ? '' : 's'}</span>`}
      ${t.stay ? `<span><b>Stay:</b> ${esc(t.stay.name)}</span>` : ''}
    </div>`;
  };
  const controls = c => c.cur ? nowText() : `<div class="wi-ctl">
      <label><span class="label">${small ? 'Day' : 'Start'}</span><select id="wi-start-${c.i}">${starts.map(d => `<option value="${d}" ${d === c.r.start ? 'selected' : ''}>${fmt(d)}</option>`).join('')}</select></label>
      ${small ? '' : `<label><span class="label">Length</span><select id="wi-nights-${c.i}">${[1, 2, 3, 4, 5, 6, 7, 10, 14].map(n => `<option value="${n}" ${n === c.r.n ? 'selected' : ''}>${n} night${n === 1 ? '' : 's'}</option>`).join('')}</select></label>`}
      ${dests.length > 1 ? `<label><span class="label">${small ? 'Plan' : 'Where'}</span><select id="wi-dest-${c.i}">${dests.map(d => `<option value="${esc(d.id)}" ${d.id === c.r.dest?.id ? 'selected' : ''}>${esc(d.city)}</option>`).join('')}</select></label>` : ''}
      ${kinds.length > 1 ? `<label><span class="label">Stay</span><select id="wi-stay-${c.i}"><option value="">Same as now</option>${kinds.map(k => `<option value="${k}" ${k === c.sc.stay ? 'selected' : ''}>${STAY_KINDS[k] || k}</option>`).join('')}</select></label>` : ''}
    </div>`;
  const row = (label, f) => `<div class="wi-row"><span class="wi-k">${label}</span>${cols.map(c => `<div class="wi-v">${f(c)}</div>`).join('')}</div>`;
  return `<section class="card stack whatif">
    <div class="stack" style="gap:2px"><h2>What if we changed this?</h2><span class="small muted">Try a different ${small ? 'day or plan' : 'start, length, place or stay'} and see what it does to who can come and what it costs. Nothing changes until you pick one.</span></div>
    <div class="wi-grid" style="--cols:${cols.length}">
      <div class="wi-row wi-head"><span class="wi-k"></span>${cols.map(c => `<div class="wi-v"><b>${c.label}</b>${c.cur ? '' : `<button class="x" data-wirm="${c.i}" aria-label="Remove ${c.label}">×</button>`}</div>`).join('')}</div>
      <div class="wi-row"><span class="wi-k"></span>${cols.map(c => `<div class="wi-v">${controls(c)}</div>`).join('')}</div>
      ${row(small ? 'When' : 'Dates', c => c.r.start ? (small ? fmt(c.r.start) : dayRange(c.r.start, c.r.end)) : '—')}
      ${dests.length ? row(small ? 'Plan' : 'Where', c => esc(c.r.dest?.city || '—')) : ''}
      ${row('Can come', c => `<b>${c.r.can.length}/${vs.length}</b>${c.cur ? '' : diff(c.r.can.length, base.can.length, (a, b) => (a > b ? '+' : '') + (a - b), (a, b) => a > b)}${vs.filter(m => !c.r.can.includes(m)).length && c.r.start ? `<span class="small muted">Not ${esc(listNames(vs.filter(m => !c.r.can.includes(m))))}</span>` : ''}`)}
      ${row('Prefer it', c => `${c.r.prefer.length}/${vs.length}`)}
      ${row('Each, all in', c => c.r.priced ? `<b>${money(c.r.low)}${c.r.high !== c.r.low ? '–' + money(c.r.high) : ''}</b>${c.cur || !base.priced ? '' : diff(c.r.high, base.high, (a, b) => (a > b ? '+' : '−') + money(Math.abs(a - b)), (a, b) => a < b)}${c.r.note ? `<span class="small muted">${esc(c.r.note)}</span>` : ''}` : `<span class="small muted">${esc(c.r.note || 'Unknown')}</span>`)}
      ${row('Fits budgets', c => c.r.fit && c.r.fit.n ? `${c.r.fit.fits.length}/${vs.length}${c.r.fit.over.length ? `<span class="small" style="color:#C2383A">Over for ${esc(budgetWho(c.r.fit.over))}</span>` : ''}` : '<span class="small muted">—</span>')}
      ${S.readOnly ? '' : `<div class="wi-row"><span class="wi-k"></span>${cols.map(c => `<div class="wi-v">${c.cur ? '' : `<button class="btn sm primary" data-wiapply="${c.i}">Make this the plan</button>`}</div>`).join('')}</div>`}
    </div>
    ${scs.length < 2 ? '<div><button class="btn sm" data-act="wiAdd">+ Compare another</button></div>' : ''}
  </section>`;
}
function whatifSet(i, patch) { S.whatif = (S.whatif || [{}]).map((sc, j) => j === i ? { ...sc, ...patch } : sc); render(); }
function whatifApply(i) {
  const sc = (S.whatif || [])[i]; if (!sc) return;
  const r = scenarioEval(sc), patch = {};
  if (sc.nights != null && !isSmall()) patch.nights = sc.nights;
  if (sc.start || sc.nights != null) patch.lockedDates = { start: r.start, end: r.end };
  if (sc.dest) patch.lockedDest = sc.dest;
  if (!Object.keys(patch).length) { flash('That’s the same as the plan now.'); return; }
  S.whatif = null; saveTrip(patch);
  flash(`Done. The plan is now ${[r.dest?.city, isSmall() ? fmt(r.start) : dayRange(r.start, r.end)].filter(Boolean).join(', ')}.`);
}

/* ---------- plan recovery engine ---------- */
// Every change goes through one path. Someone drops out, a price moves, a budget changes,
// the dates slip, a place closes: the engine runs the plan twice (as it is, and with the
// change), compares the two, and lists what moves: headcount, each person's share,
// budgets, conditions, hard limits, bookings, to-dos and the itinerary. Then it offers
// next steps that become real to-dos or a crew check-in. Nothing starts over. Changes
// made outside this card (someone taps "Can't make it") are worked out and logged too.
const $all = s => [...document.querySelectorAll(s)];
const CHANGES = [['drop', 'Someone dropped out'], ['price', 'A price changed'], ['budget', 'My budget changed'], ['dates', 'Dates moved'], ['closed', 'A place closed']];
// run fn as if the plan looked like trip/members, then put everything back
function withPlan(trip, members, fn) { const t0 = S.trip, m0 = S.members; S.trip = trip; S.members = members; try { return fn(); } finally { S.trip = t0; S.members = m0; } }
function planState(extra) {
  const sum = costSummary(), fit = budgetFit(sum, extra), heads = planHeads(), st = S.trip.stay, stayRow = sum.rows.find(r => r.k === 'stay');
  const L = S.trip.lockedDates, ldays = L ? span(L.start, L.end) : null;
  return {
    heads, low: sum.low, high: sum.high, any: sum.any,
    stayEach: st && +st.total ? Math.round(st.total / heads) : stayRow?.v ? Math.round(stayRow.v.high) : 0,
    over: fit.over.map(m => m.id), stretch: fit.stretch.map(m => m.id),
    condOff: active().filter(m => +m.cond?.under > 0 && sum.any && sum.low > +m.cond.under).map(m => m.id),
    hardBudget: sum.any ? budgetFit(sum, extra).hard.map(m => m.id) : [],
    hardDays: ldays ? active().filter(m => m.hard?.days && (m.days || []).length && !fitOf(m, ldays)).map(m => m.id) : [],
  };
}
// the plan with the change applied, without saving anything
function simulate(ch) {
  const t = JSON.parse(JSON.stringify(S.trip)), ms = S.members.map(m => ({ ...m }));
  if (ch.kind === 'drop') { const m = ms.find(x => x.id === ch.who); if (m) m.status = 'out'; }
  if (ch.kind === 'budget') { const m = ms.find(x => x.id === S.uid); if (m) m.budget = ch.amount; }
  if (ch.kind === 'price') {
    if (ch.line === 'stay' && t.stay) t.stay.total = ch.amount;
    else t.costs = { ...(t.costs || {}), [ch.line]: { low: ch.amount, high: ch.amount, src: 'quote' } };
  }
  if (ch.kind === 'dates') t.lockedDates = ch.start && ch.end ? { start: ch.start, end: ch.end } : null;
  if (ch.kind === 'closed') t.itinerary = (t.itinerary || []).filter(i => i.id !== ch.item);
  return { trip: t, members: ms };
}
const nm = id => S.members.find(m => m.id === id)?.nick || 'Someone';
const lineLabel = k => (COST_LINES[size()].find(l => l[0] === k) || [k, k])[1];
// what a change does, as before → after rows plus the things it leaves hanging
function changeImpact(ch) {
  const before = planState(), sim = simulate(ch), after = withPlan(sim.trip, sim.members, () => planState(ch.kind === 'drop' ? { exclude: [ch.who] } : ch.kind === 'budget' ? { myBudget: ch.amount } : undefined));
  const fx = [], add = (area, text, level = 'info', from = '', to = '') => fx.push({ area, text, level, from, to });
  if (before.heads !== after.heads) add('Headcount', `${after.heads < before.heads ? 'Down' : 'Up'} to ${after.heads}`, 'info', before.heads, after.heads);
  if (before.stayEach && after.stayEach && before.stayEach !== after.stayEach) add('Stay, each', after.stayEach > before.stayEach ? 'Each share goes up' : 'Each share goes down', after.stayEach > before.stayEach ? 'warn' : 'good', money(before.stayEach), money(after.stayEach));
  if (before.any && (before.low !== after.low || before.high !== after.high)) add('All in, each', after.high > before.high ? 'More per person' : 'Less per person', after.high > before.high ? 'warn' : 'good', rangeText(before.low, before.high), rangeText(after.low, after.high));
  const newly = (k) => after[k].filter(id => !before[k].includes(id) && id !== ch.who), cleared = k => before[k].filter(id => !after[k].includes(id) && id !== ch.who);
  const ms = ids => S.members.filter(m => ids.includes(m.id));
  if (newly('over').length) add('Budgets', `Now over budget for ${budgetWho(ms(newly('over')))}`, 'bad');
  if (cleared('over').length) add('Budgets', `Back within budget for ${budgetWho(ms(cleared('over')))}`, 'good');
  for (const id of newly('condOff')) add('Conditions', `${nm(id)} said they’re in if it stays under ${money(S.members.find(m => m.id === id).cond.under)}. That’s no longer true.`, 'bad');
  for (const id of cleared('condOff')) add('Conditions', `${nm(id)}’s condition (under ${money(S.members.find(m => m.id === id).cond.under)}) is met again.`, 'good');
  if (newly('hardBudget').length) add('Hard limits', `Breaks a hard budget limit for ${budgetWho(ms(newly('hardBudget')))}. They have to agree.`, 'bad');
  if (newly('hardDays').length) add('Hard limits', `${listNames(ms(newly('hardDays')))} can’t do these dates, and said their days are firm.`, 'bad');
  const tk = S.trip.tickets || {}, stay = S.trip.stay;
  if (ch.kind === 'drop') {
    const who = S.members.find(m => m.id === ch.who);
    const tasks = taskList().filter(x => !x.done && x.owner === ch.who);
    if (tasks.length) add('To-dos', `${tasks.length} to-do${tasks.length === 1 ? ' needs' : 's need'} a new owner`, 'warn');
    if (tk[ch.who]) add('Bookings', `${nm(ch.who)} already booked a flight. Check for a refund or a name change.`, 'warn');
    if (stay && stay.booked) add('Bookings', `The stay is booked for ${before.heads}. Check whether it can change or refund a share.`, 'warn');
    if (S.trip.honoree === ch.who) add('Roles', `They were the ${mode().honoree}. Pick someone new in Settings.`, 'warn');
    if (who && !going(who)) add('Headcount', 'They hadn’t said they were going, so the count doesn’t change.', 'info');
  }
  if (ch.kind === 'dates') {
    const days = ch.start && ch.end ? span(ch.start, ch.end) : null, items = (S.trip.itinerary || []).filter(i => i.date && (!days || !days.includes(i.date)));
    if (days) { const cant = active().filter(m => (m.days || []).length && !fitOf(m, days) && !after.hardDays.includes(m.id)); if (cant.length) add('Who can make it', `${listNames(cant)} didn’t mark these days as free`, 'warn'); }
    if (items.length) add('Itinerary', `${items.length} stop${items.length === 1 ? ' is' : 's are'} on ${days ? 'days outside the new dates' : 'the old dates'}`, 'warn');
    const booked = Object.keys(tk).filter(u => S.members.some(m => m.id === u && going(m)));
    if (booked.length) add('Bookings', `${booked.length} flight${booked.length === 1 ? ' is' : 's are'} already booked for the old dates`, 'warn');
    if (stay && stay.booked) add('Bookings', 'The stay is booked for the old dates', 'warn');
  }
  if (ch.kind === 'closed') { const it = (S.trip.itinerary || []).find(i => i.id === ch.item); if (it) add('Itinerary', `${it.title} comes out of the plan`, 'info'); }
  return { fx, before, after, sim };
}
// next steps for a change; each one becomes a to-do, an update or a crew check-in
function changeActions(ch, imp) {
  const out = [], tk = S.trip.tickets || {}, stay = S.trip.stay, worse = imp.fx.some(f => f.level === 'bad');
  if (ch.kind === 'drop') {
    const n = nm(ch.who);
    if (tk[ch.who] || (stay && stay.booked)) out.push({ id: 'refund', label: `Add a to-do: check refunds${tk[ch.who] ? ` or a name change for ${n}’s flight` : ''}${stay && stay.booked ? `${tk[ch.who] ? ' and' : ''} on the stay` : ''}`, on: true });
    out.push({ id: 'replace', label: 'Add a to-do: find someone to take the spot', on: false });
    if (taskList().some(x => !x.done && x.owner === ch.who)) out.push({ id: 'reassign', label: 'Hand their to-dos to someone', on: true });
  }
  if (ch.kind === 'dates' && ch.start && ch.end) {
    const old = S.trip.lockedDates, items = (S.trip.itinerary || []).filter(i => i.date);
    if (old && items.length) out.push({ id: 'shift', label: `Move the itinerary along with the dates (${items.length} stop${items.length === 1 ? '' : 's'})`, on: true });
    if (Object.keys(tk).some(u => S.members.some(m => m.id === u && going(m)))) out.push({ id: 'flights', label: 'Add a to-do: change booked flights to the new dates', on: true });
    if (stay && stay.booked) out.push({ id: 'staymove', label: 'Add a to-do: move the stay booking', on: true });
  }
  if (ch.kind !== 'budget') out.push({ id: 'ask', label: 'Ask the crew: keep going, change the plan, or call it off?', on: worse });
  return out;
}
const changeText = ch => ch.kind === 'drop' ? `${nm(ch.who)} dropped out`
  : ch.kind === 'price' ? `${lineLabel(ch.line)} is now ${money(ch.amount)}${ch.line === 'stay' && S.trip.stay ? ' total' : ' each'}`
  : ch.kind === 'dates' ? (ch.start ? `Dates moved to ${dayRange(ch.start, ch.end)}` : 'Dates reopened')
  : ch.kind === 'closed' ? `${(S.trip.itinerary || []).find(i => i.id === ch.item)?.title || 'A stop'} is off`
  : 'Budget changed';
// the change being worked out in the card, from its inputs; null until it's complete
function draftChange() {
  const k = S.recover, r = S.rc || {};
  if (k === 'drop') return r.who ? { kind: k, who: r.who } : null;
  if (k === 'price') return r.line && +r.amount > 0 ? { kind: k, line: r.line, amount: Math.round(+r.amount) } : null;
  if (k === 'budget') return +r.amount > 0 ? { kind: k, amount: Math.round(+r.amount) } : null;
  if (k === 'dates') return r.reopen ? { kind: k } : r.start && r.end && r.end >= r.start ? { kind: k, start: r.start, end: r.end } : null;
  if (k === 'closed') return r.item ? { kind: k, item: r.item } : null;
  return null;
}
function impactList(imp) {
  if (!imp.fx.length) return '<p class="small muted">Nothing else moves. Everyone’s share, budgets and bookings stay the same.</p>';
  return `<ul class="impact">${imp.fx.map(f => `<li class="fx-${f.level}"><span class="label">${esc(f.area)}</span><span>${f.from !== '' ? `<b class="mono">${esc(String(f.from))} → ${esc(String(f.to))}</b> ` : ''}${f.from !== '' ? `<span class="small muted">${esc(f.text)}</span>` : esc(f.text)}</span></li>`).join('')}</ul>`;
}
function recoveryCard() {
  if (S.demo || S.readOnly || S.members.length < 2 && !S.trip.lockedDest && !S.trip.lockedDates) return '';
  const k = S.recover, r = S.rc || {};
  if (!k) return `<section class="card recover-bar"><span><b>Something changed?</b> <span class="small muted">See what it affects before anything changes.</span></span>
    <div class="row" style="gap:6px">${CHANGES.map(([v, l]) => `<button class="chip" data-recover="${v}">${l}</button>`).join('')}</div></section>`;
  const close = '<button class="btn sm ghost" data-recover="">Cancel</button>';
  let form = '';
  if (k === 'drop') form = `<label class="field" style="flex:none"><span class="label">Who?</span><select id="recover-who"><option value="">Pick someone</option>${S.members.filter(m => m.status !== 'out' && !m.removed).map(m => `<option value="${esc(m.id)}" ${r.who === m.id ? 'selected' : ''}>${esc(m.nick || 'Someone')}${m.id === S.uid ? ' (you)' : ''}</option>`).join('')}</select></label>`;
  if (k === 'price') form = `<div class="row" style="gap:8px;align-items:flex-end"><label class="field" style="flex:1 1 160px"><span class="label">What changed?</span><select id="rc-line"><option value="">Pick one</option>${COST_LINES[size()].map(([lk, l]) => `<option value="${lk}" ${r.line === lk ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="field" style="flex:1 1 160px"><span class="label">${r.line === 'stay' && S.trip.stay ? `New total for the stay (${cur()})` : `New price per person (${cur()})`}</span><input id="rc-amount" type="number" min="0" inputmode="numeric" value="${r.amount || ''}"></label></div>`;
  if (k === 'budget') form = `<label class="field" style="flex:none;max-width:240px"><span class="label">Your max now (${cur()})</span><input id="rc-amount" type="number" min="0" inputmode="numeric" value="${r.amount || meDoc()?.budget || ''}"></label><span class="small muted">Private. The crew only sees whether the plan fits.</span>`;
  if (k === 'dates') { const d = S.trip.lockedDates; form = `${d ? `<p class="small">Right now: <b>${dayRange(d.start, d.end)}</b>.</p>` : ''}<div class="row" style="gap:8px"><label class="field"><span class="label">New start</span><input id="rc-start" type="date" value="${r.start || ''}"></label><label class="field"><span class="label">New end</span><input id="rc-end" type="date" value="${r.end || ''}"></label></div>
      <label class="check-line"><input type="checkbox" id="rc-reopen" ${r.reopen ? 'checked' : ''}> We don’t know yet. Reopen the dates and keep everyone’s free days.</label>`; }
  if (k === 'closed') { const items = visItems().filter(i => !i.hidden); form = items.length ? `<label class="field" style="flex:none"><span class="label">What’s affected?</span><select id="recover-item"><option value="">Pick a stop</option>${items.map(i => `<option value="${esc(i.id)}" ${r.item === i.id ? 'selected' : ''}>${esc((i.date ? short(i.date) + ' · ' : '') + (i.time ? t12(i.time) + ' · ' : '') + i.title)}</option>`).join('')}</select></label>` : `<p class="small muted">Nothing is planned yet, so nothing to replace. If the whole ${planWord()} is off, go back to ${isSmall() ? 'Plan' : 'Trip'} Match.</p>`; }
  const ch = draftChange(), imp = ch ? changeImpact(ch) : null, acts = ch ? changeActions(ch, imp) : [];
  const orphan = ch && ch.kind === 'drop' ? taskList().filter(x => !x.done && x.owner === ch.who) : [], others = S.members.filter(m => going(m) && m.id !== ch?.who);
  const alts = k === 'closed' && S.alts && S.alts.item === r.item ? S.alts.options : null;
  return `<section class="card stack recover" id="recover-box">
    <div class="row" style="justify-content:space-between"><h3>${esc(CHANGES.find(c => c[0] === k)[1])}</h3>${close}</div>
    ${form}
    ${imp ? `<div class="stack" style="gap:8px"><span class="label">What this changes</span>${impactList(imp)}</div>
      ${acts.length ? `<div class="stack" style="gap:6px"><span class="label">Next steps</span>${acts.map(a => `<label class="check-line"><input type="checkbox" id="rc-act-${a.id}" ${(r.acts || {})[a.id] ?? a.on ? 'checked' : ''}> ${esc(a.label)}</label>
        ${a.id === 'reassign' ? `<div class="stack" style="gap:6px;padding-left:24px">${orphan.map(x => `<label class="row small" style="gap:8px"><span style="flex:1;min-width:0">${esc(x.title)}</span><select id="rc-owner-${esc(x.id)}" style="width:auto"><option value="">Nobody yet</option>${others.map(m => `<option value="${esc(m.id)}">${esc(m.nick || 'Someone')}</option>`).join('')}</select></label>`).join('')}</div>` : ''}`).join('')}</div>` : ''}
      ${k === 'closed' ? `<div class="row" style="gap:6px">${S.sample ? `<button class="btn sm" data-act="recoverAlts" ${S.busy.alts ? 'disabled' : ''}>${S.busy.alts ? '<i class="spin"></i>Finding options…' : 'Find replacements'}</button>` : ''}</div>
        ${alts ? `<div class="stack" style="gap:8px">${alts.map((o, j) => `<div class="linkrow"><div style="min-width:0"><b>${esc(o.title)}</b><div class="small muted">${esc(o.why || '')}</div></div><button class="btn sm" data-swapin="${j}">Swap in</button></div>`).join('')}</div>` : ''}
        <form id="swapForm" class="row" style="gap:6px;align-items:flex-end"><label class="field" style="flex:1 1 200px"><span class="label">Or replace it with</span><input id="swap-title" maxlength="80" placeholder="Indoor alternative"></label><button class="btn sm" type="submit">Replace</button></form>` : ''}
      <div class="row" style="gap:6px"><button class="btn primary" data-act="recoverApply">${k === 'drop' ? `Mark ${esc(nm(ch.who))} as out` : k === 'price' ? 'Update the price' : k === 'budget' ? 'Update my budget' : k === 'dates' ? (ch.start ? 'Move the dates' : 'Reopen the dates') : 'Just drop it'}</button></div>` : ''}
  </section>`;
}
// pick up the checkboxes and owner picks before the card re-renders
function readRcActs() { const acts = {}; $all('[id^="rc-act-"]').forEach(el => { acts[el.id.slice(7)] = el.checked; }); return acts; }
async function applyChange(ch, picks = {}, opts = {}) {
  const imp = changeImpact(ch), acts = changeActions(ch, imp), on = id => acts.some(a => a.id === id) && (picks[id] ?? acts.find(a => a.id === id).on);
  const owners = {}; $all('[id^="rc-owner-"]').forEach(el => { if (el.value) owners[el.id.slice(9)] = el.value; });
  const patch = {}, tasks = {}, newTask = (title, owner = '') => { tasks[rid(6)] = { title, owner, due: '', done: false, by: S.uid, at: Date.now() }; };
  try {
    if (ch.kind === 'drop') {
      const who = S.members.find(m => m.id === ch.who); if (!who) return;
      if (who.id === S.uid) saveMe({ status: 'out', droppedAt: Date.now() }, true);
      else if (!opts.already) await S.db.doc(`trips/${S.tid}/members/${who.id}`).update({ status: 'out', droppedAt: Date.now() });
      for (const x of taskList().filter(x => !x.done && x.owner === ch.who)) tasks[x.id] = { owner: on('reassign') ? owners[x.id] || '' : '' };
      if (on('refund')) newTask(`Check refunds for ${nm(ch.who)}’s ${[(S.trip.tickets || {})[ch.who] && 'flight', S.trip.stay?.booked && 'stay share'].filter(Boolean).join(' and ')}`, ch.who === S.uid ? S.uid : '');
      if (on('replace')) newTask(`Find someone to take ${nm(ch.who)}’s spot`, S.uid);
    }
    if (ch.kind === 'price') {
      if (ch.line === 'stay' && S.trip.stay) patch.stay = { total: ch.amount };
      else patch.costs = { [ch.line]: { low: ch.amount, high: ch.amount, src: 'quote', by: S.uid } };
    }
    if (ch.kind === 'budget') saveMe({ budget: ch.amount }, true);
    if (ch.kind === 'dates') {
      const old = S.trip.lockedDates;
      patch.lockedDates = ch.start ? { start: ch.start, end: ch.end } : null;
      if (on('shift') && old) { const off = Math.round((D(ch.start) - D(old.start)) / 864e5); patch.itinerary = (S.trip.itinerary || []).map(i => i.date ? { ...i, date: add(i.date, off) } : i); }
      if (on('flights')) newTask('Change booked flights to the new dates');
      if (on('staymove')) newTask('Move the stay booking to the new dates');
    }
    if (ch.kind === 'closed') patch.itinerary = (S.trip.itinerary || []).filter(i => i.id !== ch.item);
    if (Object.keys(tasks).length) patch.tasks = tasks;
    if (on('ask')) patch.check = { id: rid(6), q: `${changeText(ch)}. What do we do?`, by: S.uid, at: Date.now(), votes: {} };
    // budgets are private, so a budget change isn't logged for the crew
    const fxs = imp.fx.filter(f => !(ch.kind === 'dates' && on('shift') && f.area === 'Itinerary'));
    const undo = ch.kind === 'drop' ? { k: 'status', uid: ch.who, status: S.members.find(m => m.id === ch.who)?.status || 'in' }
      : ch.kind === 'price' ? { k: 'set', patch: ch.line === 'stay' && S.trip.stay ? { stay: { total: S.trip.stay.total || 0 } } : { costs: { [ch.line]: (S.trip.costs || {})[ch.line] || null } } }
      : ch.kind === 'dates' ? { k: 'set', patch: { lockedDates: S.trip.lockedDates || null, ...(patch.itinerary ? { itinerary: S.trip.itinerary || [] } : {}) } }
      : ch.kind === 'closed' ? { k: 'item', item: (S.trip.itinerary || []).find(i => i.id === ch.item) } : null;
    if (ch.kind !== 'budget') Object.assign(patch, withLog(patch, { area: ch.kind, text: changeText(ch), fx: fxs.filter(f => f.level !== 'info' || f.from !== '').slice(0, 6).map(f => f.from !== '' ? `${f.area}: ${f.from} → ${f.to}` : f.text), act: ch.kind === 'price' && !fxs.some(f => f.level === 'bad') ? '' : 'all', ...(undo ? { undo } : {}) }));
    if (Object.keys(patch).length) await saveTrip(patch);
    S.recover = null; S.rc = null; S.alts = null; render();
    const top = fxs.find(f => f.from !== '') || fxs[0];
    if (!opts.quiet) flash(`${changeText(ch)}. ${top ? (top.from !== '' ? `${top.area}: ${top.from} → ${top.to}.` : top.text.replace(/\.$/, '') + '.') : 'Nothing else moves.'}`);
  } catch (e) { flash(writeErr(e)); }
}
// when someone drops out some other way, still work out what it changed and log it
function logDrop(uid) {
  if (S.demo || !S.trip) return;
  const ch = { kind: 'drop', who: uid }, imp = changeImpact(ch), id = rid(6);
  const tasks = taskList().filter(x => !x.done && x.owner === uid);
  return saveTrip({ changes: { [id]: { act: 'all', seen: { [S.uid]: true }, undo: { k: 'status', uid, status: S.members.find(m => m.id === uid)?.status || 'in' }, text: changeText(ch), fx: [...imp.fx.filter(f => f.from !== '').map(f => `${f.area}: ${f.from} → ${f.to}`), ...imp.fx.filter(f => f.level === 'bad').map(f => f.text), ...(tasks.length ? [`${tasks.length} to-do${tasks.length === 1 ? ' needs' : 's need'} a new owner`] : [])].slice(0, 6), by: S.uid, at: Date.now() } } });
}
// the last few changes and the crew check-in, on the overview
function changesCard() {
  if (S.demo) return '';
  const list = Object.entries(S.trip.changes || {}).filter(([, x]) => x).sort((a, b) => b[1].at - a[1].at).slice(0, 3), c = S.trip.check;
  if (!list.length && !c) return '';
  const opts = [['go', 'Keep going as planned'], ['change', 'Change the plan'], ['stop', 'Call it off']], votes = c?.votes || {}, mine = votes[S.uid];
  const count = k => Object.values(votes).filter(v => v === k).length, n = active().length, answered = Object.keys(votes).length;
  return `<section class="card stack changes">
    ${c ? `<div class="stack check" style="gap:8px"><span class="label" style="color:var(--accent)">Crew check-in</span><b>${esc(c.q)}</b>
      <div class="ro-opts">${opts.map(([k, l]) => `<button class="ro-opt ${mine === k ? 'on' : ''}" data-check="${k}" aria-pressed="${mine === k}" ${S.readOnly ? 'disabled' : ''}><b>${l}</b><span class="ro-count">${count(k)} vote${count(k) === 1 ? '' : 's'}${mine === k ? ' · yours' : ''}</span></button>`).join('')}</div>
      <div class="row" style="justify-content:space-between;gap:8px"><span class="small muted">${answered} of ${n} answered · ${esc(STYLES[decideOf().style][0])}</span>${isOrganizer() || c.by === S.uid ? '<button class="linkbtn small" data-act="checkClose">Close it</button>' : ''}</div></div>` : ''}
    ${list.length ? `<div class="stack" style="gap:8px"><div class="row" style="justify-content:space-between"><span class="label">What changed</span><button class="linkbtn small" data-tab="log">See all</button></div><div class="log-list">${logList().slice(0, 3).map(x => logRow(x, { short: true })).join('')}</div></div>` : ''}
  </section>`;
}
function recoverAlts() {
  const it = visItems().find(i => i.id === (S.rc || {}).item); if (!it) return;
  const ds = dest();
  askAI('alts', `${context()}
One stop in this plan can't happen anymore (bad weather, closed, or sold out): "${it.title}"${it.date ? ` on ${it.date}` : ''}${it.time ? ` at ${it.time}` : ''}${it.note ? ` (${it.note})` : ''}.
Suggest 3 real replacements in ${ds?.city || S.trip.city || 'the same area'} that fit the same slot, the crew's budget and vibe. Prefer indoor options if weather could be the reason. Keep everything else in the plan as it is.
Reply with only JSON: {"options":[{"title":"place or activity","why":"one sentence"}]}`, data => {
    const options = (Array.isArray(data?.options) ? data.options : []).filter(o => o && o.title).slice(0, 3).map(o => ({ title: String(o.title).slice(0, 80), why: String(o.why || '').slice(0, 160) }));
    if (!options.length) { flash('No replacements came back. Try again.'); return; }
    S.alts = { item: it.id, options };
  });
}
function swapItem(title) {
  title = String(title || '').trim().slice(0, 80); if (!title) return;
  const id = (S.rc || {}).item, old = (S.trip.itinerary || []).find(i => i.id === id); if (!old) return;
  saveTrip({ itinerary: (S.trip.itinerary || []).map(i => i.id === id ? { ...i, title, note: `Instead of ${old.title}`, ai: false } : i), ...withLog({}, { area: 'plan', text: `${old.title} swapped for ${title}`, act: 'all', undo: { k: 'item', item: old } }) });
  S.alts = null; S.recover = null; S.rc = null;
  flash(`Swapped in ${title}.`);
}
/* ---------- privacy + guest controls ---------- */
// Organizers (the creator plus anyone they add) control the invite link and who can
// invite or lock decisions, and can remove people. Each person controls whether their
// budget and check-ins are visible. Until real accounts exist this is enforced by the
// app, not by the server, so it keeps honest people honest rather than stopping a hacker.
const isOrgOf = t => !!t && (t.createdBy === S.uid || !!(t.orgs || {})[S.uid]);
const canInvite = (t = S.trip) => S.demo || (!t.invitesOff && ((t.perm || {}).invite !== 'org' || isOrgOf(t)));
const canLock = () => S.demo || (S.trip.perm || {}).lock !== 'org' || isOrganizer();
const linkFor = t => SHARE_BASE + '#' + t.id + (t.inviteKey ? '.' + t.inviteKey : '');
// "#abc123" or "#abc123.k7x9" (a plan id plus the current invite key)
const parseTripHash = h => { const m = String(h || '').match(/^([a-z0-9]{6,20})(?:\.([a-z0-9]{4,12}))?$/); return m ? { tid: m[1], key: m[2] || '' } : null; };
function accessState() {
  const t = S.trip; if (!t || S.demo) return 'ok';
  const me = meDoc();
  if (me && me.removed) return 'removed';
  if (me || (t.people || {})[S.uid] || t.createdBy === S.uid || (t.crewId && myCrews().some(c => c.id === t.crewId))) return 'ok';
  if (t.invitesOff) return 'off';
  if (t.inviteKey && S.linkKey !== t.inviteKey) return 'stale';
  return 'ok';
}
function blockedView(st) {
  const msg = { removed: ['You’re no longer in this plan', 'An organizer took you off it. If that’s a mistake, ask them to add you back.'],
    off: ['This plan isn’t taking new people', 'The organizer turned invites off. Ask whoever sent you the link.'],
    stale: ['This invite link was turned off', 'The organizer made a new one. Ask whoever sent it for the new link.'] }[st];
  return `${topBar()}<section class="card stack" style="margin-top:20px"><span class="label">${esc(S.trip.name)}</span><h1 style="font-size:clamp(28px,7vw,40px)">${msg[0]}</h1><p class="muted">${msg[1]}</p><div><button class="btn primary" data-act="home">Back to my plans</button></div></section>`;
}
// Budgets are private by default: results count people without naming them, unless
// someone chose to be named.
function budgetWho(ms) {
  const pub = ms.filter(m => m.budgetPublic || m.id === S.uid), priv = ms.length - pub.length;
  if (!pub.length) return priv === 1 ? '1 person' : `${priv} people`;
  return listNames(pub) + (priv ? ` and ${priv} other${priv === 1 ? '' : 's'}` : '');
}
function accessCard() {
  const t = S.trip, org = isOrganizer(), perm = t.perm || {};
  const sel = (id, v, opts) => `<select id="${id}" aria-label="${id === 'perm-invite' ? 'Who can invite people' : 'Who can lock decisions'}" style="width:auto" ${org ? '' : 'disabled'}>${opts.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<section class="card stack access">
    <h3>Access</h3>
    ${org ? '' : '<p class="small muted">Only organizers can change these.</p>'}
    <div class="acc-row"><div><b>Invite link</b><span class="small muted">${t.invitesOff ? 'Off. Nobody new can join.' : t.inviteKey ? 'On. Older links stopped working when it was reset.' : 'On.'}</span></div>
      ${org ? `<div class="row" style="gap:6px"><button class="btn sm" data-act="linkReset">New link</button><button class="btn sm ${t.invitesOff ? 'primary' : 'ghost'}" data-act="linkToggle">${t.invitesOff ? 'Turn invites on' : 'Turn invites off'}</button></div>` : ''}</div>
    <div class="acc-row"><div><b>Who can invite people</b></div>${sel('perm-invite', perm.invite || 'all', [['all', 'Anyone in the plan'], ['org', 'Organizers only']])}</div>
    <div class="acc-row"><div><b>Who can lock decisions</b><span class="small muted">Where, when and the final pick. Everyone can still vote.</span></div>${sel('perm-lock', perm.lock || 'all', [['all', 'Anyone in the plan'], ['org', 'Organizers only']])}</div>
    <p class="small muted">Organizers: ${esc(listNames(S.members.filter(m => m.id === t.createdBy || (t.orgs || {})[m.id])) || 'the creator')}. Make someone an organizer or remove them from the crew list in Home › Crew.</p>
  </section>`;
}
function myPrivacy() {
  const m = meDoc(); if (!m || S.demo) return '';
  return `<div class="stack" style="gap:8px;border-top:1px solid var(--line);padding-top:12px">
    <label class="field" style="flex:none;max-width:280px"><span class="label">Show me amounts in</span><select id="my-cur">${curOptions(myCur())}</select><span class="small muted">${myCur() === cur() ? 'Same as the plan.' : `Totals also show ≈ ${myCur()} (${fxNote()}).`}</span></label>
    <span class="label">Privacy</span>
    <label class="check-line"><input type="checkbox" id="me-budgetPublic" style="width:auto" ${m.budgetPublic ? 'checked' : ''}> Name me when something is over my budget. Off: I’m counted, but not named.</label>
    <label class="check-line"><input type="checkbox" id="me-hideLoc" style="width:auto" ${m.hideLoc ? 'checked' : ''}> Hide where I check in during the ${planWord()}. An SOS always shares your spot.</label>
  </div>`;
}
async function removeMember(uid) {
  const m = S.members.find(x => x.id === uid); if (!m || !isOrganizer() || uid === S.uid) return;
  const tasks = taskList().filter(x => !x.done && x.owner === uid);
  try {
    if (!S.demo) { if (going(m)) logDrop(uid); await S.db.doc(`trips/${S.tid}/members/${uid}`).update({ status: 'out', removed: true }); }
    else { m.status = 'out'; m.removed = true; }
    saveTrip({ people: { [uid]: null }, left: { [uid]: true }, orgs: { [uid]: null }, ...(tasks.length ? { tasks: Object.fromEntries(tasks.map(x => [x.id, { owner: '' }])) } : {}) });
    S.confirmRm = null; flash(`${m.nick || 'Someone'} was removed from the ${planWord()}.`);
  } catch (e) { flash(writeErr(e)); }
}

/* ---------- repeat a plan, crew templates ---------- */
// "Repeat this plan" copies the useful structure of a plan: its to-dos, the shape of the
// itinerary (by day number, not date), the group packing list and last time's costs as a
// guide. Dates, prices, who's coming and bookings always start fresh. A crew can save that
// structure as a named template ("Our birthday weekend") and improve it each time.
function planSnapshot(t = S.trip) {
  const start = (t.lockedDates || dates() || {}).start;
  const dayIdx = x => start && x ? Math.max(0, Math.round((D(x) - D(start)) / 864e5)) : 0;
  const ds = t.lockedDest ? (t.destinations || []).find(x => x.id === t.lockedDest) : null;
  return {
    size: sizeOf(t), mode: t.mode || 'friends', currency: CUR_CODES.includes(t.currency) ? t.currency : 'USD', nights: nightsSet(t), city: t.city || '',
    dest: ds ? { city: ds.city, code: ds.code || '' } : null,
    tasks: taskList().map(x => x.title).slice(0, 30),
    itin: (t.itinerary || []).filter(i => !i.secret).map(i => ({ day: dayIdx(i.date), time: i.time || '', title: i.title, kind: i.kind || 'plan', note: i.note || '' })).slice(0, 60),
    packing: S.packing.filter(p => p.kind === 'group').map(p => p.text).slice(0, 60),
    costs: Object.fromEntries(Object.entries(t.costs || {}).filter(([, v]) => v && (v.low || v.high)).map(([k, v]) => [k, { low: v.low, high: v.high }])),
    from: S.tid, fromName: t.name, at: Date.now(),
  };
}
// templates saved by older versions (or edited elsewhere) may be missing parts
const tplOf = s => ({ ...s, tasks: arr(s.tasks), itin: arr(s.itin), packing: arr(s.packing), costs: isObj(s.costs) ? s.costs : {} });
const snapCounts = raw => { const s = tplOf(raw); return [s.tasks.length && `${s.tasks.length} to-do${s.tasks.length === 1 ? '' : 's'}`, s.itin.length && `${s.itin.length} stop${s.itin.length === 1 ? '' : 's'}`, s.packing.length && `${s.packing.length} packing item${s.packing.length === 1 ? '' : 's'}`, Object.keys(s.costs).length && 'last time’s costs'].filter(Boolean); };
function repeatDialog() {
  const r = S.repeat; if (!r) return '';
  const crew = S.crews.find(c => c.id === (r.cid || S.trip?.crewId));
  const raw = r.tpl ? (crew?.templates || {})[r.tpl] : planSnapshot();
  if (!raw) return '';
  const snap = tplOf(raw);
  const sz = SIZES[snap.size] || SIZES.trip, small = ['hangout', 'day'].includes(snap.size);
  const a = small ? TODAY : add(TODAY, 30), b = add(a, sz.win + (small ? 0 : 15));
  const what = [['tasks', `To-dos (${snap.tasks.length})`, snap.tasks.length], ['itin', `Itinerary outline (${snap.itin.length} stops)`, snap.itin.length], ['pack', `Group packing list (${snap.packing.length})`, snap.packing.length], ['costs', 'Last time’s costs, as a guide', Object.keys(snap.costs).length], ['dest', snap.dest ? `Suggest ${snap.dest.city} again` : '', !!snap.dest]].filter(x => x[2]);
  return `<section class="card stack repeat" id="repeat-box">
    <div class="row" style="justify-content:space-between"><h3>${r.tpl ? `Start from “${esc(snap.name)}”` : 'Repeat this plan'}</h3><button class="btn sm ghost" data-act="repeatClose">Cancel</button></div>
    <p class="small muted">Brings over the structure. Dates, prices, who’s coming and bookings start fresh${crew ? `, and everyone in ${esc(crew.name)} is added` : ''}.</p>
    <label class="field" style="flex:none"><span class="label">Name it</span><input id="rp-name" maxlength="60" value="${esc(r.tpl ? snap.name : snap.fromName + ' again')}"></label>
    <div class="row" style="gap:8px"><label class="field"><span class="label">${small ? 'Days that could work, from' : 'Earliest'}</span><input id="rp-start" type="date" value="${a}"></label><label class="field"><span class="label">${small ? 'to' : 'Latest'}</span><input id="rp-end" type="date" value="${b}"></label></div>
    ${what.length ? `<div class="stack" style="gap:6px"><span class="label">Bring over</span>${what.map(([k, l]) => `<label class="check-line"><input type="checkbox" id="rp-${k}" checked> ${esc(l)}</label>`).join('')}</div>` : '<span class="small muted">There’s nothing to bring over yet, so this starts a fresh plan with the same settings.</span>'}
    <div><button class="btn primary" data-act="repeatGo" ${S.busy.repeat ? 'disabled' : ''}>${S.busy.repeat ? '<i class="spin"></i>Creating…' : 'Create it'}</button></div>
  </section>`;
}
async function seedMembers(id, crew) {
  const mine = crew?.profiles?.[S.uid] || {};
  await S.db.doc(`trips/${id}/members/${S.uid}`).set({ nick: mine.nick || S.myName || 'Me', home: mine.home || '', venmo: mine.venmo || '', cashapp: mine.cashapp || '', budget: 0, status: 'in', days: [], votes: [], updatedAt: Date.now() });
  if (!crew) return;
  const ids = crewMembers(crew);
  for (const uid of ids) if (uid !== S.uid) { const pr = crew.profiles?.[uid] || {}; await S.db.doc(`trips/${id}/members/${uid}`).set({ nick: pr.nick || 'Someone', home: pr.home || '', venmo: pr.venmo || '', cashapp: pr.cashapp || '', budget: 0, status: 'maybe', days: [], votes: [], updatedAt: Date.now() }); }
  await S.db.doc('trips/' + id).update({ crewId: crew.id, people: Object.fromEntries(ids.map(u => [u, true])) });
}
async function repeatGo() {
  const r = S.repeat; if (!r || !S.db || S.demo) { if (S.demo) flash('Repeating works on real plans.'); return; }
  const crew = S.crews.find(c => c.id === (r.cid || S.trip?.crewId));
  const raw = r.tpl ? (crew?.templates || {})[r.tpl] : planSnapshot(); if (!raw) return;
  const snap = tplOf(raw);
  const on = k => !!$('#rp-' + k)?.checked;
  const name = ($('#rp-name')?.value || '').trim().slice(0, 60) || snap.fromName || 'New plan';
  let a = $('#rp-start')?.value || TODAY, b = $('#rp-end')?.value || add(a, 30); if (b < a) [a, b] = [b, a];
  const small = ['hangout', 'day'].includes(snap.size), id = rid(10);
  const trip = { name, size: snap.size, city: snap.city, currency: snap.currency, winStart: a, winEnd: b, nights: small ? 0 : snap.nights, destinations: on('dest') && snap.dest ? [{ id: rid(6), city: snap.dest.city, code: snap.dest.code }] : [], vibes: [], itinerary: [], lockedDates: null, lockedDest: null,
    mode: snap.mode, honoreeName: '', honoreeFree: true, people: { [S.uid]: true }, createdBy: S.uid, createdAt: Date.now(),
    tasks: on('tasks') ? Object.fromEntries(snap.tasks.map((title, i) => [rid(6), { title, owner: '', due: '', done: false, by: S.uid, at: Date.now() + i }])) : {},
    itinTpl: on('itin') ? snap.itin : null, lastCosts: on('costs') ? snap.costs : null, repeatOf: { tid: snap.from || '', name: snap.fromName || '', tpl: r.tpl || '' } };
  try {
    await S.db.doc('trips/' + id).set(trip);
    await seedMembers(id, crew);
    if (on('pack')) { let n = 0; for (const text of snap.packing) await S.db.doc(`trips/${id}/packing/${rid(8)}`).set({ text, kind: 'group', claimedBy: null, at: n++ }); }
    S.repeat = null; S.crewView = null;
    openTrip(id, 'overview'); S.setup = { step: 0 };
    flash(`${name} is ready. Pick dates and it all comes together.`);
  } catch (e) { flash(writeErr(e)); }
}
function templateCard() {
  const crew = S.crews.find(c => c.id === S.trip.crewId); if (!crew || S.demo || S.readOnly) return '';
  const mine = Object.entries(crew.templates || {}).find(([, x]) => x && x.from === S.tid);
  return `<section class="card stack"><h3>Make it a crew template</h3>
    <p class="small muted">Save how this ${planWord()} was put together so ${esc(crew.name)} can start the next one from it. ${mine ? 'Saving again updates the template with what you changed.' : ''}</p>
    <div class="row" style="gap:6px;align-items:flex-end"><label class="field" style="flex:1 1 200px"><span class="label">Template name</span><input id="tpl-name" maxlength="50" value="${esc(mine ? mine[1].name : '')}" placeholder="${esc(isSmall() ? 'Our best night out' : size() === 'weekend' ? 'Our birthday weekend' : 'Our summer trip')}"></label>
      <button class="btn" data-act="tplSave">${mine ? 'Update template' : 'Save template'}</button></div>
  </section>`;
}
async function saveTemplate() {
  const crew = S.crews.find(c => c.id === S.trip.crewId); if (!crew) return;
  const name = ($('#tpl-name')?.value || '').trim().slice(0, 50); if (!name) { flash('Give the template a name.'); return; }
  const existing = Object.entries(crew.templates || {}).find(([, x]) => x && x.from === S.tid), id = existing ? existing[0] : rid(6);
  try { await S.db.doc('crews/' + crew.id).update({ templates: { [id]: null } }); await S.db.doc('crews/' + crew.id).update({ templates: { [id]: { ...planSnapshot(), name, by: S.uid } } }); flash(existing ? `Updated “${name}”.` : `Saved “${name}” for ${crew.name}.`); }
  catch (e) { flash(writeErr(e)); }
}
function crewTemplates(c) {
  const list = Object.entries(c.templates || {}).filter(([, x]) => x).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  if (!list.length) return '';
  return `<section class="stack"><h2>Templates</h2>${list.map(([id, x]) => `<div class="card row tpl-row"><div class="stack" style="gap:2px;min-width:0;flex:1"><span class="label" style="color:${(SIZES[x.size] || SIZES.trip).color}">${esc((SIZES[x.size] || SIZES.trip).label)}</span><b>${esc(x.name)}</b><span class="small muted">${esc(snapCounts(x).join(' · ') || 'Same settings')} · from ${esc(x.fromName || 'an earlier plan')}</span></div>
    <div class="row" style="gap:6px">${x.by === S.uid || c.by === S.uid ? `<button class="x" data-tpldel="${esc(id)}" aria-label="Delete template ${esc(x.name)}">×</button>` : ''}<button class="btn sm primary" data-tpluse="${esc(id)}">Use</button></div></div>`).join('')}
  ${S.repeat && S.repeat.cid === c.id ? repeatDialog() : ''}</section>`;
}
// Last time's itinerary outline, placed onto this plan's dates once they're set.
function applyOutline() {
  const d = dates(), tpl = S.trip.itinTpl; if (!d || !tpl) return;
  const days = span(d.start, d.end);
  const items = tpl.map(i => ({ id: rid(6), date: days[Math.min(i.day, days.length - 1)], time: i.time, title: i.title, kind: i.kind, note: i.note }));
  saveTrip({ itinerary: [...(S.trip.itinerary || []), ...items], itinTpl: null });
  flash(`Added ${items.length} stop${items.length === 1 ? '' : 's'} from last time. Change anything that doesn’t fit.`);
}

/* ---------- how we decide ---------- */
// Each plan picks a decision style everyone can see: everyone gets a say (nothing locks
// over someone's pass), majority rules (a set share of yeses), or just pick something
// (votes until a deadline, then an organizer picks). Whatever the style, a vote can't
// lock something over a person's hard budget limit or firm free days unless that person
// agrees to that option. People can also say they're in on a condition ("if it stays
// under €300"); those are shown to the crew and checked against the real cost.
const STYLES = {
  all: ['Everyone gets a say', 'Nothing locks while someone has passed on it. If nothing works for all, run a final vote between the top two.'],
  majority: ['Majority rules', 'Anything with enough yes votes can be locked.'],
  pick: ['Just pick something', 'Vote until the deadline. After that, an organizer picks.'],
};
const decideOf = (t = S.trip) => ({ style: 'all', pct: 50, by: '', ...(t.decide || {}) });
function ruleText(d = decideOf()) {
  if (d.style === 'majority') return `Majority rules: ${d.pct}% of the crew saying yes locks it.`;
  if (d.style === 'pick') return d.by ? `Just pick something: vote until ${fmt(d.by)}${TODAY > d.by ? ' (passed)' : ''}, then an organizer picks.` : 'Just pick something: an organizer picks, using your votes.';
  return 'Everyone gets a say: nothing locks while someone has passed on it.';
}
// One shape for anything that can be locked: a Trip Match pitch, dates, or a place.
function optOf(kind, id) {
  const vs = active();
  if (kind === 'pitch') {
    const p = (S.trip.pitches?.items || []).find(x => x.id === id); if (!p) return null;
    const r = moneyRange(p.perPerson);
    return { kind, key: 'p:' + id, label: pName(p), lo: r ? r[0] : 0, days: span(p.start, p.end), yes: vs.filter(m => swipeOf(id, m.id) === 1), no: vs.filter(m => swipeOf(id, m.id) === -1), winner: runoffState()?.winner?.id === id };
  }
  if (kind === 'dates') {
    const [start, end] = String(id).split('|'), days = span(start, end), picked = vs.filter(m => (m.days || []).length);
    return { kind, key: 'd:' + start + '|' + end, label: dayRange(start, end), lo: 0, days, yes: picked.filter(m => fitOf(m, days)), no: picked.filter(m => !fitOf(m, days)) };
  }
  const d = (S.trip.destinations || []).find(x => x.id === id); if (!d) return null;
  return { kind, key: 'x:' + id, label: d.city, lo: 0, days: null, yes: votesFor(id), no: [] };
}
const agreed = (o, uid) => !!((S.trip.consent || {})[o.key] || {})[uid];
// people whose hard limit this option breaks (before anyone agreed)
// date limits are checked here (free days aren't private); budget limits come from the
// server, which says who is over without saying anyone's budget
const daysHit = (o, m) => !!(m.hard?.days && (m.days || []).length && o.days && !fitOf(m, o.days));
// only pitches carry a price; the server reads it from the plan rather than taking ours
const budgetHits = o => o.kind === 'pitch' && o.lo ? bq({ pitch: o.key.slice(2), key: o.key }) || NO_FIT : { ...NO_FIT, pending: false };
function hitWhy(o, m) {
  if (daysHit(o, m)) return 'days';
  return budgetHits(o).hard.some(x => x.id === m.id) ? 'budget' : '';
}
function hardHitsAll(o) { const d = active().filter(m => daysHit(o, m)); return [...d, ...budgetHits(o).hard.filter(x => !d.some(y => y.id === x.id))]; }
function hardHits(o) { const d = active().filter(m => daysHit(o, m) && !agreed(o, m.id)); return [...d, ...budgetHits(o).hardOpen.filter(x => !d.some(y => y.id === x.id))]; }
const softHits = o => o.lo ? active().filter(m => m.cond && +m.cond.under > 0 && o.lo > +m.cond.under) : [];
// what the crew's chosen style says about locking this option
function ruleCheck(o) {
  const d = decideOf(), n = active().length;
  if (o.winner) return { ok: true, why: 'Won the final vote' };
  const allOk = () => o.no.length
    ? { ok: false, why: `${listNames(o.no)} ${o.kind === 'dates' ? (o.no.length === 1 ? 'can’t make these dates' : 'can’t make these dates') : 'passed on it'}. Everyone gets a say here, so try a final vote or another option.` }
    : { ok: true, why: 'Nobody objected' };
  if (d.style === 'majority') {
    const need = Math.max(1, Math.ceil(n * d.pct / 100 - 1e-9));
    return o.yes.length >= need ? { ok: true, why: `${o.yes.length} of ${n} yes` } : { ok: false, why: `Majority rules: needs ${need} yes, has ${o.yes.length}.` };
  }
  if (d.style === 'pick' && (!d.by || TODAY > d.by)) return isOrganizer() ? { ok: true, why: 'Organizer’s pick' } : { ok: false, why: `${d.by ? 'Voting has closed. ' : ''}An organizer makes the pick now. Your votes help them.` };
  return allOk();
}
function lockGate(kind, id) {
  if (S.demo) return { ok: true };
  const o = optOf(kind, id); if (!o) return { ok: true };
  const r = ruleCheck(o); if (!r.ok) return r;
  if (budgetHits(o).pending) return { ok: false, why: 'Checking everyone’s budget limits. Try again in a second.' };
  const hits = hardHits(o);
  if (hits.length) {
    const me = hits.find(m => m.id === S.uid);
    return { ok: false, why: me && hits.length === 1 ? 'This breaks your own hard limit. Tap “I’m okay with this one” first.' : `This is over a hard limit for ${limitWho(hits, o)}. They have to agree to it first.` };
  }
  return { ok: true };
}
// budgets stay private, so budget limits are counted unless someone chose to be named
function limitWho(ms, o) {
  const named = ms.filter(m => m.budgetPublic || m.id === S.uid || hitWhy(o, m) === 'days');
  const rest = ms.length - named.length;
  return named.length ? listNames(named) + (rest ? ` and ${rest} other${rest === 1 ? '' : 's'}` : '') : rest === 1 ? '1 person' : `${rest} people`;
}
// small line under an option: can it be locked right now, and if not, why
function ruleChip(kind, id) {
  const o = optOf(kind, id); if (!o || S.demo) return '';
  const r = ruleCheck(o), hits = hardHits(o), soft = softHits(o), out = [];
  if (hits.length) out.push(`<span class="fit-c n">✕ Over a hard limit for ${esc(limitWho(hits, o))}</span>`);
  else out.push(`<span class="fit-c ${r.ok ? 'y' : 'm'}">${r.ok ? '✓ Can lock' : '~ ' + esc(r.why.split('.')[0])}</span>`);
  if (soft.length) out.push(`<span class="fit-c m">~ ${esc(listNames(soft))} ${soft.length === 1 ? 'is' : 'are'} only in under ${esc(money(Math.min(...soft.map(m => +m.cond.under))))}</span>`);
  const mine = hardHitsAll(o).find(m => m.id === S.uid);
  const ask = mine && !S.readOnly ? (agreed(o, S.uid) ? `<span class="small muted">You agreed to this one even though it breaks your limit. <button class="linkbtn small" data-consent="${esc(o.key)}">Take it back</button></span>` : `<span class="small">Over your hard limit. <button class="linkbtn small" data-consent="${esc(o.key)}">I’m okay with this one</button></span>`) : '';
  return `<div class="fit rule-fit">${out.join('')}</div>${ask}`;
}
const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
function ruleLine() {
  const d = decideOf();
  return `<div class="rule-line small"><span><b>${esc(STYLES[d.style][0])}.</b> ${esc(cap(ruleText(d).split(': ').slice(1).join(': ') || STYLES[d.style][1]))} Hard limits can’t be outvoted.</span><button class="linkbtn small" data-tab="settings">Change</button></div>`;
}
function decideCard() {
  const d = decideOf(), org = isOrganizer() && !S.readOnly;
  return `<section class="card stack decide" id="decide-card">
    <h3>How we decide</h3>
    <p class="small muted">Everyone sees these rules next to the votes. ${org ? '' : 'Only organizers can change them.'}</p>
    <div class="dec-styles">${Object.entries(STYLES).map(([k, [l, h]]) => `<button class="dec-style ${d.style === k ? 'on' : ''}" data-decide="${k}" aria-pressed="${d.style === k}" ${org ? '' : 'disabled'}><b>${esc(l)}</b><span class="small">${esc(h)}</span></button>`).join('')}</div>
    ${d.style === 'majority' ? `<label class="field" style="flex:none;max-width:240px"><span class="label">Yes votes needed</span><select id="dec-pct" ${org ? '' : 'disabled'}>${[50, 60, 67, 75].map(p => `<option value="${p}" ${d.pct === p ? 'selected' : ''}>${p === 50 ? 'More than half' : p === 67 ? 'Two thirds' : p === 75 ? 'Three quarters' : p + '%'}</option>`).join('')}</select></label>` : ''}
    ${d.style === 'pick' ? `<label class="field" style="flex:none;max-width:240px"><span class="label">Voting closes</span><input id="dec-by" type="date" value="${d.by || ''}" min="${TODAY}" ${org ? '' : 'disabled'}></label>` : ''}
    <p class="small"><b>Always:</b> a vote never locks something over someone’s hard budget limit or firm dates. They have to agree to that option first. Set yours in Home › Crew.</p>
  </section>`;
}
// your own limits and conditions, in Home › Crew
function myLimits() {
  const m = meDoc(); if (!m || S.demo) return '';
  const h = m.hard || {}, c = m.cond || {}, sum = costSummary(), unmet = +c.under > 0 && sum.any && sum.low > +c.under;
  return `<section class="card stack limits">
    <h2>Your limits</h2>
    <p class="small muted">Hard limits can’t be outvoted. If the crew wants something that breaks one, you’re asked first.</p>
    <label class="check-line"><input type="checkbox" id="me-hardBudget" ${h.budget ? 'checked' : ''} ${+m.budget > 0 ? '' : 'disabled'}> My budget${+m.budget > 0 ? ` (${money(m.budget)})` : ''} is a hard limit${+m.budget > 0 ? '' : '. Set a budget above first'}. It stays private.</label>
    <label class="check-line"><input type="checkbox" id="me-hardDays" ${h.days ? 'checked' : ''}> The days I picked are firm. Don’t lock dates I can’t make.</label>
    <span class="label" style="margin-top:6px">I’m in if… <span class="muted" style="text-transform:none;letter-spacing:0">(the crew sees this)</span></span>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:0 1 180px"><span class="small muted">It stays under (${cur()})</span><input id="me-condUnder" type="number" min="0" inputmode="numeric" value="${+c.under > 0 ? c.under : ''}" placeholder="${niceIn(300)}"></label>
      <label class="field" style="flex:1 1 220px"><span class="small muted">Or another condition</span><input id="me-condNote" maxlength="80" value="${esc(c.note || '')}" placeholder="we leave Friday evening"></label>
    </div>
    ${unmet ? `<span class="cost-flag">Right now the all-in cost starts at ${money(sum.low)}, over your ${money(c.under)}. The crew can see your condition isn’t met.</span>` : ''}
  </section>`;
}
// for the Who's coming card: who's in on a condition, and whether it holds right now
function condLines() {
  const sum = costSummary(), ms = active().filter(m => m.cond && (+m.cond.under > 0 || m.cond.note));
  if (!ms.length) return '';
  return `<div class="stack cond-list" style="gap:4px"><span class="label">In, if…</span>${ms.map(m => { const u = +m.cond.under, off = u > 0 && sum.any && sum.low > u;
    return `<span class="small"><b>${esc(m.nick || 'Someone')}</b>: ${[u > 0 && `under ${money(u)}`, m.cond.note && esc(m.cond.note)].filter(Boolean).join(', ')}${off ? ` <span style="color:#D63B3B">· not met (starts at ${money(sum.low)})</span>` : u > 0 && sum.any ? ' <span style="color:var(--good)">· met</span>' : ''}</span>`; }).join('')}</div>`;
}
function toggleConsent(key) {
  const on = !((S.trip.consent || {})[key] || {})[S.uid];
  saveTrip({ consent: { [key]: { [S.uid]: on || null } } });
  flash(on ? 'Noted. The crew can lock it now, as far as your limit goes.' : 'Taken back. It’s off the table unless your limit changes.');
}
/* ---------- crew DNA ---------- */
// A living profile of a crew, built only from what the crew has done together in the
// app: when its plans happen, what goes in the itinerary, which pitches got yeses and
// which prices got passed on. It describes the group, never one person, and it only
// uses a fixed list of plain habits. It never looks at private budgets and never guesses
// at anything personal. Anyone in the crew can hide a trait, correct it, forget a memory
// or add a note, and the AI reads the corrected version.
const DNA_MIN = 2;
const crewPlans = cid => S.trips.filter(t => t.crewId === cid);
const isLate = x => x && (x >= '22:00' || x < '04:00');
const isFoody = i => i.kind === 'food' || /dinner|brunch|lunch|breakfast|tapas|taco|market|food|restaurant|bakery|pizza|ramen|sushi/i.test(i.title || '');
const pitchPrice = (p, t, base) => { const r = moneyRange(p.perPerson); return r ? Math.round(convert(r[0], CUR_CODES.includes(t.currency) ? t.currency : 'USD', base)) : 0; };
function crewDNA(c) {
  const ps = crewPlans(c.id), dna = c.dna || {}, traits = [], memory = [];
  const items = ps.flatMap(t => (t.itinerary || []).filter(i => !i.secret));
  const timed = items.filter(i => i.time);
  const add = (k, label, evidence) => traits.push({ k, label: (dna.fix || {})[k] || label, auto: label, evidence, hidden: !!(dna.hidden || {})[k], fixed: !!(dna.fix || {})[k] });
  // when they go out
  if (timed.length >= 5) {
    const late = timed.filter(i => isLate(i.time)).length, early = timed.filter(i => i.time < '10:00' && i.time >= '04:00').length;
    if (late / timed.length >= 0.3) add('owls', 'Night owls', `${late} of ${timed.length} planned stops start after 10pm`);
    else if (early / timed.length >= 0.3) add('early', 'Early starters', `${early} of ${timed.length} planned stops start before 10am`);
  }
  // what fills the itinerary
  if (items.length >= 5) {
    const food = items.filter(isFoody).length, night = items.filter(i => i.kind === 'nightlife').length, act = items.filter(i => i.kind === 'activity').length;
    if (food / items.length >= 0.35) add('food', 'Food-first', `${food} of ${items.length} stops are about eating`);
    if (night / items.length >= 0.3) add('night', 'Here for the nights out', `${night} of ${items.length} stops are nightlife`);
    if (act / items.length >= 0.35) add('doers', 'Always doing something', `${act} of ${items.length} stops are activities`);
  }
  // how far ahead they lock
  const leads = ps.filter(t => t.lockedDates && t.createdAt).map(t => Math.round((D(t.lockedDates.start) - t.createdAt) / 864e5)).filter(n => n >= 0);
  if (leads.length >= DNA_MIN) {
    const soon = leads.filter(n => n < 21).length, far = leads.filter(n => n > 60).length;
    if (soon / leads.length >= 0.6) add('lastmin', 'Last-minute planners', `${soon} of ${leads.length} plans happened within 3 weeks of starting them`);
    else if (far / leads.length >= 0.6) add('ahead', 'Plan way ahead', `${far} of ${leads.length} plans were set up 2+ months out`);
  }
  // which days
  const starts = ps.filter(t => t.lockedDates).map(t => D(t.lockedDates.start).getUTCDay());
  if (starts.length >= DNA_MIN && starts.filter(d => [5, 6].includes(d)).length / starts.length >= 0.7) add('weekend', 'Friday-to-Sunday people', `${starts.filter(d => [5, 6].includes(d)).length} of ${starts.length} plans started on a Friday or Saturday`);
  // prices: what got passed on versus what got yeses, by the crew as a whole
  const base = S.trip && S.trip.crewId === c.id ? cur() : (ps.find(t => CUR_CODES.includes(t.currency))?.currency || 'USD'), m$ = n => fmtMoney(n, base);
  const judged = ps.flatMap(t => (t.pitches?.items || []).map(p => { const v = Object.values((t.swipes || {})[p.id] || {}); return { p, t, yes: v.filter(x => x === 1).length, no: v.filter(x => x === -1).length, n: v.length, price: pitchPrice(p, t, base) }; })).filter(x => x.n >= 2);
  const liked = judged.filter(x => x.yes > x.n / 2), passed = judged.filter(x => x.no > x.n / 2);
  const avg = a => a.length ? Math.round(a.reduce((n, x) => n + x.price, 0) / a.length) : 0;
  const lp = liked.filter(x => x.price), pp = passed.filter(x => x.price);
  if (lp.length && pp.length >= DNA_MIN && avg(pp) > avg(lp) * 1.2) add('budget', 'Budget-conscious', `Passed on options around ${m$(avg(pp))}, said yes around ${m$(avg(lp))}`);
  // memories: prices they turned down and things they loved
  for (const x of pp.filter(x => x.price > (avg(lp) || 0)).slice(-4)) memory.push({ k: 'no-' + x.p.id, kind: 'passed', text: `${pName(x.p)} at ${x.p.perPerson}` });
  for (const x of liked.filter(x => x.yes === x.n).slice(-4)) memory.push({ k: 'yes-' + x.p.id, kind: 'loved', text: `${pName(x.p)}${x.p.tagline ? ': ' + x.p.tagline : ''}` });
  for (const t of ps) for (const i of (t.itinerary || []).filter(i => !i.secret)) {
    const r = Object.values((t.reactions || {})[rkey('it' + i.id)] || {}), up = r.filter(v => v > 0).length;
    if (up >= 2 && up > r.length / 2) memory.push({ k: 'it-' + t.id + i.id, kind: 'loved', text: i.title });
  }
  const forget = dna.forget || {};
  return { plans: ps.length, traits, memory: memory.filter(m => !forget[m.k]).slice(-8), notes: Object.entries(dna.notes || {}).filter(([, n]) => n).map(([id, n]) => ({ id, ...n })) };
}
// what the AI gets told; only the crew-level, corrected version
function dnaText(cid) {
  const c = S.crews.find(x => x.id === cid); if (!c) return '';
  const d = crewDNA(c), tr = d.traits.filter(x => !x.hidden), lines = [];
  if (tr.length) lines.push(`What this crew tends to do, from their past plans: ${tr.map(x => x.label + (x.fixed ? '' : ` (${x.evidence})`)).join('; ')}.`);
  const no = d.memory.filter(m => m.kind === 'passed'), yes = d.memory.filter(m => m.kind === 'loved');
  if (no.length) lines.push(`They passed on: ${no.map(m => m.text).join('; ')}. Don't pitch things like these at those prices.`);
  if (yes.length) lines.push(`They loved: ${yes.map(m => m.text).join('; ')}.`);
  if (d.notes.length) lines.push(`In their own words: ${d.notes.map(n => `"${n.text}"`).join(' ')}`);
  return lines.join('\n');
}
function dnaCard(c, compact) {
  const d = crewDNA(c), shown = d.traits.filter(x => !x.hidden), hid = d.traits.filter(x => x.hidden), ed = S.dnaEdit;
  if (compact) return shown.length || d.notes.length ? `<div class="rule-line small dna-line"><span><b>${esc(c.name)}’s DNA:</b> ${esc([...shown.map(x => x.label), ...d.notes.map(n => n.text)].slice(0, 4).join(' · '))}. The pitches use this.</span><button class="linkbtn small" data-crew="${esc(c.id)}">Edit</button></div>` : '';
  return `<section class="card stack dna" id="dna">
    <div class="stack" style="gap:2px"><h2>Crew DNA</h2><span class="small muted">What ${esc(c.name)} tends to do, learned from ${d.plans} plan${d.plans === 1 ? '' : 's'} together. It’s about the group, never one person, and it never uses private budgets. Fix anything that’s off; the AI uses your version.</span></div>
    ${shown.length ? `<div class="stack" style="gap:8px">${shown.map(x => `<div class="dna-trait" data-key="dna-${x.k}">
      ${ed === x.k ? `<form class="row dna-fix" data-k="${x.k}" style="gap:6px;flex:1"><input id="dna-fix-${x.k}" maxlength="50" value="${esc(x.label)}" aria-label="Correct this trait"><button class="btn sm primary" type="submit">Save</button>${x.fixed ? `<button class="btn sm ghost" type="button" data-dnareset="${x.k}">Use the learned one</button>` : ''}</form>`
      : `<div class="stack" style="gap:2px;min-width:0;flex:1"><b>${esc(x.label)}</b><span class="small muted">${x.fixed ? `You corrected this. Learned: ${esc(x.auto)}` : esc(x.evidence)}</span></div>
        <div class="row" style="gap:4px"><button class="linkbtn small" data-dnaedit="${x.k}">Not quite</button><button class="linkbtn small muted" data-dnahide="${x.k}">Not us</button></div>`}</div>`).join('')}</div>`
      : `<p class="small muted">${d.plans < DNA_MIN ? `Still learning. After a couple of plans together, habits like “night owls” or “food-first” show up here.` : 'No clear habits yet. They show up as you plan more together.'}</p>`}
    ${d.memory.length ? `<div class="stack" style="gap:6px"><span class="label">Remembers</span>${d.memory.map(m => `<div class="row dna-mem" style="gap:8px;justify-content:space-between"><span class="small"><span class="fit-c ${m.kind === 'loved' ? 'y' : 'n'}" style="margin-right:6px">${m.kind === 'loved' ? 'Loved' : 'Passed'}</span>${esc(m.text)}</span><button class="x" data-dnaforget="${esc(m.k)}" aria-label="Forget this">×</button></div>`).join('')}</div>` : ''}
    <div class="stack" style="gap:6px"><span class="label">In your own words</span>
      ${d.notes.map(n => `<div class="row dna-mem" style="gap:8px;justify-content:space-between"><span class="small">“${esc(n.text)}” <span class="muted">· ${esc(crewNick(c, n.by))}</span></span>${n.by === S.uid || c.by === S.uid ? `<button class="x" data-dnanote="${esc(n.id)}" aria-label="Remove note">×</button>` : ''}</div>`).join('')}
      <form id="dnaNote" class="row" style="gap:6px"><input id="dna-note" maxlength="80" placeholder="We always want a pool. No hostels." aria-label="Add a note about the crew"><button class="btn sm" type="submit">Add</button></form>
      <span class="small muted">Notes are seen by the whole crew. Keep personal stuff in your own details, where it stays private.</span></div>
    ${hid.length ? `<span class="small muted">Hidden: ${hid.map(x => `${esc(x.auto)} <button class="linkbtn small" data-dnashow="${x.k}">Show</button>`).join(', ')}</span>` : ''}
  </section>`;
}
const dnaSave = (cid, patch) => S.db && S.db.doc('crews/' + cid).update({ dna: patch }).catch(e => flash(writeErr(e)));
/* ---------- shared live change log ---------- */
// Every important change is written together with a log entry in the same save: what
// changed, who did it, when, who has to do something about it, and how to put it back.
// People it affects see it straight away (a toast and a banner until they tap "Got it"),
// and the author or an organizer can undo it or restore the earlier choice.
//   entry = { text, area, by, at, act: 'all' | 'some' | '', who: [uids], fx: [lines],
//             undo: { k: 'set', patch, clear } | { k: 'item', item } | { k: 'status', uid, status },
//             seen: { uid: true }, undone: { by, at } }
function withLog(patch, e) {
  const id = rid(6);
  return { ...patch, changes: { ...(patch.changes || {}), [id]: { by: S.uid, at: Date.now(), act: '', ...e, seen: { [S.uid]: true } } } };
}
const logList = (t = S.trip) => Object.entries(t.changes || {}).filter(([, x]) => x && x.text).map(([id, x]) => ({ id, ...x })).sort((a, b) => b.at - a.at);
const affects = (x, uid = S.uid) => x.act === 'all' || (x.act === 'some' && (x.who || []).includes(uid));
const needsMe = (x, uid = S.uid) => !x.undone && x.by !== uid && affects(x, uid) && !(x.seen || {})[uid];
const canUndo = x => x.undo && !x.undone && !S.readOnly && (x.by === S.uid || isOrganizer());
const logWho = x => x.by === S.uid ? 'You' : nameOf(x.by);
function undoChange(id) {
  const x = (S.trip.changes || {})[id]; if (!x || !canUndo(x)) return;
  const u = x.undo, done = { changes: { [id]: { undone: { by: S.uid, at: Date.now() } } } };
  const note = e => withLog(done, { text: `Undone: ${x.text}`, area: x.area, act: x.act, who: x.who || [], ...e });
  if (u.k === 'set') {
    const clear = Object.fromEntries((u.clear || []).filter(k => S.trip[k]).map(k => [k, null]));
    const go = () => saveTrip(note({})).then(() => saveTrip(u.patch));
    return (Object.keys(clear).length ? saveTrip(clear).then(go) : go()).then(() => flash('Put back the way it was.'));
  }
  if (u.k === 'item') {
    const list = S.trip.itinerary || [], has = list.some(i => i.id === u.item.id);
    flash(has ? 'Moved back.' : 'Put back in the plan.');
    return saveTrip({ ...note({ text: has ? `${u.item.title} moved back to ${dow(u.item.date)} ${u.item.time ? t12(u.item.time) : ''}`.trim() : `${u.item.title} is back in the plan` }), itinerary: has ? list.map(i => i.id === u.item.id ? u.item : i) : [...list, u.item] });
  }
  if (u.k === 'status') {
    const m = S.members.find(z => z.id === u.uid); if (!m) return;
    if (u.uid === S.uid) saveMe({ status: u.status }, true); else if (!S.demo) S.db.doc(`trips/${S.tid}/members/${u.uid}`).update({ status: u.status }).catch(e => flash(writeErr(e)));
    flash(`${m.nick || 'They'} ${u.uid === S.uid ? 'are' : 'is'} back in.`);
    return saveTrip(note({ text: `${m.nick || 'Someone'} is back in` }));
  }
}
const ackChange = id => saveTrip({ changes: { [id]: { seen: { [S.uid]: true } } } });
function logRow(x, opts = {}) {
  const n = active().length, seen = Object.keys(x.seen || {}).filter(u => u !== x.by && affects(x, u)).length;
  const aff = x.act === 'all' ? Math.max(0, n - 1) : x.act === 'some' ? (x.who || []).filter(u => u !== x.by).length : 0;
  const forWho = x.act === 'all' ? 'Everyone should check' : x.act === 'some' ? `For ${listNames(S.members.filter(m => (x.who || []).includes(m.id)))}` : '';
  return `<div class="log-row ${x.undone ? 'undone' : ''} ${needsMe(x) ? 'mine' : ''}" data-key="log-${esc(x.id)}">
    <div class="log-head"><span class="av-sm" style="background:${colorFor(x.by)}">${esc((nameOf(x.by) || '?')[0].toUpperCase())}</span>
      <div class="stack" style="gap:2px;min-width:0;flex:1"><b>${esc(x.text)}</b>
      <span class="small muted">${esc(logWho(x))} · ${ago(x.at)}${forWho ? ` · ${esc(forWho)}` : ''}${aff && !x.undone ? ` · seen by ${seen} of ${aff}` : ''}${x.undone ? ` · undone by ${esc(x.undone.by === S.uid ? 'you' : nameOf(x.undone.by))}` : ''}</span></div></div>
    ${(x.fx || []).length && !opts.short ? `<ul class="small muted log-fx">${x.fx.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${needsMe(x) || canUndo(x) ? `<div class="row" style="gap:6px">${needsMe(x) ? `<button class="btn sm primary" data-ack="${esc(x.id)}">Got it</button>` : ''}${canUndo(x) ? `<button class="btn sm ghost" data-undo="${esc(x.id)}">${x.by === S.uid ? 'Undo' : 'Restore the earlier choice'}</button>` : ''}</div>` : ''}
  </div>`;
}
// Home › Changes: the whole log, newest first
function logTab() {
  const list = logList(), mine = list.filter(x => needsMe(x));
  return `<section class="card stack log">
    <div class="stack" style="gap:2px"><h2>What changed</h2><span class="small muted">Every important change, who made it and when. The people it affects see it right away. The person who made a change, or an organizer, can undo it.</span></div>
    ${mine.length > 1 ? `<div><button class="btn sm" data-act="ackAll">Mark all ${mine.length} as seen</button></div>` : ''}
    ${list.length ? `<div class="log-list">${list.slice(0, 60).map(x => logRow(x)).join('')}</div>` : '<div class="empty"><span>Nothing has changed yet. Locks, moves and swaps show up here.</span></div>'}
  </section>`;
}
// top of every tab: changes by someone else that need you, until you tap Got it
function liveBanner() {
  if (S.demo || !S.trip) return '';
  const list = logList().filter(x => needsMe(x)).slice(0, 2), more = logList().filter(x => needsMe(x)).length - list.length;
  if (!list.length || S.tab === 'log') return '';
  return `<section class="live-changes" aria-live="polite">${list.map(x => `<div class="lc-row"><span class="lc-dot" aria-hidden="true"></span><span class="small"><b>${esc(x.text)}</b> <span class="muted">· ${esc(nameOf(x.by))}</span>${(x.fx || [])[0] ? ` <span class="muted">· ${esc(x.fx[0])}</span>` : ''}</span><button class="btn sm" data-ack="${esc(x.id)}">Got it</button></div>`).join('')}
    ${more > 0 ? `<button class="linkbtn small" data-tab="log">${more} more change${more === 1 ? '' : 's'}</button>` : ''}</section>`;
}
// a toast the moment someone else's change arrives
let logKnown = null, logTid = null;
function announceChanges() {
  if (!S.trip || S.demo) return;
  const ids = logList().map(x => x.id);
  if (logTid !== S.tid || !logKnown) { logTid = S.tid; logKnown = new Set(ids); return; }
  const fresh = logList().filter(x => !logKnown.has(x.id) && x.by !== S.uid && affects(x));
  ids.forEach(id => logKnown.add(id));
  if (fresh.length) flash(fresh.length === 1 ? `${nameOf(fresh[0].by)}: ${fresh[0].text}` : `${fresh.length} new changes. See Home › Changes.`);
}
// for the home page's Needs you
const logNeeds = t => logList(t).filter(x => needsMe(x));
// move or edit one stop; the crew is told and it can be moved back
function editItemForm(x, days) {
  return `<form id="editItemForm" class="tline edit-line" data-id="${esc(x.id)}" data-key="edit-${esc(x.id)}">
    <div class="row" style="gap:6px;grid-column:1/-1">
      ${days.length > 1 ? `<select id="ei-date" style="width:auto" aria-label="Day">${days.map((d, i) => `<option value="${d}" ${d === x.date ? 'selected' : ''}>Day ${i + 1} · ${short(d)}</option>`).join('')}</select>` : ''}
      <input id="ei-time" type="time" value="${esc(x.time || '')}" style="width:auto" aria-label="Time">
      <input id="ei-title" maxlength="80" value="${esc(x.title)}" style="flex:1 1 160px" aria-label="What">
      <button class="btn sm primary" type="submit">Save</button><button class="btn sm ghost" type="button" data-act="editItemCancel">Cancel</button>
    </div></form>`;
}
function saveItemEdit(id) {
  const old = (S.trip.itinerary || []).find(i => i.id === id); S.editItem = null; if (!old) return render();
  const date = $('#ei-date')?.value || old.date, time = $('#ei-time')?.value || '', title = ($('#ei-title')?.value || '').trim().slice(0, 80) || old.title;
  if (date === old.date && time === (old.time || '') && title === old.title) return render();
  const when = (d, t) => `${d !== old.date || d !== date ? dow(d) + ' ' : ''}${t ? t12(t) : 'no set time'}`;
  const moved = date !== old.date || time !== (old.time || '');
  const text = moved ? `${old.title} moved to ${when(date, time)}` : `${old.title} is now ${title}`;
  const fx = [moved ? `Was ${dow(old.date)} ${old.time ? t12(old.time) : 'with no set time'}` : '', title !== old.title && moved ? `Now called ${title}` : ''].filter(Boolean);
  saveTrip(withLog({ itinerary: (S.trip.itinerary || []).map(i => i.id === id ? { ...i, date, time, title } : i) }, { area: 'plan', text, fx, act: old.secret ? '' : 'all', undo: { k: 'item', item: old } }));
  flash(`${text}. The crew sees it now.`);
}
/* ---------- personal needs ---------- */
// Food, access and travel needs, so plans work for everyone. Nobody is asked why. Each
// person picks, per section, who sees it: the crew with their name, the crew without it
// (the default), or organizers only. The AI always plans around every need, without
// names. Like budgets, this is kept private by the app, not by the server.
const DIETS = [['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['pescatarian', 'Pescatarian'], ['glutenfree', 'Gluten-free'], ['dairyfree', 'Dairy-free'], ['nuts', 'Nut allergy'], ['shellfish', 'Shellfish allergy'], ['halal', 'Halal'], ['kosher', 'Kosher'], ['nopork', 'No pork'], ['noalcohol', 'No alcohol']];
const ACCESS = [['stepfree', 'Step-free access'], ['shortwalks', 'Short walks only'], ['groundfloor', 'Ground-floor room'], ['seating', 'Needs a seat'], ['quiet', 'A quiet space'], ['ownroom', 'Own room'], ['animal', 'Service animal']];
const NEED_SECTIONS = [['diet', 'Food'], ['access', 'Getting around and rooms'], ['travel', 'Travel']];
const SHARE_LEVELS = [['anon', 'The crew, without my name'], ['named', 'The crew, with my name'], ['org', 'Only organizers']];
const needsOf = m => m.needs || {};
const shareOf = (m, sec) => (needsOf(m).share || {})[sec] || 'anon';
const tagLabel = (list, k) => (list.find(x => x[0] === k) || [k, k])[1];
const hasTravel = n => !!(n.depart || n.arrive || n.noRedeye || +n.maxTravel || n.noFly);
const hasSec = (n, sec) => sec === 'diet' ? !!((n.diet || []).length || n.dietNote) : sec === 'access' ? !!((n.access || []).length || n.accessNote) : hasTravel(n);
// can the person looking see this section of m's needs, and with m's name?
function needView(m, sec) {
  if (m.id === S.uid) return { see: true, named: true };
  const lv = shareOf(m, sec);
  if (lv === 'org') return { see: isOrganizer(), named: true };
  return { see: true, named: lv === 'named' };
}
// the crew's needs as this viewer may see them; tags are counted, names only where allowed
function crewNeeds() {
  const ms = active(), out = { diet: {}, access: {}, notes: [], travel: [], orgOnly: false };
  for (const m of ms) {
    const n = needsOf(m);
    for (const [sec, list] of [['diet', DIETS], ['access', ACCESS]]) {
      if (!hasSec(n, sec)) continue;
      const v = needView(m, sec); if (!v.see) continue;
      if (shareOf(m, sec) === 'org' && m.id !== S.uid) out.orgOnly = true;
      for (const k of n[sec] || []) { const e = out[sec][k] = out[sec][k] || { label: tagLabel(list, k), n: 0, names: [] }; e.n++; if (v.named) e.names.push(m.id === S.uid ? 'you' : m.nick || 'Someone'); }
      const note = n[sec + 'Note']; if (note) out.notes.push({ sec, text: note, name: v.named ? (m.id === S.uid ? 'you' : m.nick || 'Someone') : '' });
    }
    if (hasTravel(n)) { const v = needView(m, 'travel'); if (v.see) out.travel.push({ n, name: v.named ? (m.id === S.uid ? 'you' : m.nick || 'Someone') : '' }); }
  }
  return out;
}
// one set of travel limits that works for everyone
function travelLimits(list) {
  const ns = list.map(x => x.n), out = [];
  const dep = ns.map(n => n.depart).filter(Boolean).sort().pop(), arr = ns.map(n => n.arrive).filter(Boolean).sort()[0];
  const max = ns.map(n => +n.maxTravel).filter(x => x > 0).sort((a, b) => a - b)[0];
  if (dep) out.push(`Leave after ${t12(dep)}`);
  if (arr) out.push(`Arrive by ${t12(arr)}`);
  if (ns.some(n => n.noRedeye)) out.push('No red-eyes');
  if (max) out.push(`At most ${max}h of travel each way`);
  const nf = ns.filter(n => n.noFly).length; if (nf) out.push(`${nf === ns.length && ns.length > 1 ? 'Nobody' : nf === 1 ? '1 person' : nf + ' people'} ${nf === ns.length && ns.length > 1 ? 'wants to fly' : 'would rather not fly'}`);
  return out;
}
function needsCard(where) {
  if (S.demo) return '';
  const c = crewNeeds(), d = Object.values(c.diet), a = Object.values(c.access), tr = travelLimits(c.travel);
  if (!d.length && !a.length && !tr.length && !c.notes.length) return '';
  const chip = e => `<span class="need-c">${esc(e.label)}${e.n > 1 ? ` ×${e.n}` : ''}${e.names.length ? ` <span class="muted">(${esc(e.names.join(', '))})</span>` : ''}</span>`;
  const showTravel = where !== 'plan' || !isSmall();
  return `<section class="card stack needs-sum">
    <div class="stack" style="gap:2px"><h3>Plan around this</h3><span class="small muted">What the crew needs, shared the way each person chose. ${where === 'stays' ? 'Check rooms and access before you lock a stay.' : 'The AI already plans around it.'}</span></div>
    ${d.length ? `<div class="need-group"><span class="label">Food</span><div class="row" style="gap:6px">${d.map(chip).join('')}</div></div>` : ''}
    ${a.length ? `<div class="need-group"><span class="label">Getting around and rooms</span><div class="row" style="gap:6px">${a.map(chip).join('')}</div></div>` : ''}
    ${tr.length && showTravel ? `<div class="need-group"><span class="label">Travel</span><div class="row" style="gap:6px">${tr.map(x => `<span class="need-c">${esc(x)}</span>`).join('')}</div>${c.travel.some(x => x.name) ? `<span class="small muted">Includes limits from ${esc(listNames(c.travel.filter(x => x.name).map(x => ({ nick: x.name }))))}</span>` : ''}</div>` : ''}
    ${c.notes.length ? `<ul class="small need-notes">${c.notes.map(n => `<li>${esc(n.text)}${n.name ? ` <span class="muted">· ${esc(n.name)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    ${c.orgOnly ? '<span class="small muted">Some of this is only shown to organizers.</span>' : ''}
  </section>`;
}
// for the AI: everything, never with names
function needsText() {
  const ms = active(), count = (sec, list) => { const m = {}; for (const x of ms) for (const k of needsOf(x)[sec] || []) m[k] = (m[k] || 0) + 1; return Object.entries(m).map(([k, n]) => `${tagLabel(list, k)}${n > 1 ? ' ×' + n : ''}`); };
  const diet = count('diet', DIETS), acc = count('access', ACCESS), tr = travelLimits(ms.filter(m => hasTravel(needsOf(m))).map(m => ({ n: needsOf(m) })));
  const notes = ms.flatMap(m => ['dietNote', 'accessNote'].map(k => needsOf(m)[k]).filter(Boolean));
  if (!diet.length && !acc.length && !tr.length && !notes.length) return '';
  return `Practical needs in the group (never name anyone or mention these in a way that singles someone out; just make every suggestion work):
${diet.length ? `- Food: ${diet.join(', ')}. Every food stop must have good options for these.\n` : ''}${acc.length ? `- Access and rooms: ${acc.join(', ')}. Pick places and stays that work for this.\n` : ''}${tr.length ? `- Travel: ${tr.join('; ')}.\n` : ''}${notes.length ? `- Also: ${notes.join('; ')}\n` : ''}`.trim();
}
function myNeeds() {
  const m = meDoc(); if (!m || S.demo) return '';
  const n = needsOf(m), sh = sec => `<label class="row small need-share" style="gap:6px"><span class="muted">Who sees this</span><select id="nd-share-${sec}" style="width:auto">${SHARE_LEVELS.map(([k, l]) => `<option value="${k}" ${shareOf(m, sec) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const tags = (sec, list) => `<div class="row" style="gap:6px">${list.map(([k, l]) => `<button class="chip ${(n[sec] || []).includes(k) ? 'on' : ''}" data-need="${sec}|${k}" aria-pressed="${(n[sec] || []).includes(k)}">${l}</button>`).join('')}</div>`;
  return `<section class="card stack my-needs">
    <h2>Your needs</h2>
    <p class="small muted">So the plan works for you. No need to say why. You choose who sees each part, and the AI plans around all of it without using your name.</p>
    <div class="stack need-sec"><div class="row" style="justify-content:space-between;gap:8px"><span class="label">Food</span>${sh('diet')}</div>${tags('diet', DIETS)}
      <input aria-label="Other food needs" id="nd-dietNote" maxlength="80" value="${esc(n.dietNote || '')}" placeholder="Anything else? e.g. severe, carry an EpiPen"></div>
    <div class="stack need-sec"><div class="row" style="justify-content:space-between;gap:8px"><span class="label">Getting around and rooms</span>${sh('access')}</div>${tags('access', ACCESS)}
      <input aria-label="Other access needs" id="nd-accessNote" maxlength="80" value="${esc(n.accessNote || '')}" placeholder="Anything else the planner should know"></div>
    ${isSmall() ? '' : `<div class="stack need-sec"><div class="row" style="justify-content:space-between;gap:8px"><span class="label">Travel</span>${sh('travel')}</div>
      <div class="row" style="gap:8px">
        <label class="field" style="flex:1 1 130px"><span class="small muted">Leave no earlier than</span><input id="nd-depart" type="time" value="${esc(n.depart || '')}"></label>
        <label class="field" style="flex:1 1 130px"><span class="small muted">Arrive no later than</span><input id="nd-arrive" type="time" value="${esc(n.arrive || '')}"></label>
        <label class="field" style="flex:1 1 130px"><span class="small muted">Max travel each way</span><select id="nd-maxTravel"><option value="0">No limit</option>${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(h => `<option value="${h}" ${+n.maxTravel === h ? 'selected' : ''}>${h} hour${h === 1 ? '' : 's'}</option>`).join('')}</select></label>
      </div>
      <label class="check-line"><input type="checkbox" id="nd-noRedeye" ${n.noRedeye ? 'checked' : ''}> No overnight flights</label>
      <label class="check-line"><input type="checkbox" id="nd-noFly" ${n.noFly ? 'checked' : ''}> I’d rather not fly</label></div>`}
  </section>`;
}
function setNeed(patch) { const n = { ...needsOf(meDoc() || {}), ...patch }; saveMe({ needs: n }, true); }
function toggleNeed(sec, k) { const cur = new Set(needsOf(meDoc() || {})[sec] || []); cur.has(k) ? cur.delete(k) : cur.add(k); setNeed({ [sec]: [...cur] }); }
/* ---------- the plan journey ----------
   One source of truth for where a plan is and what it needs. Every plan size gets its own
   steps in six shared stages. Each step knows whether it applies, whether it's done, what it
   waits on (blocked), who it's waiting on, and four things for the person looking:
   what we're trying to do, why it matters now, exactly what to do, and what happens after.
   Its button does the thing right there when it can (lock these dates, send the invite,
   I'm in), and otherwise opens the exact control it needs. The guide card, the next-move
   pill, the dot on the menu, the glow on the control, the milestone toast and the home rows
   all read from here. */
const JSTAGES = [['gather', 'Get together'], ['decide', 'Decide'], ['prepare', 'Prepare'], ['final', 'Final check'], ['experience', 'Experience'], ['after', 'Afterward']];
const JSTAGE_LABEL = Object.fromEntries(JSTAGES);
const word = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const namesOrCount = ms => ms.length <= 3 ? listNames(ms) : people(ms.length);
const daysUntil = d => Math.round((D(d) - D(TODAY)) / 864e5);
// buttons: a real action where possible, otherwise "open the place and light up the control"
const btn = (attrs, label, cls = 'primary') => `<button class="btn ${cls}" ${attrs}>${esc(label)}</button>`;
const goBtn = (k, label, cls = 'primary') => btn(`data-jgo="${k}"`, label, cls);
const nudgeBtn = (k, ms, cls = '') => ms.length ? btn(`data-jnudge="${k}"`, ms.length === 1 ? `Nudge ${ms[0].nick || 'them'}` : `Nudge ${ms.length <= 2 ? listNames(ms) : 'them'}`, cls) : '';

// The step catalogue. Each one is a function of the plan as it is now.
function jSteps() {
  const t = S.trip, sz = size(), small = isSmall(), ms = active(), me = meDoc(), n = ms.length;
  const goers = S.members.filter(going), others = arr => arr.filter(m => m.id !== S.uid);
  const haveDest = !!t.lockedDest, haveDates = !!t.lockedDates, decided = haveDest && haveDates;
  const d = t.lockedDates, over = d && TODAY > d.end, live = d && TODAY >= d.start && !over;
  const placeWord = small ? 'the plan' : 'where to go', dayWord = small ? 'the day' : 'the dates';
  const S_ = [];
  const add = (k, stage, def) => S_.push({ k, stage, ...def });
  const needsDecided = !decided ? [!haveDest && 'dest', !haveDates && 'dates'].filter(Boolean) : [];

  /* ----- get together ----- */
  const inPlan = S.members.filter(m => !m.removed && m.status !== 'out');
  add('invite', 'gather', {
    title: 'Get the crew in', done: inPlan.length >= 2, mine: inPlan.length < 2, mineText: 'Invite your friends',
    goal: 'Get everyone into the plan',
    why: inPlan.length < 2 ? `It’s just you so far. Votes, dates and costs only mean something once people are in.` : '',
    todo: 'Send the invite to your group chat. They tap it, type their name and they’re in.',
    after: 'As people join, they pick their free days and vote. You’ll see it here.',
    act: () => btn('data-act="copyInvite"', 'Send the invite'), help: { tab: 'crew', sel: '[data-act="copyInvite"]' },
  });
  if (honoreeMode() && !small) add('honoree', 'gather', {
    title: `Choose the ${mode().honoree}`, done: !!t.honoree, hideFrom: 'honoree', mine: true, mineText: `Choose the ${mode().honoree}`,
    goal: `Say who the ${mode().honoree} is`,
    why: `Their share can be covered, and surprise plans stay hidden from them.`,
    todo: `Pick them below. Only planners see this step.`,
    after: 'Anything you mark as a surprise in the itinerary is hidden from them until you reveal it.',
    act: () => `<select aria-label="Who it’s for" id="set-honoree" style="width:auto"><option value="">Pick someone</option>${S.members.map(m => `<option value="${esc(m.id)}">${esc(m.nick || 'Someone')}</option>`).join('')}</select>`,
    help: { tab: 'settings', sel: '#set-honoree' },
  });
  {
    const und = undecided(), mineU = und.some(m => m.id === S.uid);
    add('rsvp', 'gather', {
      title: 'Get everyone’s answer', done: inPlan.length >= 2 && !und.length, applies: S.members.length >= 2 || mineU,
      who: und, mine: mineU,
      group: und.length ? whoHas(und, 'hasn’t', 'haven’t', 'said if they’re in') : '',
      mineText: 'Say if you’re in',
      goal: mineU ? 'Tell the crew if you’re in' : 'Find out who’s actually coming',
      why: mineU ? `${word(goers.length, 'person is', 'people are')} going so far. The plan is built around who’s coming.` : `${word(goers.length, 'person is', 'people are')} going. ${namesOrCount(und)} ${und.length === 1 ? 'hasn’t' : 'haven’t'} answered.`,
      todo: mineU ? 'Tap one. You can change it later.' : `Ask ${namesOrCount(und)} to answer${t.rsvpBy ? ` by ${fmt(t.rsvpBy)}` : ''}.`,
      after: 'Costs, stays and the headcount use this number.',
      act: () => mineU ? `${btn('data-status="in"', 'I’m in')}${btn('data-status="out"', 'Can’t make it', 'ghost')}` : nudgeBtn('rsvp', und),
      help: { tab: 'crew', sel: '.rsvp' }, ask: 'say if you’re in',
    });
  }

  /* ----- decide ----- */
  {
    const items = t.pitches?.items || [], ro = runoffState(), match = matchedPitch(), dests = t.destinations || [];
    const notSwiped = ms.filter(m => items.some(p => !swipeOf(p.id, m.id))), mineSwipe = notSwiped.some(m => m.id === S.uid);
    const noVote = ms.filter(m => !(m.votes || []).length), lead = [...dests].sort((a, b) => votesFor(b.id).length - votesFor(a.id).length)[0];
    let s = { who: [], mine: false, group: '', why: '', todo: '', act: () => '', help: { tab: 'match', sel: '#pitch' } };
    if (ro && !ro.winner) {
      const w = ro.waiting, mineR = w.some(m => m.id === S.uid);
      s = { who: w, mine: mineR, group: `Final vote: waiting on ${namesOrCount(w)}`, mineText: 'Vote in the final round',
        why: `Nothing got a yes from everyone, so it’s down to ${ro.ps.map(pName).join(' or ')}.`, todo: mineR ? 'Pick the one you’d rather do.' : `Waiting on ${namesOrCount(w)} to vote.`,
        act: () => mineR ? goBtn('dest', 'Vote now') : nudgeBtn('dest', w), help: { tab: 'match', sel: '.runoff' }, ask: 'vote in the final round' };
    } else if (ro && ro.winner || match) {
      const p = ro?.winner || match;
      s = { group: `${pName(p)} won. Lock it in`, why: ro?.winner ? `${pName(p)} won the final vote.` : `Everyone swiped yes on ${pName(p)}.`,
        todo: `Lock in ${pName(p)}${p.start ? `, ${dayRange(p.start, p.end)}` : ''}.`, act: () => btn(`data-lockpitch="${esc(p.id)}"`, `Lock in ${pName(p)}`), help: { tab: 'match', sel: '[data-lockpitch]' } };
    } else if (items.length && notSwiped.length) {
      const top = [...items].sort((a, b) => fitScore(b) - fitScore(a))[0];
      s = { who: notSwiped, mine: mineSwipe, group: whoHas(notSwiped, 'is', 'are', 'still swiping'), mineText: `Swipe on the ${small ? 'plans' : 'trips'}`,
        why: `${word(items.length, 'option', 'options')} to choose from. ${n - notSwiped.length} of ${n} have swiped${fitScore(top) ? `, and ${pName(top)} leads so far` : ''}.`,
        todo: mineSwipe ? `Swipe on each one: yes, could work, or pass. It takes a minute.` : `Ask ${namesOrCount(notSwiped)} to swipe.`,
        act: () => mineSwipe ? goBtn('dest', 'Start swiping') : nudgeBtn('dest', notSwiped), help: { tab: 'match', sel: '#pitch' }, ask: `swipe on the ${small ? 'plan' : 'trip'} options` };
    } else if (items.length) {
      s = { group: 'No perfect match. Settle it', why: 'Everyone swiped, and nothing got a yes from all of you.', todo: 'Go with the one everyone can live with, or run a final vote between the top two.',
        act: () => goBtn('dest', 'Settle it'), help: { tab: 'match', sel: '.settle' } };
    } else if (dests.length && noVote.length) {
      const mineV = noVote.some(m => m.id === S.uid);
      s = { who: noVote, mine: mineV, group: whoHas(noVote, 'hasn’t', 'haven’t', 'voted'), mineText: `Vote on ${placeWord}`,
        why: `${word(dests.length, 'idea', 'ideas')} on the table${lead && votesFor(lead.id).length ? `. ${lead.city} leads with ${word(votesFor(lead.id).length, 'vote', 'votes')}` : ''}.`,
        todo: mineV ? 'Vote for every one you’d do.' : `Ask ${namesOrCount(noVote)} to vote, then lock the winner.`,
        act: () => mineV ? goBtn('dest', 'Vote now') : nudgeBtn('dest', noVote), help: { tab: 'match', sel: '[data-vote]' }, ask: `vote on ${placeWord}` };
    } else if (dests.length) {
      s = { group: `${lead.city} is winning. Lock it in`, why: `Everyone has voted. ${lead.city} has ${word(votesFor(lead.id).length, 'vote', 'votes')}.`, todo: `Lock in ${lead.city}.`,
        act: () => btn(`data-lockdest="${esc(lead.id)}"`, `Lock in ${lead.city}`), help: { tab: 'match', sel: '[data-lockdest]' } };
    } else {
      s = { group: small ? 'No ideas yet' : 'No destinations yet', why: small ? 'Nobody has suggested anything yet.' : 'There’s nothing on the table yet.',
        todo: S.sample ? `Get a few ${small ? 'plans' : 'trips'} pitched that fit everyone’s budget and free days, or suggest your own.` : `Suggest ${small ? 'an idea' : 'a place'}. Everyone votes on it.`,
        act: () => S.sample ? goBtn('dest', small ? 'Pitch us some plans' : 'Pitch us some trips') : goBtn('dest', 'Suggest one'),
        help: S.sample ? { tab: 'match', sel: '[data-act="genPitches"]', click: true } : { tab: 'match', sel: '#ad-city' } };
    }
    add('dest', 'decide', { title: small ? 'Choose what to do' : 'Choose where to go', done: haveDest, goal: small ? 'Let’s pick what we’re doing' : 'Let’s pick where we’re going',
      after: haveDates ? (small ? 'Then confirm the place and time.' : 'Then book travel and a place to stay.') : `Once ${dayWord} ${small ? 'is' : 'are'} set too, ${small ? 'you confirm the place and time' : 'travel and the stay open up'}.`, ...s });
  }
  {
    const noDays = ms.filter(m => !(m.days || []).length), mineD = noDays.some(m => m.id === S.uid), best = bestWindows()[0], shared = n - noDays.length;
    const bestText = best ? `${dayRange(best.start, best.end)} works for ${best.ok.length === n ? 'everyone' : best.ok.length === shared && shared < n ? 'everyone who’s responded' : `${best.ok.length} of ${n}`}` : '';
    add('dates', 'decide', {
      title: small ? 'Choose the day' : 'Choose the dates', done: haveDates, who: noDays, mine: mineD,
      group: noDays.length ? whoHas(noDays, 'hasn’t', 'haven’t', `picked ${small ? 'days' : 'dates'}`) : best ? `${bestText}. Lock it` : `No ${small ? 'day' : 'dates'} work for everyone yet`,
      mineText: small ? 'Pick the days that work for you' : 'Pick your free days',
      goal: small ? 'Let’s settle on a day' : 'Let’s settle on the dates',
      why: `${shared === n ? 'Everyone has' : !shared ? 'Nobody has' : `${shared} of ${n} have`} shared when they’re free${!shared ? ' yet' : ''}.${best ? ` ${bestText}.` : shared ? ` No ${small ? 'day' : `${nightsSet(t)}-night stretch`} works for everyone yet.` : ''}`,
      todo: mineD ? `Tap the days you’re free${best ? `, then lock ${dayRange(best.start, best.end)}` : ''}.` : noDays.length ? `Ask ${namesOrCount(noDays)} to add their free days${best ? `, then lock the best ${small ? 'day' : 'dates'}` : ''}.` : best ? `Lock ${dayRange(best.start, best.end)}.` : 'Compare a shorter trip or widen the window.',
      after: small ? 'Then confirm the place and time, and who’s coming.' : haveDest ? 'Then book travel and a place to stay.' : 'Once where is set too, travel and the stay open up.',
      act: () => mineD ? goBtn('dates', 'Pick my days')
        : `${best ? btn(`data-lockdates="${best.start}|${best.end}"`, `Lock ${dayRange(best.start, best.end)}`, noDays.length ? '' : 'primary') : goBtn('dates', 'See the options', noDays.length ? '' : 'primary')}${nudgeBtn('dates', noDays, 'primary')}`,
      help: { tab: 'dates', sel: mineD ? '.cal' : '[data-lockdates]' }, ask: 'tap the days you’re free',
    });
  }

  /* ----- prepare ----- */
  const unsure = goers.filter(m => m.status === 'in'), mineC = unsure.some(m => m.id === S.uid);
  add('confirm', 'prepare', {
    title: 'Confirm who’s coming', done: goers.length > 0 && !unsure.length && !undecided().length, blockedBy: haveDates ? [] : ['dates'],
    who: unsure, mine: mineC, group: unsure.length ? whoHas(unsure, 'hasn’t', 'haven’t', 'confirmed') : '', mineText: 'Confirm you’re coming',
    goal: mineC ? 'Lock in that you’re coming' : 'Know exactly who’s coming',
    why: `${d ? (d.start === d.end ? fmt(d.start) : dayRange(d.start, d.end)) : 'The date'} ${d && d.start !== d.end ? 'are' : 'is'} set. ${goers.length - unsure.length} of ${goers.length} going ${goers.length - unsure.length === 1 ? 'has' : 'have'} confirmed.`,
    todo: mineC ? 'Confirm, so the crew can book around you.' : `Ask ${namesOrCount(unsure)} to confirm.`,
    after: small ? 'The final headcount goes to whoever books.' : 'Bookings and the cost split use the confirmed number.',
    act: () => mineC ? `${btn('data-status="confirmed"', 'Yes, I’m coming')}${btn('data-status="out"', 'Can’t make it', 'ghost')}` : nudgeBtn('confirm', unsure),
    help: { tab: 'crew', sel: '.ladder' }, ask: 'confirm you’re coming',
  });
  if (small) {
    const first = (t.itinerary || []).filter(i => i.time).sort(byTime)[0];
    add('venue', 'prepare', {
      title: 'Confirm the place and time', done: !!(t.venue || t.time || first), blockedBy: needsDecided,
      group: 'No place or time yet', goal: 'Pin down where and when',
      why: `${dest()?.city || 'The plan'} is set for ${d ? fmt(d.start) : 'the day'}, but there’s no place or start time yet.`,
      todo: 'Add the first stop with its time: where you meet, eat or start.',
      after: 'Everyone sees it in the plan, and you set a meeting point closer to the day.',
      act: () => goBtn('venue', 'Add the first stop'), help: { tab: 'plan', sel: '.addItem input[id^="ai-title"]' },
    });
  }
  if (sz === 'trip') {
    const tk = tickets(), left = tk.ins.filter(m => !tk.tk[m.id]), mineF = left.some(m => m.id === S.uid);
    add('flights', 'prepare', {
      title: mineF ? 'Book your flight' : 'Get everyone’s flights booked', done: tk.on, blockedBy: needsDecided,
      who: left, mine: mineF, group: left.length === 1 ? `One booking left: ${left[0].nick || 'Someone'}` : `${left.length} bookings left`, mineText: 'Book your flight and send your boarding pass',
      goal: mineF ? 'Get your flight booked' : 'Get every flight booked',
      why: `${tk.have.length} of ${tk.goal} booked. Fares usually climb closer to ${d ? short(d.start) : 'the trip'}.`,
      todo: mineF ? (me?.home ? `Book from ${me.home}, then upload your boarding pass or flight number.` : 'Add where you fly from, book, then upload your boarding pass.') : `Ask ${namesOrCount(left)} to book and send their boarding pass.`,
      after: 'Once everyone’s booked, the trip is official and arrivals show up for the crew.',
      act: () => mineF ? `${goBtn('flights', 'Upload my boarding pass')}${btn('data-tab="flights"', 'Find fares', 'ghost')}` : nudgeBtn('flights', left),
      help: { tab: 'tickets', sel: '#tkForm' }, ask: 'book your flight and send your boarding pass',
    });
  }
  if (!small) {
    const opts = t.stays?.items || [], own = Object.values(t.myStays || {}).filter(Boolean);
    const top = opts.map((s, i) => ({ s, i, sc: score(rkey('st' + s.name)) })).sort((a, b) => b.sc.net - a.sc.net)[0];
    add('stay', 'prepare', {
      title: 'Choose the stay', done: !!t.stay, blockedBy: needsDecided, group: 'Nobody has picked the stay yet',
      goal: 'Lock in where you’re staying', why: opts.length || own.length ? `${word(opts.length + own.length, 'option', 'options')} so far${top && top.sc.up ? `. ${top.s.name} has the most votes` : ''}.` : `Nothing picked yet for ${word(nightsOf(dates()) || nightsSet(t), 'night', 'nights')} in ${dest()?.city || 'town'}.`,
      todo: top && top.sc.up ? `Lock ${top.s.name}, or vote first if you haven’t.` : opts.length || own.length ? 'Vote on the options, then lock the favorite.' : S.sample ? 'Get a few stays that fit the group budget, or add a place you found.' : 'Add a place you found. The crew votes, then you lock it.',
      after: 'Each person’s share goes into the all-in cost. Then mark it booked.',
      act: () => top && top.sc.up ? `${btn(`data-lockstay="${top.i}"`, `Lock ${top.s.name}`)}${goBtn('stay', 'Compare', 'ghost')}` : goBtn('stay', opts.length || own.length ? 'Vote on stays' : S.sample ? 'Find stays' : 'Add a place'),
      help: opts.length ? { tab: 'stays', sel: '.stay .votes' } : S.sample ? { tab: 'stays', sel: '[data-act="findStays"]', click: true } : { tab: 'stays', sel: '[data-act="addStayOpen"]', click: true },
    });
  }
  if (sz !== 'hangout') {
    const need = small ? 1 : Math.max(3, nightsOf(dates())), have = (t.itinerary || []).length;
    add('plan', 'prepare', {
      title: small ? 'Plan the day' : 'Sketch the days', done: have >= need, blockedBy: needsDecided, hideFrom: 'honoree-secret', group: small ? 'Nothing planned for the day yet' : 'No itinerary yet',
      goal: small ? 'Plan how the day goes' : 'Sketch what you’ll do each day',
      why: have ? `${word(have, 'stop', 'stops')} so far.` : 'Nothing planned yet. Good spots book up.',
      todo: S.sample ? 'Let the AI draft it around the crew’s picks, then change anything.' : 'Add the stops you know: dinners, activities, nights out.',
      after: 'The plan shows up in Live on the day, with the map.',
      act: () => goBtn('plan', S.sample ? 'Draft it with AI' : 'Add stops'), help: S.sample ? { tab: 'plan', sel: '[data-act="plan"]', click: true } : { tab: 'plan', sel: '.addItem input[id^="ai-title"]' },
    });
  }
  {
    const open = taskList().filter(x => !x.done), mineT = open.filter(x => x.owner === S.uid), free = open.filter(x => !x.owner);
    const x = mineT[0] || free[0];
    add('tasks', 'prepare', {
      title: mineT.length ? `Finish “${mineT[0].title}”` : 'Split the to-dos', done: !open.length, applies: taskList().length > 0,
      mine: !!mineT.length, who: [], group: free.length ? `Nobody has taken “${free[0].title}”` : open[0] ? `${nameOf(open[0].owner)} is on “${open[0].title}”` : '', mineText: mineT[0] ? mineT[0].title : '',
      goal: mineT.length ? 'Get your to-do done' : 'Make sure every to-do has someone on it',
      why: `${word(open.length, 'to-do', 'to-dos')} left${free.length ? `, ${free.length} with nobody on ${free.length === 1 ? 'it' : 'them'}` : ''}.`,
      todo: mineT.length ? `${mineT[0].title}${mineT[0].due ? `, due ${short(mineT[0].due)}` : ''}. Mark it done when it is.` : free.length ? `Take “${free[0].title}”, or hand it to someone.` : 'Everyone has their to-dos. Nothing for you right now.',
      after: 'The crew sees it ticked off.',
      act: () => x ? (mineT.length ? btn(`data-taskdone="${esc(x.id)}"`, 'Mark it done') : btn(`data-taketask="${esc(x.id)}"`, 'I’ll take it')) + goBtn('tasks', 'All to-dos', 'ghost') : '',
      help: { tab: 'tasks', sel: x ? `[data-task="${x.id}"]` : '.tasks' }, parallel: true,
    });
  }

  /* ----- final check ----- */
  const soon = d && daysUntil(d.start) <= 7;
  if (!small && t.stay) add('booked', 'final', {
    title: 'Mark the stay as booked', done: !!t.stay.booked, blockedBy: [], group: `${t.stay.name} isn’t booked yet`,
    goal: 'Make sure the stay is actually booked', why: `${t.stay.name} is picked but nobody has marked it booked.`,
    todo: 'Whoever booked it: add what you paid. That updates everyone’s share.', after: 'The real price replaces the estimate in the all-in cost.',
    act: () => goBtn('booked', 'Mark it booked'), help: { tab: 'stays', sel: '#stayBookForm' },
  });
  if (sz === 'trip') {
    const tk = tickets(), noArr = tk.ins.filter(m => tk.tk[m.id] && !m.arrive), mineA = noArr.some(m => m.id === S.uid);
    add('arrivals', 'final', {
      title: 'Share when you land', done: tk.ins.length > 0 && tk.ins.every(m => m.arrive), blockedBy: ['flights'], who: noArr, mine: mineA,
      group: noArr.length ? whoHas(noArr, 'hasn’t', 'haven’t', 'shared when they land') : '', mineText: 'Share when you land',
      goal: 'Line up arrivals', why: 'So people landing close together can share a ride in.',
      todo: mineA ? 'Add your landing time and flight number.' : `Ask ${namesOrCount(noArr)} to add their landing time.`, after: 'Rides get matched up for people arriving within an hour of each other.',
      act: () => mineA ? goBtn('arrivals', 'Add my landing time') : nudgeBtn('arrivals', noArr), help: { tab: 'tickets', sel: '#arrForm' }, ask: 'add when you land',
    });
  }
  add('meet', 'final', {
    title: 'Set the meeting point', done: !!t.meet?.text, blockedBy: needsDecided, group: 'No meeting point yet', notBefore: !soon,
    goal: 'Make sure nobody’s left wandering', why: d ? `${daysUntil(d.start) <= 0 ? 'It’s today' : `It’s ${daysUntil(d.start) === 1 ? 'tomorrow' : 'in ' + daysUntil(d.start) + ' days'}`} and there’s no meeting point.` : '',
    todo: 'Say where and when everyone meets.', after: 'Everyone sees it in Live, with a map link.',
    act: () => `<form id="meetForm" class="row j-inline" style="gap:6px;align-items:flex-end"><label class="field" style="flex:2 1 150px"><span class="label">Where</span><input id="meet-where" maxlength="80" placeholder="${small ? 'Outside the restaurant' : 'Hotel lobby'}"></label><label class="field" style="flex:0 1 120px"><span class="label">When</span><input id="meet-time" type="time" value="${esc(t.time || '')}"></label><button class="btn primary" type="submit">Set it</button></form>`,
    help: { tab: 'live', sel: '#meetForm' },
  });

  /* ----- experience ----- */
  if (live) add('live', 'experience', {
    title: small ? 'Enjoy it' : 'Follow today’s plan', done: false, live: true,
    goal: 'It’s happening', why: (() => { const nowT = new Date().toTimeString().slice(0, 5), up = visItems().filter(i => i.date === TODAY).sort(byTime).find(i => timeKey(i.time) >= timeKey(nowT)); return up ? `Up next: ${up.title}${up.time ? ' at ' + t12(up.time) : ''}.` : 'Nothing else planned today.'; })(),
    todo: 'Open today’s plan. Check in when you get somewhere, and use SOS if you get separated.', after: 'Check-ins and photos feed the recap.',
    act: () => `${btn('data-tab="live"', 'Open today')}${btn('data-tab="map"', 'Map', 'ghost')}`, help: { tab: 'live', sel: '.live' },
  });

  /* ----- afterward ----- */
  if (over) {
    const owe = settle(), mineO = owe.filter(x => x.from === S.uid);
    add('settle', 'after', {
      title: mineO.length ? 'Pay back what you owe' : 'Settle up', done: !owe.length, applies: S.expenses.length > 0, mine: !!mineO.length,
      group: owe.length ? `${word(owe.length, 'payment', 'payments')} left to settle` : '', mineText: 'Pay back what you owe',
      goal: 'Square up the money', why: `${word(owe.length, 'payment settles', 'payments settle')} everything.`,
      todo: mineO.length ? `You owe ${listNames(mineO.map(x => ({ nick: nameOf(x.to) })))} ${money2(mineO.reduce((a, x) => a + x.amt, 0))}.` : 'See who pays whom.',
      after: 'Nobody has to chase anyone.', act: () => goBtn('settle', mineO.length ? 'See how to pay' : 'See who owes what'), help: { tab: 'money', sel: '.settle-list, .card' },
    });
    add('photos', 'after', {
      title: 'Add your photos', done: S.photos.some(p => p.by === S.uid), mine: true, mineText: 'Add your photos', group: '',
      goal: 'Put the photos in one place', why: `${word(S.photos.length, 'photo', 'photos')} so far.`, todo: 'Add your best ones. They go into the recap.',
      after: 'The recap and awards pick them up.', act: () => goBtn('photos', 'Add photos'), help: { tab: 'recap', sel: '#ph-files' }, parallel: true,
    });
    add('wrapped', 'after', {
      title: small ? 'Watch the recap' : 'Watch your Wrapped', done: !!lsGet('outta_wrapped_' + S.tid, false), mine: true, mineText: small ? 'Watch the recap' : 'Watch your Wrapped', group: '',
      goal: 'Relive it', why: 'Your recap is ready.', todo: 'Watch it, then share it with the crew.', after: 'You can start the next one from this plan in Settings.',
      act: () => btn('data-tab="wrapped"', 'Watch it'), help: { tab: 'wrapped', sel: '.wslide' },
    });
  }

  // work out status for each step
  const byK = Object.fromEntries(S_.map(s => [s.k, s]));
  const honor = isHonoree();
  return S_.filter(s => s.applies !== false && !(honor && s.hideFrom)).map(s => {
    const blocked = (s.blockedBy || []).filter(k => byK[k] && !byK[k].done);
    const status = s.done ? 'done' : blocked.length ? 'blocked' : s.notBefore ? 'later' : (s.who || []).length && !s.mine ? 'waiting' : 'ready';
    return { ...s, blocked: blocked.map(k => byK[k].title), status };
  });
}
// which stage the plan is in: decided by time first, then by what's open
function journey() { return memo('journey', journeyNow); }
function journeyNow() {
  const t = S.trip, d = t.lockedDates, steps = jSteps();
  let stage;
  if (d && TODAY > d.end) stage = 'after';
  else if (d && TODAY >= d.start) stage = 'experience';
  else {
    const open = k => steps.some(s => s.stage === k && s.status !== 'done' && s.status !== 'later');
    stage = !steps.find(s => s.k === 'invite')?.done ? 'gather' : open('decide') ? 'decide' : open('prepare') ? 'prepare' : 'final';
  }
  const si = JSTAGES.findIndex(([k]) => k === stage);
  const live = steps.filter(s => !['done', 'blocked', 'later'].includes(s.status) && JSTAGES.findIndex(([k]) => k === s.stage) <= Math.max(si, 1));
  // the one step to lead with: something you can do yourself, in the earliest stage
  const rank = s => (s.mine ? 0 : s.status === 'ready' && !(s.who || []).length ? 1 : 2) * 10 + JSTAGES.findIndex(([k]) => k === s.stage);
  const focus = [...live].sort((a, b) => rank(a) - rank(b))[0] || null;
  const also = live.filter(s => s !== focus);
  return { stage, si, steps, focus, also, later: steps.filter(s => s.status !== 'done' && s !== focus && !also.includes(s)), done: steps.filter(s => s.status === 'done') };
}

/* ----- the guide card: the plan home's main thing ----- */
function journeyCard() {
  const j = journey(), f = j.focus, fresh = f && S.jLast && S.jLast !== f.k; if (f) S.jLast = f.k;
  const strip = `<div class="card stage-track j-track"><ol class="j-strip" aria-label="Where the plan is">${JSTAGES.map(([k, l], i) => `<li class="${i < j.si ? 'j-done' : i === j.si ? 'j-cur' : ''}"><i></i><span>${l}</span></li>`).join('')}</ol></div>`;
  const head = f ? `<div class="j-focus ${f.mine ? 'mine' : ''} ${fresh ? 'fresh' : ''}" data-key="jf-${f.k}">
      <span class="j-eyebrow">${esc(JSTAGE_LABEL[f.stage])}${f.mine ? ' · Your move' : ''}</span>
      <h2>${esc(f.goal)}</h2>
      ${f.why ? `<p class="j-why">${esc(f.why)}</p>` : ''}
      <div class="j-do"><span class="label">Here’s what to do</span><b>${esc(f.todo)}</b></div>
      ${f.who && f.who.filter(x => x.id !== S.uid).length ? `<div class="avs">${f.who.filter(x => x.id !== S.uid).slice(0, 8).map(x => `<span class="av-sm" title="${esc(x.nick || 'Someone')}" style="background:${colorFor(x.id)}">${esc((x.nick || '?')[0].toUpperCase())}</span>`).join('')}</div>` : ''}
      <div class="j-acts">${f.act()}${f.help && !f.live ? `<button class="linkbtn small j-help" data-jgo="${f.k}">Help me finish this step</button>` : ''}</div>
      ${f.after ? `<p class="j-after"><span class="label">After this</span> ${esc(f.after)}</p>` : ''}
    </div>`
    : `<div class="j-focus done"><span class="j-eyebrow">${esc(JSTAGE_LABEL[j.stage])}</span><h2>${j.stage === 'after' ? 'All wrapped up' : 'You’re all set'}</h2><p class="j-why">${(() => { const c = countdown(); return c && j.stage !== 'after' ? `${c.text} to go. Nothing needs doing right now.` : 'Nothing needs doing right now.'; })()}</p></div>`;
  const row = (s, later) => `<div class="j-row s-${s.status}" data-key="j-${s.k}">
      <span class="j-ic" aria-hidden="true">${s.status === 'done' ? '✓' : s.status === 'blocked' ? '🔒' : s.status === 'later' ? '◷' : s.mine ? '●' : '○'}</span>
      <div class="stack" style="gap:2px;min-width:0;flex:1"><b>${esc(s.mine && s.mineText && s.status !== 'done' ? s.mineText : s.title)}</b>
        <span class="small muted">${s.status === 'blocked' ? `Unlocks after: ${esc(s.blocked.join(', ').toLowerCase())}` : s.status === 'later' ? 'Closer to the day' : later && s.status === 'ready' ? `Later, in ${esc(JSTAGE_LABEL[s.stage].toLowerCase())}` : s.status === 'waiting' ? esc(s.group || 'Waiting on the crew') : s.status === 'done' ? 'Done' : esc(s.group || JSTAGE_LABEL[s.stage])}</span></div>
      ${s.status === 'ready' || s.status === 'waiting' ? `<button class="btn sm ${s.mine ? 'primary' : ''}" data-jgo="${s.k}">${s.mine ? 'Do it' : s.status === 'waiting' ? 'See' : 'Open'}</button>` : ''}
    </div>`;
  return `<section class="journey" id="journey">
    ${strip}
    ${head}
    ${j.also.length || j.later.length || j.done.length ? `<div class="card j-lists">` : ''}
    ${j.also.length ? `<div class="j-list"><span class="label">Also open now</span>${j.also.map(s => row(s)).join('')}</div>` : ''}
    ${j.later.length || j.done.length ? `<details class="j-more" ${S.jMore ? 'open' : ''}><summary class="small">${[j.later.length && `${j.later.length} coming up`, j.done.length && `${j.done.length} done`].filter(Boolean).join(' · ')}</summary>
      <div class="j-list">${j.later.map(s => row(s, true)).join('')}${j.done.map(s => row(s)).join('')}</div></details>` : ''}
    ${j.also.length || j.later.length || j.done.length ? '</div>' : ''}
    ${isHonoree() ? `<p class="small muted">Some of this ${planWord()} is a surprise for you. You’ll see those parts when they’re revealed.</p>` : ''}
  </section>`;
}
// open the workspace for a step and light up the exact control; click it if that's the action
function jGo(k) {
  const s = jSteps().find(x => x.k === k); if (!s || !s.help) return;
  S.tab = s.help.tab; S.secTab[secOf(S.tab).k] = S.tab; S.tabPicked = true; S.jTarget = s.help; render(); window.scrollTo({ top: 0 });
  setTimeout(() => {
    const el = s.help.sel && document.querySelector(s.help.sel); if (!el) return;
    el.classList.add('beacon'); el.scrollIntoView({ block: 'center', behavior: calm() ? 'auto' : 'smooth' });
    if (s.help.click && !el.disabled) el.click(); else if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.focus({ preventScroll: true });
  }, 140);
}
function jNudge(k) {
  const s = jSteps().find(x => x.k === k); if (!s) return;
  const ms = (s.who || []).filter(m => m.id !== S.uid); if (!ms.length) return;
  sendInvite(`${ms.map(m => m.nick || 'Someone').join(', ')}: can you ${s.ask || 'take a look'} for ${S.trip.name}? It’s what the plan is waiting on.`, inviteLink(), S.trip.name);
}
// the slim version shown at the top of other tabs
function journeyPill() {
  if (S.demo || S.tab === 'overview' || isLive()) return '';
  const f = journey().focus; if (!f) return '';
  const here = f.help && f.help.tab === S.tab;
  return `<div class="j-pill ${f.mine ? 'mine' : ''}"><span class="small"><span class="np-k">${f.mine ? 'Your move' : 'Next'}</span> ${esc(f.mine && f.mineText ? f.mineText : f.title)}</span>
    ${here ? '' : `<button class="btn sm ${f.mine ? 'primary' : ''}" data-jgo="${f.k}">Go</button>`}</div>`;
}
/* ---------- home screen + trip creation ---------- */
/* ---------- book: flights ---------- */
function skyscanner(from, d, ds) { const y = s => s.slice(2).replace(/-/g, ''); return `https://www.skyscanner.com/transport/flights/${from.toLowerCase()}/${ds.code.toLowerCase()}/${y(d.start)}/${y(d.end)}/`; }
function flightsTab() {
  const d = dates(), ds = dest(); if (!d || !ds) return needDestDates('Flight search');
  const tk = tickets(), b = budgetCap(), nights = Math.max(1, nightsOf(d));
  const deals = S.trip.deals && S.trip.deals.city === ds.city && S.trip.deals.start === d.start ? S.trip.deals.data : null;
  const est = {}; for (const f of deals?.flights || []) est[String(f.from || '').toLowerCase()] = f;
  const groups = [...new Map(active().filter(m => m.home).map(m => [m.home.trim().toLowerCase(), m.home.trim()])).entries()];
  const noHome = active().filter(m => !m.home);
  const to = ds.code ? ds.code.toUpperCase() : ds.city;
  return `<section class="book-hero"><span class="label" style="color:inherit">Flights</span><h1>To ${esc(ds.city)}</h1>
      <div class="facts" style="color:inherit"><div><span class="label" style="color:inherit;opacity:.8">Dates</span><b>${short(d.start)} → ${short(d.end)}</b></div><div><span class="label" style="color:inherit;opacity:.8">Booked</span><b>${tk.have.length}/${tk.goal}</b></div>${b ? `<div><span class="label" style="color:inherit;opacity:.8">Flight budget</span><b>~${money(b.cap * .4)}</b></div>` : ''}</div>
      ${S.sample !== null ? `<div><button class="btn" data-act="deals" ${S.busy.deals ? 'disabled' : ''}>${S.busy.deals ? '<i class="spin"></i>Checking prices…' : deals ? 'Re-check typical prices' : 'Check typical prices with AI'}</button></div>` : ''}</section>
  ${groups.map(([key, home]) => { const who = active().filter(m => (m.home || '').trim().toLowerCase() === key), e = est[key] || Object.values(est).find(f => key.includes(String(f.from || '').toLowerCase().slice(0, 3)));
    const code = isCode(home) ? home.toUpperCase() : home;
    return `<section class="card fl-route ${who.some(m => m.id === S.uid) ? 'mine' : ''}">
      <div class="route-top"><span class="code" style="font-size:clamp(30px,8vw,44px)">${esc(code)}</span><span class="plane">✈</span><span class="code" style="font-size:clamp(30px,8vw,44px);color:var(--accent)">${esc(to)}</span>
        ${e ? `<span class="price">${esc(e.roundTrip)}<small>typical round trip</small></span>` : ''}</div>
      ${e?.tip ? `<p class="small">${esc(e.tip)}</p>` : ''}
      <div class="row" style="gap:6px">${who.map(m => `<span class="chip" style="cursor:default">${esc(m.nick || 'Someone')} ${tk.tk[m.id] ? '<b style="color:var(--good)">✓ booked</b>' : '<span class="muted">not booked</span>'}</span>`).join('')}</div>
      <div class="row" style="gap:6px"><a class="btn primary sm" href="${gFlights(home, d, ds)}" target="_blank" rel="noopener">Google Flights</a>
        ${isCode(home) && ds.code ? `<a class="btn sm" href="${kayak(home.trim(), d, ds)}" target="_blank" rel="noopener">Kayak</a><a class="btn sm" href="${skyscanner(home.trim(), d, ds)}" target="_blank" rel="noopener">Skyscanner</a>` : ''}
        ${who.some(m => m.id === S.uid) && !tk.tk[S.uid] ? `<button class="btn sm ghost" data-tab="tickets">I booked it</button>` : ''}</div>
    </section>`; }).join('')}
  ${noHome.length ? `<section class="card row" style="justify-content:space-between"><span class="small"><b>${noHome.map(m => esc(m.nick || 'Someone')).join(', ')}</b> ${noHome.length === 1 ? 'hasn’t' : 'haven’t'} said where they fly from.</span><button class="btn sm" data-tab="crew">Add home airport</button></section>` : ''}
  ${!ds.code ? `<p class="small muted">Add ${esc(ds.city)}’s airport code in Plan › Where to get Kayak and Skyscanner links.</p>` : ''}
  ${b ? `<section class="card stack"><h3>The budget play</h3><p class="small muted">The tightest budget in the crew is around <b>${b.label}</b>. A good split that works for everyone:</p>
    <div class="split"><div><span class="label">Flights</span><b>${money(b.cap * .4)}</b></div><div><span class="label">Stay</span><b>${money(b.cap * .35)}</b><span class="small muted">${money(b.cap * .35 / nights)}/night each</span></div><div><span class="label">Food & fun</span><b>${money(b.cap * .25)}</b><span class="small muted">${money(b.cap * .25 / nights)}/day</span></div></div></section>` : ''}
  ${deals ? `<section class="card stack"><h3>What the whole trip will cost</h3>${dealsBody(deals, b ? b.cap : 0)}</section>` : ''}`;
}

/* ---------- book: stays ---------- */
function findStays() {
  const n = active().length, b = budgetCap(), nights = Math.max(1, nightsOf(dates()));
  const prompt = `You're finding places for a group to stay.
${context()}
Stay budget: about ${b ? money(b.cap * .35) + ' per person for the whole stay (' + money(b.cap * .35 / nights) + ' per person per night)' : 'moderate'}.

Give 6 options for ${n} people: 3–4 specific real hotels that are well known and currently operating, and 2–3 vacation rental options described generically (for example "4-bedroom Airbnb-style house in Wynwood", not a specific listing). Work out how many rooms or beds the group needs. Prices are typical ranges, not live quotes.
Reply with only JSON: {"items":[{"name":"","kind":"hotel|rental|hostel","area":"neighborhood","sleeps":"e.g. 3 rooms, 2 queens each","perNight":"$X–Y per night for the group","perPerson":"$X–Y per person total","why":"one sentence on why it fits this group","pros":["2-3 short pros"],"lat":0,"lng":0}]}
lat/lng: your best estimate of the location.`;
  askAI('stays', prompt, data => {
    const items = (Array.isArray(data?.items) ? data.items : []).filter(x => x && x.name).slice(0, 8).map(x => ({
      id: rid(6), name: String(x.name).slice(0, 80), kind: ['hotel', 'rental', 'hostel'].includes(x.kind) ? x.kind : 'hotel', area: String(x.area || '').slice(0, 60),
      sleeps: String(x.sleeps || '').slice(0, 60), perNight: String(x.perNight || '').slice(0, 40), perPerson: String(x.perPerson || '').slice(0, 40),
      why: String(x.why || '').slice(0, 240), pros: arr(x.pros).slice(0, 3).map(p => String(p).slice(0, 50)), lat: +x.lat || null, lng: +x.lng || null }));
    if (!items.length) { flash('No stays came back. Try again.'); return; }
    return saveTrip({ stays: { city: dest()?.city || '', items, at: Date.now() } });
  });
}
function stayLinks(s, ds, d, n) {
  const q = encodeURIComponent(`${s.name} ${ds.city}`);
  if (s.kind === 'rental') return `<a class="btn sm primary" href="https://www.airbnb.com/s/${encodeURIComponent((s.area ? s.area + ', ' : '') + ds.city)}/homes?checkin=${d.start}&checkout=${d.end}&adults=${n}" target="_blank" rel="noopener">Airbnb</a><a class="btn sm" href="https://www.vrbo.com/search?destination=${encodeURIComponent((s.area ? s.area + ', ' : '') + ds.city)}&startDate=${d.start}&endDate=${d.end}&adults=${n}" target="_blank" rel="noopener">Vrbo</a>`;
  return `<a class="btn sm primary" href="https://www.google.com/travel/search?q=${q}" target="_blank" rel="noopener">Check prices</a><a class="btn sm" href="https://www.booking.com/searchresults.html?ss=${q}&checkin=${d.start}&checkout=${d.end}&group_adults=${n}&no_rooms=${Math.max(1, Math.ceil(n / 2))}" target="_blank" rel="noopener">Booking.com</a>`;
}
function staysTab() {
  const d = dates(), ds = dest(); if (!d || !ds) return needDestDates('Stay ideas');
  const n = Math.max(1, active().length), nights = Math.max(1, nightsOf(d)), b = budgetCap(), st = S.trip.stay;
  const opts = S.trip.stays && S.trip.stays.city === ds.city ? S.trip.stays.items : [];
  const ranked = opts.map((s, i) => ({ s, i, sc: score(rkey('st' + s.name)) })).sort((a, b2) => b2.sc.net - a.sc.net || a.i - b2.i);
  const perNightGroup = b ? b.cap * .35 * n / nights : 0;
  return `<section class="book-hero" style="--hc1:#0E9F6E;--hc2:#1098AD"><span class="label" style="color:inherit">Stay</span><h1>${st ? esc(st.name) : 'Where we’re sleeping'}</h1>
      <div class="facts" style="color:inherit"><div><span class="label" style="color:inherit;opacity:.8">Group</span><b>${n} people</b></div><div><span class="label" style="color:inherit;opacity:.8">Nights</span><b>${nights}</b></div>${b ? `<div><span class="label" style="color:inherit;opacity:.8">Budget / night</span><b>~${money(perNightGroup)} total</b></div>` : ''}</div>
      ${S.sample !== null ? `<div><button class="btn" data-act="findStays" ${S.busy.stays ? 'disabled' : ''}>${S.busy.stays ? '<i class="spin"></i>Finding stays…' : opts.length ? 'Find more options' : 'Find stays for us'}</button></div>` : ''}</section>
  ${needsCard('stays')}
  ${st ? `<section class="card stack locked-stay"><div class="row" style="justify-content:space-between"><span class="on-pill">Our stay</span><button class="btn sm ghost" data-act="unlockStay">Change</button></div>
      <h2>${esc(st.name)}</h2><span class="small muted">${esc([st.area, st.sleeps, st.perNight].filter(Boolean).join(' · '))}</span>
      ${+st.total ? `<b class="mono">${esc(stayPriceText(st))}</b>` : ''}
      <div class="row" style="gap:6px">${st.url ? `<a class="btn sm primary" href="${esc(st.url)}" target="_blank" rel="noopener noreferrer">Open listing</a>` : stayLinks(st, ds, d, n)}<a class="btn sm" href="${maps(st.name, ds.city)}" target="_blank" rel="noopener">Map</a><button class="btn sm ghost" data-tab="map">Crew map</button></div>
      ${stayBookedBox(st)}</section>` : ''}
  ${ownStays().length ? `<section class="stack"><h3>Found by the crew</h3><div class="grid2">${ownStays().map(s => ownStayCard(s, ds, d, n)).join('')}</div></section>` : ''}
  ${ownStayForm()}
  ${opts.length ? `<section class="grid2">${ranked.map(({ s, i }) => `<article class="card stay">
      <div class="stay-top" style="--sc:${s.kind === 'rental' ? '#0E9F6E' : s.kind === 'hostel' ? '#E8590C' : '#3B5BDB'}"><span class="label" style="color:#fff">${s.kind === 'rental' ? 'Airbnb-style rental' : s.kind}</span><h3 style="color:#fff">${esc(s.name)}</h3><span style="color:rgba(255,255,255,.85)" class="small">${esc(s.area)}</span></div>
      <div class="stack" style="gap:8px;padding:14px 16px 16px">
        <div class="row" style="justify-content:space-between;align-items:baseline"><b class="mono">${esc(s.perNight)}</b><span class="small muted">${esc(s.perPerson)}</span></div>
        ${s.sleeps ? `<span class="small muted">Sleeps: ${esc(s.sleeps)}</span>` : ''}
        <p class="small">${esc(s.why)}</p>
        ${arr(s.pros).length ? `<div class="row" style="gap:4px">${arr(s.pros).map(p => `<span class="chip" style="cursor:default">${esc(p)}</span>`).join('')}</div>` : ''}
        <div class="row" style="gap:6px">${voteBtns(rkey('st' + s.name))}</div>
        <div class="row" style="gap:6px">${stayLinks(s, ds, d, n)}${st?.name !== s.name ? `<button class="btn sm ghost" data-lockstay="${i}">Lock as our stay</button>` : ''}</div>
      </div></article>`).join('')}</section>
    <p class="small muted">AI suggestions with typical prices. Live prices are on the booking sites.</p>`
  : !st && !ownStays().length ? `<div class="empty"><b>No options yet.</b><span>Let the AI find hotels and Airbnb-style rentals that fit ${n} people and the group budget, add a place you found, or search yourself below.</span></div>` : ''}
  <section class="card"><h3 style="margin-bottom:6px">Search everything yourself</h3>
    <div class="linkrow"><div><b>Airbnb for ${n}</b><div class="small muted">${b ? 'Under ' + money(perNightGroup) + '/night for the whole place' : 'Whole place for the group'}</div></div><a class="btn sm" href="${airbnb(ds, d, n, perNightGroup)}" target="_blank" rel="noopener">Search</a></div>
    <div class="linkrow"><div><b>Booking.com</b><div class="small muted">${Math.ceil(n / 2)} rooms, cheapest first</div></div><a class="btn sm" href="${booking(ds, d, n)}" target="_blank" rel="noopener">Search</a></div>
    <div class="linkrow"><div><b>Google Hotels</b><div class="small muted">Compare prices across sites</div></div><a class="btn sm" href="${gHotels(ds, d)}" target="_blank" rel="noopener">Search</a></div>
  </section>`;
}
function ticketsTab() { return booking_time() || tickets().have.length ? ticketsSection() + arrivalsSection() : ticketsSection(); }

/* ---------- maps ---------- */
const kmBetween = (a, b) => { const R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lng - a.lng) * Math.PI / 180; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const KCOL = { stay: '#E9A514', nightlife: '#D41C78', food: '#0E9F6E', activity: '#3B5BDB', meet: '#151A33', lost: '#E5484D', plan: '#7048E8' };
function mapPoints() {
  const pts = [], seen = new Set(), push = p => { if (!p || !isFinite(p.lat) || !isFinite(p.lng) || !p.lat) return; const k = p.name.toLowerCase(); if (seen.has(k)) return; seen.add(k); pts.push(p); };
  const st = S.trip.stay; if (st && st.lat) push({ key: 'stay', name: st.name, lat: st.lat, lng: st.lng, kind: 'stay' });
  const geo = S.trip.geo || {};
  if (S.trip.meet?.text) { const g = geo[rkey(S.trip.meet.text)]; if (g) push({ key: 'meet', name: S.trip.meet.text, lat: g.lat, lng: g.lng, kind: 'meet' }); }
  for (const s of S.trip.spots?.items || []) push({ key: rkey('sp' + s.name), name: s.name, lat: s.lat, lng: s.lng, kind: /food/.test(s.type || '') ? 'food' : /activity|museum|park|tour|beach/.test(s.type || '') ? 'activity' : 'nightlife' });
  for (const i of visItems()) { if (i.hidden) continue; const g = geo[rkey(i.title)]; if (g) push({ key: rkey('it' + i.id), name: i.title, lat: g.lat, lng: g.lng, kind: i.kind === 'food' ? 'food' : i.kind === 'nightlife' ? 'nightlife' : 'activity' }); }
  for (const [k, g] of Object.entries(geo)) push({ key: k, name: g.name, lat: g.lat, lng: g.lng, kind: g.kind || 'plan' });
  return pts;
}
let mapW = 0;
window.addEventListener('resize', () => { clearTimeout(mapW); mapW = setTimeout(() => { if (document.querySelector('.map')) render(); }, 150); });
function lostAt() { return active().filter(m => m.lost && !m.lost.found && Date.now() - m.lost.at < 6 * 36e5); }
function mapView(height) {
  const pts = mapPoints(); if (!pts.length) return '';
  const lost = lostAt();
  // draw in roughly real pixels so labels stay the same size on a phone and a laptop
  const W = Math.round(Math.max(300, Math.min(840, (app.clientWidth || 600) - 34))), H = Math.round(Math.min(W * .72, height || 440)), P = 40;
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  let minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lngs), maxLo = Math.max(...lngs);
  const mid = (minLa + maxLa) / 2, kx = Math.cos(mid * Math.PI / 180);
  let spanX = (maxLo - minLo) * kx || .01, spanY = (maxLa - minLa) || .01;
  const sc = Math.min((W - 2 * P) / spanX, (H - 2 * P) / spanY);
  const ox = (W - spanX * sc) / 2, oy = (H - spanY * sc) / 2;
  const X = lng => ox + (lng - minLo) * kx * sc, Y = lat => oy + (maxLa - lat) * sc;
  const kmPerPx = 111.32 / sc, barKm = [0.25, 0.5, 1, 2, 5, 10, 20, 50].find(v => v / kmPerPx > 70) || 50, barPx = barKm / kmPerPx;
  const sel = pts.find(p => p.key === S.pinSel), stay = pts.find(p => p.kind === 'stay');
  const lostPts = new Map(); for (const m of lost) { const p = pts.find(q => q.name.toLowerCase() === (m.lost.where || '').toLowerCase()); if (p) lostPts.set(p.key, m); }
  return `<div class="map-wrap"><svg viewBox="0 0 ${W} ${H}" class="map" role="img" aria-label="Crew map with ${pts.length} places">
    <defs><pattern id="mgrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="var(--map-line)" stroke-width="1"/></pattern></defs>
    <rect width="${W}" height="${H}" fill="var(--map-bg)"/><rect width="${W}" height="${H}" fill="url(#mgrid)"/>
    ${stay ? pts.filter(p => p !== stay).map(p => `<line x1="${X(stay.lng)}" y1="${Y(stay.lat)}" x2="${X(p.lng)}" y2="${Y(p.lat)}" stroke="var(--map-route)" stroke-width="1.5" stroke-dasharray="4 5"/>`).join('') : ''}
    ${(() => {
      // place labels above, then below, each pin; skip a label that would collide (it shows when the pin is tapped)
      const placed = [], order = [...pts].sort((p, q) => (q === sel) - (p === sel) || (q.kind === 'stay') - (p.kind === 'stay') || lostPts.has(q.key) - lostPts.has(p.key));
      const hit = r => placed.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
      const lab = new Map();
      for (const p of pts) placed.push({ x: X(p.lng) - 12, y: Y(p.lat) - 12, w: 24, h: 24 });
      placed.push({ x: 8, y: H - 40, w: barPx + 74, h: 34 }, { x: W - 54, y: 10, w: 44, h: 44 }); // scale bar, compass
      for (const p of order) {
        const lm = lostPts.get(p.key), cut = W < 500 ? 20 : 30, txt = lm ? (lm.nick || 'Someone') + ' is here' : p.name.length > cut ? p.name.slice(0, cut - 1) + '…' : p.name;
        const w = txt.length * 7.4 + 10, x = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, X(p.lng))), y = Y(p.lat);
        for (const dy of [-17, 28]) { const r = { x: x - w / 2, y: y + dy - 13, w, h: 17 }; if (!hit(r)) { placed.push(r); lab.set(p, { txt, y: y + dy, x }); break; } }
      }
      return pts.map(p => { const x = X(p.lng), y = Y(p.lat), on = sel === p, lm = lostPts.get(p.key), l = lab.get(p);
        return `<g class="pin" data-pin="${esc(p.key)}" tabindex="0" role="button" aria-label="${esc(p.name)}">
          <circle cx="${x}" cy="${y}" r="18" fill="transparent"/>
          ${lm ? `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${KCOL.lost}" stroke-width="3" class="pulse-ring"/>` : ''}
          <circle cx="${x}" cy="${y}" r="${on ? 14 : 10}" fill="${KCOL[p.kind] || KCOL.plan}" stroke="var(--surface)" stroke-width="3"/>
          ${l ? `<text x="${l.x}" y="${l.y}" text-anchor="middle" class="pin-label">${esc(l.txt)}</text>` : ''}</g>`; }).join(''); })()}
    <g transform="translate(${W - 34},34)"><circle r="16" fill="var(--surface)" stroke="var(--map-line)"/><path d="M0 -10 L5 4 L0 1 L-5 4Z" fill="var(--ink)"/><text y="-19" text-anchor="middle" class="pin-label" style="font-size:10px">N</text></g>
    <g transform="translate(18,${H - 20})"><rect x="-6" y="-16" width="${barPx + 70}" height="26" rx="6" fill="var(--surface)" opacity=".85"/><line x1="0" y1="0" x2="${barPx}" y2="0" stroke="var(--ink)" stroke-width="3"/><text x="${barPx + 8}" y="4" class="pin-label" style="text-anchor:start;font-size:11px">${barKm < 1 ? barKm * 1000 + ' m' : barKm + ' km'}</text></g>
  </svg>
  <div class="legend" style="margin-top:8px">${[['stay', 'Stay'], ['nightlife', 'Nightlife'], ['food', 'Food'], ['activity', 'Plans'], ['meet', 'Meet-up']].filter(([k]) => pts.some(p => p.kind === k)).map(([k, l]) => `<span><i class="sw" style="background:${KCOL[k]}"></i>${l}</span>`).join('')}</div>
  ${sel ? (() => { const ds = dest(), km = stay && sel !== stay ? kmBetween(stay, sel) : null;
    return `<div class="card stack pin-card"><div class="row" style="justify-content:space-between"><b>${esc(sel.name)}</b><span class="kind">${esc(sel.kind)}</span></div>
      ${km !== null ? `<span class="small muted">${(km * 0.621).toFixed(1)} mi from ${esc(stay.name)} · about ${Math.max(1, Math.round(km / 5 * 60))} min walk</span>` : ''}
      <div class="row" style="gap:6px"><a class="btn sm primary" href="https://www.google.com/maps/dir/?api=1${stay && sel !== stay ? `&origin=${stay.lat},${stay.lng}` : ''}&destination=${sel.lat},${sel.lng}&travelmode=walking" target="_blank" rel="noopener">Directions</a><a class="btn sm" href="${maps(sel.name, ds?.city || '')}" target="_blank" rel="noopener">Open in Maps</a></div></div>`; })() : ''}
  </div>`;
}
function pinPlaces() {
  const ds = dest(); if (!ds) return;
  const geo = S.trip.geo || {}, names = [];
  for (const i of visItems()) if (!i.hidden && !geo[rkey(i.title)] && i.kind !== 'travel') names.push(i.title);
  if (S.trip.meet?.text && !geo[rkey(S.trip.meet.text)]) names.push(S.trip.meet.text);
  const st = S.trip.stay; const needStay = st && !st.lat;
  if (needStay) names.push(st.name);
  for (const s of S.trip.spots?.items || []) if (!s.lat) names.push(s.name);
  const uniq = [...new Set(names)].slice(0, 30);
  if (!uniq.length) { flash('Everything with a real place is already on the map.'); return; }
  const prompt = `Estimate map coordinates for these places in or near ${ds.city}. Some are itinerary titles: find the actual place they name. If a title is not a specific place (like "Pool day" or "Sleep in"), skip it.
Places:
${uniq.map((n, i) => `${i + 1}. ${n}`).join('\n')}
Reply with only JSON: {"places":[{"name":"exactly as given","lat":0,"lng":0,"kind":"nightlife|food|activity|stay"}]}`;
  askAI('pin', prompt, data => {
    const out = {}; let stayFix = null; const spotFix = {};
    for (const p of data?.places || []) {
      if (!p || !p.name || !isFinite(+p.lat) || !isFinite(+p.lng) || !+p.lat) continue;
      const g = { name: String(p.name).slice(0, 80), lat: +p.lat, lng: +p.lng, kind: ['nightlife', 'food', 'activity', 'stay'].includes(p.kind) ? p.kind : 'plan' };
      if (st && p.name === st.name) stayFix = g; else if ((S.trip.spots?.items || []).some(s => s.name === p.name)) spotFix[p.name] = g; else out[rkey(p.name)] = g;
    }
    const patch = { geo: out };
    if (stayFix) patch.stay = { lat: stayFix.lat, lng: stayFix.lng };
    if (Object.keys(spotFix).length) patch.spots = { ...S.trip.spots, items: S.trip.spots.items.map(s => spotFix[s.name] ? { ...s, lat: spotFix[s.name].lat, lng: spotFix[s.name].lng } : s) };
    return saveTrip(patch);
  });
}
function mapTab() {
  const ds = dest(); if (!ds) return needDestDates('The crew map', 'dest');
  const pts = mapPoints();
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px"><h2>Crew map</h2><span class="small muted">${isSmall() ? 'Your spots and plans' + (S.trip.city ? ' in ' + esc(S.trip.city) : '') : 'Your stay, spots and plans in ' + esc(ds.city)}. Tap a pin for walking time and directions.</span></div>
      <div class="row" style="gap:6px"><button class="btn sm lost-btn" data-act="lostOpen">I’m lost</button>${S.sample !== null ? `<button class="btn sm" data-act="pinPlaces" ${S.busy.pin ? 'disabled' : ''}>${S.busy.pin ? '<i class="spin"></i>Pinning…' : 'Pin everything'}</button>` : ''}</div></div>
    ${pts.length ? mapView() : `<div class="empty"><b>Nothing on the map yet.</b><span>${isSmall() ? 'Get spot picks or build the plan' : 'Lock a stay, get nightlife picks or build the itinerary'}, then tap “Pin everything”.</span></div>`}
    <p class="small muted">Pins are approximate. Use Directions for turn-by-turn.</p>
  </section>
  ${lostAt().length ? `<section class="card stack"><h3>Lost right now</h3>${lostAt().map(m => `<div class="nudge"><b>${esc(m.nick || 'Someone')}</b><span class="small">near ${esc(m.lost.where)} · ${ago(m.lost.at)}</span></div>`).join('')}</section>` : ''}`;
}

/* ---------- stays the crew found themselves ---------- */
// Anyone can add a place they found (Airbnb, Booking, VRBO, a friend's cabin) with a
// link and the real price. It sits next to the AI ideas, gets votes, and can be locked
// in the same way. A locked stay can be marked booked with what was actually paid.
const STAY_KIND_LABEL = { rental: 'Home rental', hotel: 'Hotel', hostel: 'Hostel', other: 'Other' };
const safeUrl = u => { try { const x = new URL(String(u || '').trim()); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function guessFromUrl(u) {
  const h = hostOf(u);
  if (/airbnb\./.test(h)) return { name: 'Airbnb listing', kind: 'rental' };
  if (/vrbo\.|homeaway\./.test(h)) return { name: 'VRBO listing', kind: 'rental' };
  if (/booking\.com/.test(h)) return { name: 'Booking.com stay', kind: 'hotel' };
  if (/hostelworld\./.test(h)) return { name: 'Hostelworld stay', kind: 'hostel' };
  if (/hotels\.com|expedia\.|marriott\.|hilton\.|hyatt\./.test(h)) return { name: 'Hotel listing', kind: 'hotel' };
  return h ? { name: h, kind: 'other' } : { name: '', kind: 'other' };
}
const ownStays = () => Object.entries(S.trip.myStays || {}).filter(([, s]) => s).map(([id, s]) => ({ id, ...s })).sort((a, b) => (a.at || 0) - (b.at || 0));
const nightsNow = () => Math.max(1, nightsOf(dates()));
function stayPriceText(s) {
  if (!+s.total) return s.perNight || 'No price yet';
  const n = nightsNow(), heads = planHeads();
  return `${money(s.total)} total · ${money(s.total / n)}/night · ${money(s.total / heads)} each`;
}
function ownStayCard(s, ds, d, n) {
  const locked = S.trip.stay && S.trip.stay.ownId === s.id;
  return `<article class="card stay own-stay" data-key="own-${esc(s.id)}">
    <div class="stay-top" style="--sc:#5C6A7A"><span class="label" style="color:#fff">${esc(STAY_KIND_LABEL[s.kind] || 'Stay')} · found by ${esc(nameOf(s.by))}</span><h3 style="color:#fff">${esc(s.name)}</h3>${s.area ? `<span style="color:rgba(255,255,255,.85)" class="small">${esc(s.area)}</span>` : ''}</div>
    <div class="stack" style="gap:8px;padding:14px 16px 16px">
      <b class="mono">${esc(stayPriceText(s))}</b>
      ${s.sleeps ? `<span class="small muted">Sleeps: ${esc(s.sleeps)}</span>` : ''}
      ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
      <div class="row" style="gap:6px">${voteBtns(rkey('st' + s.name))}</div>
      <div class="row" style="gap:6px">${s.url ? `<a class="btn sm primary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open listing</a>` : ''}
        ${locked ? '<span class="pill lvl-confirmed">Our stay</span>' : S.readOnly ? '' : `<button class="btn sm ${s.url ? 'ghost' : 'primary'}" data-lockown="${esc(s.id)}">Lock as our stay</button>`}
        ${s.by === S.uid && !locked && !S.readOnly ? `<button class="x" data-delown="${esc(s.id)}" aria-label="Remove ${esc(s.name)}">×</button>` : ''}</div>
    </div></article>`;
}
function ownStayForm() {
  if (S.readOnly) return '';
  if (!S.addStay) return `<section class="card row own-stay-cta"><span><b>Found a place yourself?</b> <span class="small muted">Add the Airbnb, hotel or cabin so the crew can vote on it and lock it in.</span></span><button class="btn primary" data-act="addStayOpen">Add a place</button></section>`;
  return `<form id="ownStayForm" class="card stack">
    <div class="row" style="justify-content:space-between"><h3>Add a place you found</h3><button type="button" class="btn sm ghost" data-act="addStayClose">Cancel</button></div>
    <label class="field" style="flex:none"><span class="label">Link</span><input id="os-url" type="url" inputmode="url" placeholder="https://www.airbnb.com/rooms/…" autocomplete="off"></label>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:2 1 200px"><span class="label">Name</span><input id="os-name" maxlength="80" placeholder="Cabin with the hot tub"></label>
      <label class="field" style="flex:1 1 140px"><span class="label">Type</span><select id="os-kind">${Object.entries(STAY_KIND_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
    </div>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:1 1 150px"><span class="label">Total for ${nightsNow()} night${nightsNow() === 1 ? '' : 's'} (${cur()})</span><input id="os-total" type="number" min="0" inputmode="decimal" placeholder="With fees, if you know them"></label>
      <label class="field" style="flex:1 1 120px"><span class="label">Sleeps</span><input id="os-sleeps" maxlength="40" placeholder="6 in 3 rooms"></label>
      <label class="field" style="flex:1 1 140px"><span class="label">Area</span><input id="os-area" maxlength="60" placeholder="Neighborhood"></label>
    </div>
    <label class="field" style="flex:none"><span class="label">Why this one</span><input id="os-note" maxlength="160" placeholder="Walkable to everything, has a pool"></label>
    <div class="row" style="gap:8px"><button class="btn primary" type="submit" data-how="add">Add it</button><button class="btn" type="submit" data-how="lock">Add and lock it in</button></div>
  </form>`;
}
async function addOwnStay(lock) {
  const url = safeUrl($('#os-url')?.value), g = url ? guessFromUrl(url) : { name: '', kind: 'other' };
  const name = ($('#os-name')?.value || '').trim().slice(0, 80) || g.name;
  if (!name) { flash('Give it a name or paste the link.'); return; }
  if (($('#os-url')?.value || '').trim() && !url) { flash('That link doesn’t look right. It should start with https://'); return; }
  const kindSel = $('#os-kind')?.value, kind = kindSel && kindSel !== 'other' ? kindSel : g.kind;
  const s = { name, url, kind, total: Math.max(0, Math.round(+($('#os-total')?.value || 0))), sleeps: ($('#os-sleeps')?.value || '').trim().slice(0, 40), area: ($('#os-area')?.value || '').trim().slice(0, 60), note: ($('#os-note')?.value || '').trim().slice(0, 160), by: S.uid, at: Date.now() };
  const id = rid(6);
  S.addStay = false;
  await saveTrip({ myStays: { [id]: s } });
  if (lock) await setStay(stayFromOwn(id, s));
  flash(lock ? `${name} is locked in as your stay.` : `Added ${name}. The crew can vote on it now.`);
}
// Updates merge into what's saved, so a new stay first clears the old one; otherwise
// its link and price would stick to the new one.
async function setStay(stay) { const old = S.trip.stay; if (old) await saveTrip({ stay: null }); return saveTrip(withLog({ stay }, { area: 'stay', text: `Stay ${old ? 'switched to' : 'locked:'} ${stay.name}`, act: 'all', undo: { k: 'set', patch: { stay: old || null }, clear: ['stay'] } })); }
function stayFromOwn(id, s) {
  const n = nightsNow();
  return { ...s, ownId: id, perNight: s.total ? `${money(s.total / n)}/night` : '', custom: true };
}
// once locked: mark it booked with what was paid
function stayBookedBox(st) {
  if (S.readOnly) return '';
  if (st.booked) return `<span class="small" style="color:var(--good)"><b>Booked</b>${+st.total ? ` · ${money(st.total)} total, ${money(st.total / planHeads())} each` : ''}${st.bookedBy ? ` · by ${esc(nameOf(st.bookedBy))}` : ''}</span>`;
  return `<form id="stayBookForm" class="row" style="gap:6px;align-items:flex-end"><label class="field" style="flex:0 1 200px"><span class="label">Booked it? Total paid (${cur()})</span><input id="sb-total" type="number" min="0" inputmode="decimal" value="${+st.total || ''}" placeholder="${+st.total ? '' : 'Total for all nights'}"></label><button class="btn sm" type="submit">Mark as booked</button></form>`;
}

/* ---------- I'm lost ---------- */
function lostBanner() {
  const ls = lostAt(); if (!ls.length) return '';
  return ls.map(m => `<div class="lost-banner" role="alert"><div style="min-width:0"><b>${m.id === S.uid ? 'You sent an SOS' : esc(m.nick || 'Someone') + ' is lost'}</b><div class="small">Near ${esc(m.lost.where)} · ${ago(m.lost.at)}</div></div>
    <div class="row" style="gap:6px"><a class="btn sm" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(m.lost.where + ' ' + (dest()?.city || ''))}&travelmode=walking" target="_blank" rel="noopener">Directions</a>
    <button class="btn sm" data-found="${esc(m.id)}">${m.id === S.uid ? 'I’m good now' : 'Found them'}</button></div></div>`).join('');
}
function lostSheet() {
  const places = [S.trip.stay?.name, S.trip.meet?.text, ...visItems().filter(i => i.date === (isLive() ? TODAY : dates()?.start) && !i.hidden && i.kind !== 'travel').map(i => i.title), ...(S.trip.spots?.items || []).slice(0, 6).map(s => s.name)].filter(Boolean);
  return `<div class="sheet-bg" data-act="lostClose"></div><div class="sheet" role="dialog" aria-label="I'm lost">
    <h2>Where are you?</h2><p class="small muted">The crew gets an alert with your spot and directions to you. Tap the closest place or type a landmark or cross street.</p>
    <div class="row" style="gap:6px">${[...new Set(places)].slice(0, 10).map(p => `<button class="chip" data-lostat="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    <form id="lostForm" class="row" style="gap:6px"><input aria-label="Where you are" id="lost-where" maxlength="80" placeholder="Collins Ave & 8th St" style="flex:1 1 200px"><button class="btn lost-btn" type="submit">Send SOS</button></form>
    <p class="small muted">Tip: also share your live location from Google Maps or Find My with the group chat.</p>
    <button class="btn sm ghost" data-act="lostClose">Cancel</button></div>`;
}
function sendLost(where) {
  where = String(where || '').trim().slice(0, 80); if (!where) return;
  S.lostOpen = false;
  const me = meDoc();
  saveMe({ lost: { where, at: Date.now() }, checkin: { text: 'Lost near ' + where, at: Date.now() }, checkins: [...(me?.checkins || []), { text: 'Lost near ' + where, at: Date.now() }].slice(-40) }, true);
  postFeed(`SOS: ${me?.nick || 'Someone'} is lost near ${where}. Check the map.`);
  flash('SOS sent. The crew can see where you are.');
}
function foundLost(uid) {
  if (uid === S.uid) return saveMe({ lost: null }, true);
  const m = S.members.find(x => x.id === uid); if (!m) return;
  m.lost = null; render();
  if (!S.demo && S.db) S.db.doc(`trips/${S.tid}/members/${uid}`).update({ lost: null }).catch(e => flash(writeErr(e)));
  postFeed(`Found ${m.nick || 'them'}. Crisis over.`);
}

/* ---------- hangover index + daily recap ---------- */
const HANG = ['Fresh', 'Fine', 'Rough', 'Wrecked', 'Dead'];
function hangoverCard(day) {
  const votes = (S.trip.hangover || {})[day] || {}, vals = Object.values(votes).filter(v => v > 0), avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, mine = votes[S.uid];
  const today = visItems().filter(i => i.date === day);
  return `<section class="card stack"><div class="row" style="justify-content:space-between"><h3>Hangover index</h3>${vals.length ? `<span class="hang-avg" style="--h:${avg}">${avg.toFixed(1)} · ${HANG[Math.round(avg) - 1]}</span>` : ''}</div>
    <span class="small muted">How are you feeling this morning?</span>
    <div class="row" style="gap:6px">${HANG.map((h, i) => `<button class="chip ${mine === i + 1 ? 'on' : ''}" data-hang="${i + 1}">${i + 1} · ${h}</button>`).join('')}</div>
    ${vals.length ? `<span class="small muted">${vals.length} voted: ${active().filter(m => votes[m.id]).map(m => `${esc(m.nick || 'Someone')} ${votes[m.id]}`).join(', ')}</span>` : ''}
    ${S.hangPlan ? `<div class="card stack" style="background:var(--bg)"><b>Easier plan for today</b>${S.hangPlan.note ? `<span class="small">${esc(S.hangPlan.note)}</span>` : ''}
        ${S.hangPlan.items.map(i => `<div class="tline"><span class="mono small">${esc(tShow(i.time))}</span><div><b>${esc(i.title)}</b>${i.note ? `<div class="small muted">${esc(i.note)}</div>` : ''}</div><span></span></div>`).join('')}
        <div class="row" style="gap:6px"><button class="btn sm primary" data-act="hangApply">Use this plan</button><button class="btn sm ghost" data-act="hangCancel">Keep the original</button></div></div>`
    : avg >= 3 && today.length && S.sample !== null ? `<div class="row" style="justify-content:space-between;gap:8px"><span class="small"><b>The crew is ${HANG[Math.round(avg) - 1].toLowerCase()}.</b> Want a gentler day?</span><button class="btn sm primary" data-act="hangPlan" ${S.busy.hang ? 'disabled' : ''}>${S.busy.hang ? '<i class="spin"></i>Rewriting…' : 'Make today easier'}</button></div>` : ''}
  </section>`;
}
function hangPlan(day) {
  const items = visItems().filter(i => i.date === day && !i.hidden).sort(byTime);
  const votes = Object.values((S.trip.hangover || {})[day] || {}), avg = votes.reduce((a, b) => a + b, 0) / Math.max(1, votes.length);
  const prompt = `A group on a trip is hungover. Hangover index ${avg.toFixed(1)} out of 5 (5 = dead).
${context()}
Today's plan (${day}):
${items.map(i => `${i.time || '?'} ${i.title}${i.note ? ' (' + i.note + ')' : ''}`).join('\n')}

Rewrite today so it's gentler: start later, add a recovery meal and chill time, swap exhausting things for easy ones, but keep the best evening plan if it's still realistic. Keep it fun.
Reply with only JSON: {"note":"one funny sentence about the state of the crew","items":[{"time":"HH:MM","title":"","kind":"food|activity|nightlife|chill","note":""}]}`;
  askAI('hang', prompt, data => {
    const its = (data?.items || []).filter(i => i && i.title).slice(0, 8).map(i => ({ time: String(i.time || '').slice(0, 5), title: String(i.title).slice(0, 120), kind: i.kind || 'chill', note: String(i.note || '').slice(0, 200) }));
    if (!its.length) { flash('No plan came back. Try again.'); return; }
    S.hangPlan = { day, note: String(data.note || '').slice(0, 200), items: its };
  });
}
function applyHang() {
  const p = S.hangPlan; if (!p) return;
  const keep = (S.trip.itinerary || []).filter(i => i.date !== p.day || i.secret);
  S.hangPlan = null;
  saveTrip({ itinerary: [...keep, ...p.items.map(i => ({ id: rid(6), date: p.day, ...i, ai: true }))] });
  flash('Today’s plan is updated.');
}
function recapCard(day) {
  const d = dates(); if (!d || day <= d.start) return '';
  const y = add(day, -1), r = (S.trip.recaps || {})[y];
  return `<section class="card stack recap-card"><span class="label">Yesterday’s recap · ${fmt(y)}</span>
    ${r ? `<h3>${esc(r.title)}</h3><p>${esc(r.text)}</p>` : `<p class="small muted">The AI writes a short, funny recap of yesterday from your check-ins, plans, bucket list and photos, and posts it to Hype.</p>`}
    ${S.sample !== null && !r ? `<div><button class="btn sm primary" data-act="writeRecap" data-day="${y}" ${S.busy.recap ? 'disabled' : ''}>${S.busy.recap ? '<i class="spin"></i>Writing…' : 'Write yesterday’s recap'}</button></div>` : ''}
  </section>`;
}
function writeRecap(y) {
  const inDay = at => at && new Date(at).toISOString().slice(0, 10) === y;
  const local = at => new Date(at).toTimeString().slice(0, 5);
  const checks = active().flatMap(m => (m.checkins || []).filter(c => inDay(c.at)).map(c => `${local(c.at)} ${m.nick}: ${c.text}`)).sort();
  const plans = (S.trip.itinerary || []).filter(i => i.date === y).map(i => `${i.time || ''} ${i.title}`);
  const bucket = S.bucket.flatMap(b => Object.entries(b.doneAt || {}).filter(([, at]) => inDay(at)).map(([id]) => `${nameOf(id)} did "${b.text}"`));
  const feed = S.feed.filter(f => inDay(f.at) && !f.secret && f.by !== 'ai').map(f => `${nameOf(f.by)}: ${f.text}`).slice(-20);
  const exp = S.expenses.filter(e => inDay(e.at)).map(e => `${e.title} $${e.amount}`);
  const pics = S.photos.filter(p => inDay(p.at)).length;
  const hang = Object.entries((S.trip.hangover || {})[y] || {}).map(([id, v]) => `${nameOf(id)} ${v}/5`);
  const prompt = `Write a short, funny recap of yesterday (${y}) for a group trip's chat. Light roast, PG-13, warm, specific to what actually happened. 3–5 sentences. Use people's names. Don't invent events beyond what's listed; you can be playful about gaps.
${context()}
Plans: ${plans.join('; ') || 'none'}
Check-ins: ${checks.join('; ') || 'none'}
Bucket list: ${bucket.join('; ') || 'nothing checked off'}
Chat: ${feed.join(' | ') || 'quiet'}
Spending: ${exp.join('; ') || 'none logged'}
Photos added: ${pics}
Morning hangover scores: ${hang.join(', ') || 'none'}
Reply with only JSON: {"title":"a punchy 3-6 word headline","text":"the recap"}`;
  askAI('recap', prompt, async data => {
    if (!data?.text) { flash('No recap came back. Try again.'); return; }
    const r = { title: String(data.title || 'Yesterday').slice(0, 80), text: String(data.text).slice(0, 900), at: Date.now() };
    await saveTrip({ recaps: { [y]: r } });
    putSub('feed', rid(10), { by: 'ai', kind: 'recap', text: `${r.title}. ${r.text}`, at: Date.now() });
  });
}

/* ---------- money: spend-o-meter + group pot ---------- */
function myShare() {
  let share = 0;
  for (const e of S.expenses) { let sp = (e.split || []).filter(Boolean); if (honoreeFree() && sp.length > 1) sp = sp.filter(id => id !== S.trip.honoree); if (sp.includes(S.uid)) share += e.amount / sp.length; }
  return share;
}
function meterTab() {
  const me = meDoc(), budget = +(me?.budget || 0), d = dates();
  const exp = honoreeFree() && isHonoree() ? 0 : myShare(), pot = S.pot.filter(p => p.kind === 'in' && p.by === S.uid).reduce((a, p) => a + p.amount, 0);
  const own = (S.mySpend || []).reduce((a, x) => a + (+x.amount || 0), 0), spent = exp + pot + own;
  const pct = budget ? spent / budget : 0, left = budget - spent;
  const daysLeft = d ? Math.max(1, span(TODAY > d.start ? TODAY : d.start, d.end).length) : 1;
  const state = !budget ? 'none' : pct >= 1 ? 'over' : pct >= .8 ? 'warn' : 'ok';
  const R = 70, C = 2 * Math.PI * R, arc = Math.min(1, pct) * C;
  return `<section class="card stack meter-card">
    <div class="row" style="justify-content:space-between"><h2>My spend</h2><span class="small muted">Only you see this page</span></div>
    ${isHonoree() && honoreeFree() ? `<div class="banner"><span><b>You’re covered.</b> As the ${esc(mode().honoree)}, your share of group costs is split across the crew.</span></div>` : ''}
    <div class="meter-row">
      <svg viewBox="0 0 180 180" width="170" height="170" class="ring" role="img" aria-label="${budget ? Math.round(pct * 100) + '% of budget spent' : 'No budget set'}">
        <circle cx="90" cy="90" r="${R}" fill="none" stroke="var(--line)" stroke-width="16"/>
        <circle cx="90" cy="90" r="${R}" fill="none" stroke="var(--meter-${state})" stroke-width="16" stroke-linecap="round" stroke-dasharray="${arc} ${C}" transform="rotate(-90 90 90)"/>
        <text x="90" y="86" text-anchor="middle" class="ring-big">${budget ? Math.round(pct * 100) + '%' : '—'}</text>
        <text x="90" y="110" text-anchor="middle" class="ring-small">${budget ? 'of ' + money(budget) : 'no budget'}</text></svg>
      <div class="stack" style="gap:6px;min-width:0">
        <span class="label">Spent so far</span><b class="tile-big">${money2(spent)}</b>${alsoMine(spent)}
        ${budget ? (left >= 0 ? `<span>${money2(left)} left · <b>${money(left / daysLeft)}/day</b> for ${daysLeft} day${daysLeft === 1 ? '' : 's'}</span>` : `<span style="color:var(--meter-over)"><b>${money2(-left)} over budget</b></span>`) : `<span class="small muted">Set your budget in Home › Crew to turn on the meter.</span>`}
        ${state === 'warn' ? `<span class="pill maybe" style="align-self:flex-start">Heads up: ${Math.round(pct * 100)}% used</span>` : state === 'over' ? `<span class="pill out" style="align-self:flex-start;color:var(--meter-over)">Over budget</span>` : ''}
      </div></div>
    <div><div class="linkrow"><span>Your share of group expenses</span><span class="mono">${money2(exp)}</span></div>
      ${HIDE_TABS[size()].includes('pot') ? '' : `<div class="linkrow"><span>Put in the group pot</span><span class="mono">${money2(pot)}</span></div>`}
      ${(S.mySpend || []).map(x => `<div class="linkrow"><span>${esc(x.note)}</span><span class="row" style="gap:6px"><span class="mono">${money2(+x.amount)}</span><button class="x" data-delspend="${esc(x.id)}" aria-label="Remove ${esc(x.note)}">×</button></span></div>`).join('')}</div>
    <form id="spendForm" class="row" style="gap:6px;align-items:flex-end">
      <label class="field" style="flex:2 1 160px"><span class="label">Log something you paid yourself</span><input id="sp-note" maxlength="50" required placeholder="${({ hangout: 'Cab home', day: 'Train tickets', weekend: 'Gas', trip: 'My flight' })[size()]}"></label>
      <label class="field" style="flex:0 1 110px"><span class="label">Amount</span><input id="sp-amt" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="248"></label>
      <button class="btn" type="submit">Add</button></form>
  </section>`;
}
async function saveMySpend(items) {
  S.mySpend = items; render();
  if (S.demo) return;
  const key = `oh_spend_${S.tid}`;
  if (S.db && S.realId) { try { await S.db.doc(`data/users/${S.realId}/spend-${S.tid}`).set({ items }); return; } catch {} }
  try { localStorage.setItem(key, JSON.stringify(items)); } catch {}
}
function potTab() {
  const ins = S.pot.filter(p => p.kind === 'in'), outs = S.pot.filter(p => p.kind === 'out');
  const tin = ins.reduce((a, p) => a + p.amount, 0), tout = outs.reduce((a, p) => a + p.amount, 0), bal = tin - tout;
  const ms = active().filter(m => !(honoreeFree() && m.id === S.trip.honoree));
  const by = {}; for (const p of ins) by[p.by] = (by[p.by] || 0) + p.amount;
  const fair = Math.max(0, ...ms.map(m => by[m.id] || 0)); // everyone matches whoever put in the most
  const behind = ms.filter(m => (by[m.id] || 0) < fair - 0.5);
  const low = tin > 0 && (bal <= 0 || bal < tin * .25);
  const keeper = S.trip.potKeeper || S.trip.createdBy;
  const d = dates(), daysLeft = d ? Math.max(1, span(TODAY > d.start ? TODAY : d.start, d.end).length) : 1;
  const topUp = Math.max(10, Math.ceil(((tout / Math.max(1, d ? span(d.start, TODAY < d.end ? TODAY : d.end).length : 1)) * daysLeft - bal) / Math.max(1, ms.length) / 5) * 5);
  const hist = [...S.pot].sort((a, b) => (b.at || 0) - (a.at || 0));
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Group pot</h2><span class="small muted">For Ubers, groceries, drinks</span></div>
    <div class="pot-big ${low ? 'low' : ''}"><span class="label">In the pot</span><b>${money2(bal)}</b>${alsoMine(bal)}<span class="small muted">${money2(tin)} in · ${money2(tout)} spent</span>
      <div class="bigbar" style="margin-top:6px"><i style="width:${tin ? Math.max(0, bal / tin * 100) : 0}%;background:${low ? 'var(--meter-over)' : 'var(--good)'}"></i></div></div>
    ${low ? `<div class="lost-banner" style="background:color-mix(in oklab,var(--gold) 22%,var(--surface));color:var(--ink);border-color:var(--gold)"><div><b>The pot’s running low.</b><div class="small">Top up about ${money(topUp)} each to cover the rest of the ${planWord()}.</div></div><button class="btn sm" data-act="copyPot">Copy reminder</button></div>` : ''}
    <div class="row" style="gap:8px;align-items:center"><span class="small">Holding the pot:</span><select aria-label="Who holds the pot" id="pot-keeper" style="width:auto">${active().map(m => `<option value="${esc(m.id)}" ${keeper === m.id ? 'selected' : ''}>${esc(m.nick || 'Someone')}</option>`).join('')}</select></div>
    <div>${ms.map(m => `<div class="nudge"><b>${esc(m.nick || 'Someone')}</b><span class="row" style="gap:8px"><span class="mono small">${money2(by[m.id] || 0)}</span>${behind.includes(m) ? `<span class="pill maybe">${money2(fair - (by[m.id] || 0))} behind</span>` : '<span class="pill in">Even</span>'}</span></div>`).join('')}</div>
    ${S.copyText ? `<textarea aria-label="Text to copy" id="copybox" readonly>${esc(S.copyText)}</textarea>` : ''}
  </section>
  <section class="grid2">
    <form id="potIn" class="card stack"><h3>Chip in</h3>
      <div class="row" style="gap:6px;align-items:flex-end"><label class="field"><span class="label">Amount</span><input id="pi-amt" type="number" min="1" step="1" inputmode="decimal" required placeholder="50"></label>
      <label class="field"><span class="label">From</span><select id="pi-by">${active().map(m => `<option value="${esc(m.id)}" ${m.id === S.uid ? 'selected' : ''}>${esc(m.nick || 'Someone')}</option>`).join('')}</select></label></div>
      ${keeper !== S.uid ? `<div class="row" style="gap:6px">${payLinks(keeper, 50, S.trip.name + ' pot')}</div>` : ''}
      <div><button class="btn primary" type="submit">Add to pot</button></div></form>
    <form id="potOut" class="card stack"><h3>Spend from the pot</h3>
      <div class="row" style="gap:6px;align-items:flex-end"><label class="field" style="flex:2 1 140px"><span class="label">What</span><input id="po-note" maxlength="50" required placeholder="Uber XL to Wynwood"></label>
      <label class="field"><span class="label">Amount</span><input id="po-amt" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="38"></label></div>
      <div><button class="btn" type="submit">Log it</button></div></form>
  </section>
  ${hist.length ? `<section class="card"><h3 style="margin-bottom:6px">Pot history</h3>${hist.map(p => `<div class="linkrow"><div style="min-width:0"><b>${p.kind === 'in' ? esc(nameOf(p.by)) + ' chipped in' : esc(p.note || 'Spent')}</b><div class="small muted">${p.kind === 'out' ? 'logged by ' + esc(nameOf(p.by)) + ' · ' : ''}${ago(p.at)}</div></div>
    <span class="row" style="gap:6px"><span class="mono" style="color:${p.kind === 'in' ? 'var(--good)' : 'inherit'}">${p.kind === 'in' ? '+' : '−'}${money2(p.amount)}</span><button class="x" data-delpot="${esc(p.id)}" aria-label="Remove">×</button></span></div>`).join('')}</section>` : ''}`;
}

/* ---------- memories ---------- */
function awardsTab() {
  const rs = superResults(), d = dates(), over = d && TODAY > d.end;
  return `${nightVoteCard()}<section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px"><h2>${isSmall() ? 'Awards' : 'Trip awards'}</h2><span class="small muted">${over ? `The ${planWord()}’s over. Time to vote.` : `Voting is for after the ${planWord()}, but you can start now.`}</span></div>
      <button class="btn sm" data-act="awardsCard">Make awards card</button></div>
    ${S.img?.kind === 'awards' ? imgPanel() : ''}
    ${rs.map(r => `<div class="q"><div class="row" style="justify-content:space-between"><b>${esc(r.c)}</b>${r.winners.length ? `<span class="small">${r.winners.length > 1 ? 'Tie: ' : '♛ '}<b>${r.winners.map(id => esc(nameOf(id))).join(' & ')}</b> <span class="muted">(${r.cnt[r.winners[0]]} vote${r.cnt[r.winners[0]] === 1 ? '' : 's'})</span></span>` : '<span class="small muted">No votes yet</span>'}</div>
      <div class="row" style="gap:6px">${active().map(m => `<button class="chip ${r.mine === m.id ? 'on' : ''}" data-super="${r.key}|${esc(m.id)}">${esc(m.nick || 'Someone')}${r.cnt[m.id] ? ` <b class="mono">${r.cnt[m.id]}</b>` : ''}</button>`).join('')}</div></div>`).join('')}
  </section>`;
}
function photosTab() {
  const photos = [...S.photos].sort((a, b) => (a.at || 0) - (b.at || 0));
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Photo album</h2><span class="small muted">${photos.length} photo${photos.length === 1 ? '' : 's'}</span></div>
    ${S.assets && !S.demo ? `<label class="btn primary" style="align-self:flex-start;cursor:pointer">${S.busy.photos ? `<i class="spin"></i>Uploading ${esc(S.busy.photos)}…` : 'Add photos'}<input id="ph-files" type="file" accept="image/*" multiple hidden></label>`
      : `<p class="small muted">${S.demo ? 'Photo uploads work on real trips.' : IN_CLAUDE ? 'Photo uploads aren’t available for you here. They’ll work for everyone once the app has its own site.' : 'Photo uploads aren’t available right now.'}</p>`}
    ${photos.length ? `<div class="row" style="gap:6px"><button class="btn sm" data-show="0">▶ Play recap</button><button class="btn sm" data-act="collage">Make collage</button></div>
      ${S.img?.kind === 'collage' ? imgPanel() : ''}
      <div class="photos">${photos.map((p, i) => { const sc = score(rkey('ph' + p.id)); return `<div class="ph"><button class="ph-open" data-show="${i}" aria-label="Open photo ${i + 1}"><img src="/_blob/${esc(p.asset)}" alt="Photo by ${esc(nameOf(p.by))}" loading="lazy"></button>
        <button class="ph-like ${sc.mine > 0 ? 'on' : ''}" data-react="${rkey('ph' + p.id)}|1" aria-label="Like photo">♥ ${sc.up || ''}</button>${p.by === S.uid ? `<button class="x" data-delphoto="${esc(p.id)}" aria-label="Delete photo">×</button>` : ''}</div>`; }).join('')}</div>`
      : `<div class="empty"><span>Everyone’s photos land here. Like the best ones: the top photo makes it into your ${isSmall() ? 'recap' : 'Trip Wrapped'}.</span></div>`}
  </section>
  ${S.show !== null && photos[S.show] ? `<div class="show" role="dialog" aria-label="Trip recap">
    <img src="/_blob/${esc(photos[S.show].asset)}" alt="Photo ${S.show + 1} of ${photos.length}">
    <div class="ctl"><button class="btn sm" data-act="showPrev">‹ Prev</button><span class="chip">${S.show + 1}/${photos.length} · ${esc(nameOf(photos[S.show].by))}</span><button class="btn sm" data-act="showNext">Next ›</button><button class="btn sm" data-act="showClose">Close</button></div></div>` : ''}`;
}
function wrapData() {
  const d = dates(), ds = dest(), ms = active();
  const total = S.expenses.reduce((a, e) => a + (+e.amount || 0), 0) + S.pot.filter(p => p.kind === 'out').reduce((a, p) => a + p.amount, 0);
  const spots = (S.trip.spots?.items || []).map(s => ({ s, sc: score(rkey('sp' + s.name)) })).sort((a, b) => b.sc.net - a.sc.net);
  const owl = ms.map(m => ({ m, n: (m.checkins || []).filter(c => { const h = new Date(c.at).getHours(); return h >= 0 && h < 6; }).length, last: Math.max(0, ...(m.checkins || []).map(c => { const h = new Date(c.at).getHours(); return h < 6 ? h + 24 : h; })) })).sort((a, b) => b.n - a.n || b.last - a.last)[0];
  const photo = [...S.photos].map(p => ({ p, sc: score(rkey('ph' + p.id)).net })).sort((a, b) => b.sc - a.sc)[0];
  const pts = {}; for (const b of S.bucket) for (const id of b.doneBy || []) pts[id] = (pts[id] || 0) + (b.points || 1);
  const champ = Object.entries(pts).sort((a, b) => b[1] - a[1])[0];
  const msgs = {}; for (const f of S.feed) if (f.by !== 'ai') msgs[f.by] = (msgs[f.by] || 0) + 1;
  const hyper = Object.entries(msgs).sort((a, b) => b[1] - a[1])[0];
  const hs = {}; for (const day of Object.values(S.trip.hangover || {})) for (const [id, v] of Object.entries(day)) (hs[id] ||= []).push(v);
  const wrecked = Object.entries(hs).map(([id, v]) => [id, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1])[0];
  const awards = superResults().filter(r => r.winners.length).slice(0, 4);
  return { night: d ? bestNight() : null, d, ds, ms, total, topSpot: spots[0]?.s, owl: owl && owl.n ? owl : null, photo: photo?.p, champ, hyper, wrecked, awards, over: d && TODAY > d.end, b: blend() };
}
function wrappedTab() {
  const w = wrapData(); if (!w.d || !w.ds) return needDestDates(isSmall() ? 'The recap' : 'Your Trip Wrapped');
  const nights = nightsOf(w.d);
  const slides = [
    { c: ['#D41C78', '#7048E8'], k: `${w.over ? '' : 'So far · '}${esc(S.trip.name)}`, h: `Your ${esc(w.ds.city)} Wrapped`, s: `${nights ? nights + ' night' + (nights === 1 ? '' : 's') + ' · ' : ''}${w.ms.length} ${w.ms.length === 1 ? 'person' : 'people'} · ${dayRange(w.d.start, w.d.end)}` },
    { c: ['#0E9F6E', '#1098AD'], k: 'The damage', h: money(w.total), s: w.total ? `spent as a group. That’s about ${money(w.total / Math.max(1, w.ms.length))} each.` : 'No group spending logged. Suspicious.', src: `From ${S.expenses.length} logged expense${S.expenses.length === 1 ? '' : 's'}${S.pot.some(p => p.kind === 'out') ? ' and the group pot' : ''}` },
    w.night && { c: ['#151A33', '#7048E8'], k: 'Best night', h: esc(fmt(w.night.day, { weekday: 'long' })), s: esc([fmt(w.night.day, { month: 'long', day: 'numeric' }), w.night.st?.checkins && `${w.night.st.checkins} check-ins`, w.night.st?.posts && `${w.night.st.posts} posts`, w.night.st?.photos && `${w.night.st.photos} photos`].filter(Boolean).join(' · ')), src: esc(w.night.why) },
    w.topSpot && { c: ['#7048E8', '#3B5BDB'], k: 'Crew favorite spot', h: esc(w.topSpot.name), s: esc(w.topSpot.area || w.topSpot.type || ''), src: 'From the crew’s votes on the spot picks' },
    w.owl && { c: ['#151A33', '#3A0B2C'], k: 'Night owl', h: esc(w.owl.m.nick || 'Someone'), s: `${w.owl.n} check-in${w.owl.n === 1 ? '' : 's'} between midnight and 6am.`, src: 'From everyone’s check-ins' },
    w.photo && { c: ['#F08C00', '#D41C78'], k: `Photo of the ${isSmall() ? 'night' : 'trip'}`, h: '', img: w.photo.asset, s: `by ${esc(nameOf(w.photo.by))}`, src: 'Most upvoted in the album' },
    S.photos.length > 1 && { c: ['#3B5BDB', '#151A33'], k: 'The album', h: '', imgs: S.photos.filter(p => p.asset && p !== w.photo).slice(0, 4).map(p => p.asset), s: `${S.photos.length} photos from ${new Set(S.photos.map(p => p.by)).size} people`, src: 'From the shared album' },
    w.champ && { c: ['#F2B32B', '#E8590C'], k: 'Bucket list champion', h: esc(nameOf(w.champ[0])), s: `${w.champ[1]} points of chaos`, src: 'From the bucket list' },
    w.wrecked && { c: ['#5C6A7A', '#151A33'], k: 'Most wrecked', h: esc(nameOf(w.wrecked[0])), s: `average hangover score ${w.wrecked[1].toFixed(1)}/5`, src: 'From the morning hangover check-ins' },
    w.hyper && { c: ['#E64980', '#7048E8'], k: 'Hype machine', h: esc(nameOf(w.hyper[0])), s: `${w.hyper[1]} messages in the hype feed`, src: 'From the hype feed' },
    w.awards.length && { c: ['#FFC94D', '#E8590C'], k: 'The awards', h: '', list: w.awards.map(r => [r.c, r.winners.map(nameOf).join(' & ')]), src: 'Voted by the crew' },
    w.b && { c: ['#D41C78', '#151A33'], k: 'You were', h: esc(w.b.persona), s: 'Same time next year?', src: 'From everyone’s vibe quiz answers' },
    { c: ['#0C0F21', '#3A0B2C'], k: w.over ? 'That’s a wrap' : 'So far', h: esc(S.trip.name), s: [`${span(w.d.start, w.d.end).length} day${span(w.d.start, w.d.end).length === 1 ? '' : 's'}`, `${w.ms.length} ${w.ms.length === 1 ? 'person' : 'people'}`, S.photos.length && `${S.photos.length} photos`, S.feed.length && `${S.feed.filter(f => f.by !== 'ai').length} posts`].filter(Boolean).join(' · '), end: true },
  ].filter(Boolean);
  const i = Math.min(S.wrapI || 0, slides.length - 1), sl = slides[i];
  return `<section class="stack" style="align-items:center">
    <div class="wslide" style="background:linear-gradient(160deg,${sl.c[0]},${sl.c[1]})">
      <div class="wbars">${slides.map((_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div>
      <span class="label" style="color:rgba(255,255,255,.85)">${sl.k}</span>
      ${sl.img ? `<img src="/_blob/${esc(sl.img)}" alt="Top photo" class="wimg">` : ''}
      ${sl.h ? `<h1>${sl.h}</h1>` : ''}
      ${sl.list ? `<div class="stack" style="gap:10px">${sl.list.map(([c, n]) => `<div><span class="label" style="color:rgba(255,255,255,.75)">${esc(c)}</span><div class="wname">${esc(n)}</div></div>`).join('')}</div>` : ''}
      ${sl.imgs && sl.imgs.length ? `<div class="wgrid">${sl.imgs.map(a => `<img src="/_blob/${esc(a)}" alt="">`).join('')}</div>` : ''}
      ${sl.s ? `<p>${sl.s}</p>` : ''}
      ${sl.src ? `<span class="wsrc">${sl.src}</span>` : ''}
      ${sl.end && !S.demo ? `<div style="position:relative;z-index:2"><button class="btn" data-act="nextPlan">Plan the next one</button></div>` : ''}
      <button class="wnav left" data-act="wrapPrev" aria-label="Previous slide"></button><button class="wnav right" data-act="wrapNext" aria-label="Next slide"></button>
    </div>
    <div class="row" style="gap:8px;justify-content:center"><button class="btn sm" data-act="wrapPrev" ${i === 0 ? 'disabled' : ''}>‹ Back</button><span class="small muted mono">${i + 1}/${slides.length}</span><button class="btn sm primary" data-act="wrapNext" ${i === slides.length - 1 ? 'disabled' : ''}>Next ›</button></div>
    <button class="btn" data-act="wrappedCard">Make shareable Wrapped card</button>
    ${S.img?.kind === 'wrapped' ? imgPanel() : ''}
  </section>`;
}
async function makeWrappedCard() {
  const w = wrapData(); if (!w.d || !w.ds) return;
  try { await Promise.all(['900 120px Anybody', '700 40px Figtree', '600 30px "JetBrains Mono"'].map(f => document.fonts.load(f))); } catch {}
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#D41C78'); g.addColorStop(.55, '#7048E8'); g.addColorStop(1, '#151A33'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.8)'; x.font = CF(600, 32, 'mono'); x.fillText((S.trip.name || '').toUpperCase().slice(0, 40), 80, 150);
  x.fillStyle = '#fff'; cfit(x, w.ds.city.toUpperCase(), W - 160, 170, 900); x.fillText(w.ds.city.toUpperCase(), 80, 320); x.font = CF(900, 120); x.fillText('WRAPPED', 80, 450);
  const rows = [['DAMAGE', w.total ? money(w.total) : '—'], w.topSpot && ['FAVORITE SPOT', w.topSpot.name], w.owl && ['NIGHT OWL', w.owl.m.nick || 'Someone'], w.champ && ['BUCKET CHAMP', nameOf(w.champ[0])], w.wrecked && ['MOST WRECKED', nameOf(w.wrecked[0])], w.hyper && ['HYPE MACHINE', nameOf(w.hyper[0])], ...w.awards.slice(0, 2).map(r => [r.c.toUpperCase(), r.winners.map(nameOf).join(' & ')])].filter(Boolean).slice(0, 8);
  let y = 620;
  for (const [k, v] of rows) { x.fillStyle = '#FFC94D'; cfit(x, k, W - 160, 30, 600, 'mono'); x.fillText(k, 80, y); x.fillStyle = '#fff'; cfit(x, v, W - 160, 72, 900); x.fillText(v, 80, y + 80); y += 150; }
  if (w.b) { x.fillStyle = '#fff'; cfit(x, w.b.persona.toUpperCase(), W - 160, 46, 900); x.fillText(w.b.persona.toUpperCase(), 80, H - 200); }
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = CF(700, 38, 'body'); x.fillText('Planned on Outta Here', 80, H - 100);
  setImg('wrapped', c, slug(S.trip.name) + '-wrapped.png');
}

const SETTINGS_HTML = () => `  ${crewSection()}
  ${S.demo ? '' : accessCard()}
  <section class="card stack">
    <h3>Settings</h3>
    ${S.demo ? '' : `<label class="check-line"><input type="checkbox" id="mute-plan" ${isMuted(S.tid) ? 'checked' : ''}> Mute reminders for this ${planWord()}</label>`}
    ${S.confirm === 'delete' ? `<div class="banner"><span><b>Delete “${esc(S.trip.name)}” for everyone?</b> The crew, votes, expenses and packing list all go. This can’t be undone.</span><div class="row" style="gap:6px"><button class="btn sm danger-fill" data-act="doDelete">Delete ${planWord()}</button><button class="btn sm" data-act="cancelConfirm">Cancel</button></div></div>`
    : S.confirm === 'leave' ? `<div class="banner"><span><b>Leave this ${planWord()}?</b> ${size() === 'trip' ? 'Your days, votes and boarding pass are removed.' : 'Your days and votes are removed.'} It disappears from your plans.</span><div class="row" style="gap:6px"><button class="btn sm danger-fill" data-act="doLeave">Leave ${planWord()}</button><button class="btn sm" data-act="cancelConfirm">Cancel</button></div></div>`
    : `<div class="row" style="gap:8px">${meDoc() && !S.demo ? `<button class="btn sm danger" data-act="askLeave">Leave ${planWord()}</button>` : ''}${canDelete(S.trip) ? `<button class="btn sm danger" data-act="askDelete">Delete ${planWord()}</button>` : `<span class="small muted">Only the person who created it can delete it.</span>`}</div>`}
  </section>`;

/* ---------- live quick actions + mobile gestures ---------- */
function liveQuick() {
  const meet = S.trip.meet, myCi = meDoc()?.checkin;
  return `<section class="quick" aria-label="Quick actions">
    <button class="qa qa-lost" data-act="lostOpen"><b>I’m lost</b><span>Send the crew my spot</span></button>
    <button class="qa" data-act="ciJump"><b>Check in</b><span>${myCi ? 'You: ' + esc(myCi.text) : 'Where are you?'}</span></button>
    <button class="qa" data-act="meetJump"><b>Meet-up</b><span>${meet?.text ? esc(meet.text) + (meet.time ? ' · ' + esc(tShow(meet.time)) : '') : 'Not set yet'}</span></button>
    <button class="qa" data-tab="map"><b>Map</b><span>${mapPoints().length} places pinned</span></button>
  </section>`;
}
function jumpTo(sel) { const el = $(sel); if (!el) return; el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); setTimeout(() => el.focus({ preventScroll: true }), 300); }

/* ---------- plan passport ---------- */
// Once a plan is decided, its pass becomes a ticket: destination, dates, crew, status and
// countdown, with a stamp for each milestone the crew actually hits.
const MILESTONES = [['decided', 'Decided'], ['everyone', 'Everyone confirmed'], ['booked', 'Booked'], ['planned', 'Plan set'], ['happening', 'Happening'], ['memories', 'Memories']];
function milestonesNow() {
  const t = S.trip, sz = size(), ms = S.members.filter(m => m.status !== 'out'), d = t.lockedDates, st = stageOf(t, S.members);
  const goers = ms.filter(going);
  return {
    decided: !!(t.lockedDest && d),
    everyone: goers.length >= 2 && ms.every(m => ['confirmed', 'booked'].includes(m.status)),
    booked: sz === 'trip' ? tickets().on : sz === 'weekend' ? !!t.stay : !!(t.lockedDest && d) && taskList().filter(x => /book|ticket|table|reserv/i.test(x.title)).every(x => x.done),
    planned: (t.itinerary || []).length > 0 && taskList().every(x => x.done),
    happening: st === 'happening' || st === 'memories',
    memories: st === 'memories',
  };
}
// Milestone dates are written once, the first time each one is reached.
function syncMilestones() {
  if (!S.trip || S.demo || !S.db || !S.membersIn || S.readOnly) return null;
  const now = milestonesNow(), have = S.trip.miles || {}, patch = {};
  for (const [k] of MILESTONES) { if (now[k] && !have[k]) patch[k] = Date.now(); if (!now[k] && have[k]) patch[k] = null; }
  return Object.keys(patch).length ? patch : null;
}
function passport() {
  const t = S.trip, ds = dest(), d = dates(), sz = SIZES[size()], cd = countdown(), st = stageOf(t, S.members), now = milestonesNow(), miles = t.miles || {};
  const goers = S.members.filter(going), small = isSmall();
  const code = ds ? (ds.code ? ds.code.toUpperCase() : ds.city.toUpperCase().slice(0, 14)) : '—';
  const big = st === 'memories' ? 'DONE' : st === 'happening' ? 'NOW' : cd ? String(cd.n ?? 0) : '—';
  return `<section class="passport" style="--pc:${sz.color}">
    <div class="pp-band"><span>OUTTA/HERE · PLAN PASSPORT</span><span class="mono">${esc(S.tid || 'DEMO').toUpperCase()}</span></div>
    <div class="pp-body">
      <div class="pp-main">
        <span class="pp-k">${esc(t.name)}</span>
        <div class="pp-code">${esc(code)}</div>
        ${ds && ds.code ? `<span class="pp-city">${esc(ds.city)}</span>` : ''}
        <div class="pp-facts">
          <div><span>${small ? 'When' : 'Dates'}</span><b>${d ? (small ? fmt(d.start) : `${short(d.start)} – ${short(d.end)}`) : 'TBD'}</b></div>
          <div><span>${small ? 'Time' : 'Nights'}</span><b>${small ? (t.time ? t12(t.time) : 'TBD') : nightsOf(d)}</b></div>
          <div><span>Crew</span><b>${goers.length}</b></div>
        </div>
        <div class="avs">${goers.slice(0, 10).map(m => `<span class="av-sm" title="${esc(m.nick || 'Someone')}" style="background:${colorFor(m.id)}">${esc((m.nick || '?')[0].toUpperCase())}</span>`).join('')}</div>
      </div>
      <div class="pp-count"><b>${big}</b>${st === 'happening' ? '' : `<span>${st === 'memories' ? 'that’s a wrap' : cd && cd.n === 0 ? 'today' : cd && cd.n === 1 ? 'day to go' : 'days to go'}</span>`}<span class="stage-pill s-${st}">${STAGE_LABEL[st]}</span></div>
    </div>
    <div class="pp-stamps">${MILESTONES.map(([k, l], i) => `<div class="pp-stamp ${now[k] ? 'on' : ''}" style="--r:${[-8, 5, -4, 7, -6, 4][i]}deg"><b>${l}</b>${now[k] && miles[k] ? `<span>${short(iso(new Date(miles[k])))}</span>` : ''}</div>`).join('')}</div>
    <div class="pp-act"><button class="btn sm" data-act="passportImg">Share passport</button><button class="btn sm" data-act="card">Make story card</button>${size() !== 'trip' ? `<button class="btn sm ghost" data-act="growPlan">Make it a ${size() === 'weekend' ? 'trip' : 'weekend or trip'}</button>` : ''}</div>
    ${S.cardUrl ? `<div class="pp-media"><div class="row" style="align-items:flex-end;gap:14px"><img class="cardimg" src="${S.cardUrl}" alt="Story card for ${esc(t.name)}">
      <div class="stack" style="gap:8px">${S.downloads ? `<button class="btn primary sm" data-act="saveCard">Save image</button>` : `<span class="small muted">Press and hold the image to save it.</span>`}<button class="btn sm ghost" data-act="closeCard">Close</button></div></div></div>` : ''}
    ${S.img?.kind === 'passport' ? imgPanel() : ''}
  </section>`;
}
async function makePassportImg() {
  const t = S.trip, ds = dest(), d = dates(), st = stageOf(t, S.members), now = milestonesNow(), goers = S.members.filter(going), cd = countdown();
  try { await Promise.all(['900 120px Anybody', '700 40px Figtree', '600 30px "JetBrains Mono"'].map(f => document.fonts.load(f))); } catch {}
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const pc = SIZES[size()].color;
  x.fillStyle = '#0C0F21'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#F7F3EA'; x.beginPath(); x.roundRect(60, 60, W - 120, H - 120, 40); x.fill();
  x.fillStyle = pc; x.beginPath(); x.roundRect(60, 60, W - 120, 120, [40, 40, 0, 0]); x.fill();
  x.fillStyle = '#fff'; x.font = CF(600, 30, 'mono'); x.fillText('OUTTA/HERE · PLAN PASSPORT', 110, 132);
  x.fillStyle = '#151A33'; cfit(x, t.name.toUpperCase(), W - 240, 34, 600, 'mono'); x.fillText(t.name.toUpperCase(), 110, 260);
  const code = ds ? (ds.code ? ds.code.toUpperCase() : ds.city.toUpperCase()) : 'TBD';
  x.fillStyle = pc; cfit(x, code, W - 240, 230, 900); x.fillText(code, 110, 480);
  if (ds && ds.code) { x.fillStyle = '#151A33'; cfit(x, ds.city, W - 240, 52, 700, 'body'); x.fillText(ds.city, 110, 550); }
  const facts = [[isSmall() ? 'WHEN' : 'DATES', d ? (isSmall() ? fmt(d.start) : `${short(d.start)} – ${short(d.end)}`) : 'TBD'], ['CREW', String(goers.length)], ['STATUS', STAGE_LABEL[st].toUpperCase()]];
  facts.forEach(([k, v], i) => { const fx = 110 + i * 300; x.fillStyle = '#6B7194'; x.font = CF(600, 26, 'mono'); x.fillText(k, fx, 650); x.fillStyle = '#151A33'; cfit(x, v, 280, 40, 700, 'body'); x.fillText(v, fx, 700); });
  x.fillStyle = '#151A33'; cfit(x, goers.map(m => m.nick || 'Someone').join(' · '), W - 240, 34, 600, 'body'); x.fillText(goers.map(m => m.nick || 'Someone').join(' · '), 110, 790);
  x.strokeStyle = '#D5D8E6'; x.lineWidth = 4; x.setLineDash([16, 14]); x.beginPath(); x.moveTo(110, 850); x.lineTo(W - 110, 850); x.stroke(); x.setLineDash([]);
  MILESTONES.forEach(([k, l], i) => {
    const cx = 200 + (i % 3) * 340, cy = 960 + Math.floor(i / 3) * 190, on = now[k];
    x.save(); x.translate(cx, cy); x.rotate(([-8, 5, -4, 7, -6, 4][i]) * Math.PI / 180);
    x.strokeStyle = on ? pc : '#D5D8E6'; x.lineWidth = 6; x.beginPath(); x.roundRect(-140, -55, 280, 110, 18); x.stroke();
    x.fillStyle = on ? pc : '#B8BCCD'; x.textAlign = 'center'; cfit(x, l.toUpperCase(), 250, 30, 900); x.fillText(l.toUpperCase(), 0, 12); x.restore(); x.textAlign = 'left';
  });
  if (cd && st !== 'memories' && st !== 'happening') { x.fillStyle = '#fff'; x.font = CF(600, 30, 'mono'); x.fillText(`${cd.n} DAYS TO GO`, 110, H - 20); }
  setImg('passport', c, slug(t.name) + '-passport.png');
}

/* ---------- the aftermath ---------- */
// The best night is what the crew voted for; if nobody voted, it's the day with the
// most going on (check-ins, posts and photos). Every number says where it came from.
const localDay = at => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function nightStats() {
  const d = dates(); if (!d) return [];
  return span(d.start, d.end).map(day => {
    const checkins = S.members.reduce((n, m) => n + (m.checkins || []).filter(c => localDay(c.at) === day || (localDay(c.at) === add(day, 1) && new Date(c.at).getHours() < 6)).length, 0);
    const posts = S.feed.filter(f => f.by !== 'ai' && f.at && localDay(f.at) === day).length;
    const photos = S.photos.filter(p => p.at && localDay(p.at) === day).length;
    const hang = Object.values((S.trip.hangover || {})[add(day, 1)] || {}), hangAvg = hang.length ? hang.reduce((a, b) => a + b, 0) / hang.length : 0;
    return { day, checkins, posts, photos, hangAvg, score: checkins + posts + photos * 2 + hangAvg * 2 };
  });
}
function bestNight() {
  const votes = Object.values(S.trip.nightVotes || {}).filter(Boolean), stats = nightStats();
  if (votes.length) {
    const c = {}; for (const v of votes) c[v] = (c[v] || 0) + 1;
    const [day, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return { day, why: `Voted by ${n} of ${active().length}`, st: stats.find(s => s.day === day) };
  }
  const top = [...stats].sort((a, b) => b.score - a.score)[0];
  if (!top || !top.score) return null;
  return { day: top.day, why: 'The busiest day by check-ins, posts and photos', st: top };
}
function nightVoteCard() {
  const d = dates(); if (!d || isSmall()) return '';
  const mine = (S.trip.nightVotes || {})[S.uid], days = span(d.start, d.end), c = {};
  for (const v of Object.values(S.trip.nightVotes || {})) if (v) c[v] = (c[v] || 0) + 1;
  return `<section class="card stack"><div class="row" style="justify-content:space-between"><h3>Best night</h3><span class="small muted">Goes in the Wrapped</span></div>
    <div class="row" style="gap:6px">${days.map(day => `<button class="chip ${mine === day ? 'on' : ''}" data-nightvote="${day}">${fmt(day, { weekday: 'short', month: 'short', day: 'numeric' })}${c[day] ? ` · ${c[day]}` : ''}</button>`).join('')}</div></section>`;
}

/* ---------- invites ---------- */
const SHARE_BASE = window.OUTTA_SHARE_BASE || (location.origin + '/');
const IN_CLAUDE = !!window.OUTTA_SHARE_BASE;
const inviteLink = () => linkFor({ id: S.tid, inviteKey: S.trip?.inviteKey });
function inviteCard() {
  if (S.demo) return `<section class="card stack"><h2>Invite the crew</h2><p class="small muted">Invites work on real trips. Start one from the home screen.</p></section>`;
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Invite the crew</h2><span class="small muted">${S.members.length} in the ${planWord()}</span></div>
    ${IN_CLAUDE ? `<ol class="small steps-list"><li>Open this page’s <b>Share</b> menu and invite each friend by email as an <b>Editor</b>. Viewers can look but can’t vote or swipe.</li><li>Send them the invite below. It opens this trip directly.</li></ol>`
      : `<p class="small muted">Send this link. Friends type their name and land right in this ${planWord()}.</p>`}
    <span class="invite-link mono">${esc(inviteLink())}</span>
    <div class="row" style="gap:6px"><button class="btn primary" data-act="copyInvite">Send invite</button></div>
  </section>`;
}

/* ---------- guidance ----------
   Like a landmark on the horizon: the app always shows your next move (the pill under the trip name),
   drops a breadcrumb on the menu and tab where it lives, and makes the exact control glow when you get
   there. Nothing is forced; you can go anywhere. Finishing a stage gets a short celebration. */
const timeKey = t => !t ? '9' : (t < '05:00' ? '2' : '1') + t; // after-midnight plans belong at the end of the night
const byTime = (a, b) => timeKey(a.time).localeCompare(timeKey(b.time));
// what to point at next: the journey's focus step for you (see 05n-journey.js)
function guide() {
  if (!S.trip || isLive() || S.demo && !S.trip.pitches) return null;
  const f = journey().focus; if (!f || f.live) return null;
  if (!f.mine && f.status === 'waiting') return { tab: f.help?.tab, wait: true, label: f.group || f.title, k: f.k };
  return { tab: f.help?.tab, sel: f.help?.sel, label: f.mine && f.mineText ? f.mineText : f.title, k: f.k };
}
const DONE_TEXT = { invite: 'The crew’s in', honoree: 'Guest of honor set', rsvp: 'Everyone has answered', dest: 'Decided where', dates: 'Dates locked', confirm: 'Everyone confirmed', venue: 'Place and time set', flights: 'Everyone’s booked', stay: 'Stay locked', plan: 'The plan is sketched', tasks: 'Every to-do done', booked: 'Stay booked', arrivals: 'Arrivals are in', meet: 'Meeting point set', settle: 'All settled up' };
function checkMilestones() {
  if (!S.trip || S.demo || S.setup) return;
  const done = journey().done.map(s => s.k), key = 'outta_done2_' + S.tid;
  let seen = null; try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  try { localStorage.setItem(key, JSON.stringify(done)); } catch {}
  if (!seen) return; // first visit to this trip on this device: no fanfare for old progress
  const fresh = done.filter(l => !seen.includes(l));
  if (!fresh.length) return;
  const g = guide();
  const k = fresh[fresh.length - 1]; showMilestone(k === 'dest' && isSmall() ? 'Plan locked' : DONE_TEXT[k] || 'Step done', g && !g.wait ? g : null);
}
let msTimer;
function showMilestone(title, g) {
  document.querySelector('.milestone')?.remove();
  const el = document.createElement('div');
  el.className = 'milestone'; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ms-check" aria-hidden="true">✓</span><div style="min-width:0;flex:1"><b>${esc(title)}</b>${g ? `<span class="ms-next">Next: ${esc(g.label)}</span>` : ''}</div>${g ? `<button class="btn sm primary" data-ms-go="${g.k}">Go</button>` : ''}`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { const b = e.target.closest('[data-ms-go]'); if (b) jGo(b.dataset.msGo); el.remove(); });
  clearTimeout(msTimer); msTimer = setTimeout(() => el.remove(), 6500);
}
function applyBeacon() {
  const g = guide(); if (!g || g.wait || !g.sel || S.tab !== g.tab) { S.guideJump = false; return; }
  const el = document.querySelector(g.sel); if (!el) return;
  el.classList.add('beacon');
  if (S.guideJump) { S.guideJump = false; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 120); }
}
let lastY = 0;
window.addEventListener('scroll', () => {
  const f = document.querySelector('.fab-lost'); const y = window.scrollY;
  if (f) f.classList.toggle('tucked', y > lastY + 4 && y > 120);
  lastY = y;
}, { passive: true });

/* ---------- plans of every size ----------
   The crew is the center; everything you do together is a plan. A plan's size decides how much of the
   app it shows: a hangout is one evening (no flights, no packing), a trip is the full thing. */
const SIZES = {
  hangout: { label: 'Hangout', desc: 'Dinner, drinks, game night. One evening.', nights: 0, win: 6, ph: 'Friday dinner', color: '#14915F' },
  day: { label: 'Day out', desc: 'Beach day, concert, a day trip nearby.', nights: 0, win: 13, ph: 'Beach day', color: '#1098AD' },
  weekend: { label: 'Weekend', desc: 'A night or two away. Cabin, road trip, nearby city.', nights: 2, win: 45, ph: 'Cabin weekend', color: '#E8590C' },
  trip: { label: 'Trip', desc: 'Flights, stays, the full thing.', nights: 3, win: 60, ph: 'Vegas, finally', color: '#D41C78' },
};
const size = () => SIZES[S.trip?.size] ? S.trip.size : 'trip';
const isSmall = (t = S.trip) => ['hangout', 'day'].includes(t?.size);
const nightsSet = t => t.nights ?? (SIZES[t.size] || SIZES.trip).nights;
const sizeOf = t => SIZES[t.size] ? t.size : 'trip';
const HIDE_TABS = { hangout: ['flights', 'stays', 'tickets', 'pack', 'bucket', 'pot'], day: ['flights', 'stays', 'tickets', 'pack', 'pot'], weekend: ['flights', 'tickets'], trip: [] };
const STEP_KEYS = { hangout: ['crew', 'where', 'dates'], day: ['crew', 'where', 'dates', 'plan'], weekend: ['crew', 'where', 'dates', 'stay', 'plan'], trip: ['crew', 'where', 'dates', 'flights', 'stay', 'plan'] };
const t12 = hm => { if (!hm) return ''; const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const dayRange = (a, b) => a === b ? fmt(a) : `${fmt(a)} → ${fmt(b)}`;
function planOn() {
  if (size() === 'trip') return tickets().on;
  return !!(S.trip.lockedDest && S.trip.lockedDates && S.members.filter(going).length >= 2);
}
function passSmall() {
  const d = dates(), ds = dest(), t = S.trip, inN = S.members.filter(going).length, c = countdown(), on = planOn();
  return `<section class="pass">
    <div class="pass-main">
      <div class="row" style="justify-content:space-between"><span class="label">${esc(SIZES[size()].label)} · ${esc(t.name)}</span>
        ${on ? `<span class="on-pill">It’s on</span>` : stagePill(S.trip, S.members)}</div>
      <div class="ev-title ${ds ? '' : 'code-tbd'}">${ds ? esc(ds.city) : 'The plan: TBD'}</div>
      <div class="facts">
        <div><span class="label">When${d && !d.locked ? ' · best so far' : ''}</span><b>${d ? dayRange(d.start, d.end) : 'TBD'}${t.time ? ' · ' + t12(t.time) : ''}</b></div>
        <div><span class="label">Where</span><b style="font-family:var(--f-body)">${esc(t.venue || t.city || 'TBD')}</b></div>
        ${c ? `<div><span class="label">Countdown</span><b style="color:var(--accent)">${c.text}</b></div>` : ''}
      </div>
      <div class="row" style="gap:6px"><button class="btn sm" data-act="card">Make story card</button>${size() !== 'trip' ? `<button class="btn sm ghost" data-act="growPlan">Make it a ${size() === 'weekend' ? 'trip' : 'weekend or trip'}</button>` : ''}</div>
      ${S.cardUrl ? `<div class="row" style="align-items:flex-end;gap:14px"><img class="cardimg" src="${S.cardUrl}" alt="Story card for ${esc(t.name)}">
        <div class="stack" style="gap:8px">${S.downloads ? `<button class="btn primary sm" data-act="saveCard">Save image</button>` : `<span class="small muted">Press and hold the image to save it.</span>`}<button class="btn sm ghost" data-act="closeCard">Close</button></div></div>` : ''}
    </div>
    <div class="pass-stub">
      <div><span class="label">Crew</span><div class="code" style="font-size:40px">${inN}<span class="muted" style="font-size:22px">/${S.members.length}</span></div><span class="small muted">going</span></div>
      ${commitLadder()}
    </div>
  </section>`;
}
function growPlan() {
  const t = S.trip, to = size() === 'weekend' ? 'trip' : 'weekend', end = t.winEnd < add(TODAY, SIZES[to].win) ? add(TODAY, SIZES[to].win) : t.winEnd;
  saveTrip({ size: to, nights: SIZES[to].nights, winEnd: end, lockedDates: null });
  flash(`It’s a ${SIZES[to].label.toLowerCase()} now. Everyone’s votes are kept. Pick the nights in Dates.`);
}

/* Plan Match for hangouts and days out: the AI pitches whole evenings, the crew swipes */
function genPlanPitches() {
  takeNote();
  const opts = dateOptions().slice(0, 4); if (!opts.length) { flash('Set which days could work first.'); return; }
  const t = S.trip, b = budgetCap(), evening = size() === 'hangout';
  const prompt = `You're pitching plans to a friend group. Each person swipes yes or no, like a dating app, so make every pitch specific, fun and honest.
Plan type: ${evening ? 'one evening out or in' : 'a full day out'}${mode().label !== 'Friends trip' ? ` (${mode().label}. ${mode().ai})` : ''}.
City: ${t.city || 'unknown, assume a big US city'}.
Crew: ${active().length} people. Max spend per person: ${b ? `${b.label}; keep it at or under ${money(b.cap)}` : 'not set, keep it moderate'}.
${blend() ? 'Crew vibe quiz:\n' + blendText() : 'Vibe: fun, social'}
Ideas the crew already suggested: ${(t.destinations || []).map(d => d.city).join(', ') || 'none'}
${pitchMemory()}
Day options (use one exactly per pitch):
${opts.map((o, i) => `${i + 1}) ${o.start} (${dow(o.start)}, ${o.ok}/${active().length} free)`).join('\n')}

Give 6 different plans that use real, well-known places in that city: mix a dinner-and-drinks night, an activity (bowling, karaoke, a class, a show), something low-key, and something new. Prefer the days most people can make.
Reply with only JSON: {"pitches":[{"title":"the plan in 2-5 words","tagline":"punchy, 4-9 words","where":"main place or neighborhood","date":"YYYY-MM-DD","time":"HH:MM start","perPerson":"$25–40","vibeMatch":82,"why":"one or two sentences on why this crew would love it","steps":[{"time":"HH:MM","title":"place or activity"}],"weather":"short, or empty if it's indoors"}]}`;
  askAI('pitch', prompt, data => {
    const valid = new Map(opts.map(o => [o.start, o]));
    const items = (Array.isArray(data?.pitches) ? data.pitches : []).filter(p => p && p.title).slice(0, 8).map(p => {
      const o = valid.get(p.date) || opts[0], steps = arr(p.steps).slice(0, 5).map(s => ({ time: String(s.time || '').slice(0, 5), title: String(s.title || '').slice(0, 80) })).filter(s => s.title);
      return { id: rid(6), small: true, title: String(p.title).slice(0, 50), city: String(p.title).slice(0, 50), code: '', start: o.start, end: o.start, time: /^\d\d:\d\d$/.test(p.time) ? p.time : '',
        where: String(p.where || '').slice(0, 60), tagline: String(p.tagline || '').slice(0, 80), why: String(p.why || '').slice(0, 300), perPerson: String(p.perPerson || '').slice(0, 30),
        vibeMatch: Math.max(0, Math.min(100, Math.round(+p.vibeMatch || 0))), highlights: steps.map(s => (s.time ? t12(s.time) + ' · ' : '') + s.title), steps, weather: String(p.weather || '').slice(0, 60) };
    });
    if (!items.length) { flash('No plans came back. Try again.'); return; }
    return saveTrip({ pitches: { items, at: Date.now() }, pitchHistory: nextHistory(), runoff: null });
  });
}
function lockSmallPitch(p) {
  const ds = [...(S.trip.destinations || [])];
  let d = ds.find(x => x.city.toLowerCase() === p.title.toLowerCase());
  if (!d) { d = { id: rid(6), city: p.title, code: '' }; ds.push(d); }
  const patch = { destinations: ds, lockedDest: d.id, lockedDates: { start: p.start, end: p.start }, time: p.time || '', venue: p.where || '' };
  if (!(S.trip.itinerary || []).length && p.steps?.length) patch.itinerary = p.steps.map(s => ({ id: rid(6), date: p.start, time: s.time, title: s.title, kind: 'plan', note: '', ai: true }));
  saveTrip(withLog(patch, { area: 'dest', text: `Locked in: ${p.title}, ${fmt(p.start)}${p.time ? ' at ' + t12(p.time) : ''}`, act: 'all', undo: { k: 'set', patch: { lockedDest: S.trip.lockedDest || null, lockedDates: S.trip.lockedDates || null, time: S.trip.time || '', venue: S.trip.venue || '' } } }));
  flash(`Locked: ${p.title}, ${fmt(p.start)}${p.time ? ' at ' + t12(p.time) : ''}.`);
}

/* ---------- crews ---------- */
const crewMembers = c => [...new Set([...(c.ids || []), ...Object.keys(c.people || {}).filter(k => c.people[k])])];
const myCrews = () => S.crews.filter(c => c.by === S.uid || crewMembers(c).includes(S.uid));
const crewNick = (c, id) => c.profiles?.[id]?.nick || 'Someone';
function myPlans() {
  const crewIds = new Set(myCrews().map(c => c.id));
  return S.trips.filter(t => (t.people || {})[S.uid] || (!(t.left || {})[S.uid] && (t.createdBy === S.uid || (t.crewId && crewIds.has(t.crewId)))));
}
const planWhen = t => t.lockedDates ? (t.lockedDates.start === t.lockedDates.end ? fmt(t.lockedDates.start) : `${short(t.lockedDates.start)} – ${short(t.lockedDates.end)}`) + (t.time ? ' · ' + t12(t.time) : '') : '';
function planStatus(t) {
  if (t.lockedDest && t.lockedDates) return 'Locked in';
  if (t.lockedDest) return 'Picking the day';
  if (t.lockedDates) return isSmall(t) ? 'Picking the plan' : 'Picking where';
  return isSmall(t) ? 'Picking the plan and the day' : 'Picking where and when';
}
// Split-flap letters, one tile per character, flipping in left to right.
const flap = text => String(text || '').split(' ').map((w, wi, all) => `<span class="fw">${[...w].map((ch, k) => `<i style="--i:${Math.min(24, all.slice(0, wi).join(' ').length + wi + k)}">${esc(ch)}</i>`).join('')}</span>`).join(' ');
const BOARD = { draft: 'Standby', gathering: 'Voting', decided: 'Scheduled', organizing: 'Check-in', confirmed: 'On time', happening: 'Now', memories: 'Landed' };
function planRow(t, opts = {}) {
  const sz = SIZES[sizeOf(t)], crew = S.crews.find(c => c.id === t.crewId), name = (t.destinations || []).find(d => d.id === t.lockedDest)?.city;
  const daysTo = t.lockedDates ? Math.round((D(t.lockedDates.start) - D(TODAY)) / 864e5) : null, st = stageOf(t), p = t.pulse || {};
  const mine = (p.who || []).includes(S.uid) && p.mine && st !== 'memories';
  const d = t.lockedDates, n = Object.values(t.people || {}).filter(Boolean).length;
  // lead with where it's happening; the plan's own name and the crew go underneath
  const trip = sizeOf(t) === 'trip', main = name || (trip ? 'TBD' : t.name);
  const sub = [main !== t.name && esc(t.name), crew && !opts.noCrew && esc(crew.name)].filter(Boolean).join(' · ');
  return `<div class="card plan-row dep-row st-${st} ${mine ? 'needs-me' : ''}" style="--pc:${sz.color}">
    <div class="pr-date">${d ? `<span>${fmt(d.start, { month: 'short' })}</span><b>${D(d.start).getUTCDate()}</b><span>${t.time ? t12(t.time) : fmt(d.start, { weekday: 'short' })}</span>` : '<span>Date</span><b>TBD</b><span>&nbsp;</span>'}</div>
    <div class="pr-mid">
      <span class="pr-kind"><i style="background:var(--pc)"></i>${esc(sz.label)}${n ? ` · ${n} in` : ''}</span>
      ${trip ? `<h3><span class="sr-only">${esc(main)}</span><span class="flap" aria-hidden="true">${flap(main)}</span></h3>` : `<h3 class="pr-name">${esc(main)}</h3>`}
      ${sub ? `<span class="pr-sub">${sub}</span>` : ''}
      <span class="small muted pr-line">${moveLine(t)}${daysTo !== null && daysTo > 0 && daysTo <= 30 ? ` · <b style="color:var(--pc)">${daysTo === 1 ? 'Tomorrow' : 'in ' + daysTo + ' days'}</b>` : ''}</span>
    </div>
    <div class="pr-status"><span class="board-st">${BOARD[st]}</span>${mine ? '<span class="your-flag">Your move</span>' : ''}</div>
    <div class="pr-acts">${S.confirmHome === t.id
      ? `<span class="small pr-ask">Delete for everyone?</span><button class="btn sm ghost" data-act="homeCancel">Cancel</button><button class="btn sm danger-fill" data-homedo="${esc(t.id)}" ${S.busy.delete ? 'disabled' : ''}>${S.busy.delete ? 'Deleting…' : 'Delete'}</button>`
      : `${canDelete(t) ? `<button class="btn sm ghost icon pr-del" data-homedel="${esc(t.id)}" aria-label="Delete ${esc(t.name)}" title="Delete"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button>` : ''}<button class="btn sm" data-share="${esc(t.id)}" aria-label="Share ${esc(t.name)}">Share</button><button class="btn sm primary" data-open="${esc(t.id)}">Open</button>`}</div>
    ${S.shareHome === t.id && S.copyText ? `<textarea aria-label="Text to copy" class="pr-copy" id="copybox" readonly>${esc(S.copyText)}</textarea>` : ''}
  </div>`;
}
function homeView() {
  if (S.loading && parseTripHash(location.hash.slice(1))) return `${topBar()}${skel()}`;
  if (S.creating === 'crew') return pickCrewStep();
  if (S.creating === 'size') return pickSizeStep();
  if (S.creating === 'mode') return modePicker();
  if (S.creating === 'form') return newTripForm();
  if (S.crewView) return crewPage(S.crewView);
  const canSave = !!S.db, plans = myPlans(), crews = myCrews();
  const live = plans.filter(t => t.lockedDates && t.lockedDates.start <= TODAY && t.lockedDates.end >= TODAY);
  const upcoming = plans.filter(t => t.lockedDates && t.lockedDates.start > TODAY).sort((a, b) => a.lockedDates.start < b.lockedDates.start ? -1 : 1);
  const deciding = plans.filter(t => !t.lockedDates && (!t.winEnd || t.winEnd >= TODAY)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const past = plans.filter(t => (t.lockedDates && t.lockedDates.end < TODAY) || (!t.lockedDates && t.winEnd && t.winEnd < TODAY));
  const fresh = canSave && S.tripsLoaded && !plans.length && !crews.length;
  return `${topBar()}
  <section class="hero ${fresh ? '' : 'hero-sm'}">
    <span class="label">${S.myName ? 'Hey ' + esc(S.myName) : 'Your crew’s plans, from Friday night to Tulum'}</span>
    <h1>${fresh ? 'Get the group chat out the door.' : 'What are we doing?'}</h1>
    ${fresh ? '<p>Hangouts, day trips and full-on trips with your crews. The AI pitches plans that fit everyone, the crew swipes, and when everyone matches, it’s on.</p>' : ''}
    <div class="row"><button class="btn primary big" data-act="newTrip" ${canSave ? '' : 'disabled'}>New plan</button>${canSave ? '<button class="btn" data-act="newCrew">New crew</button>' : ''}<button class="btn ghost" data-act="demo">See the demo</button></div>
    ${!canSave && !S.loading ? `<span class="small muted">${IN_CLAUDE ? 'Couldn’t connect. Reload the page to try again.' : 'Can’t reach the local server. Start it with npm run dev, then reload.'}</span>` : ''}
  </section>
  ${S.creating === 'newCrew' ? `<section class="card stack"><h2>New crew</h2><p class="small muted">A crew is a group you make plans with. You’ll get an invite link for it next.</p>
    <form id="newCrewForm" class="row" style="gap:6px"><input aria-label="Crew name" id="nc-name" maxlength="40" required placeholder="The Vegas Six" style="flex:1 1 200px"><button class="btn primary" type="submit">Create crew</button><button class="btn ghost" type="button" data-act="cancelNew">Cancel</button></form></section>` : ''}
  ${!canSave ? '' : !S.tripsLoaded ? skel('rows') : `
  ${inboxCard()}
  <div class="home-bar"><span class="small muted">${[live.length && live.length + ' happening now', upcoming.length && upcoming.length + ' coming up', deciding.length && deciding.length + ' deciding'].filter(Boolean).join(' · ') || 'No plans yet'}</span>${viewSwitch()}</div>
  ${homeMode === 'cal' ? calView(plans, deciding) : `
  ${live.length ? `<section class="stack"><h2 class="board-h"><i class="live-dot" aria-hidden="true"></i> Happening now</h2>${live.map(t => planRow(t)).join('')}</section>` : ''}
  <section class="stack"><div class="row" style="justify-content:space-between"><h2 class="board-h">Departures</h2><span class="small muted mono">${upcoming.length} locked in · <span data-clock>${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span></span></div>
    ${upcoming.length ? upcoming.map(t => planRow(t)).join('') : `<div class="empty"><span>Nothing locked yet. When a plan has a place and a day, it shows up here like a calendar.</span></div>`}</section>
  ${deciding.length ? `<section class="stack"><div class="row" style="justify-content:space-between"><h2 class="board-h">On standby</h2><span class="small muted">Still deciding</span></div>${deciding.map(t => planRow(t, { del: true })).join('')}</section>` : ''}`}
  <section class="stack"><div class="row" style="justify-content:space-between"><h2>Your crews</h2><button class="btn sm" data-act="newCrew">New crew</button></div>
    ${crews.length ? `<div class="crew-grid">${crews.map(c => crewCard(c, plans)).join('')}</div>` : `<div class="empty"><span>Crews are the groups you make plans with. Make one, share its invite link, and every plan after that starts with everyone already in.</span><button class="btn sm primary" data-act="newCrew">Make a crew</button></div>`}</section>
  ${past.length && homeMode !== 'cal' ? `<details class="card past"><summary><b>Landed</b> <span class="small muted">Past plans ·</span> <span class="small muted">${past.length}</span></summary><div class="stack" style="margin-top:10px">${past.map(t => planRow(t, { del: true })).join('')}</div></details>` : ''}`}`;
}
/* ---------- home: calendar view ---------- */
const ICON_LIST = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>';
const ICON_CAL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
let homeMode = 'list'; try { homeMode = localStorage.getItem('outta_homeview') === 'cal' ? 'cal' : 'list'; } catch {}
const covers = (t, d) => t.lockedDates && t.lockedDates.start <= d && t.lockedDates.end >= d;
function viewSwitch() {
  return `<div class="seg" role="group" aria-label="View">${[['list', 'List', ICON_LIST], ['cal', 'Calendar', ICON_CAL]].map(([k, l, i]) => `<button class="${homeMode === k ? 'on' : ''}" data-homeview="${k}" aria-pressed="${homeMode === k}">${i}${l}</button>`).join('')}</div>`;
}
function calView(plans, deciding) {
  const month = S.calMonth || TODAY.slice(0, 7), first = month + '-01';
  const start = add(first, -((D(first).getUTCDay() + 6) % 7)), grid = Array.from({ length: 42 }, (_, i) => add(start, i));
  // each plan keeps one lane for its whole stay so multi-day bars line up across the week
  const evs = plans.filter(t => t.lockedDates).sort((a, b) => a.lockedDates.start < b.lockedDates.start ? -1 : a.lockedDates.start > b.lockedDates.start ? 1 : b.lockedDates.end.localeCompare(a.lockedDates.end) || (a.time || '').localeCompare(b.time || ''));
  const laneEnd = [], lane = new Map();
  for (const t of evs) { let l = laneEnd.findIndex(e => e < t.lockedDates.start); if (l < 0) l = laneEnd.length; laneEnd[l] = t.lockedDates.end; lane.set(t, l); }
  const inMonth = d => d.slice(0, 7) === month;
  const sel = S.calDay && inMonth(S.calDay) ? S.calDay : inMonth(TODAY) ? TODAY : (evs.find(t => inMonth(t.lockedDates.start))?.lockedDates.start || first);
  const LANES = 3;
  const cells = grid.map((d, i) => {
    const here = evs.filter(t => covers(t, d)), more = here.filter(t => lane.get(t) >= LANES).length;
    const bars = Array.from({ length: Math.min(LANES, 1 + Math.max(-1, ...here.map(t => Math.min(LANES - 1, lane.get(t))))) }, (_, l) => {
      const t = here.find(x => lane.get(x) === l); if (!t) return '<span class="mc-ev gap"></span>';
      const s = d === t.lockedDates.start, e = d === t.lockedDates.end, label = s || i % 7 === 0;
      // the label runs along the bar until the plan ends or the week does
      const n = Math.min(span(d, t.lockedDates.end).length, 7 - i % 7);
      return `<span class="mc-ev ${s ? 's' : ''} ${e ? 'e' : ''} ${t.lockedDates.end < TODAY ? 'past' : ''}" style="--pc:${SIZES[sizeOf(t)].color};--n:${n}">${label ? `<b>${esc(t.name)}</b>` : '&nbsp;'}</span>`;
    }).join('');
    return `<button class="mc-day ${inMonth(d) ? '' : 'out'} ${d === TODAY ? 'today' : ''} ${d === sel ? 'sel' : ''}" data-calday="${d}" aria-label="${fmt(d)}${here.length ? ', ' + here.length + ' plan' + (here.length > 1 ? 's' : '') : ''}" aria-pressed="${d === sel}">
      <span class="mc-n">${D(d).getUTCDate()}</span>${bars}${more ? `<span class="mc-more">+${more}</span>` : ''}</button>`;
  });
  const day = evs.filter(t => covers(t, sel)), label = D(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const nMonth = evs.filter(t => t.lockedDates.start.slice(0, 7) <= month && t.lockedDates.end.slice(0, 7) >= month).length;
  return `<section class="card mcal">
    <div class="mc-head"><div class="stack" style="gap:0"><h2 class="mc-title">${label}</h2><span class="small muted">${nMonth ? `${nMonth} plan${nMonth > 1 ? 's' : ''} this month` : 'Nothing locked this month'}</span></div>
      <div class="row" style="gap:4px;flex-wrap:nowrap">${month !== TODAY.slice(0, 7) ? '<button class="btn sm ghost" data-calnav="0">Today</button>' : ''}<button class="btn sm icon" data-calnav="-1" aria-label="Previous month"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><button class="btn sm icon" data-calnav="1" aria-label="Next month"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div></div>
    <div class="mc-dows">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="mc-grid" data-key="mc-${month}">${cells.join('')}</div>
  </section>
  <section class="stack"><div class="row" style="justify-content:space-between"><h2>${sel === TODAY ? 'Today' : fmt(sel, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>${day.length ? `<span class="small muted">${day.length} plan${day.length > 1 ? 's' : ''}</span>` : ''}</div>
    ${day.length ? day.map(t => planRow(t)).join('') : `<div class="empty"><span>${sel < TODAY ? 'Nothing that day.' : 'Nothing planned yet. Free day.'}</span>${sel >= TODAY && S.db ? '<button class="btn sm primary" data-act="newTrip">Plan something</button>' : ''}</div>`}</section>
  ${deciding.length ? `<section class="stack"><div class="row" style="justify-content:space-between"><h2>Still deciding</h2><span class="small muted">Shows on the calendar once a day is locked</span></div>
    <div class="row" style="gap:6px">${deciding.map(t => `<button class="chip dec-chip" style="--pc:${SIZES[sizeOf(t)].color}" data-open="${esc(t.id)}"><i></i>${esc(t.name)}</button>`).join('')}</div></section>` : ''}`;
}
function calNav(dir) {
  const m = S.calMonth || TODAY.slice(0, 7);
  if (!dir) { S.calMonth = null; S.calDay = null; }
  else { const d = D(m + '-01'); d.setUTCMonth(d.getUTCMonth() + dir); S.calMonth = iso(d).slice(0, 7); S.calDay = null; }
  render();
  const g = $('.mc-grid');
  if (g && dir && !calm()) g.animate([{ opacity: 0, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE });
}

function crewCard(c, plans) {
  const ids = crewMembers(c), cp = plans.filter(t => t.crewId === c.id);
  const next = cp.filter(t => t.lockedDates && t.lockedDates.end >= TODAY).sort((a, b) => a.lockedDates.start < b.lockedDates.start ? -1 : 1)[0];
  return `<div class="card crew-card">
    <button class="crew-open" data-crew="${esc(c.id)}"><h3>${esc(c.name)}</h3>
      <div class="avs">${ids.slice(0, 8).map(id => `<span class="av-sm" style="background:${colorFor(id)}" title="${esc(crewNick(c, id))}">${esc(crewNick(c, id)[0].toUpperCase())}</span>`).join('')}${ids.length > 8 ? `<span class="small muted">+${ids.length - 8}</span>` : ''}</div>
      <span class="small muted">${next ? `Next: <b>${esc(next.name)}</b> · ${esc(planWhen(next))}` : `${cp.length} plan${cp.length === 1 ? '' : 's'} together`}</span></button>
    <div class="row" style="gap:6px"><button class="btn sm primary" data-startcrew="${esc(c.id)}">+ Plan something</button><button class="btn sm ghost" data-crew="${esc(c.id)}">Open</button></div>
  </div>`;
}
const crewLink = cid => SHARE_BASE + '#c-' + cid;
function crewPage(cid) {
  const c = S.crews.find(x => x.id === cid);
  if (!c) return `${topBar()}${skel('rows')}<button class="btn" data-act="home">Back home</button>`;
  const ids = crewMembers(c), plans = myPlans().filter(t => t.crewId === cid);
  const upcoming = plans.filter(t => !t.lockedDates || t.lockedDates.end >= TODAY).sort((a, b) => (a.lockedDates?.start || '9') < (b.lockedDates?.start || '9') ? -1 : 1);
  const past = plans.filter(t => t.lockedDates && t.lockedDates.end < TODAY);
  return `${topBar()}
  <section class="stack"><button class="linkbtn small" data-act="home" style="align-self:flex-start">‹ All plans</button>
    <span class="label">Crew</span><h1 style="font-size:clamp(32px,7vw,48px)">${esc(c.name)}</h1>
    <div class="row" style="gap:6px">${ids.map(id => `<span class="chip" style="cursor:default"><span class="av" style="width:20px;height:20px;font-size:10px;background:${colorFor(id)}">${esc(crewNick(c, id)[0].toUpperCase())}</span>${esc(crewNick(c, id))}${id === S.uid ? ' (you)' : ''}</span>`).join('')}</div>
    <div class="row"><button class="btn primary big" data-startcrew="${esc(cid)}">+ Plan something</button></div>
  </section>
  <section class="stack"><h2>Plans</h2>${upcoming.length ? upcoming.map(t => planRow(t, { noCrew: true })).join('') : `<div class="empty"><span>No plans yet. Start one and everyone in the crew is added automatically.</span></div>`}</section>
  <section class="card stack"><h3>Invite to the crew</h3>
    <p class="small muted">${IN_CLAUDE ? 'First share this page with them (Share menu, as an Editor). Then send this link.' : 'Send this link. They type their name and join the crew.'}</p>
    <span class="invite-link mono">${esc(crewLink(cid))}</span>
    <div><button class="btn primary" data-act="copyCrewInvite" data-cid="${esc(cid)}">Send invite</button></div></section>
  ${dnaCard(c)}
  ${crewTemplates(c)}
  ${past.length ? `<details class="card past"><summary><b>Landed</b> <span class="small muted">Past plans ·</span> <span class="small muted">${past.length}</span></summary><div class="stack" style="margin-top:10px">${past.map(t => planRow(t, { noCrew: true })).join('')}</div></details>` : ''}
  ${c.by === S.uid || S.isOwner ? (S.confirmCrew === cid ? `<section class="card row confirm-row" style="justify-content:space-between;gap:10px"><span class="small"><b>Delete ${esc(c.name)}?</b> Its plans are kept. Templates and Crew DNA go with it.</span><span class="row" style="gap:6px"><button class="btn sm danger-fill" data-delcrewdo="${esc(cid)}" ${S.busy.delcrew ? 'disabled' : ''}>${S.busy.delcrew ? '<i class="spin"></i>Deleting…' : 'Delete crew'}</button><button class="btn sm ghost" data-act="delCrewCancel">Cancel</button></span></section>` : `<div><button class="btn sm ghost danger" data-delcrew="${esc(cid)}">Delete crew</button></div>`) : ''}`;
}
async function createCrew(name) {
  const cid = rid(10), body = { name: name.slice(0, 40), ids: [S.uid], people: { [S.uid]: true }, profiles: { [S.uid]: { nick: S.myName || 'Me' } }, by: S.uid, at: Date.now() };
  try { await S.db.doc('crews/' + cid).set(body); S.creating = null; openCrew(cid); flash('Crew created. Send the invite link to add people.'); }
  catch (e) { flash(writeErr(e)); }
}
async function joinCrew(cid) {
  if (!S.db) return;
  try {
    const snap = await S.db.doc('crews/' + cid).get();
    if (!snap.exists) { flash('That crew link doesn’t work anymore.'); setHash(''); return; }
    if (!crewMembers(snap.data()).includes(S.uid)) { await S.db.doc('crews/' + cid).update({ people: { [S.uid]: true }, profiles: { [S.uid]: { nick: S.myName || 'Someone' } } }); flash(`You joined ${snap.data().name}.`); }
    openCrew(cid);
  } catch (e) { flash(writeErr(e)); }
}
function openCrew(cid) {
  S.confirmCrew = null;
  stop(); S.tid = null; resetTrip(); S.crewView = cid; S.creating = null; setHash('c-' + cid);
  render(); window.scrollTo({ top: 0 });
}

/* new-plan flow: crew → size → (type) → basics */
function startNewPlan(cid) {
  S.newCrew = cid || null; S.newSize = null; S.newMode = null;
  S.creating = cid || !myCrews().length ? 'size' : 'crew'; S.cameFromCrewStep = !cid && !!myCrews().length;
  if (cid) { S.crewView = null; setHash(''); }
  render(); window.scrollTo({ top: 0 });
}
function stepHead(title, back) {
  const crew = S.crews.find(c => c.id === S.newCrew), sz = SIZES[S.newSize];
  const trail = ['New plan', crew?.name, sz?.label].filter(Boolean).join(' · ');
  return `<section class="stack"><button class="linkbtn small" data-act="${back}" style="align-self:flex-start">‹ Back</button>
    <span class="label">${esc(trail)}</span><h1 style="font-size:clamp(30px,6vw,44px)">${title}</h1></section>`;
}
function pickCrewStep() {
  return `${topBar()}${stepHead('Who’s this with?', 'cancelNew')}
  <div class="modes">${myCrews().map(c => `<button class="mode" data-pickcrew="${esc(c.id)}" style="--mc:${colorFor(c.id)}"><b>${esc(c.name)}</b><span class="small muted">${crewMembers(c).map(id => esc(crewNick(c, id))).join(', ')}</span></button>`).join('')}
    <button class="mode" data-pickcrew="" style="--mc:var(--muted)"><b>Someone else</b><span class="small muted">Start it and invite people after</span></button></div>`;
}
function pickSizeStep() {
  return `${topBar()}${stepHead('How big is this plan?', S.cameFromCrewStep ? 'backCrew' : 'cancelNew')}
  <div class="modes sizes">${Object.entries(SIZES).map(([k, v]) => `<button class="mode" data-size="${k}" style="--mc:${v.color}"><b>${esc(v.label)}</b><span class="small muted">${esc(v.desc)}</span></button>`).join('')}</div>`;
}
function modePicker() {
  return `${topBar()}${stepHead(`What kind of ${SIZES[S.newSize || 'trip'].label.toLowerCase()} is this?`, 'backSize')}
  <p class="muted">We’ll tune the AI picks, the awards and the features to your group.</p>
  <div class="modes">${Object.entries(MODES).map(([k, v]) => `<button class="mode" data-mode="${k}" style="--mc:${v.color}"><b>${esc(modeLabel(v, S.newSize))}</b><span class="small muted">${esc(v.desc)}</span>${v.honoree ? `<span class="label" style="color:color-mix(in oklab,var(--mc) 70%,var(--ink))">Guest of honor mode</span>` : ''}</button>`).join('')}</div>`;
}
function newTripForm() {
  const sz = SIZES[S.newSize || 'trip'], small = ['hangout', 'day'].includes(S.newSize), m = MODES[S.newMode] || MODES.friends, crew = S.crews.find(c => c.id === S.newCrew);
  const start = small ? TODAY : add(TODAY, 30), end = add(start, sz.win + (small ? 0 : 15));
  let city = ''; try { city = localStorage.getItem('outta_city') || ''; } catch {}
  const ph = { bachelorette: 'Sarah’s Last Fling', bachelor: 'Mike’s Last Ride', birthday: 'Dev turns 30', family: 'Family beach week', work: 'Q3 team offsite', festival: 'Coachella weekend', sports: 'Super Bowl trip', couples: 'Couples in Tulum', college: 'Spring break ’27' }[S.newMode] || sz.ph;
  return `${topBar()}${stepHead('The basics', small ? 'backSize' : 'backModes')}
  ${crew || !small ? `<div class="row" style="gap:8px">${!small ? `<span class="mode-chip" style="--mc:${m.color}">${esc(modeLabel(m, S.newSize))}</span>` : ''}${crew ? `<span class="small muted">Everyone in <b>${esc(crew.name)}</b> is added automatically.</span>` : ''}</div>` : ''}
  <section class="card stack">
    <form id="newTrip" class="stack">
      <label class="field"><span class="label">Name it</span><input id="nt-name" required maxlength="60" placeholder="${esc(ph)}"></label>
      ${small ? `<label class="field"><span class="label">Which city?</span><input id="nt-city" maxlength="50" value="${esc(city)}" placeholder="Brooklyn" required></label>` : ''}
      <div class="row">
        <label class="field"><span class="label">${small ? 'Could happen from' : 'Earliest date'}</span><input id="nt-start" type="date" value="${start}" min="${TODAY}" required></label>
        <label class="field"><span class="label">${small ? 'Until' : 'Latest date'}</span><input id="nt-end" type="date" value="${end}" min="${TODAY}" required></label>
      </div>
      <details class="more-opts-inline"><summary class="small">More options${small ? '' : ': nights, currency' + (m.honoree ? ', ' + esc(m.honoree) : '')}</summary>
        <div class="row" style="margin-top:10px">
          <label class="field" style="flex:0 1 190px"><span class="label">Currency</span><select id="nt-cur">${curOptions(lsGetC('outta_lastcur', '') || myCur())}</select></label>
          ${small ? '' : `<label class="field" style="flex:0 1 110px"><span class="label">Nights</span><select id="nt-nights">${[1, 2, 3, 4, 5, 6, 7, 10, 14].map(n => `<option ${n === sz.nights ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}
          ${!small && m.honoree ? `<label class="field"><span class="label">The ${esc(m.honoree)}’s name</span><input id="nt-honoree" maxlength="40" placeholder="Optional"></label>` : ''}
        </div>
        <span class="small muted">All of this can change later in Settings.</span>
      </details>
      <p class="small muted">${small ? 'Everyone taps which of these days they’re free. The crew picks the exact plan and day together.' : 'Not sure on dates yet? Give a wide window. The crew picks the exact nights later.'}</p>
      <div><button class="btn primary big" type="submit" ${S.busy.create ? 'disabled' : ''}>${S.busy.create ? '<i class="spin"></i>Creating…' : `Create ${esc(sz.label.toLowerCase())}`}</button></div>
    </form>
  </section>`;
}
async function createTrip() {
  const name = $('#nt-name').value.trim(); let a = $('#nt-start').value, b = $('#nt-end').value;
  if (!name || !a || !b) return;
  if (b < a) [a, b] = [b, a];
  if (span(a, b).length >= 92) b = add(a, 90);
  const sz = S.newSize || 'trip', small = ['hangout', 'day'].includes(sz), city = ($('#nt-city')?.value || '').trim().slice(0, 50);
  if (small && !city) { flash('Add the city so the AI can pitch real places.'); return; }
  if (city) { try { localStorage.setItem('outta_city', city); } catch {} }
  const id = rid(10);
  const currency = CUR_CODES.includes($('#nt-cur')?.value) ? $('#nt-cur').value : myCur(); try { localStorage.setItem('outta_lastcur', currency); } catch {}
  const trip = { name: name.slice(0, 60), size: sz, city, currency, winStart: a, winEnd: b, nights: small ? 0 : +($('#nt-nights')?.value || SIZES[sz].nights), destinations: [], vibes: [], itinerary: [], lockedDates: null, lockedDest: null,
    mode: small ? 'friends' : (S.newMode || 'friends'), honoreeName: ($('#nt-honoree')?.value || '').trim().slice(0, 40), honoreeFree: true, people: { [S.uid]: true }, createdBy: S.uid, createdAt: Date.now() };
  try {
    await S.db.doc('trips/' + id).set(trip);
    const crew = S.crews.find(c => c.id === S.newCrew);
    await seedMembers(id, crew);
    S.newCrew = null; S.creating = null; S.newMode = null; S.newSize = null; S.fromCrewPage = false;
    openTrip(id, 'overview'); S.setup = { step: 0 };
  } catch (e) { flash(writeErr(e)); }
}

/* ---------- smart reminders ---------- */
// Only what needs you: your input, a decision that's ready, a deadline close by,
// something that changed since you last looked, a plan that starts tomorrow.
// You pick which kinds you want and can mute a plan. Nothing repeats once handled.
const REMIND_KINDS = [['input', 'When my input is needed'], ['decision', 'When a decision is ready'], ['deadline', 'Deadlines coming up'], ['change', 'When a plan changes'], ['soon', 'The day before a plan']];
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const remindPrefs = () => ({ input: true, decision: true, deadline: true, change: true, soon: true, ...lsGet('outta_remind', {}) });
const isMuted = tid => !!lsGet('outta_mute_' + tid, false);
// what a plan looked like the last time you had it open
const snapOf = t => ({ stage: stageOf(t), dest: (t.destinations || []).find(d => d.id === t.lockedDest)?.city || '', dates: t.lockedDates ? t.lockedDates.start + '|' + t.lockedDates.end : '', stay: t.stay?.name || '', time: t.time || '' });
function rememberSeen() {
  if (!S.trip || S.demo || !S.tid) return;
  const k = 'outta_seen_' + S.tid, now = snapOf(S.trip), old = lsGet(k, null);
  if (!old || JSON.stringify(old) !== JSON.stringify(now)) lsSet(k, now);
}
function changesOf(t) {
  const old = lsGet('outta_seen_' + t.id, null); if (!old) return [];
  const now = snapOf(t), out = [];
  if (now.dest && now.dest !== old.dest) out.push(`${isSmall(t) ? 'The plan' : 'Destination'} locked: ${now.dest}`);
  if (now.dates && now.dates !== old.dates) { const [a, b] = now.dates.split('|'); out.push(`${a === b ? 'Day' : 'Dates'} locked: ${dayRange(a, b)}`); }
  if (!now.dates && old.dates) out.push('The dates were reopened');
  if (now.stay && now.stay !== old.stay) out.push(`Stay picked: ${now.stay}`);
  if (now.time && now.time !== old.time) out.push(`Time set: ${t12(now.time)}`);
  if (!out.length && now.stage !== old.stage) out.push(`Now: ${STAGE_LABEL[now.stage]}`);
  return out;
}
function inbox() {
  const prefs = remindPrefs(), out = [];
  for (const t of myPlans()) {
    if (isMuted(t.id)) continue;
    const p = t.pulse || {}, st = stageOf(t), name = t.name, d = t.lockedDates;
    if (st === 'memories') continue;
    if (prefs.input && (p.who || []).includes(S.uid) && p.mine) out.push({ k: 'input', t, text: p.mine, w: 3 });
    else if (prefs.decision && p.k === 'decide' && (t.createdBy === S.uid || (t.orgs || {})[S.uid])) out.push({ k: 'decision', t, text: p.text, w: 2 });
    if (prefs.deadline && t.rsvpBy && t.rsvpBy >= TODAY && t.rsvpBy <= add(TODAY, 2) && (p.und || []).includes(S.uid)) out.push({ k: 'deadline', t, text: `Answer by ${t.rsvpBy === TODAY ? 'today' : fmt(t.rsvpBy)}`, w: 4 });
    if (prefs.soon && d && d.start === add(TODAY, 1)) out.push({ k: 'soon', t, text: `Tomorrow${t.time ? ' at ' + t12(t.time) : ''}`, w: 1 });
    const ln = prefs.change ? logNeeds(t) : [];
    if (ln.length) out.push({ k: 'change', t, text: ln.length === 1 ? ln[0].text : `${ln[0].text} · ${ln.length - 1} more change${ln.length === 2 ? '' : 's'}`, w: 2 });
    const ch = prefs.change && !ln.length ? changesOf(t) : [];
    if (ch.length) out.push({ k: 'change', t, text: ch.length === 1 ? ch[0] : `${ch[0]} · ${ch.length - 1} more change${ch.length === 2 ? '' : 's'}`, w: 0 });
  }
  return out.sort((a, b) => b.w - a.w);
}
const REMIND_ICON = { input: '●', decision: '◆', deadline: '⏳', change: '↻', soon: '★' };
function inboxCard() {
  const items = inbox();
  if (!items.length && !S.remindOpen) return '';
  return `<section class="card stack inbox">
    <div class="row" style="justify-content:space-between"><h2>Needs you${items.length ? ` <span class="count">${items.length}</span>` : ''}</h2><button class="linkbtn small muted" data-act="remindOpen">${S.remindOpen ? 'Done' : 'Settings'}</button></div>
    ${S.remindOpen ? remindSettings() : ''}
    ${items.length ? `<div class="inbox-list">${items.slice(0, 6).map(x => `<button class="inbox-i k-${x.k}" data-open="${esc(x.t.id)}"><span class="ib-ic" aria-hidden="true">${REMIND_ICON[x.k]}</span><span class="ib-t"><b>${esc(x.text)}</b><span class="small muted">${esc(x.t.name)}</span></span><span class="ib-go" aria-hidden="true">→</span></button>`).join('')}</div>`
      : '<span class="small muted">Nothing needs you right now.</span>'}
  </section>`;
}
function remindSettings() {
  const p = remindPrefs(), np = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return `<div class="stack remind-set" style="gap:8px">
    <span class="label">Tell me about</span>
    <div class="row" style="gap:6px">${REMIND_KINDS.map(([k, l]) => `<button class="chip ${p[k] ? 'on' : ''}" data-remind="${k}" aria-pressed="${p[k]}">${l}</button>`).join('')}</div>
    ${np === 'default' ? '<div><button class="btn sm" data-act="notifyAsk">Also show browser notifications</button></div>' : np === 'granted' ? '<span class="small muted">Browser notifications are on while the app is open.</span>' : np === 'denied' ? '<span class="small muted">Browser notifications are blocked for this site.</span>' : ''}
    <span class="small muted">Mute a single plan from its Settings.</span>
  </div>`;
}
// A quiet browser notification when a plan newly needs you, at most once per ask.
function notifyNew(trips) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !remindPrefs().input) return;
  const told = lsGet('outta_told', {});
  for (const t of trips) {
    const p = t.pulse; if (!p || !(p.who || []).includes(S.uid) || !p.mine || isMuted(t.id) || t.id === S.tid) continue;
    const key = t.id + '|' + p.mine; if (told[key]) continue;
    told[key] = Date.now();
    try { new Notification(t.name, { body: p.mine, tag: 'outta-' + t.id }); } catch {}
  }
  lsSet('outta_told', Object.fromEntries(Object.entries(told).filter(([, at]) => Date.now() - at < 30 * 864e5)));
}

/* ---------- per-size wording ---------- */
function draftNight() {
  const d = dates(); if (!d) return;
  const spots = (S.trip.spots?.items || []).map(s => s.name).join('; ');
  const prompt = `Plan ${size() === 'hangout' ? 'this evening' : 'this day out'} for a friend group: 3–5 stops with times, in order, close to each other.
${context()}
Spots the crew likes: ${spots || 'none yet, suggest real places'}
Reply with only JSON: {"items":[{"time":"HH:MM","title":"short title with the place name","kind":"food|activity|nightlife|chill","note":"one short line"}]}`;
  askAI('plan', prompt, data => {
    const items = (data?.items || []).filter(i => i && i.title).slice(0, 6).map(i => ({ id: rid(6), date: d.start, time: String(i.time || '').slice(0, 5), title: String(i.title).slice(0, 120), kind: i.kind || 'plan', note: String(i.note || '').slice(0, 200), ai: true }));
    if (!items.length) { flash('No plan came back. Try again.'); return; }
    return saveTrip({ itinerary: [...(S.trip.itinerary || []).filter(i => !i.ai), ...items] });
  });
}
const planWord = () => ({ hangout: 'hangout', day: 'day out', weekend: 'weekend', trip: 'trip' })[size()];
const SUPERS_SMALL = ['MVP of the night', 'Picked the best spot', 'Most likely to be late', 'First to leave', 'Last one standing', 'Best story of the night', 'Main character', 'Best dressed'];
const CHECKINS_SMALL = ['On my way', 'Here', 'Running late', 'Getting food', 'Heading home'];
const HYPES_SMALL = ['LET’S GOOO', 'Who’s driving?', 'Outfit check?', 'Running late lol'];
// story card for hangouts and days out: an event ticket instead of a boarding pass
async function makeEventCard() {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  try { await Promise.all(['900 120px Anybody', '600 40px "JetBrains Mono"', '700 40px Figtree'].map(f => document.fonts.load(f))); } catch {}
  const d = dates(), ds = dest(), cd = countdown(), t = S.trip, sz = SIZES[size()];
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0C0F21'); g.addColorStop(1, '#0B3B34'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(W * .8, H * .15, 0, W * .8, H * .15, 720); r.addColorStop(0, 'rgba(60,203,143,.45)'); r.addColorStop(1, 'rgba(60,203,143,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff'; x.font = CF(900, 60); x.fillText('OUTTA', 90, 180); let px = 90 + x.measureText('OUTTA').width; x.fillStyle = '#FF4FA3'; x.fillText('/', px, 180); px += x.measureText('/').width; x.fillStyle = '#fff'; x.fillText('HERE', px, 180);
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(70, 300, W - 140, 1160, 52); x.fill();
  const L = 140; x.fillStyle = '#6B7194'; x.font = CF(600, 30, 'mono'); x.fillText(`${sz.label.toUpperCase()} · ${(t.name || '').toUpperCase()}`.slice(0, 40), L, 410);
  const title = ds ? ds.city : t.name; x.fillStyle = '#151A33'; cfit(x, title, W - 2 * L, 120, 900); x.fillText(title, L, 560);
  const rows = [['WHEN', d ? fmt(d.start) + (t.time ? ' · ' + t12(t.time) : '') : 'TBD'], ['WHERE', t.venue || t.city || 'TBD'], ['CREW', S.members.filter(going).map(m => m.nick || 'Someone').join(' · ') || '—']];
  let y = 700; for (const [k, v] of rows) { x.fillStyle = '#6B7194'; x.font = CF(600, 30, 'mono'); x.fillText(k, L, y); x.fillStyle = '#151A33'; cfit(x, v, W - 2 * L, 54, 700, 'body'); x.fillText(v, L, y + 66); y += 170; }
  x.fillStyle = '#14915F'; x.font = CF(900, 110); x.fillText(cd && cd.n > 0 ? (cd.n === 1 ? 'TOMORROW' : `IN ${cd.n} DAYS`) : cd && cd.n === 0 ? 'TONIGHT' : 'SOON', L, 1330);
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = CF(700, 40, 'body'); x.fillText('Planned on Outta Here', 90, H - 130);
  c.toBlob(blob => { if (!blob) { flash('Couldn’t draw the card.'); return; } if (S.cardUrl) URL.revokeObjectURL(S.cardUrl); S.cardBlob = blob; S.cardUrl = URL.createObjectURL(blob); render(); }, 'image/png');
}

/* ---------- story card ---------- */
async function makeCard() {
  if (isSmall()) return makeEventCard();
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  try { await Promise.all(['900 120px Anybody', '600 40px "JetBrains Mono"', '700 40px Figtree'].map(f => document.fonts.load(f))); } catch {}
  const F = (w, s, fam) => `${w} ${s}px ${fam === 'mono' ? '"JetBrains Mono", monospace' : fam === 'body' ? 'Figtree, sans-serif' : 'Anybody, "Arial Narrow", sans-serif'}`;
  const fit = (ctx, text, max, size, w, fam) => { let s = size; do { ctx.font = F(w, s, fam); s -= 4; } while (ctx.measureText(text).width > max && s > 20); };
  const PINK = '#FF4FA3', INK = '#151A33', GREY = '#6B7194';
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0C0F21'); g.addColorStop(1, '#3A0B2C'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(W * .85, H * .12, 0, W * .85, H * .12, 760); r.addColorStop(0, 'rgba(255,79,163,.55)'); r.addColorStop(1, 'rgba(255,79,163,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H);
  x.font = F(900, 60); x.fillStyle = '#fff'; x.fillText('OUTTA', 90, 180); let px = 90 + x.measureText('OUTTA').width; x.fillStyle = PINK; x.fillText('/', px, 180); px += x.measureText('/').width; x.fillStyle = '#fff'; x.fillText('HERE', px, 180);

  const tw = W - 140, th = 1380, t = document.createElement('canvas'); t.width = tw; t.height = th; const y = t.getContext('2d');
  y.fillStyle = '#fff'; y.beginPath(); y.roundRect(0, 0, tw, th, 52); y.fill();
  const cut = 960;
  y.globalCompositeOperation = 'destination-out'; y.beginPath(); y.arc(0, cut, 44, 0, 7); y.arc(tw, cut, 44, 0, 7); y.fill(); y.globalCompositeOperation = 'source-over';
  y.strokeStyle = '#D5D8E6'; y.lineWidth = 4; y.setLineDash([18, 16]); y.beginPath(); y.moveTo(60, cut); y.lineTo(tw - 60, cut); y.stroke(); y.setLineDash([]);
  const L = 70, d = dates(), ds = dest(), hs = homes(), cd = countdown(), b = blend();
  y.fillStyle = GREY; y.font = F(600, 30, 'mono'); y.fillText('BOARDING PASS · GROUP TRIP', L, 110);
  y.fillStyle = INK; fit(y, S.trip.name, tw - 2 * L, 70, 800, 'body'); y.fillText(S.trip.name, L, 200);
  const from = hs.length === 0 ? 'HOME' : hs.length === 1 ? (isCode(hs[0]) ? hs[0].toUpperCase() : hs[0].toUpperCase().slice(0, 8)) : `${hs.length} CITIES`;
  const to = ds ? (ds.code ? ds.code.toUpperCase() : ds.city.toUpperCase()) : 'TBD';
  y.fillStyle = GREY; y.font = F(600, 28, 'mono'); y.fillText('FROM', L, 300); y.fillText('TO', tw / 2 + 40, 300);
  y.fillStyle = INK; fit(y, from, tw / 2 - L - 110, 190, 900); y.fillText(from, L, 470);
  y.fillStyle = PINK; fit(y, to, tw / 2 - L - 10, 190, 900); y.fillText(to, tw / 2 + 40, 470);
  y.font = F(900, 64); y.fillText('✈', tw / 2 - 60, 440);
  const cols = [['DATES', d ? `${short(d.start)} – ${short(d.end)}` : 'TBD'], ['NIGHTS', d ? String(nightsOf(d)) : String(S.trip.nights || '')], ['CREW', String(S.members.filter(going).length)]];
  const cx = [L, L + 540, L + 720];
  cols.forEach(([k, v], i) => { y.fillStyle = GREY; y.font = F(600, 28, 'mono'); y.fillText(k, cx[i], 600); y.fillStyle = INK; fit(y, v, (cx[i + 1] || tw - L) - cx[i] - 30, 46, 600, 'mono'); y.fillText(v, cx[i], 670); });
  if (ds) { y.fillStyle = GREY; y.font = F(600, 28, 'mono'); y.fillText('DESTINATION', L, 770); y.fillStyle = INK; fit(y, ds.city, tw - 2 * L, 60, 700, 'body'); y.fillText(ds.city, L, 840); }
  if (b) { y.fillStyle = PINK; fit(y, b.persona.toUpperCase(), tw - 2 * L, 44, 900); y.fillText(b.persona.toUpperCase(), L, 910); }
  if (cd && cd.n > 0) {
    y.fillStyle = PINK; y.font = F(900, 220); y.fillText(String(cd.n), L, 1200);
    const nw = y.measureText(String(cd.n)).width; y.fillStyle = INK; y.font = F(900, 70); y.fillText(cd.n === 1 ? 'DAY TO GO' : 'DAYS TO GO', L + nw + 30, 1190);
  } else { y.fillStyle = PINK; y.font = F(900, 120); y.fillText(cd ? cd.text.toUpperCase() : 'SOON', L, 1170); }
  const names = S.members.filter(going).map(m => m.nick || 'Someone').join(' · ');
  y.fillStyle = GREY; fit(y, names, tw - 2 * L, 34, 600, 'body'); y.fillText(names, L, 1290);
  x.drawImage(t, 70, 300);
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = F(700, 40, 'body'); x.fillText('Planned on Outta Here', 90, H - 130);
  c.toBlob(blob => { if (!blob) { flash('Couldn’t draw the card.'); return; } if (S.cardUrl) URL.revokeObjectURL(S.cardUrl); S.cardBlob = blob; S.cardUrl = URL.createObjectURL(blob); render(); }, 'image/png');
}
async function saveCard() {
  if (!S.downloads || !S.cardBlob) return;
  try { await S.downloads.save({ filename: (S.trip.name || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-story.png', data: S.cardBlob }); }
  catch (e) { if (e && e.code !== 'declined') flash('Couldn’t save the image here. Press and hold it instead.'); }
}

/* ---------- events ---------- */
app.addEventListener('click', e => {
  const t = e.target.closest('button,[data-open],[data-pin],[data-act]'); if (!t) return;
  const ds = t.dataset;
  if (ds.act === 'home') return goHome();
  if (ds.act === 'reloadView') { lastView = null; S.tab = 'overview'; return render(); }
  if (ds.act === 'remindOpen') { S.remindOpen = !S.remindOpen; return render(); }
  if (ds.remind) { const p = remindPrefs(); p[ds.remind] = !p[ds.remind]; lsSet('outta_remind', p); return render(); }
  if (ds.act === 'notifyAsk') { try { Notification.requestPermission().then(render); } catch {} return; }
  if (ds.act === 'theme') { const day = document.documentElement.dataset.theme !== 'light'; document.documentElement.dataset.theme = day ? 'light' : 'dark'; try { localStorage.setItem('outta_theme', day ? 'light' : 'dark'); } catch {} return render(); }
  if (ds.act === 'demo') return openDemo();
  if (ds.open) return openTrip(ds.open);
  if (ds.homedel) { S.confirmHome = ds.homedel; return render(); }
  if (ds.homeview) { homeMode = ds.homeview; try { localStorage.setItem('outta_homeview', homeMode); } catch {} return render(); }
  if (ds.calnav !== undefined) return calNav(+ds.calnav);
  if (ds.calday) { S.calDay = ds.calday; render(); if (matchMedia('(max-width:700px)').matches) $('.mcal + section')?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }); return; }
  if (ds.share) {
    const t = S.trips.find(x => x.id === ds.share); if (!t) return;
    const w = SIZES[sizeOf(t)].label.toLowerCase();
    S.shareHome = t.id;
    if (!canInvite(t)) { flash('Only organizers can invite people to this one.'); return; }
    return sendInvite(inviteText(t), linkFor(t), t.name).then(render);
  }
  if (ds.startcrew) return startNewPlan(ds.startcrew);
  if (ds.act === 'clearCrew') { S.newCrew = null; return render(); }
  if (ds.delcrew) { S.confirmCrew = ds.delcrew; return render(); }
  if (ds.act === 'delCrewCancel') { S.confirmCrew = null; return render(); }
  if (ds.delcrewdo) return once('delcrew', () => S.db ? S.db.doc('crews/' + ds.delcrewdo).delete().then(() => { S.confirmCrew = null; flash('Crew deleted. Its plans are kept.'); goHome(); }, e => flash(writeErr(e))) : null);
  if (ds.act === 'homeCancel') { S.confirmHome = null; return render(); }
  if (ds.homedo) return once('delete', () => deleteTrip(ds.homedo));
  if (ds.act === 'newTrip') return startNewPlan();
  if (ds.pickcrew !== undefined) { S.newCrew = ds.pickcrew || null; S.creating = 'size'; render(); window.scrollTo({ top: 0 }); return; }
  if (ds.size) { S.newSize = ds.size; S.creating = ['hangout', 'day'].includes(ds.size) ? 'form' : 'mode'; render(); window.scrollTo({ top: 0 }); return; }
  if (ds.act === 'backSize') { S.creating = 'size'; return render(); }
  if (ds.act === 'backCrew') { S.creating = 'crew'; return render(); }
  if (ds.act === 'newCrew') { S.crewView = null; S.creating = 'newCrew'; render(); setTimeout(() => $('#nc-name')?.focus(), 50); return; }
  if (ds.crew) return openCrew(ds.crew);
  if (ds.act === 'copyCrewInvite') { const c = S.crews.find(x => x.id === ds.cid); return sendInvite(crewInviteText(c), crewLink(ds.cid), c?.name || 'Outta Here'); }
  if (ds.mode) { S.newMode = ds.mode; S.creating = 'form'; render(); window.scrollTo({ top: 0 }); return; }
  if (ds.act === 'backModes') { S.creating = 'mode'; return render(); }
  if (ds.act === 'cancelNew') { S.creating = null; S.newCrew = null; S.newSize = null; return render(); }
  if (ds.sec) { const sec = sections().find(x => x.k === ds.sec); S.tab = S.secTab[ds.sec] || (ds.sec === 'live' && !isLive() && !S.secTab.live ? 'live' : sec.tabs[0][0]); S.tabPicked = true; S.show = null; clearInterval(showTimer); render(); window.scrollTo({ top: 0 }); return; }
  if (ds.tab) { if (ds.tab === 'wrapped' && S.tid) lsSet('outta_wrapped_' + S.tid, true); S.guideJump = !!ds.guide; S.tab = TAB_ALIAS[ds.tab] || ds.tab; S.secTab[secOf(S.tab).k] = S.tab; S.tabPicked = true; if (ds.tab !== 'recap') { S.show = null; clearInterval(showTimer); } render(); window.scrollTo({ top: 0 }); return; }
  if (ds.tpluse) { S.repeat = { tpl: ds.tpluse, cid: S.crewView || S.trip?.crewId }; render(); setTimeout(() => $('#repeat-box')?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }), 60); return; }
  if (ds.tpldel) { const cid = S.crewView || S.trip?.crewId; if (S.db && cid) S.db.doc('crews/' + cid).update({ templates: { [ds.tpldel]: null } }).then(() => flash('Template deleted.'), e => flash(writeErr(e))); return; }
  if (ds.act === 'repeatClose') { S.repeat = null; return render(); }
  { const cid = S.crewView || S.trip?.crewId;
    if (ds.dnaedit) { S.dnaEdit = ds.dnaedit; render(); setTimeout(() => $('#dna-fix-' + ds.dnaedit)?.focus(), 50); return; }
    if (ds.dnahide) return dnaSave(cid, { hidden: { [ds.dnahide]: true } });
    if (ds.dnashow) return dnaSave(cid, { hidden: { [ds.dnashow]: null } });
    if (ds.dnareset) { S.dnaEdit = null; return dnaSave(cid, { fix: { [ds.dnareset]: null } }); }
    if (ds.dnaforget) { flash('Forgotten. It won’t shape new pitches.'); return dnaSave(cid, { forget: { [ds.dnaforget]: true } }); }
    if (ds.dnanote) return dnaSave(cid, { notes: { [ds.dnanote]: null } }); }
  if (ds.act === 'repeatGo') return once('repeat', repeatGo);
  if (ds.ack) return ackChange(ds.ack);
  if (ds.undo) return undoChange(ds.undo);
  if (ds.act === 'ackAll') return saveTrip({ changes: Object.fromEntries(logList().filter(x => needsMe(x)).map(x => [x.id, { seen: { [S.uid]: true } }])) });
  if (!S.trip) return;
  if (ds.jgo) return jGo(ds.jgo);
  if (ds.jnudge) return jNudge(ds.jnudge);
  if (ds.act === 'repeatOpen') { S.repeat = {}; render(); setTimeout(() => $('#repeat-box')?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }), 60); return; }
  if (ds.act === 'tplSave') return once('tpl', saveTemplate);
  if (ds.act === 'applyOutline') return applyOutline();
  if (ds.act === 'dropOutline') return saveTrip({ itinTpl: null });
  if (ds.status) return setStatus(ds.status);
  if (ds.act === 'rsvpNudge') return rsvpNudge();
  if (ds.act === 'rsvpCountOut') return rsvpCountOut();
  if (ds.act === 'rsvpClear') return saveTrip({ rsvpBy: null });
  if (ds.budget) { saveMe({ budget: +ds.budget }); delete DRAFT['me-budget']; return; }
  if (ds.act === 'setupNext') return setupGo(1);
  if (ds.act === 'setupBack') return setupGo(-1);
  if (ds.act === 'setupLater') { setupSave(); S.setup = null; S.tab = 'overview'; render(); window.scrollTo({ top: 0 }); flash('No problem. Finish it any time in Home › Crew.'); return; }
  if (ds.join) return joinPlan(ds.join);
  if (ds.runoff) { const ro = runoffState(); if (!ro || ro.winner) return; return saveTrip({ roVotes: { [ro.key]: { [S.uid]: ds.runoff } } }); }
  if (ds.act === 'startRunoff') return startRunoff();
  if (ds.act === 'endRunoff') return saveTrip({ runoff: null });
  if (ds.act === 'nudgeSwipe') return sendInvite(`Swipe on our ${planWord()} options for ${S.trip.name}. We’re waiting on you!`, inviteLink(), S.trip.name);
  if (ds.day) {
    const days = new Set(meDoc()?.days || []), pref = new Set(meDoc()?.pref || []), d = ds.day;
    if (!days.has(d)) days.add(d); else if (!pref.has(d)) pref.add(d); else { days.delete(d); pref.delete(d); }
    return saveMe({ days: [...days].sort(), pref: [...pref].filter(x => days.has(x)).sort() });
  }
  if (ds.taskdone) { const x = (S.trip.tasks || {})[ds.taskdone]; if (x) { patchTask(ds.taskdone, { done: !x.done, doneBy: x.done ? '' : S.uid }); if (!x.done) flash(`Done: ${x.title}`); } return; }
  if (ds.taketask) return patchTask(ds.taketask, { owner: S.uid });
  if (ds.deltask) return saveTrip({ tasks: { [ds.deltask]: null } });
  if (ds.taskidea) return addTask(ds.taskidea);
  if (ds.recover !== undefined) { S.recover = ds.recover || null; S.rc = null; S.alts = null; render(); if (S.recover) setTimeout(() => $('#recover-box')?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }), 60); return; }
  if (ds.act === 'recoverApply' || ds.act === 'recoverDrop') { const ch = draftChange(); if (ch) applyChange(ch, readRcActs()); return; }
  if (ds.check) return saveTrip({ check: { votes: { [S.uid]: ds.check } } });
  if (ds.act === 'checkClose') return saveTrip({ check: null });
  if (ds.act === 'recoverAlts') return recoverAlts();
  if (ds.swapin !== undefined) { const o = S.alts?.options?.[+ds.swapin]; if (o) swapItem(o.title); return; }
  if (ds.act === 'linkReset') return saveTrip({ inviteKey: rid(6), invitesOff: false }).then(ok => ok && flash('New link made. Old invite links stop working for people who haven’t joined.'));
  if (ds.act === 'linkToggle') { const off = !S.trip.invitesOff; return saveTrip({ invitesOff: off }).then(ok => ok && flash(off ? 'Invites are off. Nobody new can join.' : 'Invites are back on.')); }
  if (ds.rmmember) { S.confirmRm = ds.rmmember; return render(); }
  if (ds.act === 'rmCancel') { S.confirmRm = null; return render(); }
  if (ds.rmdo) return removeMember(ds.rmdo);
  if (ds.mkorg) { const on = !(S.trip.orgs || {})[ds.mkorg]; return saveTrip({ orgs: { [ds.mkorg]: on || null } }).then(ok => ok && flash(on ? 'Now an organizer.' : 'No longer an organizer.')); }
  if (ds.act === 'passportImg') return makePassportImg();
  if (ds.nightvote) { const cur = (S.trip.nightVotes || {})[S.uid]; return saveTrip({ nightVotes: { [S.uid]: cur === ds.nightvote ? null : ds.nightvote } }); }
  if (ds.act === 'nextPlan') return S.trip.crewId ? startNewPlan(S.trip.crewId) : (goHome(), startNewPlan());
  if (ds.act === 'wiAdd') { S.whatif = [...(S.whatif || [{}]), {}]; return render(); }
  if (ds.wirm !== undefined) { const l = (S.whatif || [{}]).filter((_, j) => j !== +ds.wirm); S.whatif = l.length ? l : [{}]; return render(); }
  if (ds.wiapply !== undefined) return whatifApply(+ds.wiapply);
  if (ds.act === 'costAI') return estimateCosts();
  if (ds.costkeep) { const h = costHints()[ds.costkeep]; if (h) saveTrip({ costs: { [ds.costkeep]: { low: h.low, high: h.high, src: h.src, note: h.note, by: S.uid, at: Date.now() } } }); return; }
  if (ds.flex) { const f = { ...(meDoc()?.flex || {}) }; f[ds.flex] = !f[ds.flex]; return saveMe({ flex: f }, true); }
  if (ds.act === 'allDays') return saveMe({ days: span(S.trip.winStart, S.trip.winEnd) }, true);
  if (ds.act === 'noDays') return saveMe({ days: [], pref: [] }, true);
  if (ds.act === 'weekends') return saveMe({ days: span(S.trip.winStart, S.trip.winEnd).filter(x => [0, 5, 6].includes(D(x).getUTCDay())) }, true);
  if ((ds.lockdates || ds.lockdest || ds.lockpitch) && !canLock()) { flash('Only organizers can lock this one. Your vote still counts.'); return; }
  if (ds.lockdates || ds.lockdest || ds.lockpitch) { const g = lockGate(ds.lockpitch ? 'pitch' : ds.lockdest ? 'dest' : 'dates', ds.lockpitch || ds.lockdest || ds.lockdates); if (!g.ok) { flash(g.why); return; } }
  if (ds.consent) return toggleConsent(ds.consent);
  if (ds.need) { const [sec, k] = ds.need.split('|'); return toggleNeed(sec, k); }
  if (ds.decide) { if (!isOrganizer() || ds.decide === decideOf().style) return; return saveTrip(withLog({ decide: { style: ds.decide, ...(ds.decide === 'pick' && !decideOf().by ? { by: add(TODAY, 3) } : {}) } }, { area: 'rules', text: `How we decide: ${STYLES[ds.decide][0]}`, act: 'all', undo: { k: 'set', patch: { decide: { style: decideOf().style } } } })); }
  if (ds.lockdates) { const [start, end] = ds.lockdates.split('|'); return saveTrip(withLog({ lockedDates: { start, end } }, { area: 'dates', text: `${start === end ? 'Day' : 'Dates'} locked: ${dayRange(start, end)}`, act: 'all', undo: { k: 'set', patch: { lockedDates: S.trip.lockedDates || null } } })); }
  if (ds.act === 'unlockDates') return saveTrip(withLog({ lockedDates: null }, { area: 'dates', text: 'Dates unlocked', act: 'all', undo: { k: 'set', patch: { lockedDates: S.trip.lockedDates || null } } }));
  if (ds.vote) { const set = new Set(meDoc()?.votes || []); set.has(ds.vote) ? set.delete(ds.vote) : set.add(ds.vote); return saveMe({ votes: [...set] }, true); }
  if (ds.lockdest) return saveTrip(withLog({ lockedDest: ds.lockdest }, { area: 'dest', text: `${isSmall() ? 'Plan' : 'Destination'} locked: ${(S.trip.destinations || []).find(x => x.id === ds.lockdest)?.city || ''}`, act: 'all', undo: { k: 'set', patch: { lockedDest: S.trip.lockedDest || null } } }));
  if (ds.act === 'unlockDest') return saveTrip(withLog({ lockedDest: null }, { area: 'dest', text: `${dest()?.city || 'Destination'} unlocked`, act: 'all', undo: { k: 'set', patch: { lockedDest: S.trip.lockedDest || null } } }));
  if (ds.deldest) return saveTrip({ destinations: (S.trip.destinations || []).filter(x => x.id !== ds.deldest), ...(S.trip.lockedDest === ds.deldest ? { lockedDest: null } : {}) });
  if (ds.vibe) { const set = new Set(S.trip.vibes || []); set.has(ds.vibe) ? set.delete(ds.vibe) : set.add(ds.vibe); return saveTrip({ vibes: [...set] }); }
  if (ds.act === 'card') return makeCard();
  if (ds.act === 'genPitches') return genPitches();
  if (ds.act === 'growPlan') return growPlan();
  if (ds.setsize) { const k = ds.setsize, small = ['hangout', 'day'].includes(k), n = small ? 0 : (isSmall() ? SIZES[k].nights : nightsSet(S.trip)); return saveTrip({ size: k, nights: n, ...(n !== nightsSet(S.trip) ? { lockedDates: null } : {}), ...(S.trip.winEnd < add(TODAY, SIZES[k].win) ? { winEnd: add(TODAY, SIZES[k].win) } : {}) }); }
  if (ds.act === 'copyInvite') return sendInvite(inviteText(S.trip), inviteLink(), S.trip.name);
  if (ds.setnights) return saveTrip({ nights: +ds.setnights, lockedDates: null });
  if (ds.act === 'ciJump') return jumpTo('#ci-text');
  if (ds.act === 'meetJump') return jumpTo('#meet-where');
  if (ds.pin) { S.pinSel = S.pinSel === ds.pin ? null : ds.pin; return render(); }
  if (ds.act === 'pinPlaces') return pinPlaces();
  if (ds.act === 'lostOpen') { S.lostOpen = true; return render(); }
  if (ds.act === 'lostClose') { S.lostOpen = false; return render(); }
  if (ds.lostat) return sendLost(ds.lostat);
  if (ds.found) return foundLost(ds.found);
  if (ds.hang) { const n = +ds.hang, day = isLive() ? TODAY : dates()?.start, cur = ((S.trip.hangover || {})[day] || {})[S.uid]; return saveTrip({ hangover: { [day]: { [S.uid]: cur === n ? 0 : n } } }); }
  if (ds.act === 'hangPlan') return hangPlan(isLive() ? TODAY : dates()?.start);
  if (ds.act === 'hangApply') return applyHang();
  if (ds.act === 'hangCancel') { S.hangPlan = null; return render(); }
  if (ds.act === 'writeRecap') return writeRecap(ds.day);
  if (ds.act === 'findStays') return findStays();
  if (ds.lockstay !== undefined) { if (!canLock()) { flash('Only organizers can lock this one. Your vote still counts.'); return; } const it = S.trip.stays?.items?.[+ds.lockstay]; if (it) return setStay({ ...it }).then(ok => ok && flash(`Locked ${it.name} as your stay.`)); return; }
  if (ds.act === 'unlockStay') return saveTrip(withLog({ stay: null }, { area: 'stay', text: `Stay unlocked: ${S.trip.stay?.name || ''}`, act: 'all', undo: { k: 'set', patch: { stay: S.trip.stay }, clear: ['stay'] } }));
  if (ds.act === 'addStayOpen') { S.addStay = true; render(); setTimeout(() => $('#os-url')?.focus(), 60); return; }
  if (ds.act === 'addStayClose') { S.addStay = false; return render(); }
  if (ds.lockown) { if (!canLock()) { flash('Only organizers can lock this one. Your vote still counts.'); return; } const s = (S.trip.myStays || {})[ds.lockown]; if (s) return setStay(stayFromOwn(ds.lockown, s)).then(ok => ok && flash(`Locked ${s.name} as your stay.`)); return; }
  if (ds.delown) return saveTrip({ myStays: { [ds.delown]: null } });
  if (ds.delspend) return saveMySpend((S.mySpend || []).filter(x => x.id !== ds.delspend));
  if (ds.delpot) return delSub('pot', ds.delpot);
  if (ds.act === 'copyPot') { const ins = S.pot.filter(p => p.kind === 'in'), tin = ins.reduce((a, p) => a + p.amount, 0), bal = tin - S.pot.filter(p => p.kind === 'out').reduce((a, p) => a + p.amount, 0); return copy(`Pot check! Only ${money2(bal)} left in the ${S.trip.name} pot. Chip in about $30 each to ${nameOf(S.trip.potKeeper || S.trip.createdBy)} so the Ubers keep coming.`); }
  if (ds.act === 'wrapNext') { S.wrapI = (S.wrapI || 0) + 1; return render(); }
  if (ds.act === 'wrapPrev') { S.wrapI = Math.max(0, (S.wrapI || 0) - 1); return render(); }
  if (ds.act === 'wrappedCard') return makeWrappedCard();
  if (ds.setmode) { S.wrapI = 0; return saveTrip({ mode: ds.setmode }); }
  if (ds.reveal) { const it = (S.trip.itinerary || []).map(i => i.id === ds.reveal ? { ...i, revealed: true } : i); flash('Surprise revealed.'); return saveTrip({ itinerary: it }); }
  if (ds.swipe) { const [pid, v] = ds.swipe.split('|'); return swipe(pid, +v); }
  if (ds.lockpitch) return lockPitch(ds.lockpitch);
  if (ds.checkin) { const c = { text: ds.checkin, at: Date.now() }; return saveMe({ checkin: c, checkins: [...(meDoc()?.checkins || []), c].slice(-40) }, true); }
  if (ds.act === 'clearMeet') return saveTrip(withLog({ meet: null }, { area: 'meet', text: 'Meeting point cleared', act: 'all', undo: { k: 'set', patch: { meet: S.trip.meet } } }));
  if (ds.hype) return postFeed(ds.hype);
  if (ds.delfeed) return delSub('feed', ds.delfeed);
  if (ds.bkdone) { const it = S.bucket.find(x => x.id === ds.bkdone); if (!it) return; const s2 = new Set(it.doneBy || []); const da = { ...(it.doneAt || {}) }; if (s2.has(S.uid)) { s2.delete(S.uid); delete da[S.uid]; } else { s2.add(S.uid); da[S.uid] = Date.now(); } return putSub('bucket', it.id, { doneBy: [...s2], doneAt: da }, true); }
  if (ds.delbk) return delSub('bucket', ds.delbk);
  if (ds.super) { const [k, id] = ds.super.split('|'); const cur = ((S.trip.superVotes || {})[k] || {})[S.uid]; return saveTrip({ superVotes: { [k]: { [S.uid]: cur === id ? '' : id } } }); }
  if (ds.act === 'awardsCard') return makeAwards();
  if (ds.act === 'collage') return makeCollage();
  if (ds.act === 'saveImg') return saveImg();
  if (ds.act === 'closeImg') { S.img = null; return render(); }
  if (ds.show !== undefined) return openShow(+ds.show);
  if (ds.act === 'showClose') return closeShow();
  if (ds.act === 'showNext') { S.show = (S.show + 1) % S.photos.length; return openShow(S.show); }
  if (ds.act === 'showPrev') { S.show = (S.show - 1 + S.photos.length) % S.photos.length; return openShow(S.show); }
  if (ds.delphoto) return delPhoto(ds.delphoto);
  if (ds.act === 'syncCrew') { const c = S.crews.find(x => x.id === S.trip.crewId); return saveCrew(c ? c.name : S.trip.name); }
  if (ds.qrunoff) { const [k, v] = ds.qrunoff.split('|'); const cur = (meDoc()?.runoff || {})[k]; return saveMe({ runoff: { ...(meDoc()?.runoff || {}), [k]: cur === v ? '' : v } }, true); }
  if (ds.act === 'delTicket') return delTicket();
  if (ds.act === 'askDelete') { S.confirm = 'delete'; return render(); }
  if (ds.act === 'askLeave') { S.confirm = 'leave'; return render(); }
  if (ds.act === 'cancelConfirm') { S.confirm = null; return render(); }
  if (ds.act === 'doDelete') return once('delete', () => deleteTrip(S.tid));
  if (ds.act === 'doLeave') return leaveTrip();
  if (ds.act === 'closeCard') { S.cardUrl = null; S.cardBlob = null; return render(); }
  if (ds.act === 'saveCard') return saveCard();
  if (ds.act === 'copyNudge') {
    const lines = nudges().map(x => `• ${x.m.nick || 'Someone'}: ${x.todo.join(', ')}`);
    return copy(`${S.trip.name} check-in! We're close, just need:\n${lines.join('\n')}\n\nTakes 2 minutes. Open Outta Here and knock it out.`);
  }
  if (ds.quiz) { const [k, v] = ds.quiz.split('|'); return saveMe({ quiz: { ...(meDoc()?.quiz || {}), [k]: v } }, true); }
  if (ds.react) { const [key, v] = ds.react.split('|'); const nv = score(key).mine === +v ? 0 : +v; return saveTrip({ reactions: { [key]: { [S.uid]: nv } } }); }
  if (ds.split) { const s = new Set(S.split || active().map(m => m.id)); s.has(ds.split) ? s.delete(ds.split) : s.add(ds.split); S.split = s; return render(); }
  if (ds.delexp) return delSub('expenses', ds.delexp);
  if (ds.claim) return putSub('packing', ds.claim, { claimedBy: S.uid }, true);
  if (ds.unclaim) return putSub('packing', ds.unclaim, { claimedBy: null }, true);
  if (ds.pack) { const s = new Set(meDoc()?.packed || []); s.has(ds.pack) ? s.delete(ds.pack) : s.add(ds.pack); return saveMe({ packed: [...s] }); }
  if (ds.delpack) return delSub('packing', ds.delpack);
  if (ds.act === 'pack') return buildPacking();
  if (ds.act === 'spots') return findSpots();
  if (ds.act === 'deals') return findDeals();
  if (ds.act === 'plan') return draftPlan();
  if (ds.act === 'clearAI') return saveTrip({ itinerary: (S.trip.itinerary || []).filter(i => !i.ai) });
  if (ds.addspot) {
    const s = S.trip.spots.items[+ds.addspot], d = dates(); if (!s || !d) return;
    const days = span(d.start, d.end).slice(0, -1);
    const pref = days.find(x => (s.bestNight || '').toLowerCase().startsWith(dow(x).toLowerCase())) || days[0] || d.start;
    flash(`Added ${s.name} to ${fmt(pref)}`);
    return saveTrip({ itinerary: [...(S.trip.itinerary || []), { id: rid(6), date: pref, time: s.type === 'late-night food' ? '01:30' : '22:30', title: s.name, kind: 'nightlife', note: s.why || '' }] });
  }
  if (ds.delitem) { const it = (S.trip.itinerary || []).find(i => i.id === ds.delitem); if (!it) return; return saveTrip(withLog({ itinerary: (S.trip.itinerary || []).filter(i => i.id !== ds.delitem) }, { area: 'plan', text: `${it.title} removed from the plan`, act: it.secret ? '' : 'all', undo: { k: 'item', item: it } })); }
  if (ds.edititem) { S.editItem = ds.edititem; render(); setTimeout(() => $('#ei-time')?.focus(), 50); return; }
  if (ds.act === 'editItemCancel') { S.editItem = null; return render(); }
});
app.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'me-nick') saveMe({ nick: e.target.value.trim().slice(0, 30) }, true, true);
  if (/^cost-(low|high|src)-/.test(id)) saveCostLine(id.replace(/^cost-(low|high|src)-/, ''));
  { const w = id.match(/^wi-(start|nights|dest|stay)-(\d)$/); if (w) whatifSet(+w[2], { [w[1]]: w[1] === 'nights' ? +e.target.value : e.target.value || undefined }); }
  { const rk = { 'recover-who': 'who', 'recover-item': 'item', 'rc-line': 'line', 'rc-amount': 'amount', 'rc-start': 'start', 'rc-end': 'end', 'rc-reopen': 'reopen' }[id];
    if (rk) { S.rc = { ...(S.rc || {}), acts: readRcActs(), [rk]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }; if (rk === 'item') S.alts = null; if (rk === 'start' && !S.rc.end && S.trip.lockedDates) { const L = S.trip.lockedDates; S.rc.end = add(e.target.value, span(L.start, L.end).length - 1); } delete DRAFT[id]; render(); } }
  if (id.startsWith('rc-act-')) S.rc = { ...(S.rc || {}), acts: readRcActs() };
  if (id === 'mute-plan') { lsSet('outta_mute_' + S.tid, e.target.checked); flash(e.target.checked ? 'Muted. It won’t show up in Needs you.' : 'Reminders are back on for this plan.'); }
  if (id === 'perm-invite' || id === 'perm-lock') saveTrip({ perm: { [id.slice(5)]: e.target.value } });
  if (id === 'me-budgetPublic') saveMe({ budgetPublic: e.target.checked }, true, true);
  if (id.startsWith('nd-share-')) setNeed({ share: { ...(needsOf(meDoc() || {}).share || {}), [id.slice(9)]: e.target.value } });
  if (['nd-dietNote', 'nd-accessNote', 'nd-depart', 'nd-arrive', 'nd-maxTravel'].includes(id)) { setNeed({ [id.slice(3)]: id === 'nd-maxTravel' ? +e.target.value : e.target.value.trim().slice(0, 80) }); delete DRAFT[id]; }
  if (id === 'nd-noRedeye' || id === 'nd-noFly') setNeed({ [id.slice(3)]: e.target.checked });
  if (id === 'dec-pct') saveTrip({ decide: { pct: +e.target.value } });
  if (id === 'dec-by') saveTrip({ decide: { by: e.target.value || '' } });
  if (id === 'me-hardBudget') saveMe({ hard: { ...(meDoc()?.hard || {}), budget: e.target.checked } }, true);
  if (id === 'me-hardDays') saveMe({ hard: { ...(meDoc()?.hard || {}), days: e.target.checked } }, true);
  if (id === 'me-condUnder' || id === 'me-condNote') { const u = Math.max(0, Math.round(+$('#me-condUnder').value || 0)), note = $('#me-condNote').value.trim().slice(0, 80); saveMe({ cond: u || note ? { under: u, note } : null }, true); }
  if (id === 'me-hideLoc') saveMe({ hideLoc: e.target.checked }, true, true);
  if (id === 'my-flight-price') { const v = Math.round(+e.target.value || 0); if (v > 0) saveTrip({ tickets: { [S.uid]: { price: v } } }).then(ok => ok && flash('Got it. Your flight is in the cost now.')); }
  if (id === 'set-cur' && CUR_CODES.includes(e.target.value)) { saveTrip(withLog({ currency: e.target.value }, { area: 'money', text: `Currency changed to ${e.target.value}`, undo: { k: 'set', patch: { currency: cur() } } })); flash(`Now in ${e.target.value}. Amounts already typed in weren’t converted.`); }
  if (id === 'my-cur' && CUR_CODES.includes(e.target.value)) { try { localStorage.setItem('outta_mycur', e.target.value); } catch {} render(); }
  if (id === 'cost-buffer') saveTrip({ costBuffer: +e.target.value });
  if (id.startsWith('task-owner-')) patchTask(id.slice(11), { owner: e.target.value });
  if (id.startsWith('task-due-')) patchTask(id.slice(9), { due: e.target.value });
  if (id === 'rsvp-by') saveTrip({ rsvpBy: e.target.value || null });
  if (id === 'me-home') saveMe({ home: e.target.value.trim().slice(0, 40) }, true, true);
  if (id === 'me-budget') saveMe({ budget: Math.max(0, Math.round(+e.target.value || 0)) }, true, true);
  if (id === 'ph-files') { const files = [...e.target.files]; e.target.value = ''; once('photos-up', () => uploadPhotos(files)); return; }
  if (id === 'set-honoree') { saveTrip({ honoree: e.target.value || null }); return; }
  if (id === 'set-free') { saveTrip({ honoreeFree: e.target.checked }); return; }
  if (id === 'pot-keeper') { saveTrip({ potKeeper: e.target.value }); return; }
  if (id === 'tk-file') { S.tkFile = e.target.files[0] || null; render(); }
  if (id === 'me-venmo') saveMe({ venmo: handle(e.target.value).slice(0, 40) }, true, true);
  if (id === 'me-cash') saveMe({ cashapp: handle(e.target.value).slice(0, 40) }, true, true);
  if (id === 'nights') saveTrip({ nights: +e.target.value, lockedDates: null });
  if (id === 'win-start' || id === 'win-end') {
    delete DRAFT['win-start']; delete DRAFT['win-end'];
    let a = $('#win-start').value, b = $('#win-end').value;
    if (!a || !b) return;
    if (b < a) { flash('The latest date has to be after the earliest one.'); render(); return; }
    if (span(a, b).length >= 92) { b = add(a, 90); flash('The window can be up to 3 months, so the end moved to ' + short(b) + '.'); }
    const patch = { winStart: a, winEnd: b }, L = S.trip.lockedDates;
    if (L && (L.start < a || L.end > b)) { patch.lockedDates = null; flash('Your locked dates were outside the new window, so they’re unlocked.'); }
    saveTrip(patch);
    return;
  }
  if (id.startsWith('me-') || id === 'nights') delete DRAFT[id];
});
// Escape closes whatever is open on top (a sheet, a confirmation, an inline editor) and
// puts focus back on the button that opened it.
let opener = null;
app.addEventListener('click', e => { const b = e.target.closest('button'); if (b) opener = b; }, true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const layers = [
    [S.lostOpen, () => { S.lostOpen = false; }], [S.show !== null && S.show !== undefined, () => { S.show = null; clearInterval(showTimer); }],
    [S.confirmCrew, () => { S.confirmCrew = null; }], [S.confirmHome, () => { S.confirmHome = null; }], [S.confirm, () => { S.confirm = null; }], [S.confirmRm, () => { S.confirmRm = null; }],
    [S.editItem, () => { S.editItem = null; }], [S.repeat, () => { S.repeat = null; }], [S.recover, () => { S.recover = null; S.rc = null; }],
    [S.addStay, () => { S.addStay = false; }], [S.remindOpen, () => { S.remindOpen = false; }], [S.dnaEdit, () => { S.dnaEdit = null; }],
  ];
  const top = layers.find(([on]) => on); if (!top) return;
  e.preventDefault(); top[1](); render();
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
});
app.addEventListener('keydown', e => { const p = e.target.closest && e.target.closest('[data-pin]'); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); p.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
// swipe left/right on a phone to move between the tabs of a menu
let swipe0 = null;
app.addEventListener('touchstart', e => {
  swipe0 = null;
  if (!S.tid || e.touches.length !== 1 || e.target.closest('input,textarea,select,.pitch,.map,.subtabs,.wslide,.show,.sheet,.cal,.feed,.board,.photos')) return;
  swipe0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
}, { passive: true });
app.addEventListener('touchend', e => {
  if (!swipe0) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe0.x, dy = t.clientY - swipe0.y, quick = Date.now() - swipe0.at < 600;
  swipe0 = null;
  if (!quick || Math.abs(dx) < 80 || Math.abs(dy) > 50) return;
  const sec = secOf(S.tab), i = sec.tabs.findIndex(x => x[0] === S.tab), j = i + (dx < 0 ? 1 : -1);
  if (i < 0 || j < 0 || j >= sec.tabs.length) return;
  S.tab = sec.tabs[j][0]; S.secTab[sec.k] = S.tab; S.tabPicked = true;
  render(); window.scrollTo({ top: 0 });
}, { passive: true });
// opening an invite link while the app is already open only changes the #code, so watch for it
window.addEventListener('hashchange', () => { const h = (location.hash || '').slice(1); if (!S.db) return; const cm = h.match(/^c-([a-z0-9]{6,20})$/); if (cm && cm[1] !== S.crewView) return joinCrew(cm[1]); const th = parseTripHash(h); if (th && th.key) S.linkKey = th.key; if (th && th.tid !== S.tid) return openTrip(th.tid); if (/^[a-z0-9]{6,20}$/.test(h) && h !== S.tid) openTrip(h); });
let lastDown = null;
app.addEventListener('pointerdown', e => { const f = e.target.closest && e.target.closest('input,textarea,select'); lastDown = f && f.id ? { id: f.id, at: Date.now() } : null; }, true);
// keep half-typed text when someone else's change re-renders the page
const DRAFT = {};
app.addEventListener('input', e => { if (e.target.id && e.target.type !== 'file') DRAFT[e.target.id] = e.target.value; });
const clearDrafts = f => f.querySelectorAll('[id]').forEach(el => delete DRAFT[el.id]);
app.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  clearDrafts(f);
  if (f.id === 'newTrip') return once('create', createTrip);
  if (f.id === 'newCrewForm') { const n = $('#nc-name').value.trim(); if (n) return once('crew', () => createCrew(n)); return; }
  if (f.id === 'dnaNote') { const text = $('#dna-note').value.trim().slice(0, 80); if (!text) return; $('#dna-note').value = ''; return dnaSave(S.crewView || S.trip?.crewId, { notes: { [rid(6)]: { text, by: S.uid, at: Date.now() } } }); }
  if (f.classList.contains('dna-fix')) { const k = f.dataset.k, v = ($('#dna-fix-' + k)?.value || '').trim().slice(0, 50); S.dnaEdit = null; render(); return dnaSave(S.crewView || S.trip?.crewId, { fix: { [k]: v || null } }); }
  if (f.id === 'tkForm') return once('ticket-send', sendTicket);
  if (f.id === 'swapForm') return swapItem($('#swap-title').value);
  if (f.id === 'ownStayForm') return addOwnStay(e.submitter?.dataset.how === 'lock');
  if (f.id === 'stayBookForm') { const v = Math.max(0, Math.round(+($('#sb-total')?.value || 0))); return saveTrip({ stay: { booked: true, bookedBy: S.uid, bookedAt: Date.now(), ...(v ? { total: v } : {}) } }).then(ok => ok && flash('Stay marked as booked.')); }
  if (f.id === 'addTask') { addTask($('#task-title').value); $('#task-title').value = ''; return; }
  if (f.id === 'lostForm') return sendLost($('#lost-where').value);
  if (f.id === 'spendForm') { const note = $('#sp-note').value.trim(), amount = Math.round(+$('#sp-amt').value * 100) / 100; if (!note || !(amount > 0)) return; return saveMySpend([...(S.mySpend || []), { id: rid(6), note: note.slice(0, 50), amount, at: Date.now() }]); }
  if (f.id === 'potIn') { const amount = Math.round(+$('#pi-amt').value * 100) / 100; if (!(amount > 0)) return; return putSub('pot', rid(8), { kind: 'in', by: $('#pi-by').value, amount, note: '', at: Date.now() }); }
  if (f.id === 'potOut') { const amount = Math.round(+$('#po-amt').value * 100) / 100, note = $('#po-note').value.trim(); if (!(amount > 0) || !note) return; return putSub('pot', rid(8), { kind: 'out', by: S.uid, amount, note: note.slice(0, 50), at: Date.now() }); }
  if (f.id === 'arrForm') {
    const arrive = $('#arr-time').value, apt = $('#arr-apt').value.trim();
    if (!arrive) { flash('Add when you land.'); return; }
    return saveMe({ arrive, arrAirport: isCode(apt) ? apt.toUpperCase() : apt.slice(0, 3).toUpperCase(), flight: $('#arr-flight').value.trim().slice(0, 20) }, true);
  }
  if (f.id === 'editItemForm') return saveItemEdit(f.dataset.id);
  if (f.id === 'meetForm') { const text = $('#meet-where').value.trim(), time = $('#meet-time').value; if (!text) return; const old = S.trip.meet; return saveTrip(withLog({ ...(old ? { meet: null } : {}) }, { area: 'meet', text: `Meet ${old ? 'moved to' : 'at'} ${text.slice(0, 80)}${time ? ', ' + t12(time) : ''}`, act: 'all', undo: { k: 'set', patch: { meet: old || null }, clear: ['meet'] } })).then(() => saveTrip({ meet: { text: text.slice(0, 80), time, by: S.uid, at: Date.now() } })); }
  if (f.id === 'ciForm') { const text = $('#ci-text').value.trim(); if (!text) return; const c = { text: text.slice(0, 60), at: Date.now() }; return saveMe({ checkin: c, checkins: [...(meDoc()?.checkins || []), c].slice(-40) }, true); }
  if (f.id === 'feedForm') return postFeed($('#fd-text').value, $('#fd-secret')?.checked);
  if (f.id === 'bkForm') { const text = $('#bk-text').value.trim(); if (!text) return; return putSub('bucket', rid(8), { text: text.slice(0, 80), points: +$('#bk-pts').value || 1, doneBy: [], by: S.uid, at: Date.now() }); }
  if (f.id === 'crewForm') { const n = $('#crew-name').value.trim(); if (n) return saveCrew(n); return; }
  if (f.id === 'expForm') {
    const title = $('#ex-what').value.trim(), amount = Math.round(+$('#ex-amt').value * 100) / 100, paidBy = $('#ex-by').value;
    const ids = new Set(active().map(m => m.id));
    const split = [...(S.split || new Set([...ids].filter(id => !(honoreeFree() && id === S.trip.honoree))))].filter(id => ids.has(id));
    if (!title || !(amount > 0)) return;
    if (!split.length) { flash('Pick at least one person to split with.'); return; }
    S.split = null;
    return putSub('expenses', rid(8), { title: title.slice(0, 60), amount, paidBy, split, by: S.uid, at: Date.now() });
  }
  if (f.id === 'packForm') {
    const text = $('#pk-text').value.trim(); if (!text) return;
    return putSub('packing', rid(8), { text: text.slice(0, 80), kind: $('#pk-kind').value, claimedBy: null, at: Date.now() });
  }
  if (f.id === 'addDest') {
    const city = $('#ad-city').value.trim(), code = $('#ad-code').value.trim();
    if (!city) return;
    const d = { id: rid(6), city: city.slice(0, 50), code: isCode(code) ? code.toUpperCase() : '' };
    await saveTrip({ destinations: [...(S.trip.destinations || []), d] });
    const set = new Set(meDoc()?.votes || []); set.add(d.id); saveMe({ votes: [...set] }, true);
    return;
  }
  if (f.classList.contains('addItem')) {
    const date = f.dataset.date, title = $('#ai-title-' + date).value.trim(), time = $('#ai-time-' + date).value;
    if (!title) return;
    saveTrip({ itinerary: [...(S.trip.itinerary || []), { id: rid(6), date, time, title: title.slice(0, 120), kind: 'plan', note: '', secret: !!$('#ai-secret-' + date)?.checked }] });
  }
});

/* ---------- navigation ---------- */
function stop() { if (S.meDirty && S.tid && !S.demo) flushMe(); S.unsub.forEach(u => { try { u(); } catch {} }); S.unsub = []; }
function setHash(h) { try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch {} }
function resetTrip() {
  S.trip = null; S.members = []; S.membersIn = false; S.busy = {}; meSaved = false; S.setup = null; S.addStay = false; S.whatif = null; S.repeat = null; S.recover = null; S.rc = null; S.editItem = null; S.alts = null; S.expenses = []; S.packing = []; S.readOnly = false;
  S.cardUrl = null; S.cardBlob = null; S.copyText = ''; S.split = null; S.confirm = null; S.tkFile = null; S.feed = []; S.bucket = []; S.photos = []; S.pot = []; S.mySpend = []; S.lostOpen = false; S.pinSel = null; S.hangPlan = null; S.wrapI = 0; S.img = null; S.show = null; clearInterval(showTimer);
  for (const k of Object.keys(DRAFT)) delete DRAFT[k];
}
function goHome() { stop(); S.tid = null; S.creating = null; S.crewView = null; S.demo = false; resetTrip(); setHash(''); render(); }

function openTrip(id, tab) {
  if (!S.db) { flash(IN_CLAUDE ? 'Open this page in Claude to load trips.' : 'Can’t reach the local server. Is npm run dev still running?'); return; }
  stop(); S.demo = false; S.crewView = null; S.tid = id; S.tab = tab || 'overview'; S.tabPicked = !!tab; S.secTab = {}; resetTrip(); setHash(id);
  app.innerHTML = `${topBar()}${skel()}`;
  S.unsub.push(S.db.doc('trips/' + id).onSnapshot(snap => {
    if (!snap.exists) { flash('That trip doesn’t exist anymore.'); goHome(); return; }
    const first = !S.trip; S.trip = { ...snap.data() }; budgetReset(); if (first && !S.tabPicked && isLive()) S.tab = 'live'; render();
  }, () => flash('Lost the connection to this trip. Reload to reconnect.')));
  S.unsub.push(S.db.collection(`trips/${id}/members`).onSnapshot(snap => {
    const local = meDoc();
    S.members = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.membersIn = true; budgetReset(); meSaved = S.members.some(m => m.id === S.uid);
    // while your own edits are still saving, show them on top of what the server has
    if (S.meDirty && local) { const i = S.members.findIndex(m => m.id === S.uid), mine = Object.fromEntries([...meFields, ...meSending].map(k => [k, local[k]])); i >= 0 ? S.members[i] = { ...S.members[i], ...mine } : S.members.push(local); }
    S.members.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    if (S.trip) render();
  }, () => {}));
  S.unsub.push(S.db.collection(`trips/${id}/feed`).orderBy('at', 'desc').limit(150).onSnapshot(snap => {
    S.feed = snap.docs.map(d => ({ id: d.id, ...d.data() })); if (S.trip) render();
  }, () => {}));
  if (!S.realId) { try { S.mySpend = JSON.parse(localStorage.getItem('oh_spend_' + id) || '[]'); } catch { S.mySpend = []; } }
  if (S.realId) S.unsub.push(S.db.doc(`data/users/${S.realId}/spend-${id}`).onSnapshot(snap => { S.mySpend = snap.exists ? (snap.data().items || []) : (() => { try { return JSON.parse(localStorage.getItem('oh_spend_' + id) || '[]'); } catch { return []; } })(); if (S.trip) render(); }, () => {}));
  for (const coll of ['expenses', 'packing', 'bucket', 'photos', 'pot']) {
    S.unsub.push(S.db.collection(`trips/${id}/${coll}`).orderBy('at').limit(500).onSnapshot(snap => {
      S[coll] = snap.docs.map(d => ({ id: d.id, ...d.data() })); if (S.trip) render();
    }, () => {}));
  }
}

function openDemo() {
  stop(); resetTrip(); S.crewView = null; S.demo = true; S.tid = 'demo'; S.tab = 'overview'; S.secTab = {}; S.tabPicked = true; S.creating = null; setHash('');
  S.uid = S.uid || 'you';
  const start = add(TODAY, -1), end = add(TODAY, 2), y = start, t0 = Date.now(), H = 36e5;
  const at = (day, hm) => new Date(day + 'T' + hm + ':00').getTime();
  const tripDays = span(start, end);
  S.trip = { name: 'Miami, finally (demo)', mode: 'friends', winStart: add(TODAY, -10), winEnd: add(TODAY, 30), nights: 3, vibes: [], lockedDates: { start, end }, lockedDest: 'mia', createdBy: S.uid,
    destinations: [{ id: 'mia', city: 'Miami', code: 'MIA' }, { id: 'las', city: 'Las Vegas', code: 'LAS' }, { id: 'bna', city: 'Nashville', code: 'BNA' }], itinerary: [] };
  S.members = [
    { id: S.uid, nick: S.myName || 'You', home: 'JFK', budget: 1100, status: 'in', days: tripDays, votes: ['mia'], venmo: 'you-demo' },
    { id: 'd1', nick: 'Jay', home: 'JFK', budget: 900, status: 'in', days: tripDays, votes: ['mia', 'las'], venmo: 'jay-demo' },
    { id: 'd2', nick: 'Marisol', home: 'ORD', budget: 1200, status: 'in', days: tripDays, votes: ['mia'], cashapp: 'marisol-demo' },
    { id: 'd3', nick: 'Dev', home: 'LAX', budget: 750, status: 'in', days: tripDays, votes: ['las'] },
    { id: 'd4', nick: 'Tasha', home: 'ATL', budget: 1000, status: 'in', days: tripDays, votes: ['mia'] },
    { id: 'd5', nick: 'Ken', home: 'ORD', budget: 800, status: 'in', days: tripDays, votes: ['mia'] },
  ];
  const Q = (night, music, late, spend, day) => ({ night, music, late, spend, day });
  const [m0, m1, m2, m3, m4, m5] = S.members;
  m1.quiz = Q('Big club', 'Hip-hop', 'At sunrise', 'Middle', 'Pool or beach');
  m2.quiz = Q('Rooftop cocktails', 'Latin', '2–3am', 'Ballin’', 'Exploring & eating');
  m3.quiz = Q('Big club', 'EDM', '2–3am', 'Saver', 'Sleeping it off');
  m4.quiz = Q('Big club', 'Hip-hop', 'At sunrise', 'Middle', 'Pool or beach');
  S.trip.tickets = Object.fromEntries(S.members.map((m, k) => [m.id, { flight: ['B6 1123', 'B6 1123', 'AA 1450', 'AS 512', 'DL 2210', 'AA 1450'][k], at: k + 1 }]));
  m0.arrive = y + 'T15:40'; m0.arrAirport = 'MIA'; m0.flight = 'B6 1123';
  m1.arrive = y + 'T15:40'; m1.arrAirport = 'MIA'; m1.flight = 'B6 1123';
  m2.arrive = y + 'T16:15'; m2.arrAirport = 'MIA'; m2.flight = 'AA 1450';
  m5.arrive = y + 'T16:15'; m5.arrAirport = 'MIA'; m5.flight = 'AA 1450';
  m3.arrive = y + 'T21:30'; m3.arrAirport = 'FLL'; m3.flight = 'AS 512';
  m4.arrive = y + 'T19:05'; m4.arrAirport = 'MIA'; m4.flight = 'DL 2210';
  m1.checkins = [{ text: 'Out out', at: at(y, '23:50') }, { text: 'Still out', at: at(TODAY, '02:40') }, { text: 'At the pool', at: t0 - 1.2 * H }];
  m2.checkins = [{ text: 'Getting food', at: at(TODAY, '01:30') }, { text: 'Getting food', at: t0 - .3 * H }];
  m4.checkins = [{ text: 'Heading back', at: at(TODAY, '03:55') }];
  for (const m of S.members) if (m.checkins) m.checkin = m.checkins[m.checkins.length - 1];
  S.trip.stay = { name: 'Our Airbnb · South Beach', kind: 'rental', area: 'South Beach', sleeps: '3 bedrooms, 6 beds', perNight: '$520–600 per night', perPerson: '$270–300 per person', why: 'Walk to the beach and Collins Ave, room for everyone.', pros: ['Pool', 'Walk to beach'], lat: 25.7840, lng: -80.1310 };
  S.trip.stays = { city: 'Miami', at: t0, items: [
    S.trip.stay,
    { id: 'st2', name: 'Freehand Miami', kind: 'hostel', area: 'Miami Beach', sleeps: '6-bed private room', perNight: '$280–340 per night', perPerson: '$140–170 per person', why: 'Cheapest good option with a legendary bar downstairs.', pros: ['Great bar', 'Cheap'], lat: 25.8016, lng: -80.1281 },
    { id: 'st3', name: 'The Plymouth South Beach', kind: 'hotel', area: 'South Beach', sleeps: '3 rooms, 2 queens each', perNight: '$690–820 per night', perPerson: '$345–410 per person', why: 'Boutique hotel with a pool scene, a short walk to the beach.', pros: ['Pool', 'Quiet'], lat: 25.7946, lng: -80.1296 },
  ] };
  S.trip.stay.id = 'st1';
  S.trip.spots = { city: 'Miami', at: t0, items: [
    { name: 'LIV', type: 'club', area: 'Mid-Beach', why: 'The big-name club night your quiz said you wanted.', price: '$$$$', cover: '$60–100', bestNight: 'Sat', dress: 'Dress to impress', tip: 'Book a table early if you want to skip the line.', lat: 25.8172, lng: -80.1223 },
    { name: 'Sweet Liberty', type: 'bar', area: 'South Beach', why: 'Award-winning cocktails, lively, easy for a group.', price: '$$', cover: 'Free', bestNight: 'Fri', dress: 'Casual', tip: 'Happy hour runs till 7.', lat: 25.7949, lng: -80.1287 },
    { name: 'Wynwood Walls', type: 'activity', area: 'Wynwood', why: 'Street art, photo heaven, great tacos nearby.', price: '$', cover: '$12 entry', bestNight: 'Day', dress: 'Anything', tip: 'Go late afternoon for good light.', lat: 25.8010, lng: -80.1994 },
    { name: 'E11EVEN', type: 'club', area: 'Downtown', why: 'Open 24 hours. For the sunrise club crew.', price: '$$$$', cover: '$50–80', bestNight: 'Sat', dress: 'Upscale', tip: 'Best after 2am.', lat: 25.7853, lng: -80.1931 },
    { name: 'La Sandwicherie', type: 'late-night food', area: 'South Beach', why: 'The 3am sandwich everyone talks about.', price: '$', cover: 'Free', bestNight: 'Any', dress: 'Anything', tip: 'Cash moves faster.', lat: 25.7818, lng: -80.1318 },
  ] };
  S.trip.reactions = { [rkey('spLIV')]: { d1: 1, d4: 1, d3: 1 }, [rkey('spSweet Liberty')]: { d2: 1, d5: 1 }, [rkey('stOur Airbnb · South Beach')]: { d1: 1, d2: 1, d4: 1 } };
  S.trip.itinerary = [
    { id: 'i1', date: y, time: '16:00', title: 'Land + check in', kind: 'travel', note: '' },
    { id: 'i2', date: y, time: '20:30', title: 'Dinner in Wynwood', kind: 'food', note: '' },
    { id: 'i3', date: y, time: '23:00', title: 'Sweet Liberty', kind: 'nightlife', note: '' },
    { id: 'i4', date: TODAY, time: '11:30', title: 'Brunch + recovery', kind: 'food', note: '' },
    { id: 'i5', date: TODAY, time: '14:00', title: 'Pool day', kind: 'chill', note: '' },
    { id: 'i6', date: TODAY, time: '17:00', title: 'Wynwood Walls', kind: 'activity', note: '' },
    { id: 'i7', date: TODAY, time: '23:30', title: 'LIV', kind: 'nightlife', note: 'Table booked under Jay' },
    { id: 'i8', date: TODAY, time: '03:00', title: 'La Sandwicherie', kind: 'food', note: '' },
  ];
  S.trip.geo = { [rkey('Wynwood Walls')]: { name: 'Wynwood Walls', lat: 25.8010, lng: -80.1994, kind: 'activity' } };
  S.trip.meet = { text: 'Our Airbnb · South Beach', time: '22:45', by: m2.id, at: t0 - .6 * H };
  S.trip.hangover = { [TODAY]: { d1: 4, d2: 2, d4: 5, d3: 3 } };
  S.trip.recaps = { [y]: { title: 'Day one', text: 'Everyone landed by noon. Tacos in Wynwood, a nap nobody admits to, then Sweet Liberty until close. Jay checked in “Still out” at 2:40am. Tasha called it at 4 and logged a 5 on the hangover index. There’s a receipt for 14 espresso martinis and no one is claiming it.', at: t0 - 3 * H } };
  S.trip.pitches = { at: t0, items: [{ id: 'pa', city: 'Miami', code: 'MIA', start, end, tagline: 'Rooftops, Latin nights, beach recovery', why: 'Your crew splits between big clubs and rooftop cocktails, and Miami does both on the same street.', perPerson: '$780–950 all-in', vibeMatch: 91, highlights: ['LIV on Saturday', 'Wynwood walls and tacos', 'Pool day to recover'], weather: '79°F, sunny' }] };
  S.trip.swipes = { pa: Object.fromEntries(S.members.map(m => [m.id, 1])) };
  S.expenses = [
    { id: 'e1', title: 'Airbnb (3 nights)', amount: 1680, paidBy: m2.id, split: S.members.map(m => m.id), at: t0 - 50 * H },
    { id: 'e2', title: 'Dinner in Wynwood', amount: 342, paidBy: m1.id, split: S.members.map(m => m.id), at: at(y, '22:10') },
    { id: 'e3', title: 'LIV table deposit', amount: 600, paidBy: m1.id, split: [m0.id, m1.id, m3.id, m4.id], at: t0 - 2 * H },
  ];
  S.pot = [
    { id: 'p1', kind: 'in', by: m1.id, amount: 60, at: t0 - 30 * H }, { id: 'p2', kind: 'in', by: m2.id, amount: 60, at: t0 - 30 * H }, { id: 'p3', kind: 'in', by: m4.id, amount: 60, at: t0 - 29 * H },
    { id: 'p4', kind: 'in', by: S.uid, amount: 40, at: t0 - 28 * H }, { id: 'p5', kind: 'in', by: m5.id, amount: 60, at: t0 - 28 * H },
    { id: 'p6', kind: 'out', by: m2.id, amount: 38, note: 'Uber XL to Wynwood', at: at(y, '20:05') }, { id: 'p7', kind: 'out', by: m1.id, amount: 132, note: 'Groceries + drinks', at: at(y, '17:30') },
    { id: 'p8', kind: 'out', by: m4.id, amount: 64, note: 'Beach chairs + umbrella', at: t0 - 1.5 * H },
  ];
  S.trip.potKeeper = m2.id;
  S.mySpend = [{ id: 'ms1', note: 'My flight JFK → MIA', amount: 248 }];
  S.packing = [
    { id: 'pk1', text: 'Bluetooth speaker', kind: 'group', claimedBy: m1.id, at: 1 }, { id: 'pk2', text: 'Phone chargers & power strip', kind: 'group', claimedBy: null, at: 2 },
    { id: 'pk3', text: 'Hangover kit (electrolytes, Advil)', kind: 'group', claimedBy: m4.id, at: 3 }, { id: 'pk4', text: 'Going-out outfit for each night', kind: 'personal', at: 4 },
    { id: 'pk5', text: 'Swimsuit', kind: 'personal', at: 5 }, { id: 'pk6', text: 'ID (clubs will check)', kind: 'personal', at: 6 },
  ];
  S.feed = [
    { id: 'f1', by: m1.id, text: 'LET’S GOOO', at: t0 - 40 * H },
    { id: 'f2', by: m2.id, text: 'Airbnb has a pool. I repeat, the Airbnb has a pool.', at: t0 - 26 * H },
    { id: 'f3', by: 'ai', kind: 'recap', text: `${S.trip.recaps[y].title}. ${S.trip.recaps[y].text}`, at: t0 - 3 * H },
    { id: 'f4', by: m4.id, text: 'Who has the Advil', at: t0 - 2.5 * H },
  ];
  S.bucket = [
    { id: 'b1', text: 'Watch the sunrise on the beach', points: 2, doneBy: [m1.id], doneAt: { d1: at(TODAY, '06:40') }, at: 1 },
    { id: 'b2', text: 'Talk our way into VIP', points: 3, doneBy: [], at: 2 },
    { id: 'b3', text: 'Order the 3am sandwich', points: 1, doneBy: [m1.id, m2.id, m4.id], at: 3 },
  ];
  S.trip.superVotes = { s0: { d1: 'd2', d4: 'd2', d3: 'd2' }, s1: { d2: 'd3' }, s2: { d2: 'd1', d4: 'd1' }, s5: { d2: 'd1', d3: 'd1' } };
  render(); window.scrollTo({ top: 0 });
}

/* ---------- boot ---------- */
render();
(async () => {
  const c = window.claude;
  if (!c || !c.use) { S.loading = false; render(); return; } // no runtime: demo only
  const [db, user, sample, downloads, assets] = await Promise.all([c.use('db'), c.use('user'), c.use('sample'), c.use('downloads'), c.use('assets')].map(p => Promise.resolve(p).catch(() => null)));
  S.db = db; S.user = user; S.sample = sample; S.downloads = downloads; S.assets = assets;
  try { S.isOwner = user ? await user.isOwner() : false; } catch {}
  let id = null;
  try { id = user ? await user.id() : null; } catch {}
  try { const me = user ? await user.me() : null; S.myName = (me && me.name || '').split(' ')[0]; } catch {}
  if (!id) { try { id = localStorage.getItem('oh_uid'); if (!id) { id = 'g' + rid(12); localStorage.setItem('oh_uid', id); } } catch { id = 'g' + rid(12); } }
  S.realId = id && (IN_CLAUDE ? !String(id).startsWith('g') : /^u_/.test(String(id))) ? id : null;
  S.uid = segSafe(id);
  S.loading = false;
  if (db) {
    db.collection('trips').orderBy('createdAt', 'desc').limit(50).onSnapshot(snap => {
      S.trips = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.tripsLoaded = true; notifyNew(myPlans()); if (!S.tid) render();
    }, () => { S.tripsLoaded = true; if (!S.tid) render(); });
    db.collection('crews').orderBy('at', 'desc').limit(50).onSnapshot(snap => {
      S.crews = snap.docs.map(d => ({ id: d.id, ...d.data() })); if (!S.tid) render();
    }, () => {});
    const h = (location.hash || '').slice(1);
    const cm = h.match(/^c-([a-z0-9]{6,20})$/); if (cm) { joinCrew(cm[1]); return; }
    const th = parseTripHash(h);
    if (th) { S.linkKey = th.key; let tab; try { tab = sessionStorage.getItem('outta_tab_' + th.tid) || undefined; } catch {} openTrip(th.tid, tab); return; }
  }
  if (!S.tid) render(); else if (S.demo) render();
})();
})();
