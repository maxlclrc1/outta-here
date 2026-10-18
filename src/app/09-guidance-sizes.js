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
// what to point at next: the journey's focus step for you (see 05n-journey.js)
function guide() {
  if (!S.trip || isLive() || S.demo && !S.trip.pitches) return null;
  const f = journey().focus; if (!f || f.live) return null;
  if (!f.mine && f.status === 'waiting') return { tab: f.help?.tab, wait: true, label: f.group || f.title, k: f.k };
  return { tab: f.help?.tab, sel: f.help?.sel, label: f.mine && f.mineText ? f.mineText : f.title, k: f.k };
}
const DONE_TEXT = { invite: 'The crew’s in', honoree: 'Guest of honor set', rsvp: 'Everyone has answered', dest: 'Decided where', dates: 'Dates locked', confirm: 'Everyone confirmed', venue: 'Place and time set', flights: 'Everyone’s booked', stay: 'Stay locked', plan: 'The plan is sketched', tasks: 'Every to-do done', booked: 'Stay booked', arrivals: 'Arrivals are in', meet: 'Meeting point set', settle: 'All settled up' };
function checkMilestones() {
  if (!S.trip || S.demo || S.setup) return;
  const done = journey().done.map(s => s.k), key = 'outta_done2_' + S.tid;
  let seen = null; try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  try { localStorage.setItem(key, JSON.stringify(done)); } catch {}
  if (!seen) return; // first visit to this trip on this device: no fanfare for old progress
  const fresh = done.filter(l => !seen.includes(l));
  if (!fresh.length) return;
  const g = guide();
  const k = fresh[fresh.length - 1]; showMilestone(k === 'dest' && isSmall() ? 'Plan locked' : DONE_TEXT[k] || 'Step done', g && !g.wait ? g : null);
}
let msTimer;
function showMilestone(title, g) {
  document.querySelector('.milestone')?.remove();
  const el = document.createElement('div');
  el.className = 'milestone'; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ms-check" aria-hidden="true">✓</span><div style="min-width:0;flex:1"><b>${esc(title)}</b>${g ? `<span class="ms-next">Next: ${esc(g.label)}</span>` : ''}</div>${g ? `<button class="btn sm primary" data-ms-go="${g.k}">Go</button>` : ''}`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { const b = e.target.closest('[data-ms-go]'); if (b) jGo(b.dataset.msGo); el.remove(); });
  clearTimeout(msTimer); msTimer = setTimeout(() => el.remove(), 6500);
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
// What each kind of plan doesn't get, on top of what its size hides (Friends, Celebration, Family, Work ×
// small or away). Hiding is display only: nothing is deleted, and a feature a plan already uses (it has
// to-dos, bucket items, pot entries or award votes) stays visible, so older plans keep everything they had.
const GROUP_HIDE = {
  friends: { small: ['tasks', 'map', 'bucket'], away: [] },
  celebration: { small: ['map', 'bucket'], away: [] },
  family: { small: ['tasks', 'map', 'bucket', 'awards'], away: ['pot', 'bucket', 'awards'] },
  work: { small: ['map', 'bucket', 'awards', 'wrapped'], away: ['pot', 'bucket', 'awards', 'wrapped'] },
};
const IN_USE = { tasks: () => taskList().length > 0, bucket: () => S.bucket.length > 0, pot: () => S.pot.length > 0, awards: () => Object.keys(S.trip.superVotes || {}).length > 0 };
// the group pot is for splitting; a plan where one person or a company pays doesn't show it (unless it's in use)
const hiddenTabs = () => [...HIDE_TABS[size()], ...[...GROUP_HIDE[planGroup()][isSmall() ? 'small' : 'away'], ...(paysMode() === 'split' ? [] : ['pot'])].filter(k => !IN_USE[k]?.())];
const tabOn = k => !hiddenTabs().includes(k);
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
    </div>
  </section>`;
}
function growPlan() {
  const t = S.trip, to = size() === 'weekend' ? 'trip' : 'weekend', end = t.winEnd < add(TODAY, SIZES[to].win) ? add(TODAY, SIZES[to].win) : t.winEnd;
  saveTrip({ size: to, nights: SIZES[to].nights, winEnd: end, lockedDates: null }).then(ok => ok && flash(`It’s a ${SIZES[to].label.toLowerCase()} now. Everyone’s votes are kept. Pick the nights in Dates.`));
}

/* Plan Match for hangouts and days out: the AI pitches whole evenings, the crew swipes */
function genPlanPitches() {
  takeNote();
  const opts = dateOptions().slice(0, 4); if (!opts.length) { flash('Set which days could work first.'); return; }
  const t = S.trip, b = budgetCap(), evening = size() === 'hangout';
  const prompt = `You're pitching plans to a ${planKind().group}. Each person swipes yes or no, like a dating app, so make every pitch specific, fun and honest.
Plan type: ${evening ? 'one evening out or in' : 'a full day out'}${mode() !== MODES.friends ? ` (${modeLabel(mode(), size())}. ${modeAi()})` : ''}.
City: ${t.city || 'unknown, assume a big US city'}.
Crew: ${active().length} people. Max spend per person: ${b ? `${b.label}; keep it at or under ${money(b.cap)}` : 'not set, keep it moderate'}.
${blend() ? 'Crew vibe quiz:\n' + blendText() : 'Vibe: ' + vibeDefault('small')}
Ideas the crew already suggested: ${(t.destinations || []).map(d => d.city).join(', ') || 'none'}
${pitchMemory()}
Day options (use one exactly per pitch):
${opts.map((o, i) => `${i + 1}) ${o.start} (${dow(o.start)}, ${o.ok}/${active().length} free)`).join('\n')}

Give 6 different plans that use real, well-known places in that city: mix ${planKind().smallMix || 'a dinner-and-drinks night, an activity (bowling, karaoke, a class, a show), something low-key, and something new'}. Prefer the days most people can make.
Reply with only JSON: {"pitches":[{"title":"the plan in 2-5 words","tagline":"punchy, 4-9 words","where":"main place or neighborhood","date":"YYYY-MM-DD","time":"HH:MM start","perPerson":"$25–40","vibeMatch":82,"why":"one or two sentences on why this crew would love it","steps":[{"time":"HH:MM","title":"place or activity"}],"weather":"short, or empty if it's indoors"}]}`;
  askAI('pitch', prompt, data => {
    const valid = new Map(opts.map(o => [o.start, o]));
    const items = (Array.isArray(data?.pitches) ? data.pitches : []).filter(p => p && p.title).slice(0, 8).map(p => {
      const o = valid.get(p.date) || opts[0], steps = arr(p.steps).slice(0, 5).map(s => ({ time: hhmm(s.time), title: String(s.title || '').slice(0, 80) })).filter(s => s.title);
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
  if (!(S.trip.itinerary || []).length && p.steps?.length) patch.itinerary = p.steps.filter(s => !isDropped(s)).map(s => ({ id: rid(6), date: p.start, time: s.time, title: s.title, kind: 'plan', note: '', ai: true }));
  saveTrip(withLog(patch, { area: 'dest', text: `Locked in: ${p.title}, ${fmt(p.start)}${p.time ? ' at ' + t12(p.time) : ''}`, act: 'all', undo: { k: 'set', patch: { lockedDest: S.trip.lockedDest || null, lockedDates: S.trip.lockedDates || null, time: S.trip.time || '', venue: S.trip.venue || '' } } })).then(ok => { if (!ok) return; celebrate(p.title, planColor(S.trip), 'Locked in!'); flash(`Locked: ${p.title}, ${fmt(p.start)}${p.time ? ' at ' + t12(p.time) : ''}.`); });
}

