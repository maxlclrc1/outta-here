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
function planState() {
  const sum = costSummary(), fit = budgetFit(sum), heads = planHeads(), st = S.trip.stay, stayRow = sum.rows.find(r => r.k === 'stay');
  const L = S.trip.lockedDates, ldays = L ? span(L.start, L.end) : null;
  return {
    heads, low: sum.low, high: sum.high, any: sum.any,
    stayEach: st && +st.total ? Math.round(st.total / heads) : stayRow?.v ? Math.round(stayRow.v.high) : 0,
    over: fit.over.map(m => m.id), stretch: fit.stretch.map(m => m.id),
    condOff: active().filter(m => +m.cond?.under > 0 && sum.any && sum.low > +m.cond.under).map(m => m.id),
    hardBudget: active().filter(m => m.hard?.budget && +m.budget > 0 && sum.any && sum.low > +m.budget).map(m => m.id),
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
  const before = planState(), sim = simulate(ch), after = withPlan(sim.trip, sim.members, planState);
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
    if (Object.keys(tk).length) out.push({ id: 'flights', label: 'Add a to-do: change booked flights to the new dates', on: true });
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
    if (ch.kind !== 'budget') { const id = rid(6); patch.changes = { [id]: { text: changeText(ch), fx: imp.fx.filter(f => f.level !== 'info' || f.from !== '').slice(0, 6).map(f => f.from !== '' ? `${f.area}: ${f.from} → ${f.to}` : f.text), by: S.uid, at: Date.now() } }; }
    if (Object.keys(patch).length) await saveTrip(patch);
    S.recover = null; S.rc = null; S.alts = null; render();
    if (!opts.quiet) flash(`${changeText(ch)}. ${imp.fx.find(f => f.from !== '') ? `${imp.fx.find(f => f.from !== '').area}: ${imp.fx.find(f => f.from !== '').from} → ${imp.fx.find(f => f.from !== '').to}.` : 'Nothing else moves.'}`);
  } catch (e) { flash(writeErr(e)); }
}
// when someone drops out some other way, still work out what it changed and log it
function logDrop(uid) {
  if (S.demo || !S.trip) return;
  const ch = { kind: 'drop', who: uid }, imp = changeImpact(ch), id = rid(6);
  const tasks = taskList().filter(x => !x.done && x.owner === uid);
  return saveTrip({ changes: { [id]: { text: changeText(ch), fx: [...imp.fx.filter(f => f.from !== '').map(f => `${f.area}: ${f.from} → ${f.to}`), ...imp.fx.filter(f => f.level === 'bad').map(f => f.text), ...(tasks.length ? [`${tasks.length} to-do${tasks.length === 1 ? ' needs' : 's need'} a new owner`] : [])].slice(0, 6), by: S.uid, at: Date.now() } } });
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
      <div class="row" style="justify-content:space-between;gap:8px"><span class="small muted">${answered} of ${n} answered. ${esc(ruleText())}</span>${isOrganizer() || c.by === S.uid ? '<button class="linkbtn small" data-act="checkClose">Close it</button>' : ''}</div></div>` : ''}
    ${list.length ? `<div class="stack" style="gap:8px"><span class="label">What changed</span>${list.map(([id, x]) => `<div class="change-row"><div class="row" style="justify-content:space-between;gap:8px"><b>${esc(x.text)}</b><span class="small muted">${ago(x.at)}</span></div>${(x.fx || []).length ? `<ul class="small muted">${x.fx.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>` : ''}
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
  saveTrip({ itinerary: (S.trip.itinerary || []).map(i => i.id === id ? { ...i, title, note: `Instead of ${old.title}`, ai: false } : i), changes: { [rid(6)]: { text: `${old.title} is off`, fx: [`Replaced with ${title}`], by: S.uid, at: Date.now() } } });
  S.alts = null; S.recover = null; S.rc = null;
  flash(`Swapped in ${title}.`);
}
