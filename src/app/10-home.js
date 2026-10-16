/* ---------- crews ---------- */
const crewMembers = c => [...new Set([...(c.ids || []), ...Object.keys(c.people || {}).filter(k => c.people[k])])];
const myCrews = () => S.crews.filter(c => c.by === S.uid || crewMembers(c).includes(S.uid));
const crewNick = (c, id) => c.profiles?.[id]?.nick || 'Someone';
function myPlans() {
  const crewIds = new Set(myCrews().map(c => c.id));
  return S.trips.filter(t => (t.people || {})[S.uid] || (!(t.left || {})[S.uid] && (t.createdBy === S.uid || (t.crewId && crewIds.has(t.crewId)))));
}
const planWhen = t => t.lockedDates ? (t.lockedDates.start === t.lockedDates.end ? fmt(t.lockedDates.start) : `${short(t.lockedDates.start)} – ${short(t.lockedDates.end)}`) + (t.time ? ' · ' + t12(t.time) : '') : '';
function planStatus(t) {
  if (t.lockedDest && t.lockedDates) return 'Locked in';
  if (t.lockedDest) return 'Picking the day';
  if (t.lockedDates) return isSmall(t) ? 'Picking the plan' : 'Picking where';
  return isSmall(t) ? 'Picking the plan and the day' : 'Picking where and when';
}
function planRow(t, opts = {}) {
  const sz = SIZES[sizeOf(t)], crew = S.crews.find(c => c.id === t.crewId), name = (t.destinations || []).find(d => d.id === t.lockedDest)?.city;
  const daysTo = t.lockedDates ? Math.round((D(t.lockedDates.start) - D(TODAY)) / 864e5) : null;
  return `<div class="card plan-row" style="--pc:${sz.color}">
    <div class="pr-date">${t.lockedDates ? `<b>${D(t.lockedDates.start).getUTCDate()}</b><span>${fmt(t.lockedDates.start, { month: 'short' })}</span>` : '<b>?</b><span>TBD</span>'}</div>
    <div class="stack" style="gap:2px;min-width:0;flex:1">
      <span class="label" style="color:var(--pc)">${esc(sz.label)}${crew && !opts.noCrew ? ' · ' + esc(crew.name) : ''}</span>
      <h3>${esc(t.name)}</h3>
      <span class="small muted">${t.lockedDates ? esc(planWhen(t)) + (name && name !== t.name ? ' · ' + esc(name) : '') : esc(planStatus(t))}${daysTo !== null && daysTo >= 0 ? ` · <b style="color:var(--pc)">${daysTo === 0 ? 'Today' : daysTo === 1 ? 'Tomorrow' : 'in ' + daysTo + ' days'}</b>` : ''}</span>
    </div>
    <div class="pr-acts">${S.confirmHome === t.id
      ? `<span class="small pr-ask">Delete for everyone?</span><button class="btn sm ghost" data-act="homeCancel">Cancel</button><button class="btn sm danger-fill" data-homedo="${esc(t.id)}">Delete</button>`
      : `${canDelete(t) ? `<button class="btn sm ghost icon pr-del" data-homedel="${esc(t.id)}" aria-label="Delete ${esc(t.name)}" title="Delete"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button>` : ''}<button class="btn sm" data-share="${esc(t.id)}" aria-label="Share ${esc(t.name)}">Share</button><button class="btn sm primary" data-open="${esc(t.id)}">Open</button>`}</div>
    ${S.shareHome === t.id && S.copyText ? `<textarea class="pr-copy" id="copybox" readonly>${esc(S.copyText)}</textarea>` : ''}
  </div>`;
}
function homeView() {
  if (S.loading && /^#[a-z0-9]{6,20}$/.test(location.hash)) return `${topBar()}<p class="muted">Loading…</p>`;
  if (S.creating === 'crew') return pickCrewStep();
  if (S.creating === 'size') return pickSizeStep();
  if (S.creating === 'mode') return modePicker();
  if (S.creating === 'form') return newTripForm();
  if (S.crewView) return crewPage(S.crewView);
  const canSave = !!S.db, plans = myPlans(), crews = myCrews();
  const live = plans.filter(t => t.lockedDates && t.lockedDates.start <= TODAY && t.lockedDates.end >= TODAY);
  const upcoming = plans.filter(t => t.lockedDates && t.lockedDates.start > TODAY).sort((a, b) => a.lockedDates.start < b.lockedDates.start ? -1 : 1);
  const deciding = plans.filter(t => !t.lockedDates && (!t.winEnd || t.winEnd >= TODAY)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const past = plans.filter(t => (t.lockedDates && t.lockedDates.end < TODAY) || (!t.lockedDates && t.winEnd && t.winEnd < TODAY));
  const fresh = canSave && S.tripsLoaded && !plans.length && !crews.length;
  return `${topBar()}
  <section class="hero ${fresh ? '' : 'hero-sm'}">
    <span class="label">${S.myName ? 'Hey ' + esc(S.myName) : 'Your crew’s plans, from Friday night to Tulum'}</span>
    <h1>${fresh ? 'Get the group chat out the door.' : 'What are we doing?'}</h1>
    ${fresh ? '<p>Hangouts, day trips and full-on trips with your crews. The AI pitches plans that fit everyone, the crew swipes, and when everyone matches, it’s on.</p>' : ''}
    <div class="row"><button class="btn primary big" data-act="newTrip" ${canSave ? '' : 'disabled'}>New plan</button>${canSave ? '<button class="btn" data-act="newCrew">New crew</button>' : ''}<button class="btn ghost" data-act="demo">See the demo</button></div>
    ${!canSave && !S.loading ? `<span class="small muted">${IN_CLAUDE ? 'Couldn’t connect. Reload the page to try again.' : 'Can’t reach the local server. Start it with npm run dev, then reload.'}</span>` : ''}
  </section>
  ${S.creating === 'newCrew' ? `<section class="card stack"><h2>New crew</h2><p class="small muted">A crew is a group you make plans with. You’ll get an invite link for it next.</p>
    <form id="newCrewForm" class="row" style="gap:6px"><input id="nc-name" maxlength="40" required placeholder="The Vegas Six" style="flex:1 1 200px"><button class="btn primary" type="submit">Create crew</button><button class="btn ghost" type="button" data-act="cancelNew">Cancel</button></form></section>` : ''}
  ${!canSave ? '' : !S.tripsLoaded ? '<p class="muted">Loading your plans…</p>' : `
  <div class="home-bar"><span class="small muted">${[live.length && live.length + ' happening now', upcoming.length && upcoming.length + ' coming up', deciding.length && deciding.length + ' deciding'].filter(Boolean).join(' · ') || 'No plans yet'}</span>${viewSwitch()}</div>
  ${homeMode === 'cal' ? calView(plans, deciding) : `
  ${live.length ? `<section class="stack"><h2><i class="live-dot" aria-hidden="true"></i> Happening now</h2>${live.map(t => planRow(t)).join('')}</section>` : ''}
  <section class="stack"><div class="row" style="justify-content:space-between"><h2>Coming up</h2><span class="small muted">${upcoming.length} locked in</span></div>
    ${upcoming.length ? upcoming.map(t => planRow(t)).join('') : `<div class="empty"><span>Nothing locked yet. When a plan has a place and a day, it shows up here like a calendar.</span></div>`}</section>
  ${deciding.length ? `<section class="stack"><h2>Still deciding</h2>${deciding.map(t => planRow(t, { del: true })).join('')}</section>` : ''}`}
  <section class="stack"><div class="row" style="justify-content:space-between"><h2>Your crews</h2><button class="btn sm" data-act="newCrew">New crew</button></div>
    ${crews.length ? `<div class="crew-grid">${crews.map(c => crewCard(c, plans)).join('')}</div>` : `<div class="empty"><span>Crews are the groups you make plans with. Make one, share its invite link, and every plan after that starts with everyone already in.</span><button class="btn sm primary" data-act="newCrew">Make a crew</button></div>`}</section>
  ${past.length && homeMode !== 'cal' ? `<details class="card past"><summary><b>Past plans</b> <span class="small muted">${past.length}</span></summary><div class="stack" style="margin-top:10px">${past.map(t => planRow(t, { del: true })).join('')}</div></details>` : ''}`}`;
}
/* ---------- home: calendar view ---------- */
const ICON_LIST = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>';
const ICON_CAL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
let homeMode = 'list'; try { homeMode = localStorage.getItem('outta_homeview') === 'cal' ? 'cal' : 'list'; } catch {}
const covers = (t, d) => t.lockedDates && t.lockedDates.start <= d && t.lockedDates.end >= d;
function viewSwitch() {
  return `<div class="seg" role="group" aria-label="View">${[['list', 'List', ICON_LIST], ['cal', 'Calendar', ICON_CAL]].map(([k, l, i]) => `<button class="${homeMode === k ? 'on' : ''}" data-homeview="${k}" aria-pressed="${homeMode === k}">${i}${l}</button>`).join('')}</div>`;
}
function calView(plans, deciding) {
  const month = S.calMonth || TODAY.slice(0, 7), first = month + '-01';
  const start = add(first, -((D(first).getUTCDay() + 6) % 7)), grid = Array.from({ length: 42 }, (_, i) => add(start, i));
  // each plan keeps one lane for its whole stay so multi-day bars line up across the week
  const evs = plans.filter(t => t.lockedDates).sort((a, b) => a.lockedDates.start < b.lockedDates.start ? -1 : a.lockedDates.start > b.lockedDates.start ? 1 : b.lockedDates.end.localeCompare(a.lockedDates.end) || (a.time || '').localeCompare(b.time || ''));
  const laneEnd = [], lane = new Map();
  for (const t of evs) { let l = laneEnd.findIndex(e => e < t.lockedDates.start); if (l < 0) l = laneEnd.length; laneEnd[l] = t.lockedDates.end; lane.set(t, l); }
  const inMonth = d => d.slice(0, 7) === month;
  const sel = S.calDay && inMonth(S.calDay) ? S.calDay : inMonth(TODAY) ? TODAY : (evs.find(t => inMonth(t.lockedDates.start))?.lockedDates.start || first);
  const LANES = 3;
  const cells = grid.map((d, i) => {
    const here = evs.filter(t => covers(t, d)), more = here.filter(t => lane.get(t) >= LANES).length;
    const bars = Array.from({ length: Math.min(LANES, 1 + Math.max(-1, ...here.map(t => Math.min(LANES - 1, lane.get(t))))) }, (_, l) => {
      const t = here.find(x => lane.get(x) === l); if (!t) return '<span class="mc-ev gap"></span>';
      const s = d === t.lockedDates.start, e = d === t.lockedDates.end, label = s || i % 7 === 0;
      // the label runs along the bar until the plan ends or the week does
      const n = Math.min(span(d, t.lockedDates.end).length, 7 - i % 7);
      return `<span class="mc-ev ${s ? 's' : ''} ${e ? 'e' : ''} ${t.lockedDates.end < TODAY ? 'past' : ''}" style="--pc:${SIZES[sizeOf(t)].color};--n:${n}">${label ? `<b>${esc(t.name)}</b>` : '&nbsp;'}</span>`;
    }).join('');
    return `<button class="mc-day ${inMonth(d) ? '' : 'out'} ${d === TODAY ? 'today' : ''} ${d === sel ? 'sel' : ''}" data-calday="${d}" aria-label="${fmt(d)}${here.length ? ', ' + here.length + ' plan' + (here.length > 1 ? 's' : '') : ''}" aria-pressed="${d === sel}">
      <span class="mc-n">${D(d).getUTCDate()}</span>${bars}${more ? `<span class="mc-more">+${more}</span>` : ''}</button>`;
  });
  const day = evs.filter(t => covers(t, sel)), label = D(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const nMonth = evs.filter(t => t.lockedDates.start.slice(0, 7) <= month && t.lockedDates.end.slice(0, 7) >= month).length;
  return `<section class="card mcal">
    <div class="mc-head"><div class="stack" style="gap:0"><h2 class="mc-title">${label}</h2><span class="small muted">${nMonth ? `${nMonth} plan${nMonth > 1 ? 's' : ''} this month` : 'Nothing locked this month'}</span></div>
      <div class="row" style="gap:4px;flex-wrap:nowrap">${month !== TODAY.slice(0, 7) ? '<button class="btn sm ghost" data-calnav="0">Today</button>' : ''}<button class="btn sm icon" data-calnav="-1" aria-label="Previous month"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><button class="btn sm icon" data-calnav="1" aria-label="Next month"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div></div>
    <div class="mc-dows">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="mc-grid" data-key="mc-${month}">${cells.join('')}</div>
  </section>
  <section class="stack"><div class="row" style="justify-content:space-between"><h2>${sel === TODAY ? 'Today' : fmt(sel, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>${day.length ? `<span class="small muted">${day.length} plan${day.length > 1 ? 's' : ''}</span>` : ''}</div>
    ${day.length ? day.map(t => planRow(t)).join('') : `<div class="empty"><span>${sel < TODAY ? 'Nothing that day.' : 'Nothing planned yet. Free day.'}</span>${sel >= TODAY && S.db ? '<button class="btn sm primary" data-act="newTrip">Plan something</button>' : ''}</div>`}</section>
  ${deciding.length ? `<section class="stack"><div class="row" style="justify-content:space-between"><h2>Still deciding</h2><span class="small muted">Shows on the calendar once a day is locked</span></div>
    <div class="row" style="gap:6px">${deciding.map(t => `<button class="chip dec-chip" style="--pc:${SIZES[sizeOf(t)].color}" data-open="${esc(t.id)}"><i></i>${esc(t.name)}</button>`).join('')}</div></section>` : ''}`;
}
function calNav(dir) {
  const m = S.calMonth || TODAY.slice(0, 7);
  if (!dir) { S.calMonth = null; S.calDay = null; }
  else { const d = D(m + '-01'); d.setUTCMonth(d.getUTCMonth() + dir); S.calMonth = iso(d).slice(0, 7); S.calDay = null; }
  render();
  const g = $('.mc-grid');
  if (g && dir && !calm()) g.animate([{ opacity: 0, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE });
}

function crewCard(c, plans) {
  const ids = crewMembers(c), cp = plans.filter(t => t.crewId === c.id);
  const next = cp.filter(t => t.lockedDates && t.lockedDates.end >= TODAY).sort((a, b) => a.lockedDates.start < b.lockedDates.start ? -1 : 1)[0];
  return `<div class="card crew-card">
    <button class="crew-open" data-crew="${esc(c.id)}"><h3>${esc(c.name)}</h3>
      <div class="avs">${ids.slice(0, 8).map(id => `<span class="av-sm" style="background:${colorFor(id)}" title="${esc(crewNick(c, id))}">${esc(crewNick(c, id)[0].toUpperCase())}</span>`).join('')}${ids.length > 8 ? `<span class="small muted">+${ids.length - 8}</span>` : ''}</div>
      <span class="small muted">${next ? `Next: <b>${esc(next.name)}</b> · ${esc(planWhen(next))}` : `${cp.length} plan${cp.length === 1 ? '' : 's'} together`}</span></button>
    <div class="row" style="gap:6px"><button class="btn sm primary" data-startcrew="${esc(c.id)}">+ Plan something</button><button class="btn sm ghost" data-crew="${esc(c.id)}">Open</button></div>
  </div>`;
}
const crewLink = cid => SHARE_BASE + '#c-' + cid;
function crewPage(cid) {
  const c = S.crews.find(x => x.id === cid);
  if (!c) return `${topBar()}<p class="muted">Loading crew…</p><button class="btn" data-act="home">Back home</button>`;
  const ids = crewMembers(c), plans = myPlans().filter(t => t.crewId === cid);
  const upcoming = plans.filter(t => !t.lockedDates || t.lockedDates.end >= TODAY).sort((a, b) => (a.lockedDates?.start || '9') < (b.lockedDates?.start || '9') ? -1 : 1);
  const past = plans.filter(t => t.lockedDates && t.lockedDates.end < TODAY);
  return `${topBar()}
  <section class="stack"><button class="linkbtn small" data-act="home" style="align-self:flex-start">‹ All plans</button>
    <span class="label">Crew</span><h1 style="font-size:clamp(32px,7vw,48px)">${esc(c.name)}</h1>
    <div class="row" style="gap:6px">${ids.map(id => `<span class="chip" style="cursor:default"><span class="av" style="width:20px;height:20px;font-size:10px;background:${colorFor(id)}">${esc(crewNick(c, id)[0].toUpperCase())}</span>${esc(crewNick(c, id))}${id === S.uid ? ' (you)' : ''}</span>`).join('')}</div>
    <div class="row"><button class="btn primary big" data-startcrew="${esc(cid)}">+ Plan something</button></div>
  </section>
  <section class="stack"><h2>Plans</h2>${upcoming.length ? upcoming.map(t => planRow(t, { noCrew: true })).join('') : `<div class="empty"><span>No plans yet. Start one and everyone in the crew is added automatically.</span></div>`}</section>
  ${playlistCard({ crew: c })}
  <section class="card stack"><h3>Invite to the crew</h3>
    <p class="small muted">${IN_CLAUDE ? 'First share this page with them (Share menu, as an Editor). Then send this link.' : 'Send this link. They type their name and join the crew.'}</p>
    <span class="invite-link mono">${esc(crewLink(cid))}</span>
    <div><button class="btn primary" data-act="copyCrewInvite" data-cid="${esc(cid)}">Send invite</button></div></section>
  ${past.length ? `<details class="card past"><summary><b>Past plans</b> <span class="small muted">${past.length}</span></summary><div class="stack" style="margin-top:10px">${past.map(t => planRow(t, { noCrew: true })).join('')}</div></details>` : ''}
  ${c.by === S.uid || S.isOwner ? `<div><button class="btn sm ghost danger" data-delcrew="${esc(cid)}">Delete crew</button></div>` : ''}`;
}
async function createCrew(name) {
  const cid = rid(10), body = { name: name.slice(0, 40), ids: [S.uid], people: { [S.uid]: true }, profiles: { [S.uid]: { nick: S.myName || 'Me' } }, by: S.uid, at: Date.now() };
  try { await S.db.doc('crews/' + cid).set(body); S.creating = null; openCrew(cid); flash('Crew created. Send the invite link to add people.'); }
  catch (e) { flash(writeErr(e)); }
}
async function joinCrew(cid) {
  if (!S.db) return;
  try {
    const snap = await S.db.doc('crews/' + cid).get();
    if (!snap.exists) { flash('That crew link doesn’t work anymore.'); setHash(''); return; }
    if (!crewMembers(snap.data()).includes(S.uid)) { await S.db.doc('crews/' + cid).update({ people: { [S.uid]: true }, profiles: { [S.uid]: { nick: S.myName || 'Someone' } } }); flash(`You joined ${snap.data().name}.`); }
    openCrew(cid);
  } catch (e) { flash(writeErr(e)); }
}
function openCrew(cid) {
  stop(); S.tid = null; resetTrip(); S.crewView = cid; S.creating = null; setHash('c-' + cid);
  subscribeSongs(`crews/${cid}/songs`); render(); window.scrollTo({ top: 0 });
}

/* new-plan flow: crew → size → (type) → basics */
function startNewPlan(cid) {
  S.newCrew = cid || null; S.newSize = null; S.newMode = null;
  S.creating = cid || !myCrews().length ? 'size' : 'crew'; S.cameFromCrewStep = !cid && !!myCrews().length;
  if (cid) { S.crewView = null; setHash(''); }
  render(); window.scrollTo({ top: 0 });
}
function stepHead(title, back) {
  const crew = S.crews.find(c => c.id === S.newCrew), sz = SIZES[S.newSize];
  const trail = ['New plan', crew?.name, sz?.label].filter(Boolean).join(' · ');
  return `<section class="stack"><button class="linkbtn small" data-act="${back}" style="align-self:flex-start">‹ Back</button>
    <span class="label">${esc(trail)}</span><h1 style="font-size:clamp(30px,6vw,44px)">${title}</h1></section>`;
}
function pickCrewStep() {
  return `${topBar()}${stepHead('Who’s this with?', 'cancelNew')}
  <div class="modes">${myCrews().map(c => `<button class="mode" data-pickcrew="${esc(c.id)}" style="--mc:${colorFor(c.id)}"><b>${esc(c.name)}</b><span class="small muted">${crewMembers(c).map(id => esc(crewNick(c, id))).join(', ')}</span></button>`).join('')}
    <button class="mode" data-pickcrew="" style="--mc:var(--muted)"><b>Someone else</b><span class="small muted">Start it and invite people after</span></button></div>`;
}
function pickSizeStep() {
  return `${topBar()}${stepHead('How big is this plan?', S.cameFromCrewStep ? 'backCrew' : 'cancelNew')}
  <div class="modes sizes">${Object.entries(SIZES).map(([k, v]) => `<button class="mode" data-size="${k}" style="--mc:${v.color}"><b>${esc(v.label)}</b><span class="small muted">${esc(v.desc)}</span></button>`).join('')}</div>`;
}
function modePicker() {
  return `${topBar()}${stepHead(`What kind of ${SIZES[S.newSize || 'trip'].label.toLowerCase()} is this?`, 'backSize')}
  <p class="muted">We’ll tune the AI picks, the awards and the features to your group.</p>
  <div class="modes">${Object.entries(MODES).map(([k, v]) => `<button class="mode" data-mode="${k}" style="--mc:${v.color}"><b>${esc(modeLabel(v, S.newSize))}</b><span class="small muted">${esc(v.desc)}</span>${v.honoree ? `<span class="label" style="color:color-mix(in oklab,var(--mc) 70%,var(--ink))">Guest of honor mode</span>` : ''}</button>`).join('')}</div>`;
}
function newTripForm() {
  const sz = SIZES[S.newSize || 'trip'], small = ['hangout', 'day'].includes(S.newSize), m = MODES[S.newMode] || MODES.friends, crew = S.crews.find(c => c.id === S.newCrew);
  const start = small ? TODAY : add(TODAY, 30), end = add(start, sz.win + (small ? 0 : 15));
  let city = ''; try { city = localStorage.getItem('outta_city') || ''; } catch {}
  const ph = { bachelorette: 'Sarah’s Last Fling', bachelor: 'Mike’s Last Ride', birthday: 'Dev turns 30', family: 'Family beach week', work: 'Q3 team offsite', festival: 'Coachella weekend', sports: 'Super Bowl trip', couples: 'Couples in Tulum', college: 'Spring break ’27' }[S.newMode] || sz.ph;
  return `${topBar()}${stepHead('The basics', small ? 'backSize' : 'backModes')}
  ${crew || !small ? `<div class="row" style="gap:8px">${!small ? `<span class="mode-chip" style="--mc:${m.color}">${esc(modeLabel(m, S.newSize))}</span>` : ''}${crew ? `<span class="small muted">Everyone in <b>${esc(crew.name)}</b> is added automatically.</span>` : ''}</div>` : ''}
  <section class="card stack">
    <form id="newTrip" class="stack">
      <label class="field"><span class="label">Name it</span><input id="nt-name" required maxlength="60" placeholder="${esc(ph)}"></label>
      ${small ? `<label class="field"><span class="label">Which city?</span><input id="nt-city" maxlength="50" value="${esc(city)}" placeholder="Brooklyn" required></label>` : ''}
      ${!small && m.honoree ? `<label class="field"><span class="label">Who’s the ${esc(m.honoree)}?</span><input id="nt-honoree" maxlength="40" placeholder="Their name"></label>` : ''}
      <div class="row">
        <label class="field"><span class="label">${small ? 'Could happen from' : 'Earliest date'}</span><input id="nt-start" type="date" value="${start}" min="${TODAY}" required></label>
        <label class="field"><span class="label">${small ? 'Until' : 'Latest date'}</span><input id="nt-end" type="date" value="${end}" min="${TODAY}" required></label>
        ${small ? '' : `<label class="field" style="flex:0 1 110px"><span class="label">Nights</span><select id="nt-nights">${[1, 2, 3, 4, 5, 6, 7, 10, 14].map(n => `<option ${n === sz.nights ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}
      </div>
      <p class="small muted">${small ? 'Everyone taps which of these days they’re free. The crew picks the exact plan and day together.' : 'Not sure on dates yet? Give a wide window. The crew picks the exact nights later.'}</p>
      <div><button class="btn primary big" type="submit">Create ${esc(sz.label.toLowerCase())}</button></div>
    </form>
  </section>`;
}
async function createTrip() {
  const name = $('#nt-name').value.trim(); let a = $('#nt-start').value, b = $('#nt-end').value;
  if (!name || !a || !b) return;
  if (b < a) [a, b] = [b, a];
  if (span(a, b).length >= 92) b = add(a, 90);
  const sz = S.newSize || 'trip', small = ['hangout', 'day'].includes(sz), city = ($('#nt-city')?.value || '').trim().slice(0, 50);
  if (small && !city) { flash('Add the city so the AI can pitch real places.'); return; }
  if (city) { try { localStorage.setItem('outta_city', city); } catch {} }
  const id = rid(10);
  const trip = { name: name.slice(0, 60), size: sz, city, winStart: a, winEnd: b, nights: small ? 0 : +($('#nt-nights')?.value || SIZES[sz].nights), destinations: [], vibes: [], itinerary: [], lockedDates: null, lockedDest: null,
    mode: small ? 'friends' : (S.newMode || 'friends'), honoreeName: ($('#nt-honoree')?.value || '').trim().slice(0, 40), honoreeFree: true, people: { [S.uid]: true }, createdBy: S.uid, createdAt: Date.now() };
  try {
    await S.db.doc('trips/' + id).set(trip);
    const crew = S.crews.find(c => c.id === S.newCrew);
    const mine = crew?.profiles?.[S.uid] || {};
    await S.db.doc(`trips/${id}/members/${S.uid}`).set({ nick: mine.nick || S.myName || 'Me', home: mine.home || '', venmo: mine.venmo || '', cashapp: mine.cashapp || '', budget: 0, status: 'in', days: [], votes: [], updatedAt: Date.now() });
    if (crew) {
      const ids = crewMembers(crew);
      for (const uid of ids) if (uid !== S.uid) { const pr = crew.profiles?.[uid] || {}; await S.db.doc(`trips/${id}/members/${uid}`).set({ nick: pr.nick || 'Someone', home: pr.home || '', venmo: pr.venmo || '', cashapp: pr.cashapp || '', budget: 0, status: 'maybe', days: [], votes: [], updatedAt: Date.now() }); }
      await S.db.doc('trips/' + id).update({ crewId: crew.id, people: Object.fromEntries(ids.map(u => [u, true])) });
    }
    S.newCrew = null; S.creating = null; S.newMode = null; S.newSize = null; S.fromCrewPage = false;
    openTrip(id, 'overview'); S.setup = { step: 0 };
  } catch (e) { flash(writeErr(e)); }
}

