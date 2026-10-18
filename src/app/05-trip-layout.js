/* ---------- crews ---------- */
async function saveCrew(name) {
  const ms = S.members.filter(m => m.status !== 'out');
  const profiles = {}; for (const m of ms) profiles[m.id] = { nick: m.nick || '', home: m.home || '', venmo: m.venmo || '', cashapp: m.cashapp || '' };
  const cid = S.trip.crewId || rid(10);
  const body = { name: name.slice(0, 40), ids: ms.map(m => m.id), profiles, by: S.uid, at: Date.now() };
  if (S.demo) { S.crews = [...S.crews.filter(c => c.id !== cid), { id: cid, ...body }]; if (await saveTrip({ crewId: cid })) flash('Crew saved.'); return; }
  try {
    if (S.trip.crewId && S.crews.some(c => c.id === cid)) { const { by, ...rest } = body; await S.db.doc('crews/' + cid).update({ ...rest, people: Object.fromEntries(body.ids.map(id => [id, true])) }); flash(`Updated “${body.name}”.`); return; }
    await S.db.doc('crews/' + cid).set({ ...body, people: Object.fromEntries(body.ids.map(id => [id, true])) }); if (await saveTrip({ crewId: cid })) flash(`Saved “${body.name}”. Start the next trip from the home screen.`);
  }
  catch (e) { flash(writeErr(e)); }
}
function crewSection() {
  const crew = S.crews.find(c => c.id === S.trip.crewId);
  return `<section class="card stack"><h3>Recurring crew</h3>
    ${crew ? `<p class="small">This ${planWord()} belongs to <b>${esc(crew.name)}</b>. Start the next plan from their crew page in one tap.</p>
      <div><button class="btn sm" data-act="syncCrew">Update crew with these people</button></div>`
    : `<p class="small muted">Save this group as a crew so the next plan starts with everyone already added, and keep a history of your plans together.</p>
      <form id="crewForm" class="row" style="gap:6px"><input aria-label="Crew name" id="crew-name" maxlength="40" placeholder="The Vegas Six" style="flex:1 1 180px" required><button class="btn sm primary" type="submit">Save crew</button></form>`}
  </section>`;
}
/* ---------- trip modes ---------- */
const SUPERS_DEFAULT = ['MVP', 'Most likely to lose their ID', 'Biggest spender', 'Best dressed', 'First to fall asleep', 'Last one standing', 'Main character', 'Most likely to miss the flight'];
const MODES = {
  friends: { label: 'Friends trip', desc: 'Your friends, somewhere new.', small: { desc: 'Just your friends.' }, color: '#D41C78', ai: 'A friend group trip.', supers: SUPERS_DEFAULT },
  bachelorette: { label: 'Bachelorette', desc: 'Brunch, a big dinner, one wild night.', color: '#E64980', honoree: 'bride',
    small: { ai: 'A bachelorette night or day out: brunch or a nice dinner, drinks and one fun night out, with photo moments. The bride is the guest of honor.' },
    ai: 'A bachelorette party. Think brunch, a nice dinner, one wild night out, matching outfits and photo moments. The bride is the guest of honor.',
    supers: ['Best bridesmaid energy', 'Most likely to cry at the wedding', 'Most likely to get us kicked out', 'Best dressed', 'First one asleep', 'Hype queen', 'Main character', 'Best dance moves'] },
  bachelor: { label: 'Bachelor', desc: 'A steak, a day out, a long night.', color: '#3B5BDB', honoree: 'groom',
    small: { ai: 'A bachelor night or day out: a great dinner, one fun activity and a night out. The groom is the guest of honor.' },
    ai: 'A bachelor party. Think steakhouse, golf or a day activity, a big night out, sports bars, a casino or a boat. The groom is the guest of honor.',
    supers: ['Best man energy', 'Most likely to lose the groom', 'Biggest spender', 'Worst decision', 'First one asleep', 'Last one standing', 'Best wingman', 'Most likely to miss the flight'] },
  birthday: { label: 'Birthday trip', desc: 'Planned around one dinner and one big night.', color: '#F08C00', honoree: 'birthday star',
    small: { desc: 'A dinner or a night out for someone’s birthday.', ai: 'A birthday plan, built around one special meal or night out for the birthday person.' },
    ai: 'A birthday trip. Plan one special birthday dinner and one big birthday night. The birthday person is the guest of honor.',
    supers: ['Best birthday toast', 'Most likely to forget whose birthday it is', 'Biggest spender', 'Best dressed', 'First one asleep', 'Last one standing', 'Main character', 'Best gift'] },
  couples: { label: 'Couples trip', desc: 'Good dinners, nice views, real downtime.', color: '#C2255C',
    small: { ai: 'A plan for a few couples: a great dinner, drinks somewhere nice and easy conversation.' },
    ai: 'A trip with several couples. Favor great dinners, wine and cocktail bars, scenic spots, one fun night out, and real downtime.',
    supers: ['Cutest couple', 'Most likely to argue about directions', 'Best dinner pick', 'Best dressed couple', 'First couple asleep', 'Most PDA', 'Best photographer', 'Most likely to miss the flight'] },
  family: { label: 'Family trip', desc: 'All ages. Easy days, early nights.', color: '#0E9F6E', nightlife: 'Things to do',
    small: { desc: 'All ages. Easy and early.', ai: 'A family outing with mixed ages, possibly kids. Keep it family-friendly: no clubs or bars, easy food and an early finish.' },
    ai: 'A family trip with mixed ages, possibly kids. Keep everything family-friendly: no clubs. Favor activities, parks, easy food spots and early evenings.',
    supers: ['Trip MVP', 'Best snack supply', 'Most likely to get lost', 'Best navigator', 'First one asleep', 'Most photos taken', 'Best attitude', 'Funniest moment'] },
  college: { label: 'Spring break', desc: 'Tight budget, beach, happy hours.', color: '#1098AD',
    small: { ai: 'A cheap night or day out for students: happy hours, cheap eats and free or low-cost fun.' },
    ai: 'A spring break or college trip on a tight budget. Favor cheap eats, beach or pool parties, happy hours, and budget stays like hostels or shared rentals.',
    supers: SUPERS_DEFAULT },
  festival: { label: 'Festival or concert', desc: 'Planned around the set times.', color: '#7048E8',
    small: { ai: 'A plan built around a concert or festival: food and drinks before, an easy way to the venue, and somewhere to go after.' },
    ai: 'A trip built around a music festival or concert. Favor pre-game spots, after-parties, easy transport to the venue, and recovery brunches.',
    supers: ['Best festival outfit', 'Most likely to lose the group', 'Front row energy', 'Best set pick', 'First one asleep', 'Last one standing', 'Main character', 'Most likely to miss the flight'] },
  sports: { label: 'Sports trip', desc: 'The game, the tailgate, the night after.', color: '#E8590C',
    small: { ai: 'A plan built around a game: at the stadium or a sports bar, food before or after, and somewhere fun to go after.' },
    ai: 'A trip built around a sports game or event. Favor sports bars, tailgates, a great steak or BBQ dinner, and a fun night out after the game.',
    supers: ['Loudest fan', 'Worst bet', 'Biggest spender', 'Best jersey', 'First one asleep', 'Last one standing', 'Best tailgate snack', 'Most likely to miss the flight'] },
  work: { label: 'Team offsite', desc: 'Team dinners, one activity, time to work.', color: '#5C6A7A', nightlife: 'Things to do',
    small: { label: 'Team outing', desc: 'A team lunch, dinner or activity.', ai: 'A work team outing, like a team lunch, dinner or activity. Keep it professional but relaxed: easy to talk, easy to get to.' },
    ai: 'A work team offsite. Keep it professional but fun: team dinners, one group activity, a nice bar for the evening, and quiet time to work.',
    supers: ['Team MVP', 'Best idea of the trip', 'Most likely to answer email at dinner', 'Best dressed', 'First one asleep', 'Best karaoke', 'Most likely to miss the flight', 'Best team spirit'] },
};
const mode = () => MODES[S.trip?.mode] || MODES.friends;
/* ---------- what a plan type changes beyond its AI line ----------
   Plan type (mode) and plan size are separate: size is how long, type is who's going and what for.
   Most types are social plans and keep the original quiz, nightlife picks and Live chips. Family
   trips and team offsites get their own. A missing or unknown mode is a friends trip, as before. */
const SPEND_Q = QUIZ.find(q => q.k === 'spend');
const CALM_SPOT = '"type":"%T","area":"neighborhood","why":"one sentence on why this group would like it","price":"$|$$|$$$|$$$$","cover":"entry price per person, e.g. Free or $15","bestNight":"best time, e.g. Sat morning","tip":"one practical insider tip","lat":0,"lng":0';
// adding a calm pick to the itinerary: cafés in the morning, meals at dinner time, a bar or lounge as a relaxed
// evening, everything else as a daytime activity; never as nightlife
const calmAdd = s => { const t = s.type || ''; return /cafe/.test(t) ? { time: '09:30', kind: 'food' } : /restaurant|food/.test(t) ? { time: '18:30', kind: 'food' } : /bar|lounge/.test(t) ? { time: '20:00', kind: 'chill' } : { time: '10:00', kind: 'activity' }; };
const PLAN_KINDS = {
  social: {
    quiz: QUIZ,
    // one evening isn't asked about daytime or heading home at sunrise; a day out isn't asked about a night out
    quizBy: {
      hangout: [QUIZ[0], QUIZ[1], { k: 'home', q: 'You head home…', o: ['Early, around 10', 'Around midnight', 'Whenever it ends'] }, SPEND_Q],
      day: [{ k: 'sday', q: 'The day is for…', o: ['Pool or beach', 'Exploring & eating', 'Activities', 'A game, show or concert'] }, { k: 'safter', q: 'And after?', o: ['Home early', 'Dinner somewhere good', 'A night out'] }, SPEND_Q],
    },
    persona: w => `The ${PERSONA_LATE[w.late?.a] || { 'Early, around 10': 'Early-Bird', 'Around midnight': 'Midnight', 'Whenever it ends': 'Late-Night' }[w.home?.a] || 'Wild'} ${PERSONA_NIGHT[w.night?.a] || { 'Pool or beach': 'Beach', 'Exploring & eating': 'Foodie', Activities: 'Go-Go', 'A game, show or concert': 'Front-Row' }[w.sday?.a] || 'Party'} Crew`, blendEg: '60% Big club, 40% Rooftop cocktails',
    group: 'friend group', with: 'friends', people: 'adults', vibe: { ctx: 'mixed, fun', pitch: 'fun, social, nightlife', small: 'fun, social' },
    spots: null, // the original nightlife scout prompt and card
    checkins: CHECKINS, hypes: HYPES, hypesLive: HYPES_LIVE, hangover: true,
    picks: 'Nightlife picks the group already likes', mix: 'Mix food, daytime activities, recovery time, and nights out (use the picks on their best nights).',
    pack: 'speaker, phone chargers, games, first aid, hangover kit, etc.',
  },
  family: {
    quiz: [
      { k: 'fpace', q: 'Ideal pace?', o: ['Packed days', 'A good mix', 'Slow and easy'] },
      { k: 'fday', q: 'Days are for…', o: ['Pool or beach', 'Parks & outdoors', 'Museums & sights', 'Theme parks', 'Exploring & eating'] },
      { k: 'feve', q: 'Evenings are for…', o: ['Early dinner, early night', 'Dinner out together', 'Games or a movie in'] },
      SPEND_Q],
    // a dinner or a single day doesn't get questions about days, evenings or theme parks
    quizBy: {
      hangout: [
        { k: 'fmeal', q: 'What kind of meal?', o: ['Casual & kid-friendly', 'A proper sit-down dinner', 'Somewhere with room to play', 'Takeout or a picnic'] },
        { k: 'fafter', q: 'And after?', o: ['Straight home', 'A walk or dessert', 'Games or a movie'] },
        SPEND_Q],
      day: [
        { k: 'fdayout', q: 'The day is for…', o: ['Parks & outdoors', 'Museums & sights', 'Zoo, aquarium or theme park', 'Pool or beach', 'Exploring & eating'] },
        { k: 'fdpace', q: 'Ideal pace?', o: ['Packed', 'A good mix', 'Slow and easy'] },
        SPEND_Q],
    },
    persona: w => `The ${{ 'Packed days': 'Go-Go', Packed: 'Go-Go', 'A good mix': 'Easygoing', 'Slow and easy': 'Slow-Days' }[w.fpace?.a || w.fdpace?.a] || 'Happy'} Family`, blendEg: '60% Parks & outdoors, 40% Museums & sights',
    group: 'family group', with: 'family', people: 'people of mixed ages, possibly kids', vibe: 'relaxed and family-friendly',
    spots: { who: 'a local guide finding family-friendly places', ask: 'Give 9 picks that work for all ages: activities, parks, sights and easy places to eat. No clubs or bars. Favor places that work for a group this size. Match the best time for each place to the trip days.',
      askSmall: 'Give 9 family-friendly picks for this outing: mostly places to eat that work for all ages, plus a few easy things to do nearby. No clubs or bars. Favor places that work for a group this size.', types: 'activity|park|museum|sight|restaurant|cafe|show', heading: 'Things to do in', empty: 'Take the vibe quiz, then let AI pull activities, parks and easy places to eat that fit your crew, budget and the days you’re there.', add: calmAdd },
    checkins: ['At the hotel', 'At the pool', 'Getting food', 'Out exploring', 'Heading back', 'Asleep'],
    hypes: ['LET’S GOOO', 'Who’s packing already?', 'I just booked!', 'Countdown is on'], hypesLive: ['Where is everyone?', 'Best day yet', 'Who’s hungry?', 'Heading back soon'], hangover: false,
    hypesSmall: ['Can’t wait!', 'Who’s driving?', 'Running a bit late', 'Saved us a table'], stops: ['food', 'activity', 'travel', 'chill'],
    picks: 'Places the group already likes', mix: 'Mix food, activities, downtime and easy evenings (use the picks at their best times). Nothing late at night or 21+ only.',
    pack: 'sunscreen, snacks, phone chargers, games, first aid, wipes, etc.',
    smallMix: 'a relaxed family meal, an easy activity everyone can join, something outdoors, and something new',
    costHints: { food: 'Every meal and snack', fun: 'Tickets, entry fees, rentals' }, dealsFun: 'activities', evening: 'Evenings',
  },
  work: {
    quiz: [
      { k: 'wact', q: 'Best team activity?', o: ['Something active', 'Food or cooking', 'Culture & a tour', 'Games or a challenge', 'Keep it low-key'] },
      { k: 'wpace', q: 'Work vs team time?', o: ['Mostly working', 'Half and half', 'Mostly team time'] },
      { k: 'weve', q: 'Evenings are for…', o: ['Team dinner, early night', 'Dinner, then a drink', 'A proper night out'] },
      SPEND_Q],
    // a team lunch or day out isn't asked about work sessions or evenings
    quizBy: (() => { const q = [
      { k: 'wout', q: 'Best kind of team outing?', o: ['A good lunch or dinner', 'A class or workshop', 'Games or a challenge', 'Something outdoors', 'Drinks after work'] },
      { k: 'wtalk', q: 'The vibe?', o: ['Easy conversation', 'A bit competitive', 'Something new to try'] },
      SPEND_Q]; return { hangout: q, day: q }; })(),
    persona: w => `The ${{ 'Mostly working': 'Heads-Down', 'Half and half': 'Balanced', 'Mostly team time': 'All-Hands' }[w.wpace?.a] || 'Dream'} Team`, blendEg: '60% Food or cooking, 40% Something active',
    group: 'work team', with: 'colleagues', people: 'colleagues', vibe: 'professional but fun',
    spots: { who: 'a local guide finding places for a work team offsite', whoSmall: 'a local guide finding places for a work team outing',
      askSmall: 'Give 9 picks for a team outing: restaurants that take group bookings, a few group activities, and one relaxed spot for a drink. Nothing rowdy.', ask: 'Give 9 picks: group activities, good restaurants for a team dinner, and one or two relaxed spots for an evening drink. Nothing rowdy. Favor places that take group bookings for a team this size. Match the best time for each place to the trip days.', types: 'activity|restaurant|bar|cafe|venue|tour', heading: 'Things to do in', empty: 'Take the vibe quiz, then let AI pull team activities, dinner spots and a relaxed place for the evening that fit your team, budget and the days you’re there.', add: calmAdd },
    checkins: ['At the hotel', 'In a session', 'Getting food', 'At dinner', 'Heading back', 'Asleep'],
    hypes: ['Can’t wait!', 'Who’s packing already?', 'I just booked!', 'See you there'], hypesLive: ['Where is everyone?', 'Great session', 'Dinner plans?', 'Heading back soon'], hangover: false,
    hypesSmall: ['See you there', 'Who’s driving?', 'Running a few minutes late', 'Saved us a table'], stops: ['food', 'activity', 'work', 'travel', 'chill'],
    picks: 'Places the team already likes', mix: 'Mix work sessions, team meals, one group activity and relaxed evenings (use the picks at their best times).',
    pack: 'laptop chargers, plug adapters, a speaker, snacks, first aid, etc.',
    smallMix: 'a team lunch or dinner, a group activity (a class, a game, a tour), something low-key, and something new',
    costHints: { food: 'Every meal and team dinner', fun: 'Team activity, tickets, entry fees' }, dealsFun: 'activities', evening: 'Evenings',
  },
};
const KIND_OF = { family: 'family', work: 'work' };
const planKind = (t = S.trip) => PLAN_KINDS[KIND_OF[t?.mode]] || PLAN_KINDS.social;
// Friends, Celebration (a guest of honor), Family or Work: what decides which features a plan shows.
// A missing or unknown type is a friends plan.
const planGroup = (t = S.trip) => KIND_OF[t?.mode] || (MODES[t?.mode]?.honoree ? 'celebration' : 'friends');
const quiz = () => planKind().quizBy?.[size()] || planKind().quiz;
// Itinerary stop kinds the AI may use: social plans keep nightlife; family trips and offsites don't get it
// (offsites get work sessions). Small plans have no travel or work stops.
const stopKinds = () => { const k = planKind().stops || ['food', 'activity', 'nightlife', 'travel', 'chill']; return isSmall() ? k.filter(x => x !== 'travel' && x !== 'work') : k; };
// a kind from an AI reply: social plans keep it as it came; others never get one outside their list
const stopKindOf = k => !planKind().stops || stopKinds().includes(k) ? k : k === 'nightlife' ? 'chill' : 'activity';
// Stops someone typed in themselves are commitments (a booking, a game, a set time); picks added from
// suggestions or last time's outline are already on the plan, but their times were never chosen.
// An AI stop nobody has changed. Editing a stop records which parts a person set (edited: { title,
// date, time }), so redrafts and replans keep it. AI stops saved before edits were recorded count as untouched.
const isDraft = i => !!i.ai && !i.edited;
const isCommitment = i => (!i.ai && !i.src && i.kind === 'plan') || !!(i.edited && (i.edited.date || i.edited.time));
// Stops someone deleted (by name), so no AI draft or replan puts them back. Surprises are never listed:
// the guest of honor can read the plan.
const isDropped = i => (S.trip.dropped || []).some(t => rkey(t) === rkey(i.title || ''));
const dropTitle = (list, title) => [...(list || []).filter(t => rkey(t) !== rkey(title)), title].slice(-40);
const undropTitle = (list, title) => (list || []).filter(t => rkey(t) !== rkey(title));
const stopLine = i => `- ${i.date}${i.time ? ' ' + i.time : ''}: ${i.title}${i.note ? ' (' + i.note + ')' : ''}`;
// what an AI itinerary request is told about stops already in the plan (only the ones it may see)
function keptStops(items) {
  // a surprise the guest of honor can't see still holds its slot
  const keep = items.filter(i => !isDraft(i)), dropped = S.trip.dropped || [], fixed = keep.filter(i => isCommitment(i) || i.hidden), rest = keep.filter(i => !isCommitment(i) && !i.hidden);
  return `${fixed.length ? `Fixed commitments the crew set (keep them exactly as they are, plan around their times, don't move, replace or repeat them):\n${fixed.map(stopLine).join('\n')}\n` : ''}${rest.length ? `Also already on the plan (the crew added these; don't repeat them):\n${rest.map(stopLine).join('\n')}\n` : ''}${dropped.length ? `The crew removed these, so don't add them back: ${dropped.join('; ')}\n` : ''}`;
}
const vibeDefault = where => { const v = planKind().vibe; return typeof v === 'string' ? v : v[where]; };
// a hangout or day out says “Family”, not “Family trip”; v.small has the few words that differ for small plans
const isSmallSize = sz => sz === 'hangout' || sz === 'day';
const modeLabel = (v, sz) => sz === 'weekend' ? v.label.replace(/ trip$/, ' weekend') : isSmallSize(sz) ? v.small?.label || v.label.replace(/ trip$/, '') : v.label;
const modeDesc = (v, sz) => isSmallSize(sz) && v.small?.desc || v.desc;
const modeAi = () => isSmall() && mode().small?.ai || mode().ai;
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
    { k: 'home', label: 'Home', tabs: [['overview', 'Overview'], ['crew', 'Crew'], ['tasks', 'To-dos'], ['log', 'Changes'], ['settings', 'Settings']] },
    { k: 'plan', label: 'Plan', tabs: [['match', isSmall() ? 'Plan Match' : 'Trip Match'], ['dates', isSmall() ? 'When' : 'Dates'], ['whatif', 'What if'], ['spots', isSmall() ? 'Spots' : (mode().nightlife || 'Nightlife')], ['plan', isSmall() ? 'The plan' : 'Itinerary']] },
    { k: 'book', label: 'Book', tabs: [['flights', 'Flights'], ['stays', 'Stays'], ['tickets', 'Boarding passes'], ['pack', 'Packing']] },
    { k: 'live', label: 'Live', tabs: [['live', 'Today'], ['map', 'Map'], ['bucket', 'Bucket list'], ['hype', 'Hype']] },
    { k: 'money', label: 'Money', tabs: [['cost', 'All-in cost'], ['meter', 'My spend'], ['pot', 'Group pot'], ['money', 'Expenses']] },
    { k: 'memories', label: 'Memories', tabs: [['wrapped', isSmall() ? 'Recap' : 'Wrapped'], ['recap', 'Photos'], ['awards', 'Awards']] },
  ].map(s => ({ ...s, tabs: s.tabs.filter(([k]) => tabOn(k)) })).filter(s => s.tabs.length);
}
const TAB_ALIAS = { deals: 'flights', where: 'match' };
const secOf = tab => sections().find(s => s.tabs.some(t => t[0] === tab)) || sections()[0];
const TABFN = () => ({ log: logTab, overview: overviewTab, crew: crewTab, tasks: tasksTab, cost: costTab, whatif: whatifTab, settings: settingsTab, match: matchTab, dates: datesTab, where: whereTab, spots: spotsTab, plan: planTab,
  flights: flightsTab, stays: staysTab, tickets: ticketsTab, pack: packTab, live: liveTab, map: mapTab, bucket: bucketSection, hype: hypeTab,
  meter: meterTab, pot: potTab, money: moneyTab, wrapped: wrappedTab, recap: photosTab, awards: awardsTab });
function tripView() {
  if (S.membersIn && accessState() !== 'ok') return blockedView(accessState());
  if (S.setup && S.membersIn && meDoc()) return setupView();
  if (TAB_ALIAS[S.tab]) S.tab = TAB_ALIAS[S.tab];
  const fns = TABFN(); if (!fns[S.tab] || !tabOn(S.tab)) S.tab = 'overview'; // a link to a tab this plan doesn't show opens the plan home
  const sec = secOf(S.tab), cd = countdown(), m = mode(), gd = guide(), crumbTab = gd && !gd.wait && gd.tab !== S.tab ? gd.tab : null;
  // someone deciding whether to join sees just the invitation, until they answer or choose to look around
  const inviteOnly = S.tab === 'overview' && showWelcome() && !S.peek;
  const head = S.tab === 'overview' ? '' : `<div class="mini"><span class="sec-eyebrow">${esc(sec.label)}</span><button class="mini-name" data-tab="overview">${esc(S.trip.name)}</button>
      ${isSmall() ? `<span class="mode-chip" style="--mc:${SIZES[size()].color}">${esc(SIZES[size()].label)}</span>` : `<span class="mode-chip" style="--mc:${m.color}">${esc(modeLabel(m, size()))}</span>`}${cd ? `<span class="small muted">${esc(cd.n > 0 ? cd.text + ' to go' : cd.text)}</span>` : ''}</div>`;
  return `${topBar()}
  ${S.demo ? `<div class="banner"><span><b>Demo trip.</b> Sample crew, nothing is saved. Try switching the trip type in Home › Settings.</span><button class="btn sm" data-act="home">Back</button></div>` : ''}
  ${S.readOnly ? `<div class="banner"><span>You can view this plan but not edit it. Ask the owner to share it with you as a Contributor.</span></div>` : ''}
  ${lostBanner()}
  ${head}
  ${liveBanner()}
  ${journeyPill()}
  ${sec.tabs.length > 1 && !inviteOnly ? `<nav class="subtabs" aria-label="${esc(sec.label)}">${sec.tabs.map(([k, l]) => `<button class="subtab ${S.tab === k ? 'on' : ''}" data-tab="${k}" aria-current="${S.tab === k}">${esc(l)}${crumbTab === k ? '<i class="crumb" aria-hidden="true"></i>' : ''}${k === 'log' && !S.demo && logList().some(x => needsMe(x)) ? ` <span class="count">${logList().filter(x => needsMe(x)).length}</span>` : ''}</button>`).join('')}</nav>` : ''}
  ${fns[S.tab]()}
  ${isLive() && !S.lostOpen && !['live', 'map', 'overview'].includes(S.tab) ? '<button class="fab-lost" data-act="lostOpen" aria-label="I’m lost: send the crew my spot">SOS</button>' : ''}
  ${S.lostOpen ? lostSheet() : ''}
  ${inviteOnly ? '' : `<nav class="bottomnav" aria-label="Trip sections"><div class="bn-inner" style="grid-template-columns:repeat(${sections().length},1fr)">${sections().map(s => `<button class="bn ${s.k === sec.k ? 'on' : ''}" data-sec="${s.k}" aria-current="${s.k === sec.k}">${icon(s.k)}${crumbTab && secOf(crumbTab).k === s.k && s.k !== sec.k ? '<i class="crumb" aria-hidden="true"></i>' : ''}<span>${s.label}${s.k === 'live' && isLive() ? ' ●' : ''}</span></button>`).join('')}</div></nav>`}`;
}

/* the plan home (overviewTab) is in 05o-overview.js */
function settingsTab() {
  const m = mode();
  return `<section class="card stack"><h3>Plan size</h3><div class="row" style="gap:6px">${Object.entries(SIZES).map(([k, v]) => `<button class="chip ${size() === k ? 'on' : ''}" data-setsize="${k}">${esc(v.label)}</button>`).join('')}</div><p class="small muted">Changing the size keeps everyone’s votes and free days.</p></section>
  <section class="card stack"><h3>Currency</h3><label class="field" style="flex:none;max-width:280px"><span class="label">Everyone spends in</span><select id="set-cur" ${S.readOnly ? 'disabled' : ''}>${curOptions(cur())}</select></label><p class="small muted">All amounts in this ${planWord()} show in this currency, and the AI prices in it. Changing it doesn’t convert amounts people already typed in.</p></section>
  <section class="card stack"><h3>Type</h3>
    <div class="modes compact">${Object.entries(MODES).map(([k, v]) => `<button class="mode ${S.trip.mode === k || (!S.trip.mode && k === 'friends') ? 'on' : ''}" data-setmode="${k}" style="--mc:${v.color}"><b>${esc(modeLabel(v, size()))}</b></button>`).join('')}</div>
    ${m.honoree ? `<div class="row" style="gap:10px">
      <label class="field"><span class="label">The ${esc(m.honoree)}</span><select id="set-honoree"><option value="">Pick someone</option>${S.members.map(x => `<option value="${esc(x.id)}" ${S.trip.honoree === x.id ? 'selected' : ''}>${esc(x.nick || 'Someone')}</option>`).join('')}</select></label>
      <label class="row small" style="gap:8px;flex:1 1 200px"><input type="checkbox" id="set-free" style="width:auto" ${S.trip.honoreeFree !== false ? 'checked' : ''}> The ${esc(m.honoree)} pays nothing (their share is split across everyone else)</label></div>
      <p class="small muted">Surprise plans and the planners-only chat are hidden from the ${esc(m.honoree)} in the app.</p>` : ''}
  </section>
  ${decideCard()}
  ${S.demo ? '' : S.repeat ? repeatDialog() : `<section class="card row repeat-cta"><span><b>Do this again?</b> <span class="small muted">Start a new ${planWord()} with the same to-dos, outline and packing list. Dates, prices and who’s coming start fresh.</span></span><button class="btn" data-act="repeatOpen">Repeat this ${planWord()}</button></section>`}
  ${templateCard()}
  ${SETTINGS_HTML()}`;
}

