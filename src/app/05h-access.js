/* ---------- privacy + guest controls ---------- */
// Organizers (the creator plus anyone they add) control the invite link and who can
// invite or lock decisions, and can remove people. Each person controls whether their
// budget and check-ins are visible. Until real accounts exist this is enforced by the
// app, not by the server, so it keeps honest people honest rather than stopping a hacker.
const isOrgOf = t => !!t && (t.createdBy === S.uid || !!(t.orgs || {})[S.uid]);
const canInvite = (t = S.trip) => S.demo || (!t.invitesOff && ((t.perm || {}).invite !== 'org' || isOrgOf(t)));
const canLock = () => S.demo || (S.trip.perm || {}).lock !== 'org' || isOrganizer();
const linkFor = t => SHARE_BASE + '#' + t.id + (t.inviteKey ? '.' + t.inviteKey : '');
// "#abc123" or "#abc123.k7x9" (a plan id plus the current invite key)
const parseTripHash = h => { const m = String(h || '').match(/^([a-z0-9]{6,20})(?:\.([a-z0-9]{4,12}))?$/); return m ? { tid: m[1], key: m[2] || '' } : null; };
function accessState() {
  const t = S.trip; if (!t || S.demo) return 'ok';
  const me = meDoc();
  if (me && me.removed) return 'removed';
  if (me || (t.people || {})[S.uid] || t.createdBy === S.uid || (t.crewId && myCrews().some(c => c.id === t.crewId))) return 'ok';
  if (t.invitesOff) return 'off';
  if (t.inviteKey && S.linkKey !== t.inviteKey) return 'stale';
  return 'ok';
}
function blockedView(st) {
  const msg = { removed: ['You’re no longer in this plan', 'An organizer took you off it. If that’s a mistake, ask them to add you back.'],
    off: ['This plan isn’t taking new people', 'The organizer turned invites off. Ask whoever sent you the link.'],
    stale: ['This invite link was turned off', 'The organizer made a new one. Ask whoever sent it for the new link.'] }[st];
  return `${topBar()}<section class="card stack" style="margin-top:20px"><span class="label">${esc(S.trip.name)}</span><h1 style="font-size:clamp(28px,7vw,40px)">${msg[0]}</h1><p class="muted">${msg[1]}</p><div><button class="btn primary" data-act="home">Back to my plans</button></div></section>`;
}
// Budgets are private by default: results count people without naming them, unless
// someone chose to be named.
function budgetWho(ms) {
  const pub = ms.filter(m => m.budgetPublic || m.id === S.uid), priv = ms.length - pub.length;
  if (!pub.length) return priv === 1 ? '1 person' : `${priv} people`;
  return listNames(pub) + (priv ? ` and ${priv} other${priv === 1 ? '' : 's'}` : '');
}
function accessCard() {
  const t = S.trip, org = isOrganizer(), perm = t.perm || {};
  const sel = (id, v, opts) => `<select id="${id}" style="width:auto" ${org ? '' : 'disabled'}>${opts.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<section class="card stack access">
    <h3>Access</h3>
    ${org ? '' : '<p class="small muted">Only organizers can change these.</p>'}
    <div class="acc-row"><div><b>Invite link</b><span class="small muted">${t.invitesOff ? 'Off. Nobody new can join.' : t.inviteKey ? 'On. Older links stopped working when it was reset.' : 'On.'}</span></div>
      ${org ? `<div class="row" style="gap:6px"><button class="btn sm" data-act="linkReset">New link</button><button class="btn sm ${t.invitesOff ? 'primary' : 'ghost'}" data-act="linkToggle">${t.invitesOff ? 'Turn invites on' : 'Turn invites off'}</button></div>` : ''}</div>
    <div class="acc-row"><div><b>Who can invite people</b></div>${sel('perm-invite', perm.invite || 'all', [['all', 'Anyone in the plan'], ['org', 'Organizers only']])}</div>
    <div class="acc-row"><div><b>Who can lock decisions</b><span class="small muted">Where, when and the final pick. Everyone can still vote.</span></div>${sel('perm-lock', perm.lock || 'all', [['all', 'Anyone in the plan'], ['org', 'Organizers only']])}</div>
    <p class="small muted">Organizers: ${esc(listNames(S.members.filter(m => m.id === t.createdBy || (t.orgs || {})[m.id])) || 'the creator')}. Make someone an organizer or remove them from the crew list in Home › Crew.</p>
  </section>`;
}
function myPrivacy() {
  const m = meDoc(); if (!m || S.demo) return '';
  return `<div class="stack" style="gap:8px;border-top:1px solid var(--line);padding-top:12px">
    <span class="label">Privacy</span>
    <label class="check-line"><input type="checkbox" id="me-budgetPublic" style="width:auto" ${m.budgetPublic ? 'checked' : ''}> Name me when something is over my budget. Off: I’m counted, but not named.</label>
    <label class="check-line"><input type="checkbox" id="me-hideLoc" style="width:auto" ${m.hideLoc ? 'checked' : ''}> Hide where I check in during the ${planWord()}. An SOS always shares your spot.</label>
  </div>`;
}
async function removeMember(uid) {
  const m = S.members.find(x => x.id === uid); if (!m || !isOrganizer() || uid === S.uid) return;
  const tasks = taskList().filter(x => !x.done && x.owner === uid);
  try {
    if (!S.demo) await S.db.doc(`trips/${S.tid}/members/${uid}`).update({ status: 'out', removed: true });
    else { m.status = 'out'; m.removed = true; }
    saveTrip({ people: { [uid]: null }, left: { [uid]: true }, orgs: { [uid]: null }, ...(tasks.length ? { tasks: Object.fromEntries(tasks.map(x => [x.id, { owner: '' }])) } : {}) });
    S.confirmRm = null; flash(`${m.nick || 'Someone'} was removed from the ${planWord()}.`);
  } catch (e) { flash(writeErr(e)); }
}

