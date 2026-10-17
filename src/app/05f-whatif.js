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
  S.whatif = null; saveTrip(patch).then(ok => ok && flash(`Done. The plan is now ${[r.dest?.city, isSmall() ? fmt(r.start) : dayRange(r.start, r.end)].filter(Boolean).join(', ')}.`));
}

