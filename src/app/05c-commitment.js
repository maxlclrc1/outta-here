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
      <div class="row" style="gap:8px;align-items:flex-end"><label class="field" style="flex:0 1 190px"><span class="label">Everyone answers by</span><input id="rsvp-by" type="date" value="${esc(by || '')}" min="${TODAY}"></label>${by ? '<button class="btn sm ghost" data-act="rsvpClear">No deadline</button>' : ''}</div>
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

