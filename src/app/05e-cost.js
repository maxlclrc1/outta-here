/* ---------- all-in cost: the real price of saying yes ---------- */
// Per person, low–high, line by line. Every number says where it came from: an AI
// estimate, a real quote someone found, or something already booked. Lines nobody
// has filled in are called out instead of quietly counting as $0.
const COST_LINES = {
  hangout: [['getting', 'Getting there', 'Rides or transit, both ways', true], ['food', 'Food & drinks', 'Dinner, rounds, tip', true], ['fun', 'Activities', 'Tickets, cover, bowling…', false], ['fees', 'Fees', 'Booking fees, deposits', false]],
  day: [['getting', 'Getting there', 'Train, gas, parking, both ways', true], ['fun', 'Tickets & activities', 'Entry, rentals, tours', true], ['food', 'Food & drinks', 'Lunch, snacks, dinner', true], ['fees', 'Fees', 'Booking fees', false]],
  weekend: [['travel', 'Getting there', 'Gas, tolls, train or a short flight', true], ['stay', 'Stay', 'Your share, all nights', true], ['local', 'Getting around', 'Ubers, parking', false], ['food', 'Food & drinks', 'Every meal and night out', true], ['fun', 'Activities', 'Tickets, cover, rentals', false], ['fees', 'Fees', 'Cleaning, resort and booking fees', false]],
  trip: [['travel', 'Flights', 'Round trip from your city', true], ['stay', 'Stay', 'Your share, all nights', true], ['local', 'Getting around', 'Airport transfer, Ubers', true], ['food', 'Food & drinks', 'Every meal and night out', true], ['fun', 'Activities', 'Tickets, tours, cover charges', false], ['fees', 'Fees', 'Cleaning, resort, baggage, booking fees', false]],
};
const SRC_LABEL = { estimate: 'AI estimate', quote: 'Real quote', booked: 'Booked' };
// "$650–800 all-in" → [650, 800]; "$180/night" → [180, 180]
function moneyRange(s) {
  const n = String(s || '').replace(/,/g, '').match(/\d+(\.\d+)?/g); if (!n) return null;
  const v = n.map(Number).filter(x => x > 0).slice(0, 2); if (!v.length) return null;
  return [Math.min(...v), Math.max(...v)];
}
const planHeads = () => { const h = headcount(); return Math.max(1, h.firm || h.max || active().length); };
// Estimates the app already has from the AI (flights, stays). Never presented as quotes.
function costHints() {
  const t = S.trip, d = dates(), nights = Math.max(1, nightsOf(d)), out = {};
  const fl = (t.deals?.data?.flights || []).map(f => moneyRange(f.roundTrip)).filter(Boolean);
  if (fl.length && size() === 'trip') out.travel = { low: Math.min(...fl.map(r => r[0])), high: Math.max(...fl.map(r => r[1])), src: 'estimate', note: 'From the flight estimates' };
  const stays = t.stay ? [t.stay] : (t.stays?.items || []);
  const pn = stays.map(s => moneyRange(s.perNight)).filter(Boolean);
  if (pn.length && !isSmall()) { const n = planHeads(); out.stay = { low: Math.round(Math.min(...pn.map(r => r[0])) * nights / n), high: Math.round(Math.max(...pn.map(r => r[1])) * nights / n), src: t.stay ? 'quote' : 'estimate', note: `${t.stay ? t.stay.name : 'Stay ideas'}, ${nights} night${nights === 1 ? '' : 's'} split ${n} ways` }; }
  return out;
}
function costSummary(t = S.trip) {
  const lines = COST_LINES[sizeOf(t)], saved = t.costs || {}, hints = t === S.trip ? costHints() : {};
  const rows = lines.map(([k, label, hint, major]) => {
    const s = saved[k], h = hints[k];
    const v = s && (s.low || s.high) ? { low: +s.low || +s.high || 0, high: +s.high || +s.low || 0, src: s.src || 'estimate', note: s.note || '' } : h || null;
    return { k, label, hint, major, v, auto: !(s && (s.low || s.high)) && !!h };
  });
  const buffer = t.costBuffer ?? 10;
  const low = rows.reduce((n, r) => n + (r.v ? r.v.low : 0), 0), high = rows.reduce((n, r) => n + (r.v ? r.v.high : 0), 0);
  const withBuf = x => Math.round(x * (1 + buffer / 100));
  const missing = rows.filter(r => r.major && !r.v), estimates = rows.filter(r => r.v && r.v.src === 'estimate');
  return { rows, buffer, low: withBuf(low), high: withBuf(high), missing, estimates, any: rows.some(r => r.v) };
}
// Who can afford it: budget ≥ high fits, between low and high is a stretch, below low doesn't.
function budgetFit(sum) {
  const ms = active().filter(m => +m.budget > 0);
  const fits = ms.filter(m => +m.budget >= sum.high), stretch = ms.filter(m => +m.budget < sum.high && +m.budget >= sum.low), over = ms.filter(m => +m.budget < sum.low);
  return { fits, stretch, over, n: ms.length, unknown: active().length - ms.length };
}
function costTab() {
  const sum = costSummary(), fit = budgetFit(sum), ro = S.readOnly;
  return `<section class="card stack cost">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div class="stack" style="gap:2px"><h2>The cost of saying yes</h2><span class="small muted">Per person, all in. Anyone in the crew can fill in a line or swap an estimate for a real quote.</span></div></div>
    <div class="cost-total"><span class="label">Each person, all in</span><b>${sum.any ? `${money(sum.low)}${sum.high !== sum.low ? '–' + money(sum.high) : ''}` : '—'}</b>
      <span class="small muted">Includes a ${sum.buffer}% buffer for the stuff nobody plans for.</span></div>
    ${sum.missing.length ? `<div class="cost-flag"><b>Not included yet:</b> ${sum.missing.map(r => esc(r.label.toLowerCase())).join(', ')}. The real total is higher than this.</div>` : ''}
    ${sum.estimates.length ? `<div class="cost-flag soft">${sum.estimates.length === 1 ? `${esc(sum.estimates[0].label)} is an AI estimate` : `${sum.estimates.length} lines are AI estimates`}, not live prices. Swap in a real quote when you have one.</div>` : ''}
    ${fit.n && sum.any ? `<div class="row" style="gap:6px">${fit.fits.length ? `<span class="pill lvl-in">Fits ${fit.fits.length}/${fit.n} budget${fit.n === 1 ? '' : 's'}</span>` : ''}${fit.stretch.length ? `<span class="pill lvl-maybe">A stretch for ${esc(budgetWho(fit.stretch))}</span>` : ''}${fit.over.length ? `<span class="pill out" style="color:#D63B3B">Over budget for ${esc(budgetWho(fit.over))}</span>` : ''}${fit.unknown ? `<span class="pill out">${fit.unknown} without a budget</span>` : ''}</div>` : ''}
    <div class="cost-rows">${sum.rows.map(r => `<div class="cost-row ${r.v ? '' : 'empty-line'}">
      <div class="cost-what"><b>${esc(r.label)}${r.major && !r.v ? ' <span class="small" style="color:#D63B3B">· missing</span>' : ''}</b><span class="small muted">${esc(r.v?.note || r.hint)}</span></div>
      <div class="cost-in">
        <label><span class="sr-only">${esc(r.label)} low</span><input id="cost-low-${r.k}" type="number" min="0" inputmode="numeric" placeholder="Low" value="${r.v && !r.auto ? r.v.low : ''}" ${ro ? 'disabled' : ''}></label>
        <span class="muted">–</span>
        <label><span class="sr-only">${esc(r.label)} high</span><input id="cost-high-${r.k}" type="number" min="0" inputmode="numeric" placeholder="High" value="${r.v && !r.auto ? r.v.high : ''}" ${ro ? 'disabled' : ''}></label>
        <select id="cost-src-${r.k}" aria-label="Where this number comes from" ${ro ? 'disabled' : ''}>${Object.entries(SRC_LABEL).map(([k, l]) => `<option value="${k}" ${(r.v?.src || 'estimate') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      ${r.auto ? `<span class="small src-tag">${esc(SRC_LABEL[r.v.src])}: ${money(r.v.low)}${r.v.high !== r.v.low ? '–' + money(r.v.high) : ''} · <button class="linkbtn" data-costkeep="${r.k}">Use it</button></span>` : r.v ? `<span class="small src-tag s-${r.v.src}">${esc(SRC_LABEL[r.v.src])}</span>` : ''}
    </div>`).join('')}</div>
    <label class="row small" style="gap:8px;align-items:center">Buffer <select id="cost-buffer" style="width:auto" ${ro ? 'disabled' : ''}>${[0, 5, 10, 15, 20].map(n => `<option value="${n}" ${n === sum.buffer ? 'selected' : ''}>${n}%</option>`).join('')}</select> on top for surprises</label>
  </section>`;
}
// waits a beat so typing low then high saves both together; the values are read
// right away, since the tab may be gone by the time the save runs
const costT = {}, costPending = {};
function saveCostLine(k) {
  const el = id => $('#cost-' + id + '-' + k);
  costPending[k] = { low: el('low') ? el('low').value : costPending[k]?.low, high: el('high') ? el('high').value : costPending[k]?.high, src: el('src') ? el('src').value : costPending[k]?.src };
  clearTimeout(costT[k]); costT[k] = setTimeout(() => saveCostLineNow(k), 350);
}
function saveCostLineNow(k) {
  const { low, high, src = 'estimate' } = costPending[k] || {}; delete costPending[k];
  const l = Math.max(0, Math.round(+low || 0)), h = Math.max(0, Math.round(+high || 0));
  delete DRAFT['cost-low-' + k]; delete DRAFT['cost-high-' + k];
  if (!l && !h) return saveTrip({ costs: { [k]: null } });
  saveTrip({ costs: { [k]: { low: l || h, high: Math.max(l, h), src, by: S.uid, at: Date.now() } } });
}

