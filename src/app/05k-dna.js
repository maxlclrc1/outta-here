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
  // late stops and nightlife in a family trip or offsite came from picks once added at 22:30 as nightlife, so they don't make a crew night owls
  const social = ps.filter(t => !planKind(t).spots).flatMap(t => (t.itinerary || []).filter(i => !i.secret));
  const timed = items.filter(i => i.time);
  const add = (k, label, evidence) => traits.push({ k, label: (dna.fix || {})[k] || label, auto: label, evidence, hidden: !!(dna.hidden || {})[k], fixed: !!(dna.fix || {})[k] });
  // when they go out
  if (timed.length >= 5) {
    const late = social.filter(i => i.time && isLate(i.time)).length, early = timed.filter(i => i.time < '10:00' && i.time >= '04:00').length;
    if (late / timed.length >= 0.3) add('owls', 'Night owls', `${late} of ${timed.length} planned stops start after 10pm`);
    else if (early / timed.length >= 0.3) add('early', 'Early starters', `${early} of ${timed.length} planned stops start before 10am`);
  }
  // what fills the itinerary
  if (items.length >= 5) {
    const food = items.filter(isFoody).length, night = social.filter(i => i.kind === 'nightlife').length, act = items.filter(i => i.kind === 'activity').length;
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
