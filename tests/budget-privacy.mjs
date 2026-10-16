// Run with the app running (npm run dev): npm run test:server
// Budget privacy: raw budgets stay with their owner; fit comes back as counts.
const BASE = process.env.BASE || 'http://localhost:3000';
const db = (u, op, path, data) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const fit = (u, tid, checks) => fetch(BASE + '/api/budget', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u }, body: JSON.stringify({ tid, checks }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_ali' + r, B = 'u_bob' + r, C = 'u_cara' + r, X = 'u_stranger' + r, T = 'budtrip' + r;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
await db(A, 'set', 'trips/' + T, { name: 'Budget test', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true, [C]: true } });
await db(A, 'set', `trips/${T}/members/${A}`, { nick: 'Ali', status: 'in', budget: 900 });
await db(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bob', status: 'in', budget: 300, hard: { budget: true, days: true } });
await db(C, 'set', `trips/${T}/members/${C}`, { nick: 'Cara', status: 'in', budget: 600, budgetPublic: true });
const list = (await db(A, 'list', `trips/${T}/members`)).docs, byId = Object.fromEntries(list.map(d => [d.id, d.data]));
check('you still get your own budget', byId[A].budget === 900);
check('other members’ budgets are not sent (list)', !('budget' in byId[B]) && !('budget' in byId[C]));
check('…only whether one is set', byId[B].budgetSet === true && byId[C].budgetSet === true);
check('…and not whether it’s a hard limit', byId[B].hard && !('budget' in byId[B].hard) && byId[B].hard.days === true);
check('other members’ budgets are not sent (single read)', !('budget' in ((await db(A, 'get', `trips/${T}/members/${B}`)).data || {})));
check('no raw budget anywhere in what Ali receives', !JSON.stringify(list).includes('300') && !JSON.stringify(list).includes('600'));
check('someone outside the plan can’t ask about budgets', (await fit(X, T, [{ lo: 400, hi: 500 }])).status === 403);
const stranger = (await db(X, 'get', `trips/${T}/members/${B}`)).data || {};
check('someone outside the plan sees name and status only', stranger.nick === 'Bob' && !('budget' in stranger) && !('budgetSet' in stranger));
const res = await fit(A, T, [{ lo: 400, hi: 500 }, { lo: 400, hi: 400, key: 'p:x' }]), f = res.results[0];
check('fit comes back as counts', f.n === 3 && f.fits.count === 2 && f.over.count === 1 && f.stretch.count === 0);
check('only you and people who chose it are named', JSON.stringify(f.fits.ids.sort()) === JSON.stringify([A, C].sort()) && f.over.ids.length === 0);
check('the answer contains no budget amounts', !JSON.stringify(res.results).match(/\b(300|600|900)\b/));
check('no exact lowest budget is returned, only a band', !('cap' in res) && res.band.lo <= 300 && res.band.hi > 300 && res.band.hi - res.band.lo >= 50 && !JSON.stringify(res).match(/"cap"/), JSON.stringify(res.band));
const bob = (await fit(B, T, [{ lo: 400, hi: 500 }])).results[0];
check('Bob is named to himself', bob.over.ids.includes(B));
check('hard limit: counted, not named to others', res.results[1].hard.count === 1 && res.results[1].hard.ids.length === 0 && res.results[1].hardOpen.count === 1);
await db(B, 'update', 'trips/' + T, { consent: { 'p:x': { [B]: true } } });
check('after Bob agrees, it no longer blocks', (await fit(A, T, [{ lo: 400, hi: 400, key: 'p:x' }])).results[0].hardOpen.count === 0);
check('“what if Bob drops out” leaves him out of the count', (await fit(A, T, [{ lo: 400, hi: 500, exclude: [B] }])).results[0].over.count === 0);
check('“what if my budget changes” only changes your own', (await fit(A, T, [{ lo: 400, hi: 500, myBudget: 350 }])).results[0].over.count === 2);
check('you can’t use “my budget” to change someone else’s', (await fit(A, T, [{ lo: 400, hi: 500, myBudget: 0 }])).results[0].over.count === 1);
// probing: prices that aren't real plan options are snapped to a grid, so nearby prices give the same answer
const near = (await fit(A, T, [{ lo: 285, hi: 285 }, { lo: 315, hi: 315 }])).results;
check('nearby made-up prices can’t tell 285 from 315', JSON.stringify(near[0]) === JSON.stringify(near[1]));
// a pitch check uses the pitch's real price from the plan, not what the browser sends
await db(A, 'update', 'trips/' + T, { pitches: { at: 1, items: [{ id: 'p1', city: 'Lisbon', perPerson: '€500–650' }] } });
const pr = (await fit(A, T, [{ pitch: 'p1', lo: 1, hi: 1 }])).results[0];
check('pitch checks use the plan’s price, not the browser’s', pr.over.count === 1 && pr.fits.count === 1, `over ${pr.over.count}, fits ${pr.fits.count}`);
// input validation
const bad = async c => (await fit(A, T, c)).status;
check('rejects negative or non-numeric prices', await bad([{ lo: -5 }]) === 400 && await bad([{ lo: 'x' }]) === 400);
check('rejects leaving out more than one person', await bad([{ lo: 100, exclude: [B, C] }]) === 400);
check('rejects oversized requests', await bad(Array.from({ length: 25 }, () => ({ lo: 100 }))) === 400);
check('rejects malformed option keys', await bad([{ lo: 100, key: '../x' }]) === 400);
// rate limit: a member trying lots of different prices is cut off
let limited = 0, asked = 0;
for (let i = 0; i < 12 && !limited; i++) {
  const r = await fit(C, T, Array.from({ length: 10 }, (_, j) => ({ lo: Math.round(100 * 1.07 ** (i * 10 + j)), hi: Math.round(100 * 1.07 ** (i * 10 + j)) })));
  if (r.status === 429) limited = 1; else asked += 10;
}
check('probing many different prices gets rate limited', !!limited, `cut off after ${asked} prices`);
check('…the limit is per person', (await fit(A, T, [{ lo: 400, hi: 500 }])).status === 200);
await db(A, 'delete', 'trips/' + T);
console.log(fails ? `${fails} FAILED` : 'budget privacy checks passed'); process.exit(fails ? 1 : 0);
