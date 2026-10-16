/* ---------- smart reminders ---------- */
// Only what needs you: your input, a decision that's ready, a deadline close by,
// something that changed since you last looked, a plan that starts tomorrow.
// You pick which kinds you want and can mute a plan. Nothing repeats once handled.
const REMIND_KINDS = [['input', 'When my input is needed'], ['decision', 'When a decision is ready'], ['deadline', 'Deadlines coming up'], ['change', 'When a plan changes'], ['soon', 'The day before a plan']];
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const remindPrefs = () => ({ input: true, decision: true, deadline: true, change: true, soon: true, ...lsGet('outta_remind', {}) });
const isMuted = tid => !!lsGet('outta_mute_' + tid, false);
// what a plan looked like the last time you had it open
const snapOf = t => ({ stage: stageOf(t), dest: (t.destinations || []).find(d => d.id === t.lockedDest)?.city || '', dates: t.lockedDates ? t.lockedDates.start + '|' + t.lockedDates.end : '', stay: t.stay?.name || '', time: t.time || '' });
function rememberSeen() {
  if (!S.trip || S.demo || !S.tid) return;
  const k = 'outta_seen_' + S.tid, now = snapOf(S.trip), old = lsGet(k, null);
  if (!old || JSON.stringify(old) !== JSON.stringify(now)) lsSet(k, now);
}
function changesOf(t) {
  const old = lsGet('outta_seen_' + t.id, null); if (!old) return [];
  const now = snapOf(t), out = [];
  if (now.dest && now.dest !== old.dest) out.push(`${isSmall(t) ? 'The plan' : 'Destination'} locked: ${now.dest}`);
  if (now.dates && now.dates !== old.dates) { const [a, b] = now.dates.split('|'); out.push(`${a === b ? 'Day' : 'Dates'} locked: ${dayRange(a, b)}`); }
  if (!now.dates && old.dates) out.push('The dates were reopened');
  if (now.stay && now.stay !== old.stay) out.push(`Stay picked: ${now.stay}`);
  if (now.time && now.time !== old.time) out.push(`Time set: ${t12(now.time)}`);
  if (!out.length && now.stage !== old.stage) out.push(`Now: ${STAGE_LABEL[now.stage]}`);
  return out;
}
function inbox() {
  const prefs = remindPrefs(), out = [];
  for (const t of myPlans()) {
    if (isMuted(t.id)) continue;
    const p = t.pulse || {}, st = stageOf(t), name = t.name, d = t.lockedDates;
    if (st === 'memories') continue;
    if (prefs.input && (p.who || []).includes(S.uid) && p.mine) out.push({ k: 'input', t, text: p.mine, w: 3 });
    else if (prefs.decision && p.k === 'decide' && (t.createdBy === S.uid || (t.orgs || {})[S.uid])) out.push({ k: 'decision', t, text: p.text, w: 2 });
    if (prefs.deadline && t.rsvpBy && t.rsvpBy >= TODAY && t.rsvpBy <= add(TODAY, 2) && (p.und || []).includes(S.uid)) out.push({ k: 'deadline', t, text: `Answer by ${t.rsvpBy === TODAY ? 'today' : fmt(t.rsvpBy)}`, w: 4 });
    if (prefs.soon && d && d.start === add(TODAY, 1)) out.push({ k: 'soon', t, text: `Tomorrow${t.time ? ' at ' + t12(t.time) : ''}`, w: 1 });
    const ch = prefs.change ? changesOf(t) : [];
    if (ch.length) out.push({ k: 'change', t, text: ch.length === 1 ? ch[0] : `${ch[0]} · ${ch.length - 1} more change${ch.length === 2 ? '' : 's'}`, w: 0 });
  }
  return out.sort((a, b) => b.w - a.w);
}
const REMIND_ICON = { input: '●', decision: '◆', deadline: '⏳', change: '↻', soon: '★' };
function inboxCard() {
  const items = inbox();
  if (!items.length && !S.remindOpen) return '';
  return `<section class="card stack inbox">
    <div class="row" style="justify-content:space-between"><h2>Needs you${items.length ? ` <span class="count">${items.length}</span>` : ''}</h2><button class="linkbtn small muted" data-act="remindOpen">${S.remindOpen ? 'Done' : 'Settings'}</button></div>
    ${S.remindOpen ? remindSettings() : ''}
    ${items.length ? `<div class="inbox-list">${items.slice(0, 6).map(x => `<button class="inbox-i k-${x.k}" data-open="${esc(x.t.id)}"><span class="ib-ic" aria-hidden="true">${REMIND_ICON[x.k]}</span><span class="ib-t"><b>${esc(x.text)}</b><span class="small muted">${esc(x.t.name)}</span></span><span class="ib-go" aria-hidden="true">→</span></button>`).join('')}</div>`
      : '<span class="small muted">Nothing needs you right now.</span>'}
  </section>`;
}
function remindSettings() {
  const p = remindPrefs(), np = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return `<div class="stack remind-set" style="gap:8px">
    <span class="label">Tell me about</span>
    <div class="row" style="gap:6px">${REMIND_KINDS.map(([k, l]) => `<button class="chip ${p[k] ? 'on' : ''}" data-remind="${k}" aria-pressed="${p[k]}">${l}</button>`).join('')}</div>
    ${np === 'default' ? '<div><button class="btn sm" data-act="notifyAsk">Also show browser notifications</button></div>' : np === 'granted' ? '<span class="small muted">Browser notifications are on while the app is open.</span>' : np === 'denied' ? '<span class="small muted">Browser notifications are blocked for this site.</span>' : ''}
    <span class="small muted">Mute a single plan from its Settings.</span>
  </div>`;
}
// A quiet browser notification when a plan newly needs you, at most once per ask.
function notifyNew(trips) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !remindPrefs().input) return;
  const told = lsGet('outta_told', {});
  for (const t of trips) {
    const p = t.pulse; if (!p || !(p.who || []).includes(S.uid) || !p.mine || isMuted(t.id) || t.id === S.tid) continue;
    const key = t.id + '|' + p.mine; if (told[key]) continue;
    told[key] = Date.now();
    try { new Notification(t.name, { body: p.mine, tag: 'outta-' + t.id }); } catch {}
  }
  lsSet('outta_told', Object.fromEntries(Object.entries(told).filter(([, at]) => Date.now() - at < 30 * 864e5)));
}

