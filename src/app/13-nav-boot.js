/* ---------- navigation ---------- */
function stop() { S.unsub.forEach(u => { try { u(); } catch {} }); S.unsub = []; }
function setHash(h) { try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch {} }
function resetTrip() {
  S.trip = null; S.members = []; S.membersIn = false; S.setup = null; S.expenses = []; S.packing = []; S.readOnly = false;
  S.cardUrl = null; S.cardBlob = null; S.copyText = ''; S.split = null; S.confirm = null; S.tkFile = null; S.feed = []; S.bucket = []; S.photos = []; S.pot = []; S.mySpend = []; S.lostOpen = false; S.pinSel = null; S.hangPlan = null; S.wrapI = 0; S.img = null; S.show = null; clearInterval(showTimer);
  for (const k of Object.keys(DRAFT)) delete DRAFT[k];
}
function goHome() { stop(); if (S.meDirty) flushMe(); S.tid = null; S.creating = null; S.crewView = null; subscribeSongs(null); S.demo = false; resetTrip(); setHash(''); render(); }

function openTrip(id, tab) {
  if (!S.db) { flash(IN_CLAUDE ? 'Open this page in Claude to load trips.' : 'Can’t reach the local server. Is npm run dev still running?'); return; }
  stop(); S.demo = false; S.crewView = null; S.tid = id; S.tab = tab || 'overview'; S.tabPicked = !!tab; S.secTab = {}; resetTrip(); setHash(id);
  app.innerHTML = `${topBar()}<p class="muted">Loading trip…</p>`;
  S.unsub.push(S.db.doc('trips/' + id).onSnapshot(snap => {
    if (!snap.exists) { flash('That trip doesn’t exist anymore.'); goHome(); return; }
    const first = !S.trip; S.trip = { ...snap.data() }; subscribeSongs(S.trip.crewId ? `crews/${S.trip.crewId}/songs` : `trips/${id}/songs`); if (first && !S.tabPicked && isLive()) S.tab = 'live'; render();
  }, () => flash('Lost the connection to this trip. Reload to reconnect.')));
  S.unsub.push(S.db.collection(`trips/${id}/members`).onSnapshot(snap => {
    const local = meDoc();
    S.members = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.membersIn = true;
    if (S.meDirty && local) { const i = S.members.findIndex(m => m.id === S.uid); i >= 0 ? S.members[i] = local : S.members.push(local); }
    S.members.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    if (S.trip) render();
  }, () => {}));
  S.unsub.push(S.db.collection(`trips/${id}/feed`).orderBy('at', 'desc').limit(150).onSnapshot(snap => {
    S.feed = snap.docs.map(d => ({ id: d.id, ...d.data() })); if (S.trip) render();
  }, () => {}));
  if (S.realId) S.unsub.push(S.db.doc(`data/users/${S.realId}/spend-${id}`).onSnapshot(snap => { S.mySpend = snap.exists ? (snap.data().items || []) : (() => { try { return JSON.parse(localStorage.getItem('oh_spend_' + id) || '[]'); } catch { return []; } })(); if (S.trip) render(); }, () => {}));
  for (const coll of ['expenses', 'packing', 'bucket', 'photos', 'pot']) {
    S.unsub.push(S.db.collection(`trips/${id}/${coll}`).orderBy('at').limit(500).onSnapshot(snap => {
      S[coll] = snap.docs.map(d => ({ id: d.id, ...d.data() })); if (S.trip) render();
    }, () => {}));
  }
}

function openDemo() {
  stop(); resetTrip(); S.crewView = null; subscribeSongs(null); S.demo = true; S.tid = 'demo'; S.tab = 'overview'; S.secTab = {}; S.tabPicked = true; S.creating = null; setHash('');
  S.uid = S.uid || 'you';
  const start = add(TODAY, -1), end = add(TODAY, 2), y = start, t0 = Date.now(), H = 36e5;
  const at = (day, hm) => new Date(day + 'T' + hm + ':00').getTime();
  const tripDays = span(start, end);
  S.trip = { name: 'Miami, finally (demo)', mode: 'friends', winStart: add(TODAY, -10), winEnd: add(TODAY, 30), nights: 3, vibes: [], lockedDates: { start, end }, lockedDest: 'mia', createdBy: S.uid,
    destinations: [{ id: 'mia', city: 'Miami', code: 'MIA' }, { id: 'las', city: 'Las Vegas', code: 'LAS' }, { id: 'bna', city: 'Nashville', code: 'BNA' }], itinerary: [] };
  S.members = [
    { id: S.uid, nick: S.myName || 'You', home: 'JFK', budget: 1100, status: 'in', days: tripDays, votes: ['mia'], venmo: 'you-demo' },
    { id: 'd1', nick: 'Jay', home: 'JFK', budget: 900, status: 'in', days: tripDays, votes: ['mia', 'las'], venmo: 'jay-demo' },
    { id: 'd2', nick: 'Marisol', home: 'ORD', budget: 1200, status: 'in', days: tripDays, votes: ['mia'], cashapp: 'marisol-demo' },
    { id: 'd3', nick: 'Dev', home: 'LAX', budget: 750, status: 'in', days: tripDays, votes: ['las'] },
    { id: 'd4', nick: 'Tasha', home: 'ATL', budget: 1000, status: 'in', days: tripDays, votes: ['mia'] },
    { id: 'd5', nick: 'Ken', home: 'ORD', budget: 800, status: 'in', days: tripDays, votes: ['mia'] },
  ];
  const Q = (night, music, late, spend, day) => ({ night, music, late, spend, day });
  const [m0, m1, m2, m3, m4, m5] = S.members;
  m1.quiz = Q('Big club', 'Hip-hop', 'At sunrise', 'Middle', 'Pool or beach');
  m2.quiz = Q('Rooftop cocktails', 'Latin', '2–3am', 'Ballin’', 'Exploring & eating');
  m3.quiz = Q('Big club', 'EDM', '2–3am', 'Saver', 'Sleeping it off');
  m4.quiz = Q('Big club', 'Hip-hop', 'At sunrise', 'Middle', 'Pool or beach');
  S.trip.tickets = Object.fromEntries(S.members.map((m, k) => [m.id, { flight: ['B6 1123', 'B6 1123', 'AA 1450', 'AS 512', 'DL 2210', 'AA 1450'][k], at: k + 1 }]));
  m0.arrive = y + 'T15:40'; m0.arrAirport = 'MIA'; m0.flight = 'B6 1123';
  m1.arrive = y + 'T15:40'; m1.arrAirport = 'MIA'; m1.flight = 'B6 1123';
  m2.arrive = y + 'T16:15'; m2.arrAirport = 'MIA'; m2.flight = 'AA 1450';
  m5.arrive = y + 'T16:15'; m5.arrAirport = 'MIA'; m5.flight = 'AA 1450';
  m3.arrive = y + 'T21:30'; m3.arrAirport = 'FLL'; m3.flight = 'AS 512';
  m4.arrive = y + 'T19:05'; m4.arrAirport = 'MIA'; m4.flight = 'DL 2210';
  m1.checkins = [{ text: 'Out out', at: at(y, '23:50') }, { text: 'Still out', at: at(TODAY, '02:40') }, { text: 'At the pool', at: t0 - 1.2 * H }];
  m2.checkins = [{ text: 'Getting food', at: at(TODAY, '01:30') }, { text: 'Getting food', at: t0 - .3 * H }];
  m4.checkins = [{ text: 'Heading back', at: at(TODAY, '03:55') }];
  for (const m of S.members) if (m.checkins) m.checkin = m.checkins[m.checkins.length - 1];
  S.trip.stay = { name: 'Our Airbnb · South Beach', kind: 'rental', area: 'South Beach', sleeps: '3 bedrooms, 6 beds', perNight: '$520–600 per night', perPerson: '$270–300 per person', why: 'Walk to the beach and Collins Ave, room for everyone.', pros: ['Pool', 'Walk to beach'], lat: 25.7840, lng: -80.1310 };
  S.trip.stays = { city: 'Miami', at: t0, items: [
    S.trip.stay,
    { id: 'st2', name: 'Freehand Miami', kind: 'hostel', area: 'Miami Beach', sleeps: '6-bed private room', perNight: '$280–340 per night', perPerson: '$140–170 per person', why: 'Cheapest good option with a legendary bar downstairs.', pros: ['Great bar', 'Cheap'], lat: 25.8016, lng: -80.1281 },
    { id: 'st3', name: 'The Plymouth South Beach', kind: 'hotel', area: 'South Beach', sleeps: '3 rooms, 2 queens each', perNight: '$690–820 per night', perPerson: '$345–410 per person', why: 'Boutique hotel with a pool scene, a short walk to the beach.', pros: ['Pool', 'Quiet'], lat: 25.7946, lng: -80.1296 },
  ] };
  S.trip.stay.id = 'st1';
  S.trip.spots = { city: 'Miami', at: t0, items: [
    { name: 'LIV', type: 'club', area: 'Mid-Beach', why: 'The big-name club night your quiz said you wanted.', price: '$$$$', cover: '$60–100', bestNight: 'Sat', dress: 'Dress to impress', tip: 'Book a table early if you want to skip the line.', lat: 25.8172, lng: -80.1223 },
    { name: 'Sweet Liberty', type: 'bar', area: 'South Beach', why: 'Award-winning cocktails, lively, easy for a group.', price: '$$', cover: 'Free', bestNight: 'Fri', dress: 'Casual', tip: 'Happy hour runs till 7.', lat: 25.7949, lng: -80.1287 },
    { name: 'Wynwood Walls', type: 'activity', area: 'Wynwood', why: 'Street art, photo heaven, great tacos nearby.', price: '$', cover: '$12 entry', bestNight: 'Day', dress: 'Anything', tip: 'Go late afternoon for good light.', lat: 25.8010, lng: -80.1994 },
    { name: 'E11EVEN', type: 'club', area: 'Downtown', why: 'Open 24 hours. For the sunrise club crew.', price: '$$$$', cover: '$50–80', bestNight: 'Sat', dress: 'Upscale', tip: 'Best after 2am.', lat: 25.7853, lng: -80.1931 },
    { name: 'La Sandwicherie', type: 'late-night food', area: 'South Beach', why: 'The 3am sandwich everyone talks about.', price: '$', cover: 'Free', bestNight: 'Any', dress: 'Anything', tip: 'Cash moves faster.', lat: 25.7818, lng: -80.1318 },
  ] };
  S.trip.reactions = { [rkey('spLIV')]: { d1: 1, d4: 1, d3: 1 }, [rkey('spSweet Liberty')]: { d2: 1, d5: 1 }, [rkey('stOur Airbnb · South Beach')]: { d1: 1, d2: 1, d4: 1 } };
  S.trip.itinerary = [
    { id: 'i1', date: y, time: '16:00', title: 'Land + check in', kind: 'travel', note: '' },
    { id: 'i2', date: y, time: '20:30', title: 'Dinner in Wynwood', kind: 'food', note: '' },
    { id: 'i3', date: y, time: '23:00', title: 'Sweet Liberty', kind: 'nightlife', note: '' },
    { id: 'i4', date: TODAY, time: '11:30', title: 'Brunch + recovery', kind: 'food', note: '' },
    { id: 'i5', date: TODAY, time: '14:00', title: 'Pool day', kind: 'chill', note: '' },
    { id: 'i6', date: TODAY, time: '17:00', title: 'Wynwood Walls', kind: 'activity', note: '' },
    { id: 'i7', date: TODAY, time: '23:30', title: 'LIV', kind: 'nightlife', note: 'Table booked under Jay' },
    { id: 'i8', date: TODAY, time: '03:00', title: 'La Sandwicherie', kind: 'food', note: '' },
  ];
  S.trip.geo = { [rkey('Wynwood Walls')]: { name: 'Wynwood Walls', lat: 25.8010, lng: -80.1994, kind: 'activity' } };
  S.trip.meet = { text: 'Our Airbnb · South Beach', time: '22:45', by: m2.id, at: t0 - .6 * H };
  S.trip.hangover = { [TODAY]: { d1: 4, d2: 2, d4: 5, d3: 3 } };
  S.trip.recaps = { [y]: { title: 'Day one', text: 'Everyone landed by noon. Tacos in Wynwood, a nap nobody admits to, then Sweet Liberty until close. Jay checked in “Still out” at 2:40am. Tasha called it at 4 and logged a 5 on the hangover index. There’s a receipt for 14 espresso martinis and no one is claiming it.', at: t0 - 3 * H } };
  S.trip.pitches = { at: t0, items: [{ id: 'pa', city: 'Miami', code: 'MIA', start, end, tagline: 'Rooftops, Latin nights, beach recovery', why: 'Your crew splits between big clubs and rooftop cocktails, and Miami does both on the same street.', perPerson: '$780–950 all-in', vibeMatch: 91, highlights: ['LIV on Saturday', 'Wynwood walls and tacos', 'Pool day to recover'], weather: '79°F, sunny' }] };
  S.trip.swipes = { pa: Object.fromEntries(S.members.map(m => [m.id, 1])) };
  S.expenses = [
    { id: 'e1', title: 'Airbnb (3 nights)', amount: 1680, paidBy: m2.id, split: S.members.map(m => m.id), at: t0 - 50 * H },
    { id: 'e2', title: 'Dinner in Wynwood', amount: 342, paidBy: m1.id, split: S.members.map(m => m.id), at: at(y, '22:10') },
    { id: 'e3', title: 'LIV table deposit', amount: 600, paidBy: m1.id, split: [m0.id, m1.id, m3.id, m4.id], at: t0 - 2 * H },
  ];
  S.pot = [
    { id: 'p1', kind: 'in', by: m1.id, amount: 60, at: t0 - 30 * H }, { id: 'p2', kind: 'in', by: m2.id, amount: 60, at: t0 - 30 * H }, { id: 'p3', kind: 'in', by: m4.id, amount: 60, at: t0 - 29 * H },
    { id: 'p4', kind: 'in', by: S.uid, amount: 40, at: t0 - 28 * H }, { id: 'p5', kind: 'in', by: m5.id, amount: 60, at: t0 - 28 * H },
    { id: 'p6', kind: 'out', by: m2.id, amount: 38, note: 'Uber XL to Wynwood', at: at(y, '20:05') }, { id: 'p7', kind: 'out', by: m1.id, amount: 132, note: 'Groceries + drinks', at: at(y, '17:30') },
    { id: 'p8', kind: 'out', by: m4.id, amount: 64, note: 'Beach chairs + umbrella', at: t0 - 1.5 * H },
  ];
  S.trip.potKeeper = m2.id;
  S.mySpend = [{ id: 'ms1', note: 'My flight JFK → MIA', amount: 248 }];
  S.packing = [
    { id: 'pk1', text: 'Bluetooth speaker', kind: 'group', claimedBy: m1.id, at: 1 }, { id: 'pk2', text: 'Phone chargers & power strip', kind: 'group', claimedBy: null, at: 2 },
    { id: 'pk3', text: 'Hangover kit (electrolytes, Advil)', kind: 'group', claimedBy: m4.id, at: 3 }, { id: 'pk4', text: 'Going-out outfit for each night', kind: 'personal', at: 4 },
    { id: 'pk5', text: 'Swimsuit', kind: 'personal', at: 5 }, { id: 'pk6', text: 'ID (clubs will check)', kind: 'personal', at: 6 },
  ];
  S.feed = [
    { id: 'f1', by: m1.id, text: 'LET’S GOOO', at: t0 - 40 * H },
    { id: 'f2', by: m2.id, text: 'Airbnb has a pool. I repeat, the Airbnb has a pool.', at: t0 - 26 * H },
    { id: 'f3', by: 'ai', kind: 'recap', text: `${S.trip.recaps[y].title}. ${S.trip.recaps[y].text}`, at: t0 - 3 * H },
    { id: 'f4', by: m4.id, text: 'Who has the Advil', at: t0 - 2.5 * H },
  ];
  S.bucket = [
    { id: 'b1', text: 'Watch the sunrise on the beach', points: 2, doneBy: [m1.id], doneAt: { d1: at(TODAY, '06:40') }, at: 1 },
    { id: 'b2', text: 'Talk our way into VIP', points: 3, doneBy: [], at: 2 },
    { id: 'b3', text: 'Order the 3am sandwich', points: 1, doneBy: [m1.id, m2.id, m4.id], at: 3 },
  ];
  S.songs = [
    { id: 'sg1', title: 'Dancing Queen', artist: 'ABBA', by: m2.id, at: 1, votes: { d2: 1, d4: 1, d1: 1, [S.uid]: 1 } },
    { id: 'sg2', title: 'Tití Me Preguntó', artist: 'Bad Bunny', by: m1.id, at: 2, votes: { d1: 1, d2: 1, d3: 1 } },
    { id: 'sg3', title: 'Mr. Brightside', artist: 'The Killers', by: S.uid, at: 3, votes: { [S.uid]: 1, d5: 1 } },
    { id: 'sg4', title: 'Espresso', artist: 'Sabrina Carpenter', by: m4.id, at: 4, votes: { d4: 1 } },
  ];
  S.trip.songVotes = { d1: 'sg2', d2: 'sg1', d4: 'sg1', d3: 'sg2', d5: 'sg1' };
  S.trip.superVotes = { s0: { d1: 'd2', d4: 'd2', d3: 'd2' }, s1: { d2: 'd3' }, s2: { d2: 'd1', d4: 'd1' }, s5: { d2: 'd1', d3: 'd1' } };
  render(); window.scrollTo({ top: 0 });
}

/* ---------- boot ---------- */
render();
(async () => {
  const c = window.claude;
  if (!c || !c.use) { S.loading = false; render(); return; } // no runtime: demo only
  const [db, user, sample, downloads, assets] = await Promise.all([c.use('db'), c.use('user'), c.use('sample'), c.use('downloads'), c.use('assets')].map(p => Promise.resolve(p).catch(() => null)));
  S.db = db; S.user = user; S.sample = sample; S.downloads = downloads; S.assets = assets;
  try { S.isOwner = user ? await user.isOwner() : false; } catch {}
  let id = null;
  try { id = user ? await user.id() : null; } catch {}
  try { const me = user ? await user.me() : null; S.myName = (me && me.name || '').split(' ')[0]; } catch {}
  if (!id) { try { id = localStorage.getItem('oh_uid'); if (!id) { id = 'g' + rid(12); localStorage.setItem('oh_uid', id); } } catch { id = 'g' + rid(12); } }
  S.realId = id && (IN_CLAUDE ? !String(id).startsWith('g') : /^u_/.test(String(id))) ? id : null;
  S.uid = segSafe(id);
  S.loading = false;
  if (db) {
    db.collection('trips').orderBy('createdAt', 'desc').limit(50).onSnapshot(snap => {
      S.trips = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.tripsLoaded = true; if (!S.tid) render();
    }, () => { S.tripsLoaded = true; if (!S.tid) render(); });
    db.collection('crews').orderBy('at', 'desc').limit(50).onSnapshot(snap => {
      S.crews = snap.docs.map(d => ({ id: d.id, ...d.data() })); if (!S.tid) render();
    }, () => {});
    const h = (location.hash || '').slice(1);
    const cm = h.match(/^c-([a-z0-9]{6,20})$/); if (cm) { joinCrew(cm[1]); return; }
    if (/^[a-z0-9]{6,20}$/.test(h)) { let tab; try { tab = sessionStorage.getItem('outta_tab_' + h) || undefined; } catch {} openTrip(h, tab); return; }
  }
  if (!S.tid) render(); else if (S.demo) render();
})();
})();
