import { listCollection, rawDoc, type Json } from '@/lib/store';

// What a shared plan link shows before anyone opens it (the WhatsApp/iMessage preview card). Only for
// someone who could open the invitation (the plan's current invite key, or just its link when it has no
// key, as lib/access.ts mayJoin allows), and only what the invitation itself shows: the name,
// the kind of plan, the place and dates once they're locked, and how many are going. Never names,
// budgets, votes or anything a guest of honor shouldn't see.
export type PlanPreview = { name: string; kind: string; line: string; going: number; color: string };

const SIZE: Json = { hangout: 'hangout', day: 'day out', weekend: 'weekend', trip: 'trip' };
const COLORS = ['#FF4FA3', '#FF8A3D', '#12B5A6', '#7048E8', '#E5484D', '#3B5BDB'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: string) => { const [, m, x] = d.split('-').map(Number); return `${MON[m - 1]} ${x}`; };
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function planPreview(id: string, key: string): PlanPreview | null {
  if (!/^[a-z0-9]{6,20}$/.test(id)) return null;
  const t = rawDoc('trips/' + id);
  // a plan with invites switched off, or a wrong or old key, gets the plain card
  if (!t || t.invitesOff || (t.inviteKey && t.inviteKey !== key)) return null;
  const size = typeof t.size === 'string' && SIZE[t.size] ? t.size : 'trip', mode = typeof t.mode === 'string' ? t.mode : 'friends';
  const kind = `${mode === 'work' ? 'Team' : mode[0].toUpperCase() + mode.slice(1)} ${SIZE[size]}`;
  const place = Array.isArray(t.destinations) ? (t.destinations as Json[]).find(d => d && d.id === t.lockedDest)?.city : '';
  const d = t.lockedDates as Json | undefined, when = d && isDay(d.start) && isDay(d.end) ? (d.start === d.end ? day(d.start) : `${day(d.start)} – ${day(d.end)}`) : '';
  const line = [typeof place === 'string' ? place : '', when].filter(Boolean).join(' · ') || (size === 'hangout' || size === 'day' ? 'Picking the plan and the day' : 'Picking where and when');
  const going = listCollection(`trips/${id}/members`, '').filter(m => ['in', 'confirmed', 'booked'].includes(String(m.data.status)) && !m.data.removed).length;
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { name: String(t.name || 'A plan').slice(0, 60), kind, line, going, color: COLORS[h % COLORS.length] };
}
