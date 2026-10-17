// Part of npm test / npm run test:server (runs against a throwaway server). To run alone against
// your own running app instead (writes to its data/): BASE=http://localhost:3000 node <this file>
// Server-side access rules: each line should print the expected result.
import { install } from './_identity.mjs'; install(); // act as the test's people (see the file)
const BASE = process.env.BASE || 'http://localhost:3000';
const call = (u, op, path, data, invite) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u, ...(invite ? { 'x-outta-invite': invite } : {}) }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_alice' + r, B = 'u_bob' + r, C = 'u_carol' + r, T = 'sectrip' + r;
let fails = 0; const check = (label, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++; };
check('create plan as yourself', (await call(A, 'set', 'trips/' + T, { name: 'Secret', createdBy: A, createdAt: Date.now(), people: { [A]: true } })).ok);
check('cannot create a plan in someone else’s name', (await call(B, 'set', 'trips/x' + T, { name: 'Fake', createdBy: A, createdAt: Date.now() })).status === 403);
await call(A, 'set', `trips/${T}/members/${A}`, { nick: 'Alice', status: 'in', budget: 900, needs: { diet: ['vegan'] } });
await call(A, 'set', `trips/${T}/expenses/e1`, { title: 'Hotel', amount: 300 });
check('stranger’s plan list does not include it', !(await call(B, 'list', 'trips')).docs.some(d => d.id === T));
check('creator’s plan list includes it', (await call(A, 'list', 'trips')).docs.some(d => d.id === T));
check('link holder can open the plan', (await call(B, 'get', 'trips/' + T)).exists);
const mem = (await call(B, 'get', `trips/${T}/members/${A}`)).data || {};
check('link holder sees name and status only (no budget or needs)', mem.nick === 'Alice' && !('budget' in mem) && !('needs' in mem));
check('link holder cannot read expenses', !(await call(B, 'list', `trips/${T}/expenses`)).docs.length);
check('stranger cannot rename the plan', (await call(B, 'update', 'trips/' + T, { name: 'Hacked' })).status === 403);
check('stranger cannot delete the plan', (await call(B, 'delete', 'trips/' + T)).status === 403);
check('stranger cannot add someone else', (await call(B, 'update', 'trips/' + T, { people: { [C]: true } })).status === 403);
check('stranger cannot write an expense', (await call(B, 'set', `trips/${T}/expenses/e2`, { title: 'x', amount: 1 })).status === 403);
check('link holder can join (own member record)', (await call(B, 'set', `trips/${T}/members/${B}`, { nick: 'Bob', status: 'in' })).ok);
check('…and add themselves to the plan', (await call(B, 'update', 'trips/' + T, { people: { [B]: true }, left: { [B]: null } })).ok);
check('member now reads expenses', (await call(B, 'list', `trips/${T}/expenses`)).docs.length === 1);
{ const m = (await call(B, 'get', `trips/${T}/members/${A}`)).data || {}; check('member sees member records, but not others’ budgets', m.status === 'in' && !('budget' in m) && m.budgetSet === true); }
check('member cannot make themselves organizer', (await call(B, 'update', 'trips/' + T, { orgs: { [B]: true } })).status === 403);
check('member cannot delete the plan', (await call(B, 'delete', 'trips/' + T)).status === 403);
check('organizer resets the invite link', (await call(A, 'update', 'trips/' + T, { inviteKey: 'k7x9q' })).ok);
check('old link can no longer join', (await call(C, 'set', `trips/${T}/members/${C}`, { nick: 'Carol' })).status === 403);
check('new link can join', (await call(C, 'set', `trips/${T}/members/${C}`, { nick: 'Carol' }, 'k7x9q')).ok);
check('organizer removes Bob', (await call(A, 'update', `trips/${T}/members/${B}`, { status: 'out', removed: true })).ok && (await call(A, 'update', 'trips/' + T, { people: { [B]: null }, left: { [B]: true } })).ok);
check('removed member cannot rejoin', (await call(B, 'update', `trips/${T}/members/${B}`, { status: 'in' })).status === 403 && (await call(B, 'update', 'trips/' + T, { people: { [B]: true } })).status === 403);
check('removed member loses access to expenses', !(await call(B, 'list', `trips/${T}/expenses`)).docs.length);
check('member cannot remove others', (await call(C, 'update', `trips/${T}/members/${A}`, { removed: true })).status === 403);
check('organizer turns invites off', (await call(A, 'update', 'trips/' + T, { invitesOff: true })).ok);
check('nobody new can join', (await call('u_dave' + r, 'set', `trips/${T}/members/u_dave${r}`, { nick: 'Dave' }, 'k7x9q')).status === 403);
// crews
const K = 'seccrew' + r;
check('create a crew', (await call(A, 'set', 'crews/' + K, { name: 'Six', people: { [A]: true }, profiles: { [A]: { nick: 'Alice' } }, by: A, at: Date.now() })).ok);
check('crew hidden from strangers’ list', !(await call(B, 'list', 'crews')).docs.some(d => d.id === K));
check('joining a crew adds only yourself', (await call(B, 'update', 'crews/' + K, { people: { [B]: true }, profiles: { [B]: { nick: 'Bob' } } })).ok && (await call(C, 'update', 'crews/' + K, { people: { u_x: true } })).status === 403);
check('crew member cannot delete the crew', (await call(B, 'delete', 'crews/' + K)).status === 403);
check('creator deletes the crew', (await call(A, 'delete', 'crews/' + K)).ok);
check('organizer deletes the plan', (await call(A, 'delete', 'trips/' + T)).ok);
console.log(fails ? `${fails} FAILED` : 'all access checks passed'); process.exit(fails ? 1 : 0);
