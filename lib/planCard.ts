import { createHash } from 'node:crypto';
import { listCollection, rawDoc, type Json } from '@/lib/store';

// What a shared plan link shows before anyone opens it (the WhatsApp/iMessage preview card). Only for
// someone who could open the invitation (the plan's current invite key, or just its link when it has no
// key, as lib/access.ts mayJoin allows), and only what the invitation screen itself shows: the name, the
// kind of plan, who invited you (the organizer's nickname), the place and dates once they're locked (or
// a small plan's city), and how many are going. Never other people's names, budgets, votes, photos, or
// anything a guest of honor shouldn't see. Nothing here is guessed: what isn't decided is left out.
export type PlanPreview = { name: string; kind: string; host: string; place: string; when: string; stage: string; going: number; color: string; small: boolean };

const SIZE: Json = { hangout: 'hangout', day: 'day out', weekend: 'weekend', trip: 'trip' };
const KIND: Json = { friends: 'Friends', bachelorette: 'Bachelorette', bachelor: 'Bachelor', birthday: 'Birthday', couples: 'Couples', family: 'Family', college: 'College', festival: 'Festival', sports: 'Sports', work: 'Team' };
// the app's plan colors (planColor in 05o-overview.js): the type's, or for friends plans the size's
const SIZE_COLOR: Json = { hangout: '#14915F', day: '#1098AD', weekend: '#E8590C', trip: '#D41C78' };
const MODE_COLOR: Json = { bachelorette: '#E64980', bachelor: '#3B5BDB', birthday: '#F08C00', couples: '#C2255C', family: '#0E9F6E', college: '#1098AD', festival: '#7048E8', sports: '#E8590C', work: '#5C6A7A' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: string) => { const [, m, x] = d.split('-').map(Number); return `${MON[m - 1]} ${x}`; };
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const text = (v: unknown, n: number) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';

// The card image is fetched with this token instead of the invite key, so the key never appears in the
// image's address: a one-way digest of the plan and its current key (a reset key changes it too).
export const cardToken = (id: string, key: string) => createHash('sha256').update(`outta-card:${id}:${key}`).digest('hex').slice(0, 24);

function preview(id: string, t: Json): PlanPreview {
  const size = typeof t.size === 'string' && SIZE[t.size] ? t.size : 'trip', mode = typeof t.mode === 'string' && KIND[t.mode] ? t.mode : 'friends', small = size === 'hangout' || size === 'day';
  const kind = `${KIND[mode]} ${SIZE[size]}`;
  const lockedCity = Array.isArray(t.destinations) ? text((t.destinations as Json[]).find(d => d && d.id === t.lockedDest)?.city, 40) : '';
  const place = lockedCity || (small ? text(t.city, 40) : '');
  const d = t.lockedDates as Json | undefined, when = d && isDay(d.start) && isDay(d.end) ? (d.start === d.end ? day(d.start) : `${day(d.start)} – ${day(d.end)}`) : '';
  // what's still open, said plainly instead of a guess
  const stage = when && (lockedCity || small) ? '' : when ? 'Picking where together' : lockedCity ? `Picking ${small ? 'the day' : 'dates'} together` : small ? 'Picking the day together' : 'Picking where and when together';
  const ms = listCollection(`trips/${id}/members`, '');
  const going = ms.filter(m => ['in', 'confirmed', 'booked'].includes(String(m.data.status)) && !m.data.removed).length;
  const host = text(ms.find(m => m.id === t.createdBy)?.data.nick, 24);
  return { name: text(t.name, 60) || 'A plan', kind, host, place, when, stage, going, color: String((mode !== 'friends' && MODE_COLOR[mode]) || SIZE_COLOR[size]), small };
}
const plan = (id: string) => /^[a-z0-9]{6,20}$/.test(id) ? rawDoc('trips/' + id) : null;
// a plan with invites switched off, or a wrong or old key, gets the plain card
export function planPreview(id: string, key: string): PlanPreview | null {
  const t = plan(id); if (!t || t.invitesOff || (t.inviteKey && t.inviteKey !== key)) return null;
  return preview(id, t);
}
export function planPreviewByToken(id: string, token: string): PlanPreview | null {
  const t = plan(id); if (!t || t.invitesOff || token !== cardToken(id, String(t.inviteKey || ''))) return null;
  return preview(id, t);
}
