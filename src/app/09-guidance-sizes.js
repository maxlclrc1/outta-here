/* ---------- invites ---------- */
const SHARE_BASE = window.OUTTA_SHARE_BASE || (location.origin + '/');
const IN_CLAUDE = !!window.OUTTA_SHARE_BASE;
const inviteLink = () => linkFor({ id: S.tid, inviteKey: S.trip?.inviteKey });
function inviteCard() {
  if (S.demo) return `<section class="card stack"><h2>Invite the crew</h2><p class="small muted">Invites work on real trips. Start one from the home screen.</p></section>`;
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Invite the crew</h2><span class="small muted">${S.members.length} in the ${planWord()}</span></div>
    ${IN_CLAUDE ? `<ol class="small steps-list"><li>Open this page’s <b>Share</b> menu and invite each friend by email as an <b>Editor</b>. Viewers can look but can’t vote or swipe.</li><li>Send them the invite below. It opens this trip directly.</li></ol>`
      : `<p class="small muted">Send this link. Friends type their name and land right in this ${planWord()}.</p>`}
    <span class="invite-link mono">${esc(inviteLink())}</span>
    <div class="row" style="gap:6px"><button class="btn primary" data-act="copyInvite">Send invite</button></div>
  </section>`;
}

/* ---------- guidance ----------
   Like a landmark on the horizon: the app always shows your next move (the pill under the trip name),
   drops a breadcrumb on the menu and tab where it lives, and makes the exact control glow when you get
   there. Nothing is forced; you can go anywhere. Finishing a stage gets a short celebration. */
const timeKey = t => !t ? '9' : (t < '05:00' ? '2' : '1') + t; // after-midnight plans belong at the end of the night
const byTime = (a, b) => timeKey(a.time).localeCompare(timeKey(b.time));
function guide() {
  if (!S.trip) return null;
  const me = meDoc(), t = S.trip, d = dates();
  if (isLive()) return null; // live mode has its own quick actions
  if (d && TODAY > d.end) return { tab: 'wrapped', sel: '.wslide', label: 'Watch your Trip Wrapped' };
  if (!me || me.status === 'maybe') return { tab: 'overview', sel: showWelcome() ? '.welcome [data-join="in"]' : '.pass-stub [data-status="in"]', label: 'Tell the crew if you’re in' };
  if (me.status === 'out') return null;
  const tk = tickets(), items = t.pitches?.items || [];
  for (const s of steps().filter(x => !x.done)) {
    if (s.go === 'crew') return S.members.length >= 2 ? { tab: 'crew', sel: '[data-act="copyNudge"]', label: 'Nudge the crew to say they’re in' } : { tab: 'crew', sel: '[data-act="copyInvite"]', label: 'Invite your friends' };
    if (s.go === 'match') {
      const ro = runoffState(); if (ro && !ro.mine && !ro.winner) return { tab: 'match', sel: '.runoff', label: 'Vote in the final round' };
      if (ro && ro.winner) return { tab: 'match', sel: '.runoff [data-lockpitch]', label: `Lock in ${pName(ro.winner)}` };
      if (!ro && items.length && active().length >= 2 && !matchedPitch() && active().every(m => items.every(p => swipeOf(p.id, m.id)))) return { tab: 'match', sel: '.settle', label: 'No perfect match. Settle it' };
      if (items.some(x => !swipeOf(x.id, S.uid))) return { tab: 'match', sel: '#pitch', label: 'Swipe on the pitches' };
      if (!items.length && S.sample) return { tab: 'match', sel: '[data-act="genPitches"]', label: isSmall() ? 'Get AI plan pitches' : 'Get AI trip pitches' };
      if (!(t.destinations || []).length) return { tab: 'match', sel: '#ad-city', label: isSmall() ? 'Suggest a plan' : 'Suggest a destination' };
      if (!(me.votes || []).length) return { tab: 'match', sel: '[data-vote]', label: 'Vote on where to go' };
      return { tab: 'match', sel: '[data-lockdest]', label: isSmall() ? 'Lock the plan' : 'Lock the destination' };
    }
    if (s.go === 'dates') {
      if (!(me.days || []).length) return { tab: 'dates', sel: '.cal', label: 'Tap the days you’re free' };
      return bestWindows()[0] ? { tab: 'dates', sel: '[data-lockdates]', label: 'Lock the best dates' } : { tab: 'dates', sel: '[data-setnights]', label: 'Find dates that work' };
    }
    if (s.go === 'flights' && !tk.tk[S.uid]) {
      if (!me.home) return { tab: 'crew', sel: '#me-home', label: 'Add where you fly from' };
      return { tab: 'flights', sel: '.fl-route.mine .btn.primary', label: 'Book your flight' };
    }
    if (s.go === 'stays') {
      const opts = t.stays?.items || [];
      if (opts.length && !opts.some(o => score(rkey('st' + o.name)).mine)) return { tab: 'stays', sel: '.stay .votes', label: 'Vote on where to stay' };
      if (opts.length) return { tab: 'stays', sel: '[data-lockstay]', label: 'Lock the stay' };
      return S.sample ? { tab: 'stays', sel: '[data-act="findStays"]', label: 'Find places to stay' } : { tab: 'stays', sel: '.linkrow .btn', label: 'Search for a place to stay' };
    }
    if (s.go === 'plan') return S.sample ? { tab: 'plan', sel: '[data-act="plan"]', label: 'Plan the days' } : { tab: 'plan', sel: '.addItem input[id^="ai-title"]', label: 'Plan the days' };
  }
  const left = steps().find(x => !x.done);
  if (left) return { tab: left.go, wait: true, label: 'Waiting on the crew to ' + left.label.toLowerCase().replace(/^book/, 'book') };
  if (!me.budget) return { tab: 'crew', sel: '#me-budget', label: 'Set your budget' };
  return null;
}
const DONE_TEXT = { 'Pick the plan': 'Plan locked', 'Pick the day': 'Day locked. It’s on', 'Plan the night': 'Night planned', 'Plan the day': 'Day planned', 'Get the crew in': 'The crew’s in', 'Pick where': 'Destination locked', 'Lock the dates': 'Dates locked', 'Book flights': 'Everyone’s booked. Trip is ON', 'Book the stay': 'Stay locked', 'Plan the days': 'Days planned' };
function checkMilestones() {
  if (!S.trip || S.demo || S.setup) return;
  const done = steps().filter(s => s.done).map(s => s.label), key = 'outta_done_' + S.tid;
  let seen = null; try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  try { localStorage.setItem(key, JSON.stringify(done)); } catch {}
  if (!seen) return; // first visit to this trip on this device: no fanfare for old progress
  const fresh = done.filter(l => !seen.includes(l));
  if (!fresh.length) return;
  const g = guide();
  showMilestone(DONE_TEXT[fresh[fresh.length - 1]] || fresh[fresh.length - 1], g && !g.wait ? g : null);
}
let msTimer;
function showMilestone(title, g) {
  document.querySelector('.milestone')?.remove();
  const el = document.createElement('div');
  el.className = 'milestone'; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ms-check" aria-hidden="true">✓</span><div style="min-width:0;flex:1"><b>${esc(title)}</b>${g ? `<span class="ms-next">Next: ${esc(g.label)}</span>` : ''}</div>${g ? `<button class="btn sm primary" data-ms-go="${g.tab}">Go</button>` : ''}`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { const b = e.target.closest('[data-ms-go]'); if (b) { S.tab = b.dataset.msGo; S.secTab[secOf(S.tab).k] = S.tab; S.guideJump = true; render(); window.scrollTo({ top: 0 }); } el.remove(); });
  clearTimeout(msTimer); msTimer = setTimeout(() => el.remove(), 6500);
}
function nextPill(g) {
  if (!g || S.tab === g.tab && !g.wait) return '';
  return g.wait ? `<div class="next-pill wait"><span><span class="np-k">Next</span><br>${esc(g.label)}</span></div>`
    : `<button class="next-pill" data-tab="${g.tab}" data-guide="1"><span><span class="np-k">Your next move</span><br>${esc(g.label)}</span><span class="np-go">Go →</span></button>`;
}
function applyBeacon() {
  const g = guide(); if (!g || g.wait || !g.sel || S.tab !== g.tab) { S.guideJump = false; return; }
  const el = document.querySelector(g.sel); if (!el) return;
  el.classList.add('beacon');
  if (S.guideJump) { S.guideJump = false; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 120); }
}
let lastY = 0;
window.addEventListener('scroll', () => {
  const f = document.querySelector('.fab-lost'); const y = window.scrollY;
  if (f) f.classList.toggle('tucked', y > lastY + 4 && y > 120);
  lastY = y;
}, { passive: true });

/* ---------- plans of every size ----------
   The crew is the center; everything you do together is a plan. A plan's size decides how much of the
   app it shows: a hangout is one evening (no flights, no packing), a trip is the full thing. */
const SIZES = {
  hangout: { label: 'Hangout', desc: 'Dinner, drinks, game night. One evening.', nights: 0, win: 6, ph: 'Friday dinner', color: '#14915F' },
  day: { label: 'Day out', desc: 'Beach day, concert, a day trip nearby.', nights: 0, win: 13, ph: 'Beach day', color: '#1098AD' },
  weekend: { label: 'Weekend', desc: 'A night or two away. Cabin, road trip, nearby city.', nights: 2, win: 45, ph: 'Cabin weekend', color: '#E8590C' },
  trip: { label: 'Trip', desc: 'Flights, stays, the full thing.', nights: 3, win: 60, ph: 'Vegas, finally', color: '#D41C78' },
};
const size = () => SIZES[S.trip?.size] ? S.trip.size : 'trip';
const isSmall = (t = S.trip) => ['hangout', 'day'].includes(t?.size);
const nightsSet = t => t.nights ?? (SIZES[t.size] || SIZES.trip).nights;
const sizeOf = t => SIZES[t.size] ? t.size : 'trip';
const HIDE_TABS = { hangout: ['flights', 'stays', 'tickets', 'pack', 'bucket', 'pot'], day: ['flights', 'stays', 'tickets', 'pack', 'pot'], weekend: ['flights', 'tickets'], trip: [] };
const STEP_KEYS = { hangout: ['crew', 'where', 'dates'], day: ['crew', 'where', 'dates', 'plan'], weekend: ['crew', 'where', 'dates', 'stay', 'plan'], trip: ['crew', 'where', 'dates', 'flights', 'stay', 'plan'] };
const t12 = hm => { if (!hm) return ''; const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const dayRange = (a, b) => a === b ? fmt(a) : `${fmt(a)} → ${fmt(b)}`;
function planOn() {
  if (size() === 'trip') return tickets().on;
  return !!(S.trip.lockedDest && S.trip.lockedDates && S.members.filter(going).length >= 2);
}
function passSmall() {
  const d = dates(), ds = dest(), t = S.trip, inN = S.members.filter(going).length, c = countdown(), on = planOn();
  return `<section class="pass">
    <div class="pass-main">
      <div class="row" style="justify-content:space-between"><span class="label">${esc(SIZES[size()].label)} · ${esc(t.name)}</span>
        ${on ? `<span class="on-pill">It’s on</span>` : stagePill(S.trip, S.members)}</div>
      <div class="ev-title ${ds ? '' : 'code-tbd'}">${ds ? esc(ds.city) : 'The plan: TBD'}</div>
      <div class="facts">
        <div><span class="label">When${d && !d.locked ? ' · best so far' : ''}</span><b>${d ? dayRange(d.start, d.end) : 'TBD'}${t.time ? ' · ' + t12(t.time) : ''}</b></div>
        <div><span class="label">Where</span><b style="font-family:var(--f-body)">${esc(t.venue || t.city || 'TBD')}</b></div>
        ${c ? `<div><span class="label">Countdown</span><b style="color:var(--accent)">${c.text}</b></div>` : ''}
      </div>
      <div class="row" style="gap:6px"><button class="btn sm" data-act="card">Make story card</button>${size() !== 'trip' ? `<button class="btn sm ghost" data-act="growPlan">Make it a ${size() === 'weekend' ? 'trip' : 'weekend or trip'}</button>` : ''}</div>
      ${S.cardUrl ? `<div class="row" style="align-items:flex-end;gap:14px"><img class="cardimg" src="${S.cardUrl}" alt="Story card for ${esc(t.name)}">
        <div class="stack" style="gap:8px">${S.downloads ? `<button class="btn primary sm" data-act="saveCard">Save image</button>` : `<span class="small muted">Press and hold the image to save it.</span>`}<button class="btn sm ghost" data-act="closeCard">Close</button></div></div>` : ''}
    </div>
    <div class="pass-stub">
      <div><span class="label">Crew</span><div class="code" style="font-size:40px">${inN}<span class="muted" style="font-size:22px">/${S.members.length}</span></div><span class="small muted">going</span></div>
      ${commitLadder()}
    </div>
  </section>`;
}
function growPlan() {
  const t = S.trip, to = size() === 'weekend' ? 'trip' : 'weekend', end = t.winEnd < add(TODAY, SIZES[to].win) ? add(TODAY, SIZES[to].win) : t.winEnd;
  saveTrip({ size: to, nights: SIZES[to].nights, winEnd: end, lockedDates: null });
  flash(`It’s a ${SIZES[to].label.toLowerCase()} now. Everyone’s votes are kept. Pick the nights in Dates.`);
}

/* Plan Match for hangouts and days out: the AI pitches whole evenings, the crew swipes */
function genPlanPitches() {
  takeNote();
  const opts = dateOptions().slice(0, 4); if (!opts.length) { flash('Set which days could work first.'); return; }
  const t = S.trip, b = budgetCap(), evening = size() === 'hangout';
  const prompt = `You're pitching plans to a friend group. Each person swipes yes or no, like a dating app, so make every pitch specific, fun and honest.
Plan type: ${evening ? 'one evening out or in' : 'a full day out'}${mode().label !== 'Friends trip' ? ` (${mode().label}. ${mode().ai})` : ''}.
City: ${t.city || 'unknown, assume a big US city'}.
Crew: ${active().length} people. Max spend per person: ${b ? money(b.cap) : 'not set, keep it moderate'}.
${blend() ? 'Crew vibe quiz:\n' + blendText() : 'Vibe: fun, social'}
Ideas the crew already suggested: ${(t.destinations || []).map(d => d.city).join(', ') || 'none'}
${pitchMemory()}
Day options (use one exactly per pitch):
${opts.map((o, i) => `${i + 1}) ${o.start} (${dow(o.start)}, ${o.ok}/${active().length} free)`).join('\n')}

Give 6 different plans that use real, well-known places in that city: mix a dinner-and-drinks night, an activity (bowling, karaoke, a class, a show), something low-key, and something new. Prefer the days most people can make.
Reply with only JSON: {"pitches":[{"title":"the plan in 2-5 words","tagline":"punchy, 4-9 words","where":"main place or neighborhood","date":"YYYY-MM-DD","time":"HH:MM start","perPerson":"$25–40","vibeMatch":82,"why":"one or two sentences on why this crew would love it","steps":[{"time":"HH:MM","title":"place or activity"}],"weather":"short, or empty if it's indoors"}]}`;
  askAI('pitch', prompt, data => {
    const valid = new Map(opts.map(o => [o.start, o]));
    const items = (Array.isArray(data?.pitches) ? data.pitches : []).filter(p => p && p.title).slice(0, 8).map(p => {
      const o = valid.get(p.date) || opts[0], steps = (p.steps || []).slice(0, 5).map(s => ({ time: String(s.time || '').slice(0, 5), title: String(s.title || '').slice(0, 80) })).filter(s => s.title);
      return { id: rid(6), small: true, title: String(p.title).slice(0, 50), city: String(p.title).slice(0, 50), code: '', start: o.start, end: o.start, time: /^\d\d:\d\d$/.test(p.time) ? p.time : '',
        where: String(p.where || '').slice(0, 60), tagline: String(p.tagline || '').slice(0, 80), why: String(p.why || '').slice(0, 300), perPerson: String(p.perPerson || '').slice(0, 30),
        vibeMatch: Math.max(0, Math.min(100, Math.round(+p.vibeMatch || 0))), highlights: steps.map(s => (s.time ? t12(s.time) + ' · ' : '') + s.title), steps, weather: String(p.weather || '').slice(0, 60) };
    });
    if (!items.length) { flash('No plans came back. Try again.'); return; }
    return saveTrip({ pitches: { items, at: Date.now() }, pitchHistory: nextHistory(), runoff: null });
  });
}
function lockSmallPitch(p) {
  const ds = [...(S.trip.destinations || [])];
  let d = ds.find(x => x.city.toLowerCase() === p.title.toLowerCase());
  if (!d) { d = { id: rid(6), city: p.title, code: '' }; ds.push(d); }
  const patch = { destinations: ds, lockedDest: d.id, lockedDates: { start: p.start, end: p.start }, time: p.time || '', venue: p.where || '' };
  if (!(S.trip.itinerary || []).length && p.steps?.length) patch.itinerary = p.steps.map(s => ({ id: rid(6), date: p.start, time: s.time, title: s.title, kind: 'plan', note: '', ai: true }));
  saveTrip(withLog(patch, { area: 'dest', text: `Locked in: ${p.title}, ${fmt(p.start)}${p.time ? ' at ' + t12(p.time) : ''}`, act: 'all', undo: { k: 'set', patch: { lockedDest: S.trip.lockedDest || null, lockedDates: S.trip.lockedDates || null, time: S.trip.time || '', venue: S.trip.venue || '' } } }));
  flash(`Locked: ${p.title}, ${fmt(p.start)}${p.time ? ' at ' + t12(p.time) : ''}.`);
}

