// Part of npm test / npm run test:server (runs against a throwaway server, with
// OUTTA_IDENTITY_STRICT=1). To run alone: BASE=http://localhost:3000 node <this file>
// Identity audit: the 14 ways someone could act as another person by sending their id (found by
// the identity audit). Each is now tried with the victim's id and either no cookie or the
// attacker's own cookie; they must all be refused. With OUTTA_IDENTITY_STRICT=1 any that works
// fails the suite (without it, it prints a "gap" line). Also checks the original 10 protections.
// People here claim their ids directly (not through tests/_identity.mjs), so it's explicit who
// holds which cookie.
const BASE = process.env.BASE || 'http://localhost:3000', STRICT = !!process.env.OUTTA_IDENTITY_STRICT;
const jar = {};
async function claim(id) {
  const r = await fetch(BASE + '/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  const m = (r.headers.get('set-cookie') || '').match(/^outta_[^=]+=([^;]+)/); if (!r.ok || !m) throw new Error(`couldn’t claim ${id}: ${r.status}`);
  jar[id] = m[1];
}
// `as` sends id `u`; `key` picks whose cookie goes with it: their own (default), none (null), or another id's
const H = (u, key = u) => ({ 'x-outta-user': u, ...(key && jar[key] ? { cookie: `outta_${u}=${jar[key]}` } : {}) });
const call = (u, op, path, data, { invite, key } = {}) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', ...(u ? H(u, key === undefined ? u : key) : {}), ...(invite ? { 'x-outta-invite': invite } : {}) }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_org00' + r, B = 'u_bea00' + r, C = 'u_cam00' + r, X = 'u_outsider' + r, T = 'idt' + r, P = 'trips/' + T;
let fails = 0, gaps = 0, tried = 0;
const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
// an attack path, tried both without a cookie and with the attacker's own; `worked` = it succeeded
const attack = async (l, attempt) => {
  tried++;
  for (const key of [null, X]) { if (await attempt(key)) { gaps++; console.log(`${STRICT ? 'FAIL' : 'gap '} ${l} · worked ${key ? 'with the attacker’s own cookie' : 'with no cookie'}`); if (STRICT) fails++; return; } }
  console.log(`ok   blocked: ${l}`);
};

for (const id of [A, B, C, X]) await claim(id);
// a plan: Ana organizes, Bea and Cam are in it, Cam has a private budget with a hard limit
await call(A, 'set', P, { name: 'Trip', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true, [C]: true }, inviteKey: 'k1', destinations: [{ id: 'd1', city: 'Lisbon' }],
  pitches: { at: 1, items: [{ id: 'p1', city: 'Lisbon', start: '2026-11-12', end: '2026-11-15', perPerson: '$900' }] } });
await call(A, 'set', `${P}/members/${A}`, { nick: 'Ana', status: 'in', budget: 2000 });
await call(B, 'set', `${P}/members/${B}`, { nick: 'Bea', status: 'in', budget: 1500 }, { invite: 'k1' });
await call(C, 'set', `${P}/members/${C}`, { nick: 'Cam', status: 'in', budget: 400, hard: { budget: true }, needs: { diet: ['nuts'], dietNote: 'EpiPen' } }, { invite: 'k1' });
await call(C, 'set', `data/users/${C}/spend-${T}`, { items: [{ title: 'Private thing', amount: 80 }] });
await call(A, 'update', P, { inviteKey: 'k2' }); // Ana resets the invite link: the old one (k1) should stop working
check('setup: everyone saved their own records', (await call(C, 'get', `${P}/members/${C}`)).data?.budget === 400);

// —— the original 10 protections ——
check('an outsider’s plan list doesn’t include the plan', !(await call(X, 'list', 'trips')).docs.some(d => d.id === T));
{ const m = (await call(X, 'get', `${P}/members/${C}`)).data || {}; check('an outsider with the link sees only names and RSVP', m.nick === 'Cam' && !('budget' in m) && !('needs' in m)); }
{ const m = (await call(B, 'get', `${P}/members/${C}`)).data || {}; check('a member doesn’t see another member’s budget amount', !('budget' in m) && m.budgetSet === true); }
check('a member can’t read another member’s private spend list', !(await call(B, 'get', `data/users/${C}/spend-${T}`)).exists);
check('a member can’t make themselves organizer', (await call(B, 'update', P, { orgs: { [B]: true } })).status === 403);
check('a member can’t vote for someone else', (await call(B, 'update', P, { swipes: { p1: { [C]: 1 } } })).status === 403);
check('a member can’t agree to a hard limit for someone else', (await call(B, 'update', P, { consent: { 'p:p1': { [C]: true } } })).status === 403);
check('a member can’t delete the plan', (await fetch(BASE + '/api/plans/' + T, { method: 'DELETE', headers: H(B) })).status === 403);
check('the old invite link can’t be used to join', (await call(X, 'set', `${P}/members/${X}`, { nick: 'Xan' }, { invite: 'k1' })).status === 403);
check('a request with no id can’t write the plan', (await call('', 'update', P, { name: 'x' })).status === 401);

// —— ids are still visible (that alone no longer lets anyone act as them) ——
const seen = (await call(X, 'get', P)).data || {}, ids = (await call(X, 'list', `${P}/members`)).docs?.map(d => d.id) || [];
console.log(`note ids are still visible to a link holder (organizer ${seen.createdBy === A ? 'yes' : 'no'}, ${ids.length} member ids); every path below uses them`);
check('someone with the link (not joined) doesn’t get the invite key, only whether their link works', !('inviteKey' in seen) && seen.inviteOk === false);
const ORG = seen.createdBy;

// —— the 14 attack paths ——
await attack('1. use the organizer’s id read from the plan', async key => (await call(ORG, 'update', P, { name: 'Taken' }, { key })).ok);
await attack('2. use a member’s id read from the member list', async key => (await call(ids.find(i => i === C), 'update', `${P}/members/${C}`, { nick: 'Not Cam' }, { key })).ok);
await attack('3. join after an invite reset with a key read from the plan', async () => (await call(X, 'set', `${P}/members/${X}`, { nick: 'Xan' }, { invite: seen.inviteKey })).ok);
await attack('4. read the organizer’s own budget', async key => (await call(ORG, 'get', `${P}/members/${A}`, undefined, { key })).data?.budget === 2000);
await attack('5. make yourself an organizer', async key => (await call(ORG, 'update', P, { orgs: { [X]: true } }, { key })).ok);
await attack('6. turn invites off / change the invite key', async key => (await call(ORG, 'update', P, { inviteKey: 'mine' }, { key })).ok);
await attack('7. remove a member', async key => (await call(ORG, 'update', `${P}/members/${B}`, { status: 'out', removed: true }, { key })).ok);
await attack('8. read a member’s exact budget, hard limit and private needs (as them)', async key => { const m = (await call(C, 'get', `${P}/members/${C}`, undefined, { key })).data || {}; return m.budget === 400 || m.needs?.dietNote === 'EpiPen'; });
await attack('9. read a member’s private spend list (as them)', async key => !!(await call(C, 'get', `data/users/${C}/spend-${T}`, undefined, { key })).exists);
await attack('10. agree to a hard limit on a member’s behalf', async key => (await call(C, 'update', P, { consent: { 'p:p1': { [C]: true } } }, { key })).ok);
await attack('11. change a member’s days and drop them out', async key => (await call(C, 'update', `${P}/members/${C}`, { days: [], status: 'out' }, { key })).ok);
await attack('12. upload files in a member’s name', async key => { const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'); return (await fetch(BASE + '/api/assets', { method: 'POST', headers: { 'content-type': 'image/png', 'x-outta-plan': T, ...H(C, key) }, body: png })).ok; });
await attack('13. listen to a member’s live updates', async key => {
  const res = await fetch(`${BASE}/api/db/stream?u=${C}`, { headers: key ? { cookie: `outta_${C}=${jar[key]}` } : {} }); if (!res.ok) return false;
  const rd = res.body.getReader(), got = []; setTimeout(() => call(C, 'update', `data/users/${C}/spend-${T}`, { items: [] }), 300);
  const t0 = Date.now(); while (Date.now() - t0 < 1500) { const x = await Promise.race([rd.read(), new Promise(z => setTimeout(() => z({}), 400))]); if (x.value) got.push(new TextDecoder().decode(x.value)); }
  rd.cancel().catch(() => {}); return got.join('').includes(`data/users/${C}/spend-${T}`);
});
await attack('14. delete the plan as the organizer', async key => (await fetch(BASE + '/api/plans/' + T, { method: 'DELETE', headers: H(ORG, key) })).ok);

// …and everything is as its owners left it
{ const t = (await call(A, 'get', P)).data, c = (await call(C, 'get', `${P}/members/${C}`)).data;
  check('after all that, the plan and Cam’s record are untouched', t?.name === 'Trip' && t.inviteKey === 'k2' && !t.orgs?.[X] && !t.consent && c?.nick === 'Cam' && c.status === 'in' && c.budget === 400); }
check('…and the real organizer and member still can act', (await call(A, 'update', P, { name: 'Trip 2' })).ok && (await call(C, 'update', `${P}/members/${C}`, { nick: 'Cam B' })).ok);
console.log(`\n${tried - gaps} of ${tried} attack paths blocked${gaps ? `, ${gaps} still work` : ''}`);
await fetch(BASE + '/api/plans/' + T, { method: 'DELETE', headers: H(A) });
process.exit(fails ? 1 : 0);
