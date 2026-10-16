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
async function saveTrip(patch, tid = S.tid) {
  if (!tid) return false;
  const here = tid === S.tid && S.trip;
  if (here) { S.trip = merge(S.trip, patch); render(); }
  if (S.demo) return true;
  if (!S.db) return false;
  try { await S.db.doc('trips/' + tid).update(patch); return true; }
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
let meT, meWriting = false, meSeq = 0;
function saveMe(patch, now, quiet) {
  let m = meDoc();
  if (!m) { m = { id: S.uid, nick: S.myName || 'Me', home: '', budget: 0, status: 'in', days: [], votes: [] }; S.members.push(m); }
  Object.assign(m, patch); if (!quiet) render();
  if (S.demo) return;
  S.meDirty = true; meSeq++; clearTimeout(meT); meT = setTimeout(flushMe, now ? 0 : 600);
}
async function flushMe() {
  clearTimeout(meT);
  const m = meDoc(); if (!m || !S.db || S.demo || !S.tid) return;
  const { id, ...body } = m, job = { tid: S.tid, body, seq: meSeq, joined: !!(S.trip?.people || {})[S.uid] && !(S.trip?.left || {})[S.uid] };
  while (meWriting) await new Promise(r => setTimeout(r, 120));
  meWriting = true;
  try {
    await S.db.doc(`trips/${job.tid}/members/${S.uid}`).set({ ...job.body, updatedAt: Date.now() });
    if (!job.joined) S.db.doc('trips/' + job.tid).update({ people: { [S.uid]: true }, left: { [S.uid]: null } }).catch(() => {});
  }
  catch (e) { flash(S.tid === job.tid ? writeErr(e) : 'Your last change to the other plan didn’t save. Open it and try again.'); }
  meWriting = false; if (job.seq === meSeq && S.tid === job.tid) S.meDirty = false;
}

/* ---------- AI ---------- */
async function askAI(kind, prompt, done) {
  if (!S.sample) { flash(IN_CLAUDE ? 'AI picks need this page opened in Claude.' : 'AI is off. Add your Anthropic API key to .env.local and restart the app.'); return; }
  S.busy[kind] = true; render();
  if (S.trip) { const nt = needsText(); if (nt) prompt += '\n\n' + nt; }
  if (S.trip) prompt += `\n\nGive every price in ${cur()} (${curSymbol(cur())}), not in any other currency, and use that symbol in price text.`;
  const tid = S.tid;
  try {
    const data = await S.sample.json(prompt, { modelTier: 'default' });
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

