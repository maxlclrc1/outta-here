// Part of npm test / npm run test:server (runs against a throwaway server). To run alone against
// your own running app instead (writes to its data/): BASE=http://localhost:3000 node <this file>
// The invite key is a secret: organizers always get it, members only when anyone in the plan may
// invite, and people who only have a link learn just whether their link still works.
import { install } from './_identity.mjs'; install(); // act as the test's people (see the file)
const BASE = process.env.BASE || 'http://localhost:3000';
const call = (u, op, path, data, invite) => fetch(BASE + '/api/db', { method: 'POST', headers: { 'content-type': 'application/json', 'x-outta-user': u, ...(invite ? { 'x-outta-invite': invite } : {}) }, body: JSON.stringify({ op, path, data }) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const r = Math.random().toString(36).slice(2, 8), A = 'u_org00' + r, B = 'u_bea00' + r, X = 'u_link00' + r, Y = 'u_late00' + r, T = 'ik' + r, P = 'trips/' + T;
let fails = 0; const check = (l, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? ' · ' + x : ''}`); if (!ok) fails++; };
const plan = async (u, invite) => (await call(u, 'get', P, undefined, invite)).data || {};
const listed = async u => ((await call(u, 'list', 'trips')).docs || []).find(d => d.id === T)?.data || {};
await call(A, 'set', P, { name: 'Keys', createdBy: A, createdAt: Date.now(), people: { [A]: true }, inviteKey: 'k1' });
check('Bea joins with the link', (await call(B, 'set', `${P}/members/${B}`, { nick: 'Bea', status: 'in' }, 'k1')).ok && (await call(B, 'update', P, { people: { [B]: true } }, 'k1')).ok);

// “Anyone in the plan” can invite (the default)
check('the organizer gets the invite key', (await plan(A)).inviteKey === 'k1' && (await listed(A)).inviteKey === 'k1');
check('anyone-can-invite: a member gets it too (the links they share carry it)', (await plan(B)).inviteKey === 'k1' && (await listed(B)).inviteKey === 'k1');
{ const t = await plan(X, 'k1'); check('someone with the link, not joined, doesn’t get the key', !('inviteKey' in t) && t.name === 'Keys'); check('…but learns their link works', t.inviteOk === true); }
{ const t = await plan(X); check('…and with no key in their link, that it doesn’t', t.inviteOk === false && !('inviteKey' in t)); }

// “Organizers only”
await call(A, 'update', P, { perm: { invite: 'org' } });
check('organizers-only: the organizer still gets the key', (await plan(A)).inviteKey === 'k1');
{ const t = await plan(B), l = await listed(B); check('organizers-only: a member doesn’t (read or list)', !('inviteKey' in t) && !('inviteKey' in l) && !('inviteOk' in t)); }
check('…and still can’t change it', (await call(B, 'update', P, { inviteKey: 'mine' })).status === 403);
{ const t = await plan(X, 'k1'); check('organizers-only: a link holder still doesn’t get it', !('inviteKey' in t) && t.inviteOk === true); }
await call(A, 'update', P, { perm: { invite: 'all' } });

// an old link after the organizer makes a new one
await call(A, 'update', P, { inviteKey: 'k2' });
{ const t = await plan(X, 'k1'); check('after a reset, the old link is reported as not working', t.inviteOk === false && !('inviteKey' in t)); }
check('…and can’t be used to join', (await call(X, 'set', `${P}/members/${X}`, { nick: 'Xan' }, 'k1')).status === 403);
check('…nor can a guess from what was read', (await call(X, 'set', `${P}/members/${X}`, { nick: 'Xan' }, (await plan(X, 'k1')).inviteKey)).status === 403);
{ const t = await plan(Y, 'k2'); check('the new link works', t.inviteOk === true && (await call(Y, 'set', `${P}/members/${Y}`, { nick: 'Yan', status: 'in' }, 'k2')).ok); }
check('a member who joined with the new link gets the key (anyone can invite)', (await plan(Y)).inviteKey === 'k2');

// removed people are back to link holders
await call(A, 'update', `${P}/members/${B}`, { status: 'out', removed: true }); await call(A, 'update', P, { people: { [B]: null } });
{ const t = await plan(B, 'k1'); check('a removed member no longer gets the key', !('inviteKey' in t) && t.inviteOk === false); }
// no key set: nothing to hide, every link works
await call(A, 'update', P, { inviteKey: null });
check('with no invite key, any link works', (await plan(X)).inviteOk === true);
await call(A, 'delete', P);
process.exit(fails ? 1 : 0);
