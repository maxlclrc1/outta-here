/* ---------- plan covers and the plan home ----------
   The plan home leads with the plan itself: a cover with its name, type, where and when, and who's
   coming. Then the one thing to do next (from the journey), then compact progress and four
   at-a-glance tiles that open their sections. The pass, the story card and "Something changed?"
   are folded underneath, so they're there without competing with the next move. */

// A plan's color: its type's, or for friends plans its size's, so a crew's plans don't all look alike.
const planColor = t => t.mode && t.mode !== 'friends' && MODES[t.mode] ? MODES[t.mode].color : SIZES[sizeOf(t)].color;
// A cover: the crew's latest photo when there is one, otherwise the plan's color with one of a few
// soft shapes, picked from the plan's id so it never changes.
function coverOf(t, id, photo) {
  let h = 0; for (const c of String(id || t.name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { cls: `cv cv-${h % 4}${photo ? ' cv-photo' : ''}`, style: `--pc:${planColor(t)}${photo ? `;--img:url('/_blob/${encodeURIComponent(photo)}')` : ''}` };
}
// Overlapping avatars; people who haven't said yes are faded.
function avStack(ms, max = 5) {
  const list = ms.slice(0, max);
  return `<div class="avstack" aria-hidden="true">${list.map(m => `<span class="av ${m.faded ? 'av-maybe' : ''} ${m.wait ? 'av-wait' : ''} ${m.lvl ? 'lv-' + m.lvl : ''}" style="background:${colorFor(m.id)}">${esc((m.nick || '').trim()[0]?.toUpperCase() || '')}</span>`).join('')}${ms.length > max ? `<span class="av av-more">+${ms.length - max}</span>` : ''}</div>`;
}
function planHero() {
  const t = S.trip, m = mode(), sz = size(), small = isSmall(), d = t.lockedDates, ds = t.lockedDest ? dest() : null, cd = d ? countdown() : null;
  const here = S.members.filter(x => !x.removed && x.status !== 'out'), goers = here.filter(going), maybes = here.length - goers.length;
  const photo = [...S.photos].filter(p => p.asset).sort((a, b) => (b.at || 0) - (a.at || 0))[0]?.asset;
  const cv = coverOf(t, S.tid, photo);
  // what's decided, said as decided; what isn't, said as still open (never a guess)
  const meta = ds && d ? `<span class="ovh-set">✓ It’s on</span> ${esc(ds.city)} · ${esc(planWhen(t))}`
    : ds ? `${esc(ds.city)} · <span class="ovh-open">${small ? 'day' : 'dates'} still open</span>` : d ? `${esc(planWhen(t))} · <span class="ovh-open">${small ? 'what' : 'where'} still open</span>`
    : (small ? 'Picking the plan and the day' : 'Picking where and when');
  // once the dates are set, "confirmed" and "going" are told apart: that's who the plan is built around
  const firm = goers.filter(x => x.status !== 'in').length;
  const kids = kidsWith(goers), who = here.length <= 1 && !kids ? 'Just you so far' : d && firm && !kids ? `${firm} confirmed${goers.length > firm ? ` · ${goers.length - firm} going` : ''}${maybes ? ` · ${maybes} maybe` : ''}` : `${goers.length + kids} going${partyNote(goers.length, kids)}${maybes ? ` · ${maybes} maybe` : ''}`;
  const onInvite = journey().focus?.k === 'invite';
  return `<section class="ov-hero ${cv.cls}" style="${cv.style}">
    <div class="ovh-top"><span class="ovh-chip">${esc(modeLabel(m, sz))}</span>${!modeLabel(m, sz).toLowerCase().includes(SIZES[sz].label.toLowerCase()) ? `<span class="ovh-chip soft">${esc(SIZES[sz].label)}</span>` : ''}
      ${cd ? `<span class="ovh-count ${cd.n === 0 ? 'now' : ''}">${cd.n > 0 ? `<b>${cd.n}</b> ${cd.n === 1 ? 'day' : 'days'} to go` : esc(cd.text)}</span>` : ''}</div>
    <h1 class="ovh-title">${esc(t.name)}</h1>
    <p class="ovh-meta">${meta}</p>
    <div class="ovh-crew">${avStack([...goers.map(x => ({ ...x, lvl: x.status })), ...here.filter(x => !going(x)).map(x => ({ ...x, faded: true }))], 6)}<span class="ovh-who">${who}</span>
      ${!onInvite && !S.readOnly && canInvite() ? '<button class="btn sm glass" data-tab="crew">Invite</button>' : ''}</div>
  </section>`;
}
// Four tiles with where each part of the plan stands; each opens its section.
function ovGlance() {
  const t = S.trip, small = isSmall(), d = t.lockedDates, ms = active(), ds = t.lockedDest ? dest() : null;
  const shared = ms.filter(m => (m.days || []).length).length, ideas = (t.destinations || []).length, pitches = (t.pitches?.items || []).length;
  const b = budgetCap(), all = taskList(), open = all.filter(x => !x.done).length;
  const mineIn = (meDoc()?.days || []).length > 0, myB = hasBudget(S.uid) && !+meDoc()?.budget;
  const tile = (tab, ic, k, v, done) => `<button class="glance ${done ? 'g-done' : ''}" data-tab="${tab}"><span class="g-ic" aria-hidden="true">${ic}</span><span class="g-k">${k}</span><b>${v}</b></button>`;
  return `<section class="glance-grid" aria-label="At a glance">
    ${tile('dates', '📅', 'When', d ? esc(planWhen(t)) : !mineIn && !S.readOnly ? 'Add your free days' : !shared ? 'Nobody’s shared free days yet' : shared === ms.length ? 'Everyone’s free days are in' : `${shared} of ${ms.length} shared free days`, !!d)}
    ${tile('match', '📍', small ? 'What' : 'Where', ds ? esc(ds.city) : pitches ? `${pitches} to swipe on` : ideas ? `${ideas} idea${ideas === 1 ? '' : 's'} to vote on` : 'Toss in an idea', !!ds)}
    ${paysMode() === 'one' ? tile('cost', '💸', 'Money', isPayer() ? 'You’re covering it' : `Covered by ${esc(nameOf(payerId()))}`, true) : paysMode() === 'company' ? tile('cost', '💸', 'Money', 'The company’s paying', true) : tile('cost', '💸', 'Budget', b ? `${esc(b.label)} a person` : myB && !S.readOnly ? 'Set yours' : 'None set yet', !!b)}
    ${tabOn('tasks') ? tile('tasks', '✅', 'To-dos', open ? `${open} open` : all.length ? 'All done' : 'Add the first one', all.length > 0 && !open) : tile('hype', '💬', 'Chat', S.feed.length ? `${S.feed.length} message${S.feed.length === 1 ? '' : 's'}` : 'Say hi to the crew', false)}
  </section>`;
}
// Once the dates are set, who's actually coming, in one place: confirmed, going but not confirmed yet,
// undecided, can't make it, with names, so nobody has to check the crew tab. Only real answers; the one
// nudge is left out when the next-move card above already asks the same people. Your own answer sits
// underneath, so the plan home asks it once.
function crewNow(f, ladder) {
  const ms = S.members.filter(x => !x.removed), firm = ms.filter(x => ['confirmed', 'booked'].includes(x.status)), soft = ms.filter(x => x.status === 'in'), und = undecided().filter(x => !x.removed), out = ms.filter(x => x.status === 'out');
  if (ms.length < 2 && !ladder) return '';
  const grp = (k, label, list) => list.length ? `<div class="cn-row cn-${k}" data-key="cn-${k}">${avStack(list.map(x => ({ ...x, faded: k !== 'firm' })), 4)}<div class="stack" style="gap:0;min-width:0"><b>${label} · ${list.length}</b><span class="small muted">${esc(list.map(x => x.nick || 'Someone').join(', '))}</span></div></div>` : '';
  const nudge = f && !['confirm', 'rsvp'].includes(f.k) && !S.readOnly ? (soft.some(x => x.id !== S.uid) ? nudgeBtn('confirm', soft.filter(x => x.id !== S.uid), 'sm') : und.some(x => x.id !== S.uid) ? nudgeBtn('rsvp', und.filter(x => x.id !== S.uid), 'sm') : '') : '';
  const all = !soft.length && !und.length;
  return `<section class="card crew-now" data-key="crew-now">
    <div class="row" style="justify-content:space-between;align-items:baseline"><span class="g-k">Who’s coming</span><span class="small ${all ? 'cn-all' : 'muted'}">${all ? (firm.length ? 'Everyone’s answered ✓' : 'Nobody’s confirmed yet') : `${firm.length} of ${firm.length + soft.length + und.length} confirmed`}</span></div>
    ${ms.length >= 2 ? `<div class="cn-list">${grp('firm', 'Confirmed', firm)}${grp('soft', 'Going, not confirmed yet', soft)}${grp('und', 'Haven’t decided', und)}${grp('out', 'Can’t make it', out)}</div>` : ''}
    ${nudge ? `<div class="row">${nudge}</div>` : ''}
    ${ladder ? `<div class="cn-me"><span class="g-k">You’re…</span>${commitLadder()}</div>` : ''}
  </section>`;
}
function overviewTab() {
  const t = S.trip, welcome = showWelcome();
  // someone who hasn't answered yet sees the invitation first, not the whole planning screen; if they
  // already answered on the invitation screen, that answer is used instead of asking twice
  if (welcome && !S.peek) { const ans = pendingJoin(); if (ans) { setTimeout(() => joinPlan(ans), 0); return skel(); } return welcomeCard(); }
  const me = meDoc(), stage = STAGES.findIndex(([k]) => k === stageOf(t, S.members)), f = welcome ? null : journey().focus;
  // when the next move is your own answer, the big card already asks it; the ladder would ask twice
  const askedAbove = f && f.mine && (f.k === 'rsvp' || f.k === 'confirm');
  return `${welcome ? welcomeCard() : planHero()}
  ${isLive() ? '<div class="row" style="gap:8px"><button class="btn lost-btn" data-act="lostOpen">I’m lost</button><span class="small muted">Sends the crew your spot.</span></div>' : ''}
  ${welcome ? ovGlance() : journeyCard(ovGlance())}
  ${welcome ? '' : changesCard()}
  ${!welcome && t.lockedDates ? crewNow(f, me && !S.readOnly && !askedAbove) : me && !welcome && !S.readOnly && !askedAbove ? `<section class="card ov-me"><span class="g-k">You’re…</span>${commitLadder()}</section>` : ''}
  <div class="ov-folds">
  ${S.recover ? recoveryCard() : welcome ? '' : `<details class="ov-fold" data-key="fold-recover"><summary><b>Something changed?</b><span class="small muted">See what it affects first</span></summary>${recoveryCard()}</details>`}
  <details class="ov-fold" data-key="fold-pass" ${S.cardUrl ? 'open' : ''}><summary><b>${stage >= 2 ? 'Plan passport' : 'Plan pass'}</b><span class="small muted">Share it as a story card</span></summary>${stage >= 2 ? passport() : pass()}</details>
  </div>`;
}
