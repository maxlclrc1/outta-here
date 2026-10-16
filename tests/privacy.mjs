// Run with the app running (npm run dev): npm run test:server
// Private parts of a plan are removed by the server, not just hidden by the app.
const BASE = process.env.BASE || 'http://localhost:3000';
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
// collect the paths one person's live-update stream announces while `during` runs
async function heard(u, during) {
  const ac = new AbortController(), res = await fetch(BASE + '/api/db/stream?u=' + u, { signal: ac.signal }), rd = res.body.getReader(), dec = new TextDecoder();
  let text = ''; const pump = (async () => { try { for (;;) { const { value, done } = await rd.read(); if (done) break; text += dec.decode(value); } } catch {} })();
  await new Promise(r => setTimeout(r, 300)); await during(); await new Promise(r => setTimeout(r, 700)); ac.abort(); await pump;
  return text;
}
const r = Math.random().toString(36).slice(2, 8), A = 'u_org' + r, B = 'u_bea' + r, C = 'u_guest' + r, D = 'u_dan' + r, T = 'privtrip' + r;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const now = Date.now();
await db(A, 'set', 'trips/' + T, { name: 'Dev turns 30', mode: 'birthday', createdBy: A, createdAt: now, people: { [A]: true, [B]: true, [C]: true, [D]: true }, honoree: C,
  itinerary: [{ id: 'i1', date: '2026-11-21', time: '20:00', title: 'Cake surprise at Lupa', note: 'Bring the banner', kind: 'food', secret: true }, { id: 'i2', date: '2026-11-21', time: '12:00', title: 'Brunch', kind: 'food' }, { id: 'i3', date: '2026-11-22', time: '22:00', title: 'Karaoke', kind: 'nightlife', secret: true, revealed: true }],
  changes: { c1: { text: 'Cake surprise at Lupa moved to Sat 8:00 PM', by: A, at: now, act: '', undo: { k: 'item', item: { id: 'i1', title: 'Cake surprise at Lupa', secret: true } } }, c2: { text: 'Brunch moved to Sat 12:00 PM', by: A, at: now, act: 'all', undo: { k: 'item', item: { id: 'i2', title: 'Brunch' } } } } });
for (const [u, nick] of [[A, 'Ari'], [C, 'Dev'], [D, 'Dan']]) await db(u, 'set', `trips/${T}/members/${u}`, { nick, status: 'in' });
await db(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bea', status: 'in', hideLoc: true, checkin: { text: 'Hotel Arts lobby', at: now }, checkins: [{ text: 'Hotel Arts lobby', at: now }], lost: { where: 'Pier 3', at: now },
  needs: { diet: ['nuts'], dietNote: 'carry an EpiPen', access: ['stepfree'], depart: '09:00', share: { diet: 'org', access: 'anon', travel: 'named' } } });
await db(A, 'set', `trips/${T}/feed/f1`, { by: A, text: 'Dev’s cake is ordered', at: now, secret: true });
await db(D, 'set', `trips/${T}/feed/f2`, { by: D, text: 'Can’t wait', at: now });

// personal needs shared only with organizers
const beaFor = async u => (await db(u, 'get', `trips/${T}/members/${B}`)).data || {};
const dSees = await beaFor(D), aSees = await beaFor(A), bSees = await beaFor(B);
check('a member doesn’t get needs shared only with organizers', !('diet' in dSees.needs) && !('dietNote' in dSees.needs) && !JSON.stringify(dSees).includes('EpiPen'));
check('…but still gets the parts shared with the crew', JSON.stringify(dSees.needs.access) === '["stepfree"]' && dSees.needs.depart === '09:00');
check('the same holds when listing members', !JSON.stringify((await db(D, 'list', `trips/${T}/members`)).docs).includes('EpiPen'));
check('organizers get organizer-only needs', JSON.stringify(aSees.needs.diet) === '["nuts"]' && aSees.needs.dietNote === 'carry an EpiPen');
check('you always get your own', bSees.needs.dietNote === 'carry an EpiPen' && bSees.checkin.text === 'Hotel Arts lobby');

// hidden check-ins
check('a hidden check-in comes without the place', dSees.checkin && !('text' in dSees.checkin) && dSees.checkin.at === now && dSees.checkins.every(c => !('text' in c)));
check('…for organizers too', !JSON.stringify(aSees).includes('Hotel Arts'));
check('an SOS is still shared', dSees.lost?.where === 'Pier 3');

// surprise stops
const guestTrip = (await db(C, 'get', 'trips/' + T)).data, danTrip = (await db(D, 'get', 'trips/' + T)).data;
const g1 = guestTrip.itinerary.find(i => i.id === 'i1');
check('the guest of honor gets a placeholder for a surprise', g1.title === 'Surprise' && g1.time === '20:00' && !g1.note && !JSON.stringify(guestTrip).includes('Cake'));
check('…including when listing plans', !JSON.stringify((await db(C, 'list', 'trips')).docs).includes('Cake'));
check('…and the change log leaves out entries about it', !guestTrip.changes.c1 && !!guestTrip.changes.c2);
check('revealed surprises are shown in full', guestTrip.itinerary.find(i => i.id === 'i3').title === 'Karaoke');
check('everyone else sees the surprise', danTrip.itinerary.find(i => i.id === 'i1').title === 'Cake surprise at Lupa' && !!danTrip.changes.c1);
// the guest of honor saving the itinerary can't wipe or spoil a surprise
await db(C, 'update', 'trips/' + T, { itinerary: [...guestTrip.itinerary.filter(i => i.id !== 'i1'), { id: 'i4', date: '2026-11-22', time: '11:00', title: 'Brunch again', kind: 'food' }] });
const after = (await db(A, 'get', 'trips/' + T)).data.itinerary;
check('the guest of honor’s save keeps the real surprise', after.find(i => i.id === 'i1')?.title === 'Cake surprise at Lupa' && after.some(i => i.id === 'i4'));
await db(C, 'update', 'trips/' + T, { itinerary: (await db(C, 'get', 'trips/' + T)).data.itinerary });
check('…even when they send back the placeholder', (await db(A, 'get', 'trips/' + T)).data.itinerary.find(i => i.id === 'i1')?.note === 'Bring the banner');

// planners-only chat
const gFeed = (await db(C, 'list', `trips/${T}/feed`)).docs;
check('the guest of honor doesn’t get planners-only posts', gFeed.length === 1 && gFeed[0].id === 'f2' && !(await db(C, 'get', `trips/${T}/feed/f1`)).exists);
check('everyone else does', (await db(D, 'list', `trips/${T}/feed`)).docs.length === 2);
const path = `trips/${T}/feed/f3`, post = () => db(A, 'set', path, { by: A, text: 'Balloons sorted', at: Date.now(), secret: true });
const [gHeard, dHeard] = await Promise.all([heard(C, async () => { await new Promise(r => setTimeout(r, 100)); }), heard(D, post)]);
check('live updates don’t announce a planners-only post to the guest of honor', !gHeard.includes(path));
check('…but do to the planners', dHeard.includes(path));

await db(A, 'delete', 'trips/' + T);
console.log(fails ? `${fails} FAILED` : 'privacy checks passed'); process.exit(fails ? 1 : 0);
