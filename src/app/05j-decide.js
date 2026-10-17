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
  const bh = budgetHits(o);
  if (bh.pending) return { ok: false, why: 'Checking everyone’s budget limits. Try again in a second.' };
  if (bh.unavailable) return { ok: false, why: 'Couldn’t check everyone’s budget limits just now. Try again in a minute.' };
  const hits = hardHits(o);
  if (hits.length) {
    const me = hits.find(m => m.id === S.uid);
    return { ok: false, why: me && hits.length === 1 ? 'This breaks your own hard limit. Tap “I’m okay with this one” first.' : `This is over a hard limit for ${limitWho(hits, o)}. They have to agree to it first.` };
  }
  // an earlier answer can warn, but can't clear a lock
  if (bh.stale) return { ok: false, why: 'Couldn’t confirm everyone’s budget limits just now. Try again in a minute.' };
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
  const r = ruleCheck(o), hits = hardHits(o), soft = softHits(o), out = [], bh = budgetHits(o);
  if (hits.length) out.push(`<span class="fit-c n">✕ Over a hard limit for ${esc(limitWho(hits, o))}${bh.stale ? ' (earlier check)' : ''}</span>`);
  else if (bh.unavailable || bh.stale) out.push('<span class="fit-c m">~ Budget limits can’t be checked right now</span>');
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
    ${d.style === 'pick' ? `<label class="field" style="flex:none;max-width:240px"><span class="label">Voting closes</span><input id="dec-by" type="date" value="${esc(d.by || '')}" min="${TODAY}" ${org ? '' : 'disabled'}></label>` : ''}
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
  saveTrip({ consent: { [key]: { [S.uid]: on || null } } }).then(ok => ok && flash(on ? 'Noted. The crew can lock it now, as far as your limit goes.' : 'Taken back. It’s off the table unless your limit changes.'));
}
