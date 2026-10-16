/* ---------- crews ---------- */
async function saveCrew(name) {
  const ms = S.members.filter(m => m.status !== 'out');
  const profiles = {}; for (const m of ms) profiles[m.id] = { nick: m.nick || '', home: m.home || '', venmo: m.venmo || '', cashapp: m.cashapp || '' };
  const cid = S.trip.crewId || rid(10);
  const body = { name: name.slice(0, 40), ids: ms.map(m => m.id), profiles, by: S.uid, at: Date.now() };
  if (S.demo) { S.crews = [...S.crews.filter(c => c.id !== cid), { id: cid, ...body }]; await saveTrip({ crewId: cid }); flash('Crew saved.'); return; }
  try { await S.db.doc('crews/' + cid).set(body); await saveTrip({ crewId: cid }); flash(`Saved “${body.name}”. Start the next trip from the home screen.`); }
  catch (e) { flash(writeErr(e)); }
}
function crewSection() {
  const crew = S.crews.find(c => c.id === S.trip.crewId);
  return `<section class="card stack"><h3>Recurring crew</h3>
    ${crew ? `<p class="small">This ${planWord()} belongs to <b>${esc(crew.name)}</b>. Start the next plan from their crew page in one tap.</p>
      <div><button class="btn sm" data-act="syncCrew">Update crew with these people</button></div>`
    : `<p class="small muted">Save this group as a crew so the next plan starts with everyone already added, and keep a history of your plans together.</p>
      <form id="crewForm" class="row" style="gap:6px"><input id="crew-name" maxlength="40" placeholder="The Vegas Six" style="flex:1 1 180px" required><button class="btn sm primary" type="submit">Save crew</button></form>`}
  </section>`;
}
/* ---------- trip modes ---------- */
const SUPERS_DEFAULT = ['MVP', 'Most likely to lose their ID', 'Biggest spender', 'Best dressed', 'First to fall asleep', 'Last one standing', 'Main character', 'Most likely to miss the flight'];
const MODES = {
  friends: { label: 'Friends trip', desc: 'Your friends, somewhere new.', color: '#D41C78', ai: 'A friend group trip.', supers: SUPERS_DEFAULT },
  bachelorette: { label: 'Bachelorette', desc: 'Brunch, a big dinner, one wild night.', color: '#E64980', honoree: 'bride',
    ai: 'A bachelorette party. Think brunch, a nice dinner, one wild night out, matching outfits and photo moments. The bride is the guest of honor.',
    supers: ['Best bridesmaid energy', 'Most likely to cry at the wedding', 'Most likely to get us kicked out', 'Best dressed', 'First one asleep', 'Hype queen', 'Main character', 'Best dance moves'] },
  bachelor: { label: 'Bachelor', desc: 'A steak, a day out, a long night.', color: '#3B5BDB', honoree: 'groom',
    ai: 'A bachelor party. Think steakhouse, golf or a day activity, a big night out, sports bars, a casino or a boat. The groom is the guest of honor.',
    supers: ['Best man energy', 'Most likely to lose the groom', 'Biggest spender', 'Worst decision', 'First one asleep', 'Last one standing', 'Best wingman', 'Most likely to miss the flight'] },
  birthday: { label: 'Birthday trip', desc: 'Planned around one dinner and one big night.', color: '#F08C00', honoree: 'birthday star',
    ai: 'A birthday trip. Plan one special birthday dinner and one big birthday night. The birthday person is the guest of honor.',
    supers: ['Best birthday toast', 'Most likely to forget whose birthday it is', 'Biggest spender', 'Best dressed', 'First one asleep', 'Last one standing', 'Main character', 'Best gift'] },
  couples: { label: 'Couples trip', desc: 'Good dinners, nice views, real downtime.', color: '#C2255C',
    ai: 'A trip with several couples. Favor great dinners, wine and cocktail bars, scenic spots, one fun night out, and real downtime.',
    supers: ['Cutest couple', 'Most likely to argue about directions', 'Best dinner pick', 'Best dressed couple', 'First couple asleep', 'Most PDA', 'Best photographer', 'Most likely to miss the flight'] },
  family: { label: 'Family trip', desc: 'All ages. Easy days, early nights.', color: '#0E9F6E', nightlife: 'Things to do',
    ai: 'A family trip with mixed ages, possibly kids. Keep everything family-friendly: no clubs. Favor activities, parks, easy food spots and early evenings.',
    supers: ['Trip MVP', 'Best snack supply', 'Most likely to get lost', 'Best navigator', 'First one asleep', 'Most photos taken', 'Best attitude', 'Funniest moment'] },
  college: { label: 'Spring break', desc: 'Tight budget, beach, happy hours.', color: '#1098AD',
    ai: 'A spring break or college trip on a tight budget. Favor cheap eats, beach or pool parties, happy hours, and budget stays like hostels or shared rentals.',
    supers: SUPERS_DEFAULT },
  festival: { label: 'Festival or concert', desc: 'Planned around the set times.', color: '#7048E8',
    ai: 'A trip built around a music festival or concert. Favor pre-game spots, after-parties, easy transport to the venue, and recovery brunches.',
    supers: ['Best festival outfit', 'Most likely to lose the group', 'Front row energy', 'Best set pick', 'First one asleep', 'Last one standing', 'Main character', 'Most likely to miss the flight'] },
  sports: { label: 'Sports trip', desc: 'The game, the tailgate, the night after.', color: '#E8590C',
    ai: 'A trip built around a sports game or event. Favor sports bars, tailgates, a great steak or BBQ dinner, and a fun night out after the game.',
    supers: ['Loudest fan', 'Worst bet', 'Biggest spender', 'Best jersey', 'First one asleep', 'Last one standing', 'Best tailgate snack', 'Most likely to miss the flight'] },
  work: { label: 'Team offsite', desc: 'Team dinners, one activity, time to work.', color: '#5C6A7A', nightlife: 'Things to do',
    ai: 'A work team offsite. Keep it professional but fun: team dinners, one group activity, a nice bar for the evening, and quiet time to work.',
    supers: ['Team MVP', 'Best idea of the trip', 'Most likely to answer email at dinner', 'Best dressed', 'First one asleep', 'Best karaoke', 'Most likely to miss the flight', 'Best team spirit'] },
};
const mode = () => MODES[S.trip?.mode] || MODES.friends;
const modeLabel = (v, sz) => sz === 'weekend' ? v.label.replace(/ trip$/, ' weekend') : v.label;
const honoreeMode = () => !!mode().honoree;
const isHonoree = () => honoreeMode() && S.trip.honoree && S.trip.honoree === S.uid;
const honoreeFree = () => honoreeMode() && S.trip.honoree && S.trip.honoreeFree !== false;
const visItems = () => (S.trip.itinerary || []).map(i => i.secret && !i.revealed && isHonoree() ? { ...i, title: 'Surprise', note: 'Your crew planned something. No peeking.', kind: 'surprise', hidden: true } : i);

/* ---------- layout: sections ---------- */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  plan: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  book: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  live: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  money: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
  memories: '<path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
function sections() {
  return [
    { k: 'home', label: 'Home', tabs: [['overview', 'Overview'], ['crew', 'Crew'], ['tasks', 'To-dos'], ['settings', 'Settings']] },
    { k: 'plan', label: 'Plan', tabs: [['match', isSmall() ? 'Plan Match' : 'Trip Match'], ['dates', isSmall() ? 'When' : 'Dates'], ['whatif', 'What if'], ['where', 'Where'], ['spots', isSmall() ? 'Spots' : (mode().nightlife || 'Nightlife')], ['plan', isSmall() ? 'The plan' : 'Itinerary']] },
    { k: 'book', label: 'Book', tabs: [['flights', 'Flights'], ['stays', 'Stays'], ['tickets', 'Boarding passes'], ['pack', 'Packing']] },
    { k: 'live', label: 'Live', tabs: [['live', 'Today'], ['map', 'Map'], ['bucket', 'Bucket list'], ['hype', 'Hype']] },
    { k: 'money', label: 'Money', tabs: [['cost', 'All-in cost'], ['meter', 'My spend'], ['pot', 'Group pot'], ['money', 'Expenses']] },
    { k: 'memories', label: 'Memories', tabs: [['wrapped', isSmall() ? 'Recap' : 'Wrapped'], ['recap', 'Photos'], ['playlist', 'Playlist'], ['awards', 'Awards']] },
  ].map(s => ({ ...s, tabs: s.tabs.filter(([k]) => !HIDE_TABS[size()].includes(k)) })).filter(s => s.tabs.length);
}
const TAB_ALIAS = { deals: 'flights' };
const secOf = tab => sections().find(s => s.tabs.some(t => t[0] === tab)) || sections()[0];
const TABFN = () => ({ overview: overviewTab, crew: crewTab, tasks: tasksTab, cost: costTab, whatif: whatifTab, settings: settingsTab, match: matchTab, dates: datesTab, where: whereTab, spots: spotsTab, plan: planTab,
  flights: flightsTab, stays: staysTab, tickets: ticketsTab, pack: packTab, live: liveTab, map: mapTab, bucket: bucketSection, hype: hypeTab,
  meter: meterTab, pot: potTab, money: moneyTab, wrapped: wrappedTab, recap: photosTab, awards: awardsTab, playlist: playlistTab });
function tripView() {
  if (S.membersIn && accessState() !== 'ok') return blockedView(accessState());
  if (S.setup && S.membersIn && meDoc()) return setupView();
  if (TAB_ALIAS[S.tab]) S.tab = TAB_ALIAS[S.tab];
  const fns = TABFN(); if (!fns[S.tab]) S.tab = 'overview';
  const sec = secOf(S.tab), cd = countdown(), m = mode(), gd = guide(), crumbTab = gd && !gd.wait && gd.tab !== S.tab ? gd.tab : null;
  const head = S.tab === 'overview' ? '' : `<div class="mini"><span class="sec-eyebrow">${esc(sec.label)}</span><button class="mini-name" data-tab="overview">${esc(S.trip.name)}</button>
      ${isSmall() ? `<span class="mode-chip" style="--mc:${SIZES[size()].color}">${esc(SIZES[size()].label)}</span>` : `<span class="mode-chip" style="--mc:${m.color}">${esc(modeLabel(m, size()))}</span>`}${cd ? `<span class="small muted">${esc(cd.n > 0 ? cd.text + ' to go' : cd.text)}</span>` : ''}${nextPill(gd)}</div>`;
  return `${topBar()}
  ${S.demo ? `<div class="banner"><span><b>Demo trip.</b> Sample crew, nothing is saved. Try switching the trip type in Home › Settings.</span><button class="btn sm" data-act="home">Back</button></div>` : ''}
  ${S.readOnly ? `<div class="banner"><span>You can view this plan but not edit it. Ask the owner to share it with you as a Contributor.</span></div>` : ''}
  ${lostBanner()}
  ${head}
  ${sec.tabs.length > 1 ? `<nav class="subtabs" aria-label="${esc(sec.label)}">${sec.tabs.map(([k, l]) => `<button class="subtab ${S.tab === k ? 'on' : ''}" data-tab="${k}" aria-current="${S.tab === k}">${esc(l)}${crumbTab === k ? '<i class="crumb" aria-hidden="true"></i>' : ''}</button>`).join('')}</nav>` : ''}
  ${fns[S.tab]()}
  ${isLive() && !S.lostOpen && !['live', 'map', 'overview'].includes(S.tab) ? '<button class="fab-lost" data-act="lostOpen" aria-label="I’m lost: send the crew my spot">SOS</button>' : ''}
  ${S.lostOpen ? lostSheet() : ''}
  <nav class="bottomnav" aria-label="Trip sections"><div class="bn-inner" style="grid-template-columns:repeat(${sections().length},1fr)">${sections().map(s => `<button class="bn ${s.k === sec.k ? 'on' : ''}" data-sec="${s.k}" aria-current="${s.k === sec.k}">${icon(s.k)}${crumbTab && secOf(crumbTab).k === s.k && s.k !== sec.k ? '<i class="crumb" aria-hidden="true"></i>' : ''}<span>${s.label}${s.k === 'live' && isLive() ? ' ●' : ''}</span></button>`).join('')}</div></nav>`;
}

/* ---------- home: overview ---------- */
function steps() {
  const t = S.trip, tk = tickets(), ins = S.members.filter(going).length, d = dates(), small = isSmall();
  const all = {
    crew: { label: 'Get the crew in', done: ins >= 2, sub: `${ins} in so far. Send your friends the invite.`, go: 'crew', cta: 'Invite friends' },
    where: small ? { label: 'Pick the plan', done: !!t.lockedDest, sub: dest() ? `Leaning “${dest().city}”. Swipe on AI-pitched plans to settle it.` : 'Swipe on AI-pitched plans that fit everyone.', go: 'match', cta: 'Open Plan Match' }
      : { label: 'Pick where', done: !!t.lockedDest, sub: dest() ? `Leaning ${dest().city}. Swipe on AI-pitched trips to settle it.` : 'Swipe on AI-pitched trips that fit everyone.', go: 'match', cta: 'Open Trip Match' },
    dates: small ? { label: 'Pick the day', done: !!t.lockedDates, sub: d ? `Best so far: ${fmt(d.start)}` : 'Everyone taps the days they’re free.', go: 'dates', cta: 'Pick the day' }
      : { label: 'Lock the dates', done: !!t.lockedDates, sub: d ? `Best so far: ${short(d.start)} – ${short(d.end)}` : 'Everyone taps the days they’re free.', go: 'dates', cta: 'Pick dates' },
    flights: { label: 'Book flights', done: tk.on, sub: `${tk.have.length}/${tk.goal} booked. Search fares from every home city.`, go: 'flights', cta: 'Find flights' },
    stay: { label: 'Book the stay', done: !!t.stay, sub: t.stay ? t.stay.name : 'Hotels and Airbnbs that fit the group budget.', go: 'stays', cta: 'Find stays' },
    plan: { label: small ? (size() === 'day' ? 'Plan the day' : 'Plan the night') : 'Plan the days', done: (t.itinerary || []).length >= (small ? 1 : Math.max(3, nightsOf(d))), sub: small ? 'Add the stops: where you meet, eat, and end up.' : 'Nightlife picks, an itinerary and a packing list.', go: 'plan', cta: 'Build the plan' },
  };
  return STEP_KEYS[size()].map(k => all[k]);
}
function overviewTab() {
  const st = steps(), next = st.find(s => !s.done), live = isLive(), d = dates(), over = d && TODAY > d.end;
  const tk = tickets(), t = S.trip, ns = nudges();
  const today = live ? visItems().filter(i => i.date === TODAY).sort(byTime) : [];
  const nowT = new Date().toTimeString().slice(0, 5), upNext = today.find(i => timeKey(i.time) >= timeKey(nowT));
  const fl = S.trip.deals?.data?.flights || [];
  return `${showWelcome() ? welcomeCard() : ''}${honoreeMode() && !t.honoree ? `<section class="card row" style="justify-content:space-between"><span><b>Who’s the ${esc(mode().honoree)}?</b> <span class="small muted">${t.honoreeName ? esc(t.honoreeName) + ' · ' : ''}Their share is covered and surprises stay hidden from them.</span></span>
    <select id="set-honoree" style="width:auto"><option value="">Pick someone</option>${S.members.map(m => `<option value="${esc(m.id)}">${esc(m.nick || 'Someone')}</option>`).join('')}</select></section>` : ''}
  ${live ? `<section class="hero-card live-card"><div class="row" style="gap:8px"><i class="live-dot" aria-hidden="true"></i><span class="label" style="color:inherit">${isSmall() ? 'Happening today' : 'Trip is live · Day ' + (span(d.start, d.end).indexOf(TODAY) + 1)}</span></div>
      <h2>${upNext ? `Up next: ${esc(upNext.title)}` : 'Nothing else planned today'}</h2>${upNext ? `<span>${esc(tShow(upNext.time) || '')}</span>` : ''}
      <div class="row" style="gap:8px"><button class="btn" data-tab="live">Open today</button><button class="btn ghost-light" data-tab="map">Map</button><button class="btn lost-btn" data-act="lostOpen">I’m lost</button></div></section>`
  : over ? `<section class="hero-card" style="--hc:#7048E8"><span class="label" style="color:inherit">That’s a wrap</span><h2>${isSmall() ? 'Your recap is ready' : `Your ${esc(dest()?.city || 'trip')} Wrapped is ready`}</h2><div><button class="btn" data-tab="wrapped">Watch it</button></div></section>`
  : showWelcome() ? '' : moveCard()}
  ${STAGES.findIndex(([k]) => k === stageOf(S.trip, S.members)) >= 2 ? passport() : pass()}
  ${showWelcome() ? '' : stageTrack()}
  ${showWelcome() ? '' : recoveryCard()}
  ${isSmall() ? '' : `<section class="grid2">${size() === 'trip' ? `
    <button class="tile" data-tab="flights"><span class="label">Flights</span><b class="tile-big">${tk.have.length}/${tk.goal || 0} booked</b>
      <span class="small muted">${fl.length ? 'Typical: ' + esc(fl.map(f => f.roundTrip).filter(Boolean)[0] || '') + ' round trip' : 'Search fares from every home city'}</span><span class="tile-go">Find flights →</span></button>` : ''}
    <button class="tile" data-tab="stays"><span class="label">Stay</span><b class="tile-big">${t.stay ? esc(t.stay.name) : (t.stays?.items?.length ? t.stays.items.length + ' options' : 'Not booked')}</b>
      <span class="small muted">${t.stay ? esc(t.stay.area || '') + (t.stay.perNight ? ' · ' + esc(t.stay.perNight) : '') : 'Hotels and Airbnbs that fit the budget'}</span><span class="tile-go">${t.stay ? 'See the stay →' : 'Find stays →'}</span></button>
  </section>`}
  <section class="card stack">
    <div class="row" style="justify-content:space-between"><h3>Crew</h3><button class="btn sm" data-tab="crew">Invite & manage</button></div>
    <div class="row" style="gap:6px">${S.members.map(m => `<span class="av-sm" title="${esc(m.nick || 'Someone')}" style="background:${colorFor(m.id)};${m.status === 'out' ? 'opacity:.35' : ''}">${esc((m.nick || '?')[0].toUpperCase())}</span>`).join('')}</div>
    ${ns.length ? `<span class="small muted">${ns.length} ${ns.length === 1 ? 'person has' : 'people have'} stuff to do. <button class="linkbtn" data-tab="crew">See who</button></span>` : '<span class="small" style="color:var(--good)">Everyone’s done their part.</span>'}
  </section>`;
}
function settingsTab() {
  const m = mode();
  return `<section class="card stack"><h3>Plan size</h3><div class="row" style="gap:6px">${Object.entries(SIZES).map(([k, v]) => `<button class="chip ${size() === k ? 'on' : ''}" data-setsize="${k}">${esc(v.label)}</button>`).join('')}</div><p class="small muted">Changing the size keeps everyone’s votes and free days.</p></section>
  <section class="card stack"><h3>Currency</h3><label class="field" style="flex:none;max-width:280px"><span class="label">Everyone spends in</span><select id="set-cur" ${S.readOnly ? 'disabled' : ''}>${curOptions(cur())}</select></label><p class="small muted">All amounts in this ${planWord()} show in this currency, and the AI prices in it. Changing it doesn’t convert amounts people already typed in.</p></section>
  ${isSmall() ? '' : `<section class="card stack"><h3>Type</h3>
    <div class="modes compact">${Object.entries(MODES).map(([k, v]) => `<button class="mode ${S.trip.mode === k || (!S.trip.mode && k === 'friends') ? 'on' : ''}" data-setmode="${k}" style="--mc:${v.color}"><b>${esc(modeLabel(v, size()))}</b></button>`).join('')}</div>
    ${m.honoree ? `<div class="row" style="gap:10px">
      <label class="field"><span class="label">The ${esc(m.honoree)}</span><select id="set-honoree"><option value="">Pick someone</option>${S.members.map(x => `<option value="${esc(x.id)}" ${S.trip.honoree === x.id ? 'selected' : ''}>${esc(x.nick || 'Someone')}</option>`).join('')}</select></label>
      <label class="row small" style="gap:8px;flex:1 1 200px"><input type="checkbox" id="set-free" style="width:auto" ${S.trip.honoreeFree !== false ? 'checked' : ''}> The ${esc(m.honoree)} pays nothing (their share is split across everyone else)</label></div>
      <p class="small muted">Surprise plans and the planners-only chat are hidden from the ${esc(m.honoree)} in the app.</p>` : ''}
  </section>`}
  ${SETTINGS_HTML()}`;
}

