import { StoreError, rawDoc, type Json } from '@/lib/store';

// Who may read and write what. The app's own checks only decide what to show; these are
// the ones that count, applied to every request before it touches the store.
//
// - A plan (trips/<id>) can be opened by anyone who has its link, which is how invites
//   work. Listing plans only returns the ones you're in.
// - You're "in" a plan if you created it, are in its people, are an organizer, have a
//   member record that wasn't removed, or are in the plan's crew (unless you left).
// - Everything under a plan (members, expenses, photos…) is for people in the plan.
//   Before joining you can see who's in it (names and RSVP), nothing else about them.
// - Joining: someone with the link may add only themselves, while invites are on, with
//   the current link if the organizer reset it, and not after being removed.
// - Only organizers delete a plan or change who can invite, lock and organize.
// - Crews work the same way: open by link, list only yours, join adds only yourself,
//   only the person who made a crew deletes it.
//
// Identity is still the id each browser sends (see lib/user.ts). Until real accounts
// exist, anyone who copies another browser's id can act as them; these rules stop
// everyone else.

type Ctx = { user: string; invite: string };
const deny = (msg = 'You don’t have access to this.') => new StoreError('permission_denied', msg);
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const flag = (o: unknown, k: string) => isObj(o) && !!o[k];

export function inCrew(cid: unknown, user: string) {
  if (typeof cid !== 'string' || !cid) return false;
  const c = rawDoc('crews/' + cid);
  return !!c && (flag(c.people, user) || c.by === user || (Array.isArray(c.ids) && c.ids.includes(user)));
}
export function isOrg(t: Json, user: string) { return t.createdBy === user || flag(t.orgs, user); }
export function inTrip(tid: string, user: string, t: Json | null = rawDoc('trips/' + tid)) {
  if (!t) return false;
  const me = rawDoc(`trips/${tid}/members/${user}`);
  if (me && me.removed) return isOrg(t, user);
  if (isOrg(t, user) || flag(t.people, user) || (me && !me.removed)) return true;
  return inCrew(t.crewId, user) && !flag(t.left, user);
}
// may this person join the plan right now (add themselves)?
function mayJoin(tid: string, t: Json, ctx: Ctx) {
  const me = rawDoc(`trips/${tid}/members/${ctx.user}`);
  if (me && me.removed) return false;
  if (inCrew(t.crewId, ctx.user)) return true;
  if (t.invitesOff) return false;
  return !t.inviteKey || t.inviteKey === ctx.invite;
}
// the part of a member record someone outside the plan may see on an invite
const PUBLIC_MEMBER = ['nick', 'status'];
const redactMember = (d: Json) => Object.fromEntries(PUBLIC_MEMBER.filter(k => k in d).map(k => [k, d[k]]));
const onlySelf = (o: unknown, user: string) => !isObj(o) || Object.keys(o).every(k => k === user);
// org-only fields on a plan
const ORG_FIELDS = ['orgs', 'perm', 'inviteKey', 'invitesOff', 'createdBy'];

/** What a single read returns: the data as stored, a trimmed copy, or nothing. */
export function readable(p: string, data: Json, ctx: Ctx): Json | null {
  const s = p.split('/');
  if (s[0] === 'trips' && s.length >= 4) {
    if (inTrip(s[1], ctx.user)) return data;
    return s[2] === 'members' && s.length === 4 ? redactMember(data) : null;
  }
  return data; // a plan or crew by its id, and everything else, is open to the link holder
}
/** Whether a document shows up when listing its collection. */
export function listable(p: string, data: Json, ctx: Ctx): Json | null {
  const s = p.split('/');
  if (s[0] === 'trips' && s.length === 2) return inTrip(s[1], ctx.user, data) ? data : null;
  if (s[0] === 'crews' && s.length === 2) return flag(data.people, ctx.user) || data.by === ctx.user ? data : null;
  return readable(p, data, ctx);
}
/** Whether a change to a path should be announced to this person's open tabs. */
export function notifiable(p: string, user: string) {
  const s = p.split('/');
  if (s[0] === 'trips') { const t = rawDoc('trips/' + s[1]); return !t || inTrip(s[1], user, t); }
  if (s[0] === 'crews') { const c = rawDoc('crews/' + s[1]); return !c || flag(c.people, user) || c.by === user; }
  if (s[0] === 'data' && s[1] === 'users') return s[2] === user;
  return true;
}

/** Throws if this write isn't allowed. `prev` is the stored document, if any. */
export function checkWrite(op: 'set' | 'update' | 'delete', p: string, data: Json | undefined, prev: Json | null, ctx: Ctx) {
  const s = p.split('/'), u = ctx.user;
  if (s[0] === 'trips') {
    const tid = s[1], t = s.length === 2 ? prev : rawDoc('trips/' + tid);
    if (s.length === 2) {
      if (op === 'delete') { if (prev && !isOrg(prev, u)) throw deny('Only organizers can delete this plan.'); return; }
      if (!prev) { if (op === 'set' && data?.createdBy === u) return; throw deny(); }
      if (op === 'set') { if (!isOrg(prev, u) || data?.createdBy !== prev.createdBy) throw deny(); return; }
      // update
      if (inTrip(tid, u, prev)) {
        const orgOnly = ORG_FIELDS.filter(k => data && k in data);
        if (orgOnly.length && !isOrg(prev, u)) throw deny('Only organizers can change this.');
        return;
      }
      const keys = Object.keys(data || {});
      if (keys.every(k => k === 'people' || k === 'left') && onlySelf(data?.people, u) && onlySelf(data?.left, u) && mayJoin(tid, prev, ctx)) return;
      throw deny();
    }
    if (!t) throw deny('This plan doesn’t exist anymore.');
    if (s[2] === 'members' && s.length === 4) {
      const uid = s[3];
      if (uid === u) {
        if (prev && prev.removed && !isOrg(t, u)) throw deny('You were removed from this plan.');
        if (inTrip(tid, u, t) || mayJoin(tid, t, ctx)) {
          if (data && 'removed' in data && !isOrg(t, u)) throw deny();
          return;
        }
        throw deny();
      }
      if (!inTrip(tid, u, t)) throw deny();
      if (op === 'delete' && !isOrg(t, u)) throw deny();
      if (data && 'removed' in data && !isOrg(t, u)) throw deny('Only organizers can remove people.');
      return;
    }
    if (!inTrip(tid, u, t)) throw deny();
    return;
  }
  if (s[0] === 'crews' && s.length === 2) {
    if (op === 'delete') { if (prev && prev.by !== u) throw deny('Only the person who made this crew can delete it.'); return; }
    if (!prev) { if (op === 'set' && data?.by === u && flag(data.people, u)) return; throw deny(); }
    if (op === 'set') { if (prev.by !== u) throw deny(); return; }
    if (flag(prev.people, u) || prev.by === u) return;
    const keys = Object.keys(data || {});
    if (keys.every(k => k === 'people' || k === 'profiles') && onlySelf(data?.people, u) && onlySelf(data?.profiles, u)) return;
    throw deny();
  }
}
