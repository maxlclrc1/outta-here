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
  return `<div class="avstack" aria-hidden="true">${list.map(m => `<span class="av ${m.faded ? 'av-maybe' : ''} ${m.lvl ? 'lv-' + m.lvl : ''}" style="background:${colorFor(m.id)}">${esc((m.nick || '').trim()[0]?.toUpperCase() || '')}</span>`).join('')}${ms.length > max ? `<span class="av av-more">+${ms.length - max}</span>` : ''}</div>`;
}
function planHero() {
  const t = S.trip, m = mode(), sz = size(), small = isSmall(), d = t.lockedDates, ds = t.lockedDest ? dest() : null, cd = d ? countdown() : null;
  const here = S.members.filter(x => !x.removed && x.status !== 'out'), goers = here.filter(going), maybes = here.length - goers.length;
  const photo = [...S.photos].filter(p => p.asset).sort((a, b) => (b.at || 0) - (a.at || 0))[0]?.asset;
  const cv = coverOf(t, S.tid, photo);
  const meta = [ds && esc(ds.city), d && esc(planWhen(t))].filter(Boolean).join(' · ') || (small ? 'Picking the plan and the day' : 'Picking where and when');
  const kids = kidsWith(goers), who = here.length <= 1 && !kids ? 'Just you so far' : `${goers.length + kids} going${partyNote(goers.length, kids)}${maybes ? ` · ${maybes} maybe` : ''}`;
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
function overviewTab() {
  const t = S.trip, welcome = showWelcome();
  // someone who hasn't answered yet sees the invitation first, not the whole planning screen
  if (welcome && !S.peek) return welcomeCard();
  const me = meDoc(), stage = STAGES.findIndex(([k]) => k === stageOf(t, S.members)), f = welcome ? null : journey().focus;
  // when the next move is your own answer, the big card already asks it; the ladder would ask twice
  const askedAbove = f && f.mine && (f.k === 'rsvp' || f.k === 'confirm');
  return `${welcome ? welcomeCard() : planHero()}
  ${isLive() ? '<div class="row" style="gap:8px"><button class="btn lost-btn" data-act="lostOpen">I’m lost</button><span class="small muted">Sends the crew your spot.</span></div>' : ''}
  ${welcome ? ovGlance() : journeyCard(ovGlance())}
  ${welcome ? '' : changesCard()}
  ${me && !welcome && !S.readOnly && !askedAbove ? `<section class="card ov-me"><span class="g-k">You’re…</span>${commitLadder()}</section>` : ''}
  <div class="ov-folds">
  ${S.recover ? recoveryCard() : welcome ? '' : `<details class="ov-fold" data-key="fold-recover"><summary><b>Something changed?</b><span class="small muted">See what it affects first</span></summary>${recoveryCard()}</details>`}
  <details class="ov-fold" data-key="fold-pass" ${S.cardUrl ? 'open' : ''}><summary><b>${stage >= 2 ? 'Plan passport' : 'Plan pass'}</b><span class="small muted">Share it as a story card</span></summary>${stage >= 2 ? passport() : pass()}</details>
  </div>`;
}
