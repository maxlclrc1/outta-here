// Part of npm test / npm run test:server (runs against a throwaway server).
// Identity audit. The server knows people only by the id their browser sends (x-outta-user, or
// ?u= on the live-update stream) and can't tell whether the caller really owns it.
// Two kinds of lines:
//   ok / FAIL  protections that hold today and must keep holding
//   gap        a confirmed way to act as someone else (known, not yet fixed). These print
//              without failing the suite; with OUTTA_IDENTITY_STRICT=1 they fail, so the fix
//              can flip them into real tests.
const BASE = process.env.BASE || 'http://localhost:3000', STRICT = !!process.env.OUTTA_IDENTITY_STRICT;
const call = (u, op, path, data, invite) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', ...(u ? { 'x-outta-user': u } : {}), ...(invite ? { 'x-outta-invite': invite } : {}) }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_org00' + r, B = 'u_bea00' + r, C = 'u_cam00' + r, X = 'u_outsider' + r, T = 'idt' + r, P = 'trips/' + T;
let fails = 0, gaps = 0;
const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
// `worked` = the attack succeeded
const gap = (l, worked, x = '') => { if (!worked) return console.log(`ok   blocked: ${l}`); gaps++; console.log(`${STRICT ? 'FAIL' : 'gap '} ${l}${x ? ' · ' + x : ''}`); if (STRICT) fails++; };

// a plan: Ana organizes, Bea and Cam are in it, Cam has a private budget with a hard limit
await call(A, 'set', P, { name: 'Trip', createdBy: A, createdAt: Date.now(), people: { [A]: true, [B]: true, [C]: true }, inviteKey: 'k1', destinations: [{ id: 'd1', city: 'Lisbon' }],
  pitches: { at: 1, items: [{ id: 'p1', city: 'Lisbon', start: '2026-11-12', end: '2026-11-15', perPerson: '$900' }] } });
await call(A, 'set', `${P}/members/${A}`, { nick: 'Ana', status: 'in', budget: 2000 });
await call(B, 'set', `${P}/members/${B}`, { nick: 'Bea', status: 'in', budget: 1500 }, 'k1');
await call(C, 'set', `${P}/members/${C}`, { nick: 'Cam', status: 'in', budget: 400, hard: { budget: true }, needs: { diet: ['nuts'], dietNote: 'EpiPen' } }, 'k1');
await call(C, 'set', `data/users/${C}/spend-${T}`, { items: [{ title: 'Private thing', amount: 80 }] });
await call(A, 'update', P, { inviteKey: 'k2' }); // Ana resets the invite link: the old one (k1) should stop working

// —— protections that hold for anyone who doesn't use someone else's id ——
check('an outsider’s plan list doesn’t include the plan', !(await call(X, 'list', 'trips')).docs.some(d => d.id === T));
{ const m = (await call(X, 'get', `${P}/members/${C}`)).data || {}; check('an outsider with the link sees only names and RSVP', m.nick === 'Cam' && !('budget' in m) && !('needs' in m)); }
{ const m = (await call(B, 'get', `${P}/members/${C}`)).data || {}; check('a member doesn’t see another member’s budget amount', !('budget' in m) && m.budgetSet === true); }
check('a member can’t read another member’s private spend list', !(await call(B, 'get', `data/users/${C}/spend-${T}`)).exists);
check('a member can’t make themselves organizer', (await call(B, 'update', P, { orgs: { [B]: true } })).status === 403);
check('a member can’t vote for someone else', (await call(B, 'update', P, { swipes: { p1: { [C]: 1 } } })).status === 403);
check('a member can’t agree to a hard limit for someone else', (await call(B, 'update', P, { consent: { 'p:p1': { [C]: true } } })).status === 403);
check('a member can’t delete the plan', (await fetch(BASE + '/api/plans/' + T, { method: 'DELETE', headers: { 'x-outta-user': B } })).status === 403);
check('the old invite link can’t be used to join', (await call(X, 'set', `${P}/members/${X}`, { nick: 'Xan' }, 'k1')).status === 403);
check('a request with no id can’t write the plan', (await call('', 'update', P, { name: 'x' })).status === 403);

// —— how ids get out ——
const seen = (await call(X, 'get', P)).data || {}, ids = (await call(X, 'list', `${P}/members`)).docs?.map(d => d.id) || [];
gap('anyone with the plan’s link (not joined) reads the organizer’s id, everyone’s ids and the current invite key from the plan', seen.createdBy === A && !!seen.people?.[C] && seen.inviteKey === 'k2', `createdBy, people, inviteKey: ${seen.inviteKey}`);
gap('…and every member’s id from the member list', ids.includes(A) && ids.includes(C), ids.length + ' ids');
gap('the invite key read from the plan lets an old-link holder join after the reset', (await call(X, 'set', `${P}/members/${X}`, { nick: 'Xan' }, seen.inviteKey)).ok);

// —— acting as the organizer, using the id read above (no joining needed) ——
const ORG = seen.createdBy;
{ const m = (await call(ORG, 'get', `${P}/members/${A}`)).data || {}; gap('read the organizer’s own budget', m.budget === 2000, 'budget ' + m.budget); }
gap('make yourself an organizer', (await call(ORG, 'update', P, { orgs: { [X]: true } })).ok);
gap('turn invites off / change the invite key', (await call(ORG, 'update', P, { inviteKey: 'mine' })).ok);
gap('remove a member', (await call(ORG, 'update', `${P}/members/${B}`, { status: 'out', removed: true })).ok && (await call(ORG, 'update', P, { people: { [B]: null } })).ok);

// —— acting as another member ——
{ const m = (await call(C, 'get', `${P}/members/${C}`)).data || {}; gap('read a member’s exact budget, hard limit and private needs (as them)', m.budget === 400 && m.needs?.dietNote === 'EpiPen', `budget ${m.budget}`); }
{ const s = await call(C, 'get', `data/users/${C}/spend-${T}`); gap('read a member’s private spend list (as them)', s.exists && s.data.items[0].title === 'Private thing'); }
gap('agree to a hard limit on a member’s behalf, so a lock over their budget goes through', (await call(C, 'update', P, { consent: { 'p:p1': { [C]: true } } })).ok && (await call(A, 'update', P, { lockedDest: 'd1', lockedDates: { start: '2026-11-12', end: '2026-11-15' } })).ok);
gap('change a member’s days and drop them out', (await call(C, 'update', `${P}/members/${C}`, { days: [], status: 'out' })).ok);
{ const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'); const u = await fetch(BASE + '/api/assets', { method: 'POST', headers: { 'content-type': 'image/png', 'x-outta-user': C, 'x-outta-plan': T }, body: png });
  gap('upload files in a member’s name (counting against their quota)', u.status === 200 || u.status === 415, 'status ' + u.status); }
{ const ctl = new AbortController(), got = []; const res = await fetch(`${BASE}/api/db/stream?u=${C}`, { signal: ctl.signal }); const rd = res.body.getReader();
  setTimeout(() => call(C, 'update', `data/users/${C}/spend-${T}`, { items: [] }), 300);
  const t0 = Date.now(); while (Date.now() - t0 < 1500) { const x = await Promise.race([rd.read(), new Promise(z => setTimeout(() => z({}), 400))]); if (x.value) got.push(new TextDecoder().decode(x.value)); }
  ctl.abort(); gap('listen to a member’s live updates (which of their private records change)', got.join('').includes(`data/users/${C}/spend-${T}`)); }
// …and finally delete the whole plan as the organizer
gap('delete the plan', (await fetch(BASE + '/api/plans/' + T, { method: 'DELETE', headers: { 'x-outta-user': ORG } })).status === 200 && !(await call(A, 'get', P)).exists);

console.log(`\n${gaps} known identity gap${gaps === 1 ? '' : 's'} (impersonation is possible until the server can tell who is calling)`);
await call(A, 'delete', P);
process.exit(fails ? 1 : 0);
