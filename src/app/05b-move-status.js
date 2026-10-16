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

// The step the plan is waiting on, the same for everyone looking (unlike the guide's focus,
// which leads with your own move). Used for the home rows and the nudge wording.
function groupStep() {
  const j = journey(), live = j.steps.filter(s => s.status === 'ready' || s.status === 'waiting');
  const order = s => JSTAGES.findIndex(([k]) => k === s.stage) * 10 + ((s.who || []).length ? 0 : 1);
  return [...live].sort((a, b) => order(a) - order(b))[0] || null;
}
// The plan's current move is saved on the plan, so the home page can show it without
// loading every plan's members. Written only when it changes.
let pulseT = 0;
function syncPulse() {
  if (!S.trip || S.demo || !S.db || !S.membersIn || S.readOnly) return;
  const b = groupStep(), st = stageOf(S.trip, S.members);
  const pulse = { stage: st, k: b?.k || '', text: b ? b.group || b.title : (st === 'confirmed' ? 'All set' : ''), mine: b?.mineText || '', who: (b?.who || []).map(m => m.id), und: undecided().map(m => m.id) };
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

