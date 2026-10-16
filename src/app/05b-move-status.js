/* ---------- plan status + the move ---------- */
// Every plan moves through the same stages, computed from what has actually happened.
// "The move" is the one next thing the plan needs: from you if you owe something,
// otherwise from whoever the group is waiting on.
const STAGES = [['draft', 'Draft'], ['gathering', 'Gathering votes'], ['decided', 'Decided'], ['organizing', 'Organizing'], ['confirmed', 'Confirmed'], ['happening', 'Happening'], ['memories', 'Memories']];
const STAGE_LABEL = Object.fromEntries(STAGES);
const going = m => m && ['in', 'confirmed', 'booked'].includes(m.status);
const listNames = ms => { const n = ms.map(m => m.nick || 'Someone'); return n.length <= 2 ? n.join(' and ') : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`; };
const people = n => `${n} ${n === 1 ? 'person' : 'people'}`;
// "Jay hasn’t voted", "Jay and Kim haven’t voted", "4 people haven’t voted"
const whoHas = (w, one, many, rest) => `${w.length <= 2 ? listNames(w) : people(w.length)} ${w.length === 1 ? one : many} ${rest}`;

// Works from the plan document alone (home page) or with its members (inside the plan).
function stageOf(t, ms) {
  const d = t.lockedDates, sz = sizeOf(t);
  if (d && TODAY > d.end) return 'memories';
  if (d && TODAY >= d.start) return 'happening';
  const ins = ms ? ms.filter(going).length : Object.values(t.people || {}).filter(Boolean).length;
  if (!t.lockedDest || !d) return ins >= 2 || (t.pitches?.items || []).length || (t.destinations || []).length ? 'gathering' : 'draft';
  const goers = ms ? ms.filter(going).map(m => m.id) : Object.keys(t.people || {}).filter(k => t.people[k]);
  const booked = goers.length > 0 && goers.every(id => (t.tickets || {})[id]);
  const tasks = Object.values(t.tasks || {}).filter(Boolean), tasksDone = tasks.every(x => x.done);
  const done = (sz !== 'trip' || booked) && (['hangout', 'day'].includes(sz) || !!t.stay) && (t.itinerary || []).length > 0 && tasksDone;
  if (done) return 'confirmed';
  const started = Object.keys(t.tickets || {}).length || t.stay || (t.itinerary || []).length || tasks.some(x => x.done || x.owner);
  return started ? 'organizing' : 'decided';
}

// What the plan is waiting on. `group` is how anyone sees it; `mine` is the same ask
// when you're one of the people it's waiting on; `ask` is the nudge wording.
function blockers() {
  const t = S.trip, ms = active(), small = isSmall(), items = t.pitches?.items || [];
  if (ms.filter(going).length < 2 && !t.lockedDest) return { k: 'invite', who: [], group: 'Only you so far. Get the crew in', tab: 'crew', sel: '[data-act="copyInvite"]', cta: 'Invite friends' };
  if (!t.lockedDest) {
    if (items.length) {
      const ro = runoffState();
      if (ro && !ro.winner) return { k: 'runoff', who: ro.waiting, group: `Final vote: waiting on ${ro.waiting.length <= 2 ? listNames(ro.waiting) : people(ro.waiting.length)}`, mine: 'Vote in the final round', ask: 'vote in the final round', tab: 'match', sel: '.runoff' };
      if (ro && ro.winner) return { k: 'decide', who: [], group: `${pName(ro.winner)} won the final vote. Lock it in`, tab: 'match', sel: '.runoff [data-lockpitch]', cta: 'Lock it in' };
      const w = ms.filter(m => items.some(p => !swipeOf(p.id, m.id)));
      if (w.length) return { k: 'swipe', who: w, group: whoHas(w, 'is', 'are', 'still swiping'), mine: `Swipe on the ${small ? 'plans' : 'trips'}`, ask: `swipe on the ${small ? 'plan' : 'trip'} options`, tab: 'match', sel: '#pitch' };
      const m = matchedPitch();
      if (m) return { k: 'decide', who: [], group: `It’s a match: ${pName(m)}. Lock it in`, tab: 'match', sel: '.match [data-lockpitch]', cta: 'Lock it in' };
      return { k: 'decide', who: [], group: 'No perfect match yet. Settle it', tab: 'match', sel: '.settle', cta: 'Settle it' };
    }
    const ds = t.destinations || [];
    if (!ds.length) return { k: 'ideas', who: [], group: small ? 'No ideas yet. Get pitches or add one' : 'No destinations yet. Get pitches or suggest one', tab: S.sample ? 'match' : 'where', sel: S.sample ? '[data-act="genPitches"]' : '#ad-city', cta: S.sample ? 'Get pitches' : 'Add one' };
    const w = ms.filter(m => !(m.votes || []).length);
    if (w.length) return { k: 'vote', who: w, group: whoHas(w, 'hasn’t', 'haven’t', `voted on ${small ? 'the plan' : 'where'}`), mine: `Vote on ${small ? 'the plan' : 'where to go'}`, ask: `vote on ${small ? 'the plan' : 'where we go'}`, tab: 'where', sel: '[data-vote]' };
    return { k: 'decide', who: [], group: `${dest()?.city || 'One place'} is winning. Lock it in`, tab: 'where', sel: '[data-lockdest]', cta: 'Lock it in' };
  }
  if (!t.lockedDates) {
    const w = ms.filter(m => !(m.days || []).length);
    if (w.length) return { k: 'days', who: w, group: whoHas(w, 'hasn’t', 'haven’t', `picked ${small ? 'days' : 'dates'}`), mine: small ? 'Pick the days that work for you' : 'Pick your dates', ask: `tap the days you’re free`, tab: 'dates', sel: '.cal' };
    const b = bestWindows()[0];
    return b ? { k: 'decide', who: [], group: `${dayRange(b.start, b.end)} works for ${b.ok.length} of ${ms.length}. Lock it`, tab: 'dates', sel: '[data-lockdates]', cta: 'Lock it' }
      : { k: 'decide', who: [], group: `No ${small ? 'day' : 'dates'} work for everyone yet`, tab: 'dates', sel: '.cal', cta: 'See the options' };
  }
  const unsure = ms.filter(m => !m.status || m.status === 'maybe' || m.status === 'in');
  if (unsure.length) return { k: 'confirm', who: unsure, group: whoHas(unsure, 'hasn’t', 'haven’t', 'confirmed yet'), mine: 'Are you definitely coming?', ask: 'confirm you’re coming', tab: 'overview', sel: '.ladder' };
  const open = Object.entries(t.tasks || {}).filter(([, x]) => x && !x.done).map(([id, x]) => ({ id, ...x })).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1);
  const owned = open.find(x => x.owner);
  if (owned) {
    const o = S.members.find(m => m.id === owned.owner);
    return { k: 'task', who: o ? [o] : [], group: `${o ? o.nick || 'Someone' : 'Someone'} is on “${owned.title}”${owned.due ? `, due ${short(owned.due)}` : ''}`, mine: `${owned.title}${owned.due ? ` · due ${short(owned.due)}` : ''}`, ask: `how’s “${owned.title}” going`, tab: 'tasks', sel: `[data-task="${owned.id}"]` };
  }
  if (size() === 'trip') {
    const tk = tickets();
    if (!tk.on) { const w = ms.filter(m => going(m) && !tk.tk[m.id]); return { k: 'book', who: w, group: w.length === 1 ? `One booking left: ${w[0].nick || 'Someone'}` : `${w.length} bookings left`, mine: 'Book your flight and send your boarding pass', ask: 'book your flight and send your boarding pass', tab: 'tickets', sel: '#tk-flight' }; }
  }
  if (open.length) return { k: 'task', who: [], group: `Nobody has taken “${open[0].title}”`, tab: 'tasks', sel: `[data-task="${open[0].id}"]`, cta: 'Take it' };
  if (!small && !t.stay) return { k: 'stay', who: [], group: 'Nobody has picked the stay yet', tab: 'stays', sel: '.stay-card', cta: 'Find stays' };
  if (!(t.itinerary || []).length) return { k: 'plan', who: [], group: small ? `Nothing planned for the ${size() === 'day' ? 'day' : 'night'} yet` : 'No itinerary yet', tab: 'plan', sel: '#addItem', cta: 'Plan it' };
  return null;
}
function theMove() {
  const t = S.trip, d = dates(), st = stageOf(t, S.members);
  if (st === 'memories') return { k: 'done', title: isSmall() ? 'That’s a wrap. Your recap is ready' : `That’s a wrap. Your ${dest()?.city || 'trip'} Wrapped is ready`, tab: 'wrapped', cta: 'Watch it' };
  const b = blockers();
  if (!b) { const cd = countdown(); return { k: 'set', title: st === 'happening' ? 'It’s happening. Have fun' : `All set.${cd ? ' ' + cd.text + ' to go' : ''}`, sub: 'Everything that needed doing is done.' }; }
  const mine = (b.who || []).some(m => m.id === S.uid), others = (b.who || []).filter(m => m.id !== S.uid);
  return {
    ...b, mine,
    title: mine ? b.mine : b.group,
    sub: mine ? (others.length ? `${listNames(others)} still ${others.length === 1 ? 'needs' : 'need'} to as well.` : 'Everyone else is done. It’s on you.')
      : others.length > 2 ? `Waiting on ${listNames(others)}.` : '',
    cta: mine ? 'Do it now' : others.length && b.ask ? 'Nudge them' : b.cta || 'Go',
    nudge: !mine && others.length && b.ask ? others : null,
  };
}
function moveCard() {
  const m = theMove(); if (!m) return '';
  return `<section class="move ${m.mine ? 'mine' : ''} k-${m.k}">
    <span class="move-k">${m.mine ? 'Your move' : m.k === 'set' || m.k === 'done' ? STAGE_LABEL[stageOf(S.trip, S.members)] : 'The move'}</span>
    <h2>${esc(m.title)}</h2>
    ${m.sub ? `<p>${esc(m.sub)}</p>` : ''}
    ${m.who && m.who.filter(x => x.id !== S.uid).length ? `<div class="avs">${m.who.filter(x => x.id !== S.uid).slice(0, 8).map(x => `<span class="av-sm" title="${esc(x.nick || 'Someone')}" style="background:${colorFor(x.id)}">${esc((x.nick || '?')[0].toUpperCase())}</span>`).join('')}</div>` : ''}
    ${m.k === 'confirm' && m.mine ? `<div class="row" style="gap:8px"><button class="btn" data-status="confirmed">Yes, I’m coming</button><button class="btn ghost-light" data-status="out">Can’t make it</button></div>`
      : m.nudge ? `<div class="row" style="gap:8px"><button class="btn" data-act="moveNudge">Nudge ${m.nudge.length === 1 ? esc(m.nudge[0].nick || 'them') : 'them'}</button>${m.tab ? `<button class="btn ghost-light" data-tab="${m.tab}" data-guide="1">Open</button>` : ''}</div>`
      : m.tab ? `<div><button class="btn" data-tab="${m.tab}" data-guide="1">${esc(m.cta)}</button></div>` : ''}
  </section>`;
}
function stageTrack() {
  const cur = STAGES.findIndex(([k]) => k === stageOf(S.trip, S.members));
  return `<section class="card stage-track" aria-label="Plan status: ${esc(STAGES[cur][1])}">
    <ol>${STAGES.map(([k, l], i) => `<li class="${i < cur ? 'st-done' : i === cur ? 'cur' : ''}"><i></i><span>${l}</span></li>`).join('')}</ol>
  </section>`;
}
function nudgeMove() {
  const m = theMove(); if (!m || !m.nudge) return;
  const names = m.nudge.map(x => x.nick || 'Someone').join(', ');
  sendInvite(`${names}: can you ${m.ask} for ${S.trip.name}? It’s the one thing the plan is waiting on.`, inviteLink(), S.trip.name);
}
// The plan's current move is saved on the plan, so the home page can show it without
// loading every plan's members. Written only when it changes.
let pulseT = 0;
function syncPulse() {
  if (!S.trip || S.demo || !S.db || !S.membersIn || S.readOnly) return;
  const b = blockers(), st = stageOf(S.trip, S.members);
  const pulse = { stage: st, k: b?.k || '', text: b ? b.group : (st === 'confirmed' ? 'All set' : ''), mine: b?.mine || '', who: (b?.who || []).map(m => m.id), und: undecided().map(m => m.id) };
  const old = S.trip.pulse || {}, miles = syncMilestones();
  const same = old.stage === pulse.stage && old.k === pulse.k && old.text === pulse.text && old.mine === pulse.mine && (old.who || []).join() === pulse.who.join() && (old.und || []).join() === pulse.und.join();
  if (same && !miles) return;
  clearTimeout(pulseT); const tid = S.tid;
  pulseT = setTimeout(() => { if (S.tid === tid) S.db.doc('trips/' + tid).update({ ...(same ? {} : { pulse: { ...pulse, at: Date.now() } }), ...(miles ? { miles } : {}) }).catch(() => {}); }, 1200);
}
function stagePill(t, ms) {
  const st = stageOf(t, ms);
  return `<span class="stage-pill s-${st}">${STAGE_LABEL[st]}</span>`;
}
// One line for a plan on the home page: your move if it's on you, otherwise what it's waiting on.
function moveLine(t) {
  const p = t.pulse, st = stageOf(t);
  if (st === 'memories') return isSmall(t) ? 'Recap ready' : 'Wrapped is ready';
  if (!p || !p.text) return planStatus(t);
  if ((p.who || []).includes(S.uid) && p.mine) return `<b class="your-move">Your move:</b> ${esc(p.mine)}`;
  return esc(p.text);
}

