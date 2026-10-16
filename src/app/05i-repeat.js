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

