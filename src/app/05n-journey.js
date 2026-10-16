/* ---------- the plan journey ----------
   One source of truth for where a plan is and what it needs. Every plan size gets its own
   steps in six shared stages. Each step knows whether it applies, whether it's done, what it
   waits on (blocked), who it's waiting on, and four things for the person looking:
   what we're trying to do, why it matters now, exactly what to do, and what happens after.
   Its button does the thing right there when it can (lock these dates, send the invite,
   I'm in), and otherwise opens the exact control it needs. The guide card, the next-move
   pill, the dot on the menu, the glow on the control, the milestone toast and the home rows
   all read from here. */
const JSTAGES = [['gather', 'Get together'], ['decide', 'Decide'], ['prepare', 'Prepare'], ['final', 'Final check'], ['experience', 'Experience'], ['after', 'Afterward']];
const JSTAGE_LABEL = Object.fromEntries(JSTAGES);
const word = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const namesOrCount = ms => ms.length <= 3 ? listNames(ms) : people(ms.length);
const daysUntil = d => Math.round((D(d) - D(TODAY)) / 864e5);
// buttons: a real action where possible, otherwise "open the place and light up the control"
const btn = (attrs, label, cls = 'primary') => `<button class="btn ${cls}" ${attrs}>${esc(label)}</button>`;
const goBtn = (k, label, cls = 'primary') => btn(`data-jgo="${k}"`, label, cls);
const nudgeBtn = (k, ms, cls = '') => ms.length ? btn(`data-jnudge="${k}"`, ms.length === 1 ? `Nudge ${ms[0].nick || 'them'}` : `Nudge ${ms.length <= 2 ? listNames(ms) : 'them'}`, cls) : '';

// The step catalogue. Each one is a function of the plan as it is now.
function jSteps() {
  const t = S.trip, sz = size(), small = isSmall(), ms = active(), me = meDoc(), n = ms.length;
  const goers = S.members.filter(going), others = arr => arr.filter(m => m.id !== S.uid);
  const haveDest = !!t.lockedDest, haveDates = !!t.lockedDates, decided = haveDest && haveDates;
  const d = t.lockedDates, over = d && TODAY > d.end, live = d && TODAY >= d.start && !over;
  const placeWord = small ? 'the plan' : 'where to go', dayWord = small ? 'the day' : 'the dates';
  const S_ = [];
  const add = (k, stage, def) => S_.push({ k, stage, ...def });
  const needsDecided = !decided ? [!haveDest && 'dest', !haveDates && 'dates'].filter(Boolean) : [];

  /* ----- get together ----- */
  const inPlan = S.members.filter(m => !m.removed && m.status !== 'out');
  add('invite', 'gather', {
    title: 'Get the crew in', done: inPlan.length >= 2, mine: inPlan.length < 2, mineText: 'Invite your friends',
    goal: 'Get everyone into the plan',
    why: inPlan.length < 2 ? `It’s just you so far. Votes, dates and costs only mean something once people are in.` : '',
    todo: 'Send the invite to your group chat. They tap it, type their name and they’re in.',
    after: 'As people join, they pick their free days and vote. You’ll see it here.',
    act: () => btn('data-act="copyInvite"', 'Send the invite'), help: { tab: 'crew', sel: '[data-act="copyInvite"]' },
  });
  if (honoreeMode() && !small) add('honoree', 'gather', {
    title: `Choose the ${mode().honoree}`, done: !!t.honoree, hideFrom: 'honoree', mine: true, mineText: `Choose the ${mode().honoree}`,
    goal: `Say who the ${mode().honoree} is`,
    why: `Their share can be covered, and surprise plans stay hidden from them.`,
    todo: `Pick them below. Only planners see this step.`,
    after: 'Anything you mark as a surprise in the itinerary is hidden from them until you reveal it.',
    act: () => `<select id="set-honoree" style="width:auto"><option value="">Pick someone</option>${S.members.map(m => `<option value="${esc(m.id)}">${esc(m.nick || 'Someone')}</option>`).join('')}</select>`,
    help: { tab: 'settings', sel: '#set-honoree' },
  });
  {
    const und = undecided(), mineU = und.some(m => m.id === S.uid);
    add('rsvp', 'gather', {
      title: 'Get everyone’s answer', done: inPlan.length >= 2 && !und.length, applies: S.members.length >= 2 || mineU,
      who: und, mine: mineU,
      group: und.length ? whoHas(und, 'hasn’t', 'haven’t', 'said if they’re in') : '',
      mineText: 'Say if you’re in',
      goal: mineU ? 'Tell the crew if you’re in' : 'Find out who’s actually coming',
      why: mineU ? `${word(goers.length, 'person is', 'people are')} going so far. The plan is built around who’s coming.` : `${word(goers.length, 'person is', 'people are')} going. ${namesOrCount(und)} ${und.length === 1 ? 'hasn’t' : 'haven’t'} answered.`,
      todo: mineU ? 'Tap one. You can change it later.' : `Ask ${namesOrCount(und)} to answer${t.rsvpBy ? ` by ${fmt(t.rsvpBy)}` : ''}.`,
      after: 'Costs, stays and the headcount use this number.',
      act: () => mineU ? `${btn('data-status="in"', 'I’m in')}${btn('data-status="out"', 'Can’t make it', 'ghost')}` : nudgeBtn('rsvp', und),
      help: { tab: 'crew', sel: '.rsvp' }, ask: 'say if you’re in',
    });
  }

  /* ----- decide ----- */
  {
    const items = t.pitches?.items || [], ro = runoffState(), match = matchedPitch(), dests = t.destinations || [];
    const notSwiped = ms.filter(m => items.some(p => !swipeOf(p.id, m.id))), mineSwipe = notSwiped.some(m => m.id === S.uid);
    const noVote = ms.filter(m => !(m.votes || []).length), lead = [...dests].sort((a, b) => votesFor(b.id).length - votesFor(a.id).length)[0];
    let s = { who: [], mine: false, group: '', why: '', todo: '', act: () => '', help: { tab: 'match', sel: '#pitch' } };
    if (ro && !ro.winner) {
      const w = ro.waiting, mineR = w.some(m => m.id === S.uid);
      s = { who: w, mine: mineR, group: `Final vote: waiting on ${namesOrCount(w)}`, mineText: 'Vote in the final round',
        why: `Nothing got a yes from everyone, so it’s down to ${ro.ps.map(pName).join(' or ')}.`, todo: mineR ? 'Pick the one you’d rather do.' : `Waiting on ${namesOrCount(w)} to vote.`,
        act: () => mineR ? goBtn('dest', 'Vote now') : nudgeBtn('dest', w), help: { tab: 'match', sel: '.runoff' }, ask: 'vote in the final round' };
    } else if (ro && ro.winner || match) {
      const p = ro?.winner || match;
      s = { group: `${pName(p)} won. Lock it in`, why: ro?.winner ? `${pName(p)} won the final vote.` : `Everyone swiped yes on ${pName(p)}.`,
        todo: `Lock in ${pName(p)}${p.start ? `, ${dayRange(p.start, p.end)}` : ''}.`, act: () => btn(`data-lockpitch="${esc(p.id)}"`, `Lock in ${pName(p)}`), help: { tab: 'match', sel: '[data-lockpitch]' } };
    } else if (items.length && notSwiped.length) {
      const top = [...items].sort((a, b) => fitScore(b) - fitScore(a))[0];
      s = { who: notSwiped, mine: mineSwipe, group: whoHas(notSwiped, 'is', 'are', 'still swiping'), mineText: `Swipe on the ${small ? 'plans' : 'trips'}`,
        why: `${word(items.length, 'option', 'options')} to choose from. ${n - notSwiped.length} of ${n} have swiped${fitScore(top) ? `, and ${pName(top)} leads so far` : ''}.`,
        todo: mineSwipe ? `Swipe on each one: yes, could work, or pass. It takes a minute.` : `Ask ${namesOrCount(notSwiped)} to swipe.`,
        act: () => mineSwipe ? goBtn('dest', 'Start swiping') : nudgeBtn('dest', notSwiped), help: { tab: 'match', sel: '#pitch' }, ask: `swipe on the ${small ? 'plan' : 'trip'} options` };
    } else if (items.length) {
      s = { group: 'No perfect match. Settle it', why: 'Everyone swiped, and nothing got a yes from all of you.', todo: 'Go with the one everyone can live with, or run a final vote between the top two.',
        act: () => goBtn('dest', 'Settle it'), help: { tab: 'match', sel: '.settle' } };
    } else if (dests.length && noVote.length) {
      const mineV = noVote.some(m => m.id === S.uid);
      s = { who: noVote, mine: mineV, group: whoHas(noVote, 'hasn’t', 'haven’t', 'voted'), mineText: `Vote on ${placeWord}`,
        why: `${word(dests.length, 'idea', 'ideas')} on the table${lead && votesFor(lead.id).length ? `. ${lead.city} leads with ${word(votesFor(lead.id).length, 'vote', 'votes')}` : ''}.`,
        todo: mineV ? 'Vote for every one you’d do.' : `Ask ${namesOrCount(noVote)} to vote, then lock the winner.`,
        act: () => mineV ? goBtn('dest', 'Vote now') : nudgeBtn('dest', noVote), help: { tab: 'match', sel: '[data-vote]' }, ask: `vote on ${placeWord}` };
    } else if (dests.length) {
      s = { group: `${lead.city} is winning. Lock it in`, why: `Everyone has voted. ${lead.city} has ${word(votesFor(lead.id).length, 'vote', 'votes')}.`, todo: `Lock in ${lead.city}.`,
        act: () => btn(`data-lockdest="${esc(lead.id)}"`, `Lock in ${lead.city}`), help: { tab: 'match', sel: '[data-lockdest]' } };
    } else {
      s = { group: small ? 'No ideas yet' : 'No destinations yet', why: small ? 'Nobody has suggested anything yet.' : 'There’s nothing on the table yet.',
        todo: S.sample ? `Get a few ${small ? 'plans' : 'trips'} pitched that fit everyone’s budget and free days, or suggest your own.` : `Suggest ${small ? 'an idea' : 'a place'}. Everyone votes on it.`,
        act: () => S.sample ? goBtn('dest', small ? 'Pitch us some plans' : 'Pitch us some trips') : goBtn('dest', 'Suggest one'),
        help: S.sample ? { tab: 'match', sel: '[data-act="genPitches"]', click: true } : { tab: 'match', sel: '#ad-city' } };
    }
    add('dest', 'decide', { title: small ? 'Choose what to do' : 'Choose where to go', done: haveDest, goal: small ? 'Let’s pick what we’re doing' : 'Let’s pick where we’re going',
      after: haveDates ? (small ? 'Then confirm the place and time.' : 'Then book travel and a place to stay.') : `Once ${dayWord} ${small ? 'is' : 'are'} set too, ${small ? 'you confirm the place and time' : 'travel and the stay open up'}.`, ...s });
  }
  {
    const noDays = ms.filter(m => !(m.days || []).length), mineD = noDays.some(m => m.id === S.uid), best = bestWindows()[0], shared = n - noDays.length;
    const bestText = best ? `${dayRange(best.start, best.end)} works for ${best.ok.length === n ? 'everyone' : best.ok.length === shared && shared < n ? 'everyone who’s responded' : `${best.ok.length} of ${n}`}` : '';
    add('dates', 'decide', {
      title: small ? 'Choose the day' : 'Choose the dates', done: haveDates, who: noDays, mine: mineD,
      group: noDays.length ? whoHas(noDays, 'hasn’t', 'haven’t', `picked ${small ? 'days' : 'dates'}`) : best ? `${bestText}. Lock it` : `No ${small ? 'day' : 'dates'} work for everyone yet`,
      mineText: small ? 'Pick the days that work for you' : 'Pick your free days',
      goal: small ? 'Let’s settle on a day' : 'Let’s settle on the dates',
      why: `${shared === n ? 'Everyone has' : !shared ? 'Nobody has' : `${shared} of ${n} have`} shared when they’re free${!shared ? ' yet' : ''}.${best ? ` ${bestText}.` : shared ? ` No ${small ? 'day' : `${nightsSet(t)}-night stretch`} works for everyone yet.` : ''}`,
      todo: mineD ? `Tap the days you’re free${best ? `, then lock ${dayRange(best.start, best.end)}` : ''}.` : noDays.length ? `Ask ${namesOrCount(noDays)} to add their free days${best ? `, then lock the best ${small ? 'day' : 'dates'}` : ''}.` : best ? `Lock ${dayRange(best.start, best.end)}.` : 'Compare a shorter trip or widen the window.',
      after: small ? 'Then confirm the place and time, and who’s coming.' : haveDest ? 'Then book travel and a place to stay.' : 'Once where is set too, travel and the stay open up.',
      act: () => mineD ? goBtn('dates', 'Pick my days')
        : `${best ? btn(`data-lockdates="${best.start}|${best.end}"`, `Lock ${dayRange(best.start, best.end)}`, noDays.length ? '' : 'primary') : goBtn('dates', 'See the options', noDays.length ? '' : 'primary')}${nudgeBtn('dates', noDays, 'primary')}`,
      help: { tab: 'dates', sel: mineD ? '.cal' : '[data-lockdates]' }, ask: 'tap the days you’re free',
    });
  }

  /* ----- prepare ----- */
  const unsure = goers.filter(m => m.status === 'in'), mineC = unsure.some(m => m.id === S.uid);
  add('confirm', 'prepare', {
    title: 'Confirm who’s coming', done: goers.length > 0 && !unsure.length && !undecided().length, blockedBy: haveDates ? [] : ['dates'],
    who: unsure, mine: mineC, group: unsure.length ? whoHas(unsure, 'hasn’t', 'haven’t', 'confirmed') : '', mineText: 'Confirm you’re coming',
    goal: mineC ? 'Lock in that you’re coming' : 'Know exactly who’s coming',
    why: `${d ? (d.start === d.end ? fmt(d.start) : dayRange(d.start, d.end)) : 'The date'} ${d && d.start !== d.end ? 'are' : 'is'} set. ${goers.length - unsure.length} of ${goers.length} going ${goers.length - unsure.length === 1 ? 'has' : 'have'} confirmed.`,
    todo: mineC ? 'Confirm, so the crew can book around you.' : `Ask ${namesOrCount(unsure)} to confirm.`,
    after: small ? 'The final headcount goes to whoever books.' : 'Bookings and the cost split use the confirmed number.',
    act: () => mineC ? `${btn('data-status="confirmed"', 'Yes, I’m coming')}${btn('data-status="out"', 'Can’t make it', 'ghost')}` : nudgeBtn('confirm', unsure),
    help: { tab: 'crew', sel: '.ladder' }, ask: 'confirm you’re coming',
  });
  if (small) {
    const first = (t.itinerary || []).filter(i => i.time).sort(byTime)[0];
    add('venue', 'prepare', {
      title: 'Confirm the place and time', done: !!(t.venue || t.time || first), blockedBy: needsDecided,
      group: 'No place or time yet', goal: 'Pin down where and when',
      why: `${dest()?.city || 'The plan'} is set for ${d ? fmt(d.start) : 'the day'}, but there’s no place or start time yet.`,
      todo: 'Add the first stop with its time: where you meet, eat or start.',
      after: 'Everyone sees it in the plan, and you set a meeting point closer to the day.',
      act: () => goBtn('venue', 'Add the first stop'), help: { tab: 'plan', sel: '.addItem input[id^="ai-title"]' },
    });
  }
  if (sz === 'trip') {
    const tk = tickets(), left = tk.ins.filter(m => !tk.tk[m.id]), mineF = left.some(m => m.id === S.uid);
    add('flights', 'prepare', {
      title: mineF ? 'Book your flight' : 'Get everyone’s flights booked', done: tk.on, blockedBy: needsDecided,
      who: left, mine: mineF, group: left.length === 1 ? `One booking left: ${left[0].nick || 'Someone'}` : `${left.length} bookings left`, mineText: 'Book your flight and send your boarding pass',
      goal: mineF ? 'Get your flight booked' : 'Get every flight booked',
      why: `${tk.have.length} of ${tk.goal} booked. Fares usually climb closer to ${d ? short(d.start) : 'the trip'}.`,
      todo: mineF ? (me?.home ? `Book from ${me.home}, then upload your boarding pass or flight number.` : 'Add where you fly from, book, then upload your boarding pass.') : `Ask ${namesOrCount(left)} to book and send their boarding pass.`,
      after: 'Once everyone’s booked, the trip is official and arrivals show up for the crew.',
      act: () => mineF ? `${goBtn('flights', 'Upload my boarding pass')}${btn('data-tab="flights"', 'Find fares', 'ghost')}` : nudgeBtn('flights', left),
      help: { tab: 'tickets', sel: '#tkForm' }, ask: 'book your flight and send your boarding pass',
    });
  }
  if (!small) {
    const opts = t.stays?.items || [], own = Object.values(t.myStays || {}).filter(Boolean);
    const top = opts.map((s, i) => ({ s, i, sc: score(rkey('st' + s.name)) })).sort((a, b) => b.sc.net - a.sc.net)[0];
    add('stay', 'prepare', {
      title: 'Choose the stay', done: !!t.stay, blockedBy: needsDecided, group: 'Nobody has picked the stay yet',
      goal: 'Lock in where you’re staying', why: opts.length || own.length ? `${word(opts.length + own.length, 'option', 'options')} so far${top && top.sc.up ? `. ${top.s.name} has the most votes` : ''}.` : `Nothing picked yet for ${word(nightsOf(dates()) || nightsSet(t), 'night', 'nights')} in ${dest()?.city || 'town'}.`,
      todo: top && top.sc.up ? `Lock ${top.s.name}, or vote first if you haven’t.` : opts.length || own.length ? 'Vote on the options, then lock the favorite.' : S.sample ? 'Get a few stays that fit the group budget, or add a place you found.' : 'Add a place you found. The crew votes, then you lock it.',
      after: 'Each person’s share goes into the all-in cost. Then mark it booked.',
      act: () => top && top.sc.up ? `${btn(`data-lockstay="${top.i}"`, `Lock ${top.s.name}`)}${goBtn('stay', 'Compare', 'ghost')}` : goBtn('stay', opts.length || own.length ? 'Vote on stays' : S.sample ? 'Find stays' : 'Add a place'),
      help: opts.length ? { tab: 'stays', sel: '.stay .votes' } : S.sample ? { tab: 'stays', sel: '[data-act="findStays"]', click: true } : { tab: 'stays', sel: '[data-act="addStayOpen"]', click: true },
    });
  }
  if (sz !== 'hangout') {
    const need = small ? 1 : Math.max(3, nightsOf(dates())), have = (t.itinerary || []).length;
    add('plan', 'prepare', {
      title: small ? 'Plan the day' : 'Sketch the days', done: have >= need, blockedBy: needsDecided, hideFrom: 'honoree-secret', group: small ? 'Nothing planned for the day yet' : 'No itinerary yet',
      goal: small ? 'Plan how the day goes' : 'Sketch what you’ll do each day',
      why: have ? `${word(have, 'stop', 'stops')} so far.` : 'Nothing planned yet. Good spots book up.',
      todo: S.sample ? 'Let the AI draft it around the crew’s picks, then change anything.' : 'Add the stops you know: dinners, activities, nights out.',
      after: 'The plan shows up in Live on the day, with the map.',
      act: () => goBtn('plan', S.sample ? 'Draft it with AI' : 'Add stops'), help: S.sample ? { tab: 'plan', sel: '[data-act="plan"]', click: true } : { tab: 'plan', sel: '.addItem input[id^="ai-title"]' },
    });
  }
  {
    const open = taskList().filter(x => !x.done), mineT = open.filter(x => x.owner === S.uid), free = open.filter(x => !x.owner);
    const x = mineT[0] || free[0];
    add('tasks', 'prepare', {
      title: mineT.length ? `Finish “${mineT[0].title}”` : 'Split the to-dos', done: !open.length, applies: taskList().length > 0,
      mine: !!mineT.length, who: [], group: free.length ? `Nobody has taken “${free[0].title}”` : open[0] ? `${nameOf(open[0].owner)} is on “${open[0].title}”` : '', mineText: mineT[0] ? mineT[0].title : '',
      goal: mineT.length ? 'Get your to-do done' : 'Make sure every to-do has someone on it',
      why: `${word(open.length, 'to-do', 'to-dos')} left${free.length ? `, ${free.length} with nobody on ${free.length === 1 ? 'it' : 'them'}` : ''}.`,
      todo: mineT.length ? `${mineT[0].title}${mineT[0].due ? `, due ${short(mineT[0].due)}` : ''}. Mark it done when it is.` : free.length ? `Take “${free[0].title}”, or hand it to someone.` : 'Everyone has their to-dos. Nothing for you right now.',
      after: 'The crew sees it ticked off.',
      act: () => x ? (mineT.length ? btn(`data-taskdone="${esc(x.id)}"`, 'Mark it done') : btn(`data-taketask="${esc(x.id)}"`, 'I’ll take it')) + goBtn('tasks', 'All to-dos', 'ghost') : '',
      help: { tab: 'tasks', sel: x ? `[data-task="${x.id}"]` : '.tasks' }, parallel: true,
    });
  }

  /* ----- final check ----- */
  const soon = d && daysUntil(d.start) <= 7;
  if (!small && t.stay) add('booked', 'final', {
    title: 'Mark the stay as booked', done: !!t.stay.booked, blockedBy: [], group: `${t.stay.name} isn’t booked yet`,
    goal: 'Make sure the stay is actually booked', why: `${t.stay.name} is picked but nobody has marked it booked.`,
    todo: 'Whoever booked it: add what you paid. That updates everyone’s share.', after: 'The real price replaces the estimate in the all-in cost.',
    act: () => goBtn('booked', 'Mark it booked'), help: { tab: 'stays', sel: '#stayBookForm' },
  });
  if (sz === 'trip') {
    const tk = tickets(), noArr = tk.ins.filter(m => tk.tk[m.id] && !m.arrive), mineA = noArr.some(m => m.id === S.uid);
    add('arrivals', 'final', {
      title: 'Share when you land', done: tk.ins.length > 0 && tk.ins.every(m => m.arrive), blockedBy: ['flights'], who: noArr, mine: mineA,
      group: noArr.length ? whoHas(noArr, 'hasn’t', 'haven’t', 'shared when they land') : '', mineText: 'Share when you land',
      goal: 'Line up arrivals', why: 'So people landing close together can share a ride in.',
      todo: mineA ? 'Add your landing time and flight number.' : `Ask ${namesOrCount(noArr)} to add their landing time.`, after: 'Rides get matched up for people arriving within an hour of each other.',
      act: () => mineA ? goBtn('arrivals', 'Add my landing time') : nudgeBtn('arrivals', noArr), help: { tab: 'tickets', sel: '#arrForm' }, ask: 'add when you land',
    });
  }
  add('meet', 'final', {
    title: 'Set the meeting point', done: !!t.meet?.text, blockedBy: needsDecided, group: 'No meeting point yet', notBefore: !soon,
    goal: 'Make sure nobody’s left wandering', why: d ? `${daysUntil(d.start) <= 0 ? 'It’s today' : `It’s ${daysUntil(d.start) === 1 ? 'tomorrow' : 'in ' + daysUntil(d.start) + ' days'}`} and there’s no meeting point.` : '',
    todo: 'Say where and when everyone meets.', after: 'Everyone sees it in Live, with a map link.',
    act: () => `<form id="meetForm" class="row j-inline" style="gap:6px;align-items:flex-end"><label class="field" style="flex:2 1 150px"><span class="label">Where</span><input id="meet-where" maxlength="80" placeholder="${small ? 'Outside the restaurant' : 'Hotel lobby'}"></label><label class="field" style="flex:0 1 120px"><span class="label">When</span><input id="meet-time" type="time" value="${esc(t.time || '')}"></label><button class="btn primary" type="submit">Set it</button></form>`,
    help: { tab: 'live', sel: '#meetForm' },
  });

  /* ----- experience ----- */
  if (live) add('live', 'experience', {
    title: small ? 'Enjoy it' : 'Follow today’s plan', done: false, live: true,
    goal: 'It’s happening', why: (() => { const nowT = new Date().toTimeString().slice(0, 5), up = visItems().filter(i => i.date === TODAY).sort(byTime).find(i => timeKey(i.time) >= timeKey(nowT)); return up ? `Up next: ${up.title}${up.time ? ' at ' + t12(up.time) : ''}.` : 'Nothing else planned today.'; })(),
    todo: 'Open today’s plan. Check in when you get somewhere, and use SOS if you get separated.', after: 'Check-ins and photos feed the recap.',
    act: () => `${btn('data-tab="live"', 'Open today')}${btn('data-tab="map"', 'Map', 'ghost')}`, help: { tab: 'live', sel: '.live' },
  });

  /* ----- afterward ----- */
  if (over) {
    const owe = settle(), mineO = owe.filter(x => x.from === S.uid);
    add('settle', 'after', {
      title: mineO.length ? 'Pay back what you owe' : 'Settle up', done: !owe.length, applies: S.expenses.length > 0, mine: !!mineO.length,
      group: owe.length ? `${word(owe.length, 'payment', 'payments')} left to settle` : '', mineText: 'Pay back what you owe',
      goal: 'Square up the money', why: `${word(owe.length, 'payment settles', 'payments settle')} everything.`,
      todo: mineO.length ? `You owe ${listNames(mineO.map(x => ({ nick: nameOf(x.to) })))} ${money2(mineO.reduce((a, x) => a + x.amt, 0))}.` : 'See who pays whom.',
      after: 'Nobody has to chase anyone.', act: () => goBtn('settle', mineO.length ? 'See how to pay' : 'See who owes what'), help: { tab: 'money', sel: '.settle-list, .card' },
    });
    add('photos', 'after', {
      title: 'Add your photos', done: S.photos.some(p => p.by === S.uid), mine: true, mineText: 'Add your photos', group: '',
      goal: 'Put the photos in one place', why: `${word(S.photos.length, 'photo', 'photos')} so far.`, todo: 'Add your best ones. They go into the recap.',
      after: 'The recap and awards pick them up.', act: () => goBtn('photos', 'Add photos'), help: { tab: 'recap', sel: '#ph-files' }, parallel: true,
    });
    add('wrapped', 'after', {
      title: small ? 'Watch the recap' : 'Watch your Wrapped', done: !!lsGet('outta_wrapped_' + S.tid, false), mine: true, mineText: small ? 'Watch the recap' : 'Watch your Wrapped', group: '',
      goal: 'Relive it', why: 'Your recap is ready.', todo: 'Watch it, then share it with the crew.', after: 'You can start the next one from this plan in Settings.',
      act: () => btn('data-tab="wrapped"', 'Watch it'), help: { tab: 'wrapped', sel: '.wslide' },
    });
  }

  // work out status for each step
  const byK = Object.fromEntries(S_.map(s => [s.k, s]));
  const honor = isHonoree();
  return S_.filter(s => s.applies !== false && !(honor && s.hideFrom)).map(s => {
    const blocked = (s.blockedBy || []).filter(k => byK[k] && !byK[k].done);
    const status = s.done ? 'done' : blocked.length ? 'blocked' : s.notBefore ? 'later' : (s.who || []).length && !s.mine ? 'waiting' : 'ready';
    return { ...s, blocked: blocked.map(k => byK[k].title), status };
  });
}
// which stage the plan is in: decided by time first, then by what's open
function journey() {
  const t = S.trip, d = t.lockedDates, steps = jSteps();
  let stage;
  if (d && TODAY > d.end) stage = 'after';
  else if (d && TODAY >= d.start) stage = 'experience';
  else {
    const open = k => steps.some(s => s.stage === k && s.status !== 'done' && s.status !== 'later');
    stage = !steps.find(s => s.k === 'invite')?.done ? 'gather' : open('decide') ? 'decide' : open('prepare') ? 'prepare' : 'final';
  }
  const si = JSTAGES.findIndex(([k]) => k === stage);
  const live = steps.filter(s => !['done', 'blocked', 'later'].includes(s.status) && JSTAGES.findIndex(([k]) => k === s.stage) <= Math.max(si, 1));
  // the one step to lead with: something you can do yourself, in the earliest stage
  const rank = s => (s.mine ? 0 : s.status === 'ready' && !(s.who || []).length ? 1 : 2) * 10 + JSTAGES.findIndex(([k]) => k === s.stage);
  const focus = [...live].sort((a, b) => rank(a) - rank(b))[0] || null;
  const also = live.filter(s => s !== focus);
  return { stage, si, steps, focus, also, later: steps.filter(s => s.status !== 'done' && s !== focus && !also.includes(s)), done: steps.filter(s => s.status === 'done') };
}

/* ----- the guide card: the plan home's main thing ----- */
function journeyCard() {
  const j = journey(), f = j.focus, fresh = f && S.jLast && S.jLast !== f.k; if (f) S.jLast = f.k;
  const strip = `<div class="card stage-track j-track"><ol class="j-strip" aria-label="Where the plan is">${JSTAGES.map(([k, l], i) => `<li class="${i < j.si ? 'j-done' : i === j.si ? 'j-cur' : ''}"><i></i><span>${l}</span></li>`).join('')}</ol></div>`;
  const head = f ? `<div class="j-focus ${f.mine ? 'mine' : ''} ${fresh ? 'fresh' : ''}" data-key="jf-${f.k}">
      <span class="j-eyebrow">${esc(JSTAGE_LABEL[f.stage])}${f.mine ? ' · Your move' : ''}</span>
      <h2>${esc(f.goal)}</h2>
      ${f.why ? `<p class="j-why">${esc(f.why)}</p>` : ''}
      <div class="j-do"><span class="label">Here’s what to do</span><b>${esc(f.todo)}</b></div>
      ${f.who && f.who.filter(x => x.id !== S.uid).length ? `<div class="avs">${f.who.filter(x => x.id !== S.uid).slice(0, 8).map(x => `<span class="av-sm" title="${esc(x.nick || 'Someone')}" style="background:${colorFor(x.id)}">${esc((x.nick || '?')[0].toUpperCase())}</span>`).join('')}</div>` : ''}
      <div class="j-acts">${f.act()}${f.help && !f.live ? `<button class="linkbtn small j-help" data-jgo="${f.k}">Help me finish this step</button>` : ''}</div>
      ${f.after ? `<p class="j-after"><span class="label">After this</span> ${esc(f.after)}</p>` : ''}
    </div>`
    : `<div class="j-focus done"><span class="j-eyebrow">${esc(JSTAGE_LABEL[j.stage])}</span><h2>${j.stage === 'after' ? 'All wrapped up' : 'You’re all set'}</h2><p class="j-why">${(() => { const c = countdown(); return c && j.stage !== 'after' ? `${c.text} to go. Nothing needs doing right now.` : 'Nothing needs doing right now.'; })()}</p></div>`;
  const row = (s, later) => `<div class="j-row s-${s.status}" data-key="j-${s.k}">
      <span class="j-ic" aria-hidden="true">${s.status === 'done' ? '✓' : s.status === 'blocked' ? '🔒' : s.status === 'later' ? '◷' : s.mine ? '●' : '○'}</span>
      <div class="stack" style="gap:2px;min-width:0;flex:1"><b>${esc(s.mine && s.mineText && s.status !== 'done' ? s.mineText : s.title)}</b>
        <span class="small muted">${s.status === 'blocked' ? `Unlocks after: ${esc(s.blocked.join(', ').toLowerCase())}` : s.status === 'later' ? 'Closer to the day' : later && s.status === 'ready' ? `Later, in ${esc(JSTAGE_LABEL[s.stage].toLowerCase())}` : s.status === 'waiting' ? esc(s.group || 'Waiting on the crew') : s.status === 'done' ? 'Done' : esc(s.group || JSTAGE_LABEL[s.stage])}</span></div>
      ${s.status === 'ready' || s.status === 'waiting' ? `<button class="btn sm ${s.mine ? 'primary' : ''}" data-jgo="${s.k}">${s.mine ? 'Do it' : s.status === 'waiting' ? 'See' : 'Open'}</button>` : ''}
    </div>`;
  return `<section class="journey" id="journey">
    ${strip}
    ${head}
    ${j.also.length || j.later.length || j.done.length ? `<div class="card j-lists">` : ''}
    ${j.also.length ? `<div class="j-list"><span class="label">Also open now</span>${j.also.map(s => row(s)).join('')}</div>` : ''}
    ${j.later.length || j.done.length ? `<details class="j-more" ${S.jMore ? 'open' : ''}><summary class="small">${[j.later.length && `${j.later.length} coming up`, j.done.length && `${j.done.length} done`].filter(Boolean).join(' · ')}</summary>
      <div class="j-list">${j.later.map(s => row(s, true)).join('')}${j.done.map(s => row(s)).join('')}</div></details>` : ''}
    ${j.also.length || j.later.length || j.done.length ? '</div>' : ''}
    ${isHonoree() ? `<p class="small muted">Some of this ${planWord()} is a surprise for you. You’ll see those parts when they’re revealed.</p>` : ''}
  </section>`;
}
// open the workspace for a step and light up the exact control; click it if that's the action
function jGo(k) {
  const s = jSteps().find(x => x.k === k); if (!s || !s.help) return;
  S.tab = s.help.tab; S.secTab[secOf(S.tab).k] = S.tab; S.tabPicked = true; S.jTarget = s.help; render(); window.scrollTo({ top: 0 });
  setTimeout(() => {
    const el = s.help.sel && document.querySelector(s.help.sel); if (!el) return;
    el.classList.add('beacon'); el.scrollIntoView({ block: 'center', behavior: calm() ? 'auto' : 'smooth' });
    if (s.help.click && !el.disabled) el.click(); else if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.focus({ preventScroll: true });
  }, 140);
}
function jNudge(k) {
  const s = jSteps().find(x => x.k === k); if (!s) return;
  const ms = (s.who || []).filter(m => m.id !== S.uid); if (!ms.length) return;
  sendInvite(`${ms.map(m => m.nick || 'Someone').join(', ')}: can you ${s.ask || 'take a look'} for ${S.trip.name}? It’s what the plan is waiting on.`, inviteLink(), S.trip.name);
}
// the slim version shown at the top of other tabs
function journeyPill() {
  if (S.demo || S.tab === 'overview' || isLive()) return '';
  const f = journey().focus; if (!f) return '';
  const here = f.help && f.help.tab === S.tab;
  return `<div class="j-pill ${f.mine ? 'mine' : ''}"><span class="small"><span class="np-k">${f.mine ? 'Your move' : 'Next'}</span> ${esc(f.mine && f.mineText ? f.mineText : f.title)}</span>
    ${here ? '' : `<button class="btn sm ${f.mine ? 'primary' : ''}" data-jgo="${f.k}">Go</button>`}</div>`;
}
