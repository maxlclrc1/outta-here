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
// Family trips and offsites keep the same lines, but hints about nights out and cover charges get plain ones.
const costLines = (t = S.trip) => { const h = planKind(t).costHints, ls = COST_LINES[sizeOf(t)]; return h ? ls.map(l => h[l[0]] && /night|cover|rounds/i.test(l[2]) ? [l[0], l[1], h[l[0]], l[3]] : l) : ls; };
const SRC_LABEL = { estimate: 'Estimate', ai: 'AI estimate', quote: 'Real quote', booked: 'Booked', paid: 'Paid' };
// "$650–800 all-in" → [650, 800]; "$180/night" → [180, 180]
function moneyRange(s) {
  const n = String(s || '').replace(/,/g, '').match(/\d+(\.\d+)?/g); if (!n) return null;
  const v = n.map(Number).filter(x => x > 0).slice(0, 2); if (!v.length) return null;
  return [Math.min(...v), Math.max(...v)];
}
const planHeads = () => { const h = headcount(); return Math.max(1, h.firm || h.max || active().length); };
// Who splits a shared cost: those heads, minus a guest of honor whose share the group covers
// (as expense splits and settle-up do). Never below 1, so a lone covered honoree sees the full price.
const payHeads = () => {
  const h = headcount(), n = planHeads(), hon = honoreeFree() && S.members.find(m => m.id === S.trip.honoree);
  const st = hon ? hon.status || 'maybe' : '', counted = hon && (h.firm ? ['booked', 'confirmed'] : h.max ? ['booked', 'confirmed', 'in'] : ['booked', 'confirmed', 'in', 'maybe']).includes(st);
  return Math.max(1, n - (counted ? 1 : 0));
};
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
  const out = {}, other = { n: 0 }, heads = payHeads();
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
  if (t.stay && +t.stay.total && !isSmall()) { const n = payHeads(); out.stay = { low: Math.round(t.stay.total / n), high: Math.round(t.stay.total / n), src: t.stay.booked ? 'booked' : 'quote', note: `${t.stay.name}, ${money(t.stay.total)} total ${n === 1 ? "for 1 person" : `split ${n} ways`}` }; return out; }
  const stays = t.stay ? [t.stay] : (t.stays?.items || []);
  const pn = stays.map(s => moneyRange(s.perNight)).filter(Boolean);
  if (pn.length && !isSmall()) { const n = payHeads(); out.stay = { low: Math.round(Math.min(...pn.map(r => r[0])) * nights / n), high: Math.round(Math.max(...pn.map(r => r[1])) * nights / n), src: t.stay ? 'quote' : 'ai', note: `${t.stay ? t.stay.name : 'Stay ideas'}, ${nights} night${nights === 1 ? '' : 's'} ${n === 1 ? "for 1 person" : `split ${n} ways`}` }; }
  return out;
}
// who: 'crew' (a typical person's range) or 'me' (your own, using your real numbers)
function costSummary(t = S.trip, who = 'crew') {
  const lines = costLines(t), saved = t.costs || {}, hints = t === S.trip ? costHints() : {};
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
   Budget ≥ high fits, between low and high is a stretch, below low is over.
   If a check can't be answered (too many checks, say), the last confirmed answer is shown
   marked `stale` ("earlier check"), or `unavailable` if there was none, never "no budgets".
   It's asked again once the server says it can be. */
const BQ = { tid: null, cache: new Map(), queue: new Map(), cap: undefined, t: 0, good: new Map(), retry: 0 };
const NO_FIT = { n: 0, unknown: 0, fits: [], stretch: [], over: [], hard: [], hardOpen: [], pending: true };
const budgetsHere = () => S.demo || IN_CLAUDE;
function budgetReset() { BQ.cache.clear(); BQ.cap = undefined; }
function bq(check) {
  if (BQ.tid !== S.tid) { BQ.tid = S.tid; budgetReset(); BQ.queue.clear(); BQ.good.clear(); BQ.goodCap = undefined; }
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
  let data = null, wait = 30;
  try {
    const r = await fetch('/api/budget', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outta-user': S.uid }, body: JSON.stringify({ tid, checks: items.map(([, c]) => c) }) });
    if (r.ok) data = await r.json(); else wait = +r.headers.get('Retry-After') || wait;
  } catch {}
  if (S.tid !== tid) return;
  if (data) items.forEach(([k], i) => { const v = budgetShape(data.results[i]); BQ.cache.set(k, v); BQ.good.set(k, v); });
  // not answered: keep the last confirmed answer, marked as earlier, and ask again later
  else items.forEach(([k]) => BQ.cache.set(k, BQ.good.has(k) ? { ...BQ.good.get(k), stale: true } : { ...NO_FIT, pending: false, unavailable: true }));
  if (data) BQ.cap = BQ.goodCap = data.band; else if (BQ.cap === undefined) BQ.cap = BQ.goodCap ?? null;
  if (!data && !BQ.retry) BQ.retry = setTimeout(() => { BQ.retry = 0; if (S.tid !== tid) return; for (const [k, v] of BQ.cache) if (v.stale || v.unavailable) BQ.cache.delete(k); render(); }, Math.min(60, Math.max(5, wait)) * 1000);
  render();
}
// counts from the server → lists the UI can use: named people, then anonymous stand-ins
function budgetShape(r) {
  const list = g => [...g.ids.map(id => S.members.find(m => m.id === id) || { id, nick: 'Someone' }), ...Array.from({ length: Math.max(0, g.count - g.ids.length) }, (_, i) => ({ id: 'anon-' + i, nick: 'Someone' }))];
  return { n: r.n, unknown: r.total - r.n, fits: list(r.fits), stretch: list(r.stretch), over: list(r.over), hard: list(r.hard), hardOpen: list(r.hardOpen) };
}
function budgetLocal({ lo = 0, hi = 0, key = '', pitch }) {
  if (pitch) { const r = moneyRange((S.trip.pitches?.items || []).find(x => x.id === pitch)?.perPerson); lo = r ? r[0] : 0; hi = r ? r[1] : 0; }
  // only the budgets the who-pays setting counts, as per-person amounts (as the server does)
  const ms = active().map(m => ({ ...m, budget: budgetOf(m) })).filter(m => m.budget > 0), h = Math.max(lo, hi || lo), consent = ((S.trip.consent || {})[key]) || {};
  const hard = lo ? ms.filter(m => m.hard?.budget && lo > m.budget) : [];
  return { n: ms.length, unknown: active().length - ms.length, fits: ms.filter(m => m.budget >= h), stretch: ms.filter(m => m.budget < h && m.budget >= lo), over: ms.filter(m => m.budget < lo), hard, hardOpen: hard.filter(m => !consent[m.id]) };
}
// extra: { exclude: [ids], myBudget } for "what if" questions (someone drops out, my budget changes)
function budgetFit(sum, extra) { return bq({ lo: Math.round(sum.low || 0), hi: Math.round(sum.high || 0), ...(extra || {}) }) || NO_FIT; }
// The tightest budget in the crew, as a band ("€250–300"), never the exact number. `cap` is
// the low end, which is what the AI and the suggested splits plan around.
const BAND_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
function bandOf(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), g = [0.1, 1, 10].flatMap(m => BAND_STEPS.map(x => x * e * m)); return { lo: Math.round(Math.max(...g.filter(x => x <= v))), hi: Math.round(Math.min(...g.filter(x => x > v))) }; }
function budgetCapShared() {
  let b;
  if (budgetsHere()) { const v = active().map(budgetOf).filter(x => x > 0); b = v.length ? { ...bandOf(Math.min(...v)), n: v.length } : null; }
  else { bq({}); b = BQ.cap || null; }
  return b ? { cap: b.lo, lo: b.lo, hi: b.hi, n: b.n, label: `${money(b.lo)}–${money(b.hi)}` } : null;
}
const rangeText = (lo, hi) => `${money(lo)}${hi !== lo ? '–' + money(hi) : ''}`;
// When one person covers everyone, the others just see that it's covered.
function coveredCard() {
  const who = esc(nameOf(payerId()));
  return `<section class="card stack covered"><span class="g-k">The money</span><h2>Covered by ${who}</h2>
    <p class="muted">${who} is paying for this ${planWord()}, so there’s no budget to set and nothing to split. If you pay for something for the group, log it in Expenses and ${who} pays you back.</p>
    <div><button class="btn sm" data-tab="money">Expenses</button></div></section>`;
}
function costTab() {
  const pm = paysMode(); if (pm === 'one' && !isPayer()) return coveredCard();
  // one payer or a company: the headline is the total for everyone, and nobody's personal budget is checked
  const whole = pm !== 'split', heads = planHeads(), all = v => Math.round(v * heads);
  const sum = costSummary(), me = whole ? sum : costSummary(S.trip, 'me'), fit = whole ? { n: 0 } : budgetFit(sum), ro = S.readOnly, mine = meDoc(), myB = whole ? 0 : +mine?.budget || 0, totalB = budgetIsTotal() ? +mine?.budget || 0 : 0;
  const differs = me.low !== sum.low || me.high !== sum.high;
  const empty = sum.rows.filter(r => !r.v || ['estimate', 'ai'].includes(r.v.src)).length;
  return `<section class="card stack cost">
    <div class="stack" style="gap:2px"><h2>${whole ? `What it’ll cost ${pm === 'one' ? 'you' : 'the company'}` : 'The cost of saying yes'}</h2><span class="small muted">${whole ? `For everyone (${heads} ${heads === 1 ? 'person' : 'people'}), all in. The lines below are per person.` : 'Per person, all in.'} Built from what’s booked or paid first, then quotes, then estimates.</span></div>
    ${whole ? `<div class="cost-totals"><div class="cost-total"><span class="label">Everyone, all in</span><b>${sum.any ? rangeText(all(sum.low), all(sum.high)) : '—'}</b><span class="small muted">${sum.any ? `${heads} × ${rangeText(sum.low, sum.high)} each. ` : ''}${totalB && sum.any ? (all(sum.high) <= totalB ? `Fits your ${money(totalB)} total budget. ` : all(sum.low) <= totalB ? `Could go over your ${money(totalB)} total budget. ` : `Over your ${money(totalB)} total budget. `) : ''}Includes a ${sum.buffer}% buffer.</span></div></div>` : `<div class="cost-totals">
      <div class="cost-total"><span class="label">${differs ? 'You, all in' : 'Each person, all in'}</span><b>${me.any ? rangeText(me.low, me.high) : '—'}</b>${me.any ? alsoMine(me.low, me.high) : ''}
        <span class="small muted">${myB && me.any ? (me.high <= myB ? `Fits your ${money(myB)} budget.` : me.low <= myB ? `Could go over your ${money(myB)} budget.` : `Over your ${money(myB)} budget.`) + ' ' : ''}Includes a ${sum.buffer}% buffer.</span></div>
      ${differs && sum.any ? `<div class="cost-total soft"><span class="label">Typical for the crew</span><b>${rangeText(sum.low, sum.high)}</b>${alsoMine(sum.low, sum.high)}<span class="small muted">Everyone’s flights and shares differ a bit.</span></div>` : ''}
    </div>`}
    ${S.sample !== null && !ro ? `<div class="row" style="gap:8px;align-items:center"><button class="btn ${sum.any ? '' : 'primary'}" data-act="costAI" ${S.busy.cost || !dest() ? 'disabled' : ''}>${S.busy.cost ? '<i class="spin"></i>Estimating…' : sum.any ? 'Estimate the rest with AI' : 'Estimate it with AI'}</button>
      <span class="small muted">${!dest() ? `Pick ${isSmall() ? 'the plan' : 'where you’re going'} first.` : empty ? 'Fills only lines without a real quote or booking.' : 'Every line has a real number. Nice.'}</span></div>`
      : S.sample === null ? `<span class="small muted">AI estimates are off ${IN_CLAUDE ? 'for you right now' : 'until you add your Anthropic API key'}. Type in numbers below.</span>` : ''}
    ${sum.missing.length ? `<div class="cost-flag"><b>Not included yet:</b> ${sum.missing.map(r => esc(r.label.toLowerCase())).join(', ')}. The real total is higher than this.</div>` : ''}
    ${sum.estimates.length ? `<div class="cost-flag soft">${sum.estimates.length === 1 ? `${esc(sum.estimates[0].label)} is an estimate` : `${sum.estimates.length} lines are estimates`}, not live prices. Swap in a real quote when you have one.</div>` : ''}
    ${sum.any && fit.unavailable ? '<div class="row" style="gap:6px"><span class="pill maybe">Budget check unavailable right now</span></div>' : ''}
    ${fit.n && sum.any ? `<div class="row" style="gap:6px">${fit.stale ? '<span class="pill maybe">Earlier check, updating…</span>' : ''}${fit.fits.length ? `<span class="pill lvl-in">Fits ${fit.fits.length}/${fit.n} budget${fit.n === 1 ? '' : 's'}</span>` : ''}${fit.stretch.length ? `<span class="pill lvl-maybe">A stretch for ${esc(budgetWho(fit.stretch))}</span>` : ''}${fit.over.length ? `<span class="pill out" style="color:#D63B3B">Over budget for ${esc(budgetWho(fit.over))}</span>` : ''}${fit.unknown ? `<span class="pill out">${fit.unknown} without a budget</span>` : ''}</div>` : ''}
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
  const lines = costLines(), saved = S.trip.costs || {}, heads = planHeads();
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

