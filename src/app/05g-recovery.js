/* ---------- when plans change ---------- */
// Someone drops out, the budget moves, a place closes, the dates slip. Each fix shows
// what it affects before anything changes, and none of them start the plan over.
function recoveryCard() {
  if (S.demo || S.readOnly || !S.trip.lockedDest && !S.trip.lockedDates) return '';
  const k = S.recover;
  if (!k) return `<section class="card recover-bar"><span><b>Something changed?</b> <span class="small muted">Fix it without starting over.</span></span>
    <div class="row" style="gap:6px">${[['drop', 'Someone dropped out'], ['budget', 'Budget changed'], ['closed', 'Weather or a place closed'], ['dates', 'Dates moved']].map(([v, l]) => `<button class="chip" data-recover="${v}">${l}</button>`).join('')}</div></section>`;
  const close = '<button class="btn sm ghost" data-recover="">Close</button>';
  if (k === 'drop') {
    const ms = S.members.filter(m => m.status !== 'out' && !m.removed), who = S.members.find(m => m.id === S.recoverWho) || null;
    let impact = '';
    if (who) {
      const n = S.members.filter(going).length, n2 = going(who) ? n - 1 : n, sum = costSummary(), stay = sum.rows.find(r => r.k === 'stay' && r.v);
      const tasks = taskList().filter(x => !x.done && x.owner === who.id), tk = (S.trip.tickets || {})[who.id];
      impact = `<ul class="impact">
        <li>${n2 === n ? `Headcount stays at <b>${n}</b>. They hadn’t said they were going.` : `Headcount goes from <b>${n}</b> to <b>${n2}</b>.`}</li>
        ${stay && n2 < n && n2 > 0 ? `<li>The stay costs each person about <b>${money(stay.v.high * n / n2)}</b> instead of ${money(stay.v.high)}.</li>` : ''}
        ${tasks.length ? `<li>${tasks.length === 1 ? 'This to-do needs' : 'These to-dos need'} a new owner: ${tasks.map(x => `<b>${esc(x.title)}</b>`).join(', ')}.</li>` : ''}
        ${tk ? `<li>${esc(who.nick || 'They')} already booked. Sort out refunds or a name change directly.</li>` : ''}
        ${S.trip.honoree === who.id ? `<li>They were the ${esc(mode().honoree)}. Pick a new one in Settings.</li>` : ''}
      </ul>
      <div class="row" style="gap:6px"><button class="btn sm danger-fill" data-act="recoverDrop">Mark ${esc(who.nick || 'them')} as out</button>${close}</div>`;
    }
    return `<section class="card stack recover"><h3>Someone dropped out</h3>
      <label class="field" style="flex:none"><span class="label">Who?</span><select id="recover-who"><option value="">Pick someone</option>${ms.map(m => `<option value="${esc(m.id)}" ${S.recoverWho === m.id ? 'selected' : ''}>${esc(m.nick || 'Someone')}${m.id === S.uid ? ' (you)' : ''}</option>`).join('')}</select></label>
      ${impact || `<div class="row">${close}</div>`}</section>`;
  }
  if (k === 'budget') {
    const m = meDoc() || {}, sum = costSummary(), fit = budgetFit(sum);
    return `<section class="card stack recover"><h3>Budget changed</h3>
      <label class="field" style="flex:none"><span class="label">Your max now (${cur()})</span><input id="me-budget" type="number" min="0" inputmode="numeric" value="${m.budget || ''}"></label>
      ${sum.any ? `<p class="small">The plan is <b>${money(sum.low)}–${money(sum.high)}</b> each. ${fit.over.length ? `Over budget for ${esc(budgetWho(fit.over))}.` : fit.stretch.length ? `A stretch for ${esc(budgetWho(fit.stretch))}.` : 'It fits everyone’s budget.'}</p>
        ${fit.over.length || fit.stretch.length ? '<div class="row" style="gap:6px"><button class="btn sm" data-tab="whatif">Compare cheaper options</button><button class="btn sm" data-tab="cost">See the costs</button></div>' : ''}` : '<p class="small muted">Fill in the All-in cost to see how this changes things.</p>'}
      <div class="row">${close}</div></section>`;
  }
  if (k === 'closed') {
    const items = visItems().filter(i => !i.hidden), sel = items.find(i => i.id === S.recoverItem), alts = S.alts && S.alts.item === S.recoverItem ? S.alts.options : null;
    return `<section class="card stack recover"><h3>Weather or a place closed</h3>
      ${items.length ? `<label class="field" style="flex:none"><span class="label">What’s affected?</span><select id="recover-item"><option value="">Pick a stop</option>${items.map(i => `<option value="${esc(i.id)}" ${S.recoverItem === i.id ? 'selected' : ''}>${esc((i.date ? short(i.date) + ' · ' : '') + (i.time ? t12(i.time) + ' · ' : '') + i.title)}</option>`).join('')}</select></label>` : `<p class="small muted">Nothing is planned yet, so nothing to replace. If the whole ${size() === 'trip' || size() === 'weekend' ? 'destination' : 'plan'} is off, go back to Plan Match.</p>`}
      ${sel ? `<div class="row" style="gap:6px">${S.sample ? `<button class="btn sm primary" data-act="recoverAlts" ${S.busy.alts ? 'disabled' : ''}>${S.busy.alts ? '<i class="spin"></i>Finding options…' : 'Find replacements'}</button>` : ''}<button class="btn sm" data-act="recoverRemove">Just drop it</button></div>
        ${alts ? `<div class="stack" style="gap:8px">${alts.map((o, j) => `<div class="linkrow"><div style="min-width:0"><b>${esc(o.title)}</b><div class="small muted">${esc(o.why || '')}</div></div><button class="btn sm" data-swapin="${j}">Swap in</button></div>`).join('')}</div>` : ''}
        <form id="swapForm" class="row" style="gap:6px;align-items:flex-end"><label class="field" style="flex:1 1 200px"><span class="label">Or replace it with</span><input id="swap-title" maxlength="80" placeholder="Indoor alternative"></label><button class="btn sm" type="submit">Replace</button></form>` : ''}
      <div class="row">${close}</div></section>`;
  }
  if (k === 'dates') {
    const d = S.trip.lockedDates;
    return `<section class="card stack recover"><h3>Dates moved</h3>
      <p class="small">${d ? `Right now it’s <b>${dayRange(d.start, d.end)}</b>. ` : ''}Reopening the dates keeps everyone’s free days and the destination. People just update their days and you lock new ones.</p>
      <div class="row" style="gap:6px"><button class="btn sm primary" data-act="recoverDates">Reopen the dates</button>${close}</div></section>`;
  }
  return '';
}
async function recoverDrop() {
  const who = S.members.find(m => m.id === S.recoverWho); if (!who) return;
  const tasks = taskList().filter(x => !x.done && x.owner === who.id);
  try {
    if (who.id === S.uid) saveMe({ status: 'out', droppedAt: Date.now() }, true);
    else await S.db.doc(`trips/${S.tid}/members/${who.id}`).update({ status: 'out', droppedAt: Date.now() });
    if (tasks.length) saveTrip({ tasks: Object.fromEntries(tasks.map(x => [x.id, { owner: '' }])) });
    S.recover = null; S.recoverWho = null; render();
    flash(`${who.nick || 'They'} ${who.id === S.uid ? 'are' : 'is'} out.${tasks.length ? ` ${tasks.length} to-do${tasks.length === 1 ? ' needs' : 's need'} a new owner.` : ''}`);
  } catch (e) { flash(writeErr(e)); }
}
function recoverAlts() {
  const it = visItems().find(i => i.id === S.recoverItem); if (!it) return;
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
  const id = S.recoverItem, old = (S.trip.itinerary || []).find(i => i.id === id); if (!old) return;
  saveTrip({ itinerary: (S.trip.itinerary || []).map(i => i.id === id ? { ...i, title, note: `Instead of ${old.title}`, ai: false } : i) });
  S.alts = null; S.recover = null; S.recoverItem = null;
  flash(`Swapped in ${title}.`);
}

