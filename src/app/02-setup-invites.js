/* ---------- your details first ---------- */
// Creating or joining a plan starts with a short setup, one question per screen,
// before the full plan with every tab opens up.
const showWelcome = () => S.membersIn && !S.demo && !S.readOnly && (!meDoc() || (meDoc().status === 'maybe' && !meDoc().seen));
// family and team plans don't ask the vibe questions up front (they're still in Things to do)
const setupSteps = () => ['days', ...(isSmall() ? [] : ['home']), ...(hasBudget(S.uid) ? ['budget'] : []), ...(['family', 'work'].includes(planGroup()) ? [] : ['vibe'])];
const BUDGETS = { hangout: [30, 60, 100], day: [50, 100, 200], weekend: [250, 450, 700], trip: [600, 1000, 1600] };
function dayPicker() {
  const t = S.trip, days = span(t.winStart, t.winEnd), mine = new Set(meDoc()?.days || []), pref = new Set(meDoc()?.pref || []);
  const pad = d => '<span></span>'.repeat((D(d).getUTCDay() + 6) % 7);
  const cells = days.map((d, i) => `${i === 0 ? pad(d) : D(d).getUTCDate() === 1 ? `<span class="cal-month">${monthName(d)}</span>${pad(d)}` : ''}<button class="day ${mine.has(d) ? 'mine' : ''} ${pref.has(d) ? 'pref' : ''} ${d === TODAY ? 'is-today' : ''}" data-day="${d}" aria-pressed="${mine.has(d)}" aria-label="${fmt(d)}${pref.has(d) ? ', best for you' : mine.has(d) ? ', works' : ''}">${D(d).getUTCDate()}${pref.has(d) ? '<i class="star" aria-hidden="true">★</i>' : ''}</button>`);
  return `<div class="cal">${days.length ? `<span class="cal-month first">${monthName(days[0])}</span>` : ''}${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<span class="dow">${x}</span>`).join('')}${cells.join('')}</div>`;
}
function setupView() {
  const steps = setupSteps(), i = Math.min(S.setup.step, steps.length - 1), k = steps[i], m = meDoc(), last = i === steps.length - 1;
  const nDays = (m.days || []).length, mq = m.quiz || {};
  const step = {
    days: { h: isSmall() ? 'Which days work for you?' : 'When are you free?',
      p: S.starMode ? 'Tap your favorite days ★. Tap again to unstar.' : `Tap every ${isSmall() ? 'day' : 'day you could be away'} between ${short(S.trip.winStart)} and ${short(S.trip.winEnd)}. Tap again to take one off.`,
      c: `<div class="row" style="gap:6px"><button class="btn sm" data-act="allDays">All of them</button><button class="btn sm" data-act="weekends">Fri–Sun</button><button class="btn sm ${S.starMode ? 'on' : ''}" data-act="starMode" aria-pressed="${!!S.starMode}">★ Favorites</button><button class="btn sm ghost" data-act="noDays">Clear</button></div>
        ${dayPicker()}<span class="small muted">${nDays ? `${nDays} day${nDays === 1 ? '' : 's'} picked` : 'Nothing picked yet'}</span>` },
    home: { h: size() === 'trip' ? 'Where are you flying from?' : 'Where are you coming from?',
      p: size() === 'trip' ? 'Your home airport or city. It’s used for flight prices and to pitch places that are easy for everyone to reach.' : 'Your city or neighborhood, so pitches stay within reach for everyone.',
      c: `<input id="me-home" aria-label="${size() === 'trip' ? 'Home airport or city' : 'Your city or neighborhood'}" class="big-input" maxlength="40" value="${esc(m.home || '')}" placeholder="${size() === 'trip' ? 'JFK or New York' : 'Brooklyn'}" autocomplete="address-level2" enterkeyhint="next">` },
    budget: budgetIsTotal() ? { h: 'What’s the budget for everyone?',
      p: `You’re covering it, so this is the total for the whole group${isSmall() ? '' : ', travel included'}. Pitches are planned around it, split across everyone coming.`,
      c: `<label class="field"><span class="label">Total for everyone (${cur()})</span><input id="me-budget" class="big-input" type="number" min="0" step="${isSmall() ? 10 : 100}" inputmode="numeric" value="${m.budget ? esc(m.budget) : ''}" placeholder="${niceIn(BUDGETS[size()][1] * Math.max(2, planHeads()))}" enterkeyhint="next"></label>` } : { h: 'What’s your max?',
      p: isSmall() ? 'Just your own share, all in. Pitches stay under the lowest budget in the crew.' : 'Just your own share, travel included. Pitches stay under the lowest budget in the crew.',
      c: `<div class="row" style="gap:6px">${BUDGETS[size()].map(u => niceIn(u)).map(v => `<button class="chip big-chip ${+m.budget === v ? 'on' : ''}" data-budget="${v}">${money(v)}</button>`).join('')}</div>
        <label class="field"><span class="label">Or type it (${cur()})</span><input id="me-budget" class="big-input" type="number" min="0" step="${isSmall() ? 5 : 50}" inputmode="numeric" value="${m.budget ? esc(m.budget) : ''}" placeholder="${niceIn(BUDGETS[size()][1])}" enterkeyhint="next"></label>` },
    vibe: { h: 'Quick vibe check',
      p: 'A few taps. It shapes what the AI pitches and the crew’s vibe.',
      c: quiz().map(q => `<div class="q"><span class="small"><b>${esc(q.q)}</b></span><div class="row" style="gap:6px">${q.o.map(o => `<button class="chip ${mq[q.k] === o ? 'on' : ''}" data-quiz="${q.k}|${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`).join('') },
  }[k];
  const done = setupAnswered(k), pct = setupPct();
  return `${topBar()}
  <section class="setup">
    <div class="setup-top"><span class="label">${esc(S.trip.name)} · Step ${i + 1} of ${steps.length}</span><button class="linkbtn small muted" data-act="setupLater">Do this later</button></div>
    <div class="setup-bar ${pct >= 100 ? 'full' : ''}" role="progressbar" aria-label="Your answers" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct}%"></i></div>
    <div class="setup-step" data-key="setup-${k}">
      ${S.setup.joined && i === 0 ? `<span class="setup-hi">🎉 You’re ${S.setup.joined === 'in' ? 'in' : 'on the list'}! ${steps.length} quick ${steps.length === 1 ? 'question' : 'questions'} and you’re done.</span>` : ''}
      <span class="setup-ico" aria-hidden="true">${SETUP_ICONS[k]}</span>
      <h1>${step.h}</h1>
      <p class="muted">${step.p}</p>
      <div class="stack setup-body">${step.c}</div>
    </div>
  </section>
  <div class="setup-nav"><div class="setup-nav-in">
    ${S.setup.praise ? `<span class="setup-praise" data-key="praise-${S.setup.n}" aria-live="polite">${esc(S.setup.praise)}</span>` : ''}
    ${i ? '<button class="btn ghost big setup-back" data-act="setupBack" aria-label="Back">←</button>' : ''}
    <button class="btn primary big setup-go ${done ? '' : 'skip'}" data-act="setupNext">${setupGoLabel(done, last)}</button>
  </div></div>`;
}
// The setup reads like a run of quick wins: the bar grows the moment a question is answered (and is full
// once the last one is), "Continue" turns into "Skip" when nothing's picked, and each answer gets a cheer.
const SETUP_ICONS = { days: '📅', home: '📍', budget: '💸', vibe: '✨' };
const PRAISE = ['Nice!', 'Love it!', 'Great pick!', 'Got it!', 'Ooh, nice.'];
const setupGoLabel = (done, last) => done ? (last ? 'Finish' : 'Continue') : (last ? 'Skip and finish' : 'Skip');
function setupAnswered(k) {
  const m = meDoc() || {}, typed = id => DRAFT[id] ?? $('#' + id)?.value;
  if (k === 'days') return (m.days || []).length > 0;
  if (k === 'home') return !!String(typed('me-home') ?? m.home ?? '').trim();
  if (k === 'budget') return +(typed('me-budget') || m.budget || 0) > 0;
  if (k === 'vibe') return Object.values(m.quiz || {}).some(Boolean);
  return false;
}
function setupPct() {
  const steps = setupSteps(), i = Math.min(S.setup.step, steps.length - 1);
  return (i + (setupAnswered(steps[i]) ? 1 : 0)) / steps.length * 100;
}
// typing doesn't re-render, so the bar and the button catch up here
function setupLive() {
  if (!S.setup) return;
  const steps = setupSteps(), i = Math.min(S.setup.step, steps.length - 1), pct = setupPct(), bar = $('.setup-bar'), go = $('.setup-go'), done = setupAnswered(steps[i]);
  if (bar) { bar.querySelector('i').style.width = pct + '%'; bar.classList.toggle('full', pct >= 100); bar.setAttribute('aria-valuenow', Math.round(pct)); }
  if (go) { go.textContent = setupGoLabel(done, i === steps.length - 1); go.classList.toggle('skip', !done); }
}
function setupSave() {
  const h = $('#me-home'), b = $('#me-budget');
  if (h) saveMe({ home: h.value.trim().slice(0, 40) }, true, true);
  if (b && b.value !== '') saveMe({ budget: Math.max(0, Math.round(+b.value || 0)) }, true, true);
  delete DRAFT['me-home']; delete DRAFT['me-budget'];
}
function setupGo(dir) {
  const steps = setupSteps(), n = steps.length, k = steps[Math.min(S.setup.step, n - 1)], won = dir > 0 && setupAnswered(k);
  setupSave();
  const next = S.setup.step + dir, joined = S.setup.joined;
  if (won && navigator.vibrate) try { navigator.vibrate(12); } catch {}
  if (next >= n) {
    S.setup = null; S.tab = 'overview';
    celebrate('You’re all set!', planColor(S.trip), joined ? 'Welcome to the crew' : 'Nice work');
    flash(`You’re all set. Here’s the ${planWord()}.`);
  } else { S.setup.step = Math.max(0, next); S.setup.n = (S.setup.n || 0) + 1; S.setup.praise = won ? PRAISE[S.setup.n % PRAISE.length] : ''; }
  render(); window.scrollTo({ top: 0 });
}
function startSetup() {
  if (S.demo || S.readOnly) return;
  S.setup = { step: 0 }; render(); window.scrollTo({ top: 0 });
}

/* ---------- invites ---------- */
// Phones get the native share sheet (Messages, WhatsApp, Instagram…). Desktop, or a
// browser that blocks sharing, copies the message instead.
async function sendInvite(text, url, title) {
  const phone = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && innerWidth < 820);
  if (navigator.share && phone) {
    try { await navigator.share({ title, text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  return copy(`${text}\n${url}`);
}
const noSignup = () => IN_CLAUDE ? '' : ' No app, no sign-up.';
// An invite that reads like a friend asking: the plan, what's decided (only what the plan says; anything
// open is said as open), who's in so far, and what tapping the link lets you do. `wa`: WhatsApp's *bold*.
const SIZE_EMOJI = { hangout: '🍻', day: '☀️', weekend: '🏡', trip: '✈️' };
const MODE_EMOJI = { birthday: '🎂', bachelorette: '💍', bachelor: '🥃', family: '🏡', work: '💼', festival: '🎶', couples: '💞', sports: '🏟️', college: '🎓' };
function inviteText(t, wa = false) {
  const sz = sizeOf(t), small = isSmallSize(sz), here = t === S.trip;
  const city = t.lockedDest ? (t.destinations || []).find(d => d.id === t.lockedDest)?.city || '' : '', place = city || (small ? t.city || '' : '');
  const when = t.lockedDates ? planWhen(t) : '', ins = here ? S.members.filter(m => going(m) && !m.removed).length : 0;
  const facts = [when, place].filter(Boolean).join(' · ') || (small ? 'Picking the day together' : 'Picking where and when together');
  const ask = !t.lockedDates ? `Tap to say if you’re in and ${small ? 'which days work' : 'when you’re free'} 👇` : !city && !small ? 'Tap to say if you’re in and vote on where 👇' : 'Tap to say if you’re in 👇';
  return [`${MODE_EMOJI[t.mode] || SIZE_EMOJI[sz] || '✨'} ${wa ? `*${t.name}*` : t.name}`, facts + (ins > 1 ? ` · ${ins} in so far` : ''), [noSignup().trim(), ask].filter(Boolean).join(' ')].join('\n');
}
const crewInviteText = c => `Join ${c?.name || 'our crew'} on Outta Here. It’s where we plan everything, from Friday dinners to trips.${noSignup()}`;
async function joinCrewQuiet(cid) {
  const c = S.crews.find(x => x.id === cid);
  if (!S.db || S.demo || !cid || (c && crewMembers(c).includes(S.uid))) return;
  try { await S.db.doc('crews/' + cid).update({ people: { [S.uid]: true }, profiles: { [S.uid]: { nick: S.myName || 'Someone' } } }); } catch {}
}
// First thing someone sees when they open an invite: what it is, who's in, and one tap to answer.
// Until they answer, that's all they see (they can choose to look around first).
function welcomeCard() {
  const t = S.trip, host = S.members.find(m => m.id === t.createdBy), ins = S.members.filter(going);
  const crew = S.crews.find(c => c.id === t.crewId), ds = t.lockedDest ? dest() : null, sz = SIZES[size()], cv = coverOf(t, S.tid);
  const when = t.lockedDates ? planWhen(t) : `Picking ${isSmall() ? 'a day' : 'dates'} together`;
  return `<section class="welcome ov-hero ${cv.cls}" style="${cv.style}">
    <div class="ovh-top"><span class="ovh-chip">${host ? `${esc(host.nick || 'A friend')} invited you` : 'You’re invited'}</span><span class="ovh-chip soft">${esc(modeLabel(mode(), size()))}</span></div>
    <h1 class="ovh-title">${esc(t.name)}</h1>
    <p class="ovh-meta">${[esc(sz.label) + (crew ? ' with ' + esc(crew.name) : ''), esc(when), ds && esc(ds.city)].filter(Boolean).join(' · ')}</p>
    ${ins.length ? `<div class="ovh-crew">${avStack(ins, 6)}<span class="ovh-who">${ins.length + kidsWith(ins)} in so far${partyNote(ins.length, kidsWith(ins))}</span></div>` : ''}
    ${S.trip.rsvpBy && TODAY <= S.trip.rsvpBy ? `<span class="small ovh-note"><b>Answer by ${fmt(S.trip.rsvpBy)}</b> so the crew knows how many to plan for.</span>` : ''}
    <div class="welcome-acts"><button class="btn primary big" data-join="in">I’m in</button><button class="btn big glass" data-join="maybe">Maybe</button><button class="btn ghost big glass" data-join="out">Can’t make it</button></div>
    ${t.crewId ? `<span class="small ovh-note">Saying you’re in also adds you to ${crew ? esc(crew.name) : 'the crew'}, so you’re part of their next plans too.</span>` : ''}
  </section>
  ${S.peek ? '' : '<button class="linkbtn small peek" data-act="peek">Look around the plan first</button>'}`;
}
// Saying yes goes straight into the quick setup, which opens with the welcome itself; setup starts
// before the answer is saved, so no "step done" banner or toast lands on top of it.
function joinPlan(status) {
  if (status !== 'out' && !S.demo && !S.readOnly) { document.querySelector('.milestone')?.remove(); S.setup = { step: 0, joined: status }; }
  saveMe({ status, seen: true }, true);
  if (status !== 'out') { joinCrewQuiet(S.trip.crewId); window.scrollTo({ top: 0 }); }
  if (!S.setup) flash(status === 'in' ? 'You’re in.' : status === 'maybe' ? 'Marked as maybe.' : 'Got it. The crew will see you can’t make it.');
}

/* ---------- plan match: learning and settling disagreements ---------- */
const pName = p => p.small ? p.title : p.city;
const yesOf = p => active().filter(m => swipeOf(p.id, m.id) === 1).length;
function swipeSummary() {
  const vs = active();
  return (S.trip.pitches?.items || []).map(p => ({ n: pName(p), y: yesOf(p), w: workableOf(p), x: vs.filter(m => swipeOf(p.id, m.id) === -1).length })).filter(h => h.y || h.w || h.x);
}
const nextHistory = () => [...swipeSummary(), ...(S.trip.pitchHistory || [])].slice(0, 16);
// What the AI should learn before pitching again: the crew's own request, how they swiped, what they've done before.
function pitchMemory() {
  const t = S.trip, hist = nextHistory(), lines = [];
  const past = S.trips.filter(x => x.id !== S.tid && t.crewId && x.crewId === t.crewId && x.lockedDest).map(x => (x.destinations || []).find(d => d.id === x.lockedDest)?.city || x.name).slice(0, 8);
  if (t.pitchNote) lines.push(`The crew asked for: "${t.pitchNote}". Treat this as a requirement.`);
  if (hist.length) lines.push(`How the crew (${active().length} people) swiped on earlier pitches. Lean toward what got yeses, steer away from what most people passed on, and don't repeat any of these:\n${hist.map(h => `- ${h.n}: ${h.y} yes, ${h.w || 0} could work, ${h.x} pass`).join('\n')}`);
  if (t.crewId) { const dna = dnaText(t.crewId); if (dna) lines.push(dna); }
  if (past.length) lines.push(`Plans this crew already locked before: ${past.join(', ')}. Don't repeat them; use them as a hint about their taste.`);
  return lines.join('\n');
}
function takeNote() {
  const el = $('#pitch-note'); if (!el) return;
  const note = el.value.trim().slice(0, 120);
  if (note !== (S.trip.pitchNote || '')) saveTrip({ pitchNote: note });
}
function steerField() {
  if (S.sample === null || S.readOnly) return '';
  const hist = nextHistory().length;
  return `<div class="steer"><label class="field"><span class="label">Steer the pitches (optional)</span><input id="pitch-note" maxlength="120" value="${esc(S.trip.pitchNote || '')}" placeholder="${isSmall() ? 'Cheap, near the L train, no karaoke' : 'Somewhere warm, no red-eyes, under $800'}"></label>
    ${hist ? `<span class="small muted">New pitches learn from how you swiped on the last ${hist === 1 ? 'one' : hist}.</span>` : ''}</div>`;
}
function runoffState() {
  const r = S.trip.runoff; if (!r || !r.key) return null;
  const items = S.trip.pitches?.items || [], ps = (r.ids || []).map(id => items.find(x => x.id === id)).filter(Boolean);
  if (ps.length < 2) return null;
  const vs = active(), votes = (S.trip.roVotes || {})[r.key] || {};
  const count = id => vs.filter(m => votes[m.id] === id).length, waiting = vs.filter(m => !votes[m.id]);
  const ranked = [...ps].sort((a, b) => count(b.id) - count(a.id) || fitScore(b) - fitScore(a) || (b.vibeMatch || 0) - (a.vibeMatch || 0));
  const winner = !waiting.length || count(ranked[0].id) > vs.length / 2 ? ranked[0] : null;
  return { key: r.key, ps, count, waiting, winner, mine: votes[S.uid] };
}
const lockedOn = p => S.trip.lockedDest && dest()?.city === p.city && S.trip.lockedDates?.start === p.start;
function runoffCard() {
  const ro = runoffState(); if (!ro) return '';
  const other = ro.winner && ro.ps.find(p => p !== ro.winner);
  return `<section class="card runoff stack">
    <div class="row" style="justify-content:space-between"><span class="label" style="color:var(--accent)">Final vote</span>${S.readOnly ? '' : '<button class="linkbtn small muted" data-act="endRunoff">Cancel</button>'}</div>
    <h2>${ro.winner ? `${esc(pName(ro.winner))} wins` : 'Pick one'}</h2>
    <p class="small muted">${ro.winner ? `${ro.count(ro.winner.id)} to ${ro.count(other.id)}.` : 'Nothing got a yes from everyone, so the top two go head to head. Most votes wins.'}</p>
    <div class="ro-opts">${ro.ps.map(p => `<button class="ro-opt ${ro.mine === p.id ? 'on' : ''} ${ro.winner === p ? 'win' : ''}" data-runoff="${esc(p.id)}" aria-pressed="${ro.mine === p.id}" ${ro.winner || S.readOnly ? 'disabled' : ''}>
      <b>${esc(pName(p))}</b><span class="small">${p.start === p.end ? fmt(p.start) + (p.time ? ' · ' + t12(p.time) : '') : short(p.start) + ' – ' + short(p.end)} · ${esc(pitchShort(p, p.perPerson || '?'))}</span>
      <span class="ro-count">${ro.count(p.id)} vote${ro.count(p.id) === 1 ? '' : 's'}${ro.mine === p.id ? ' · yours' : ''}</span></button>`).join('')}</div>
    ${ro.winner ? (lockedOn(ro.winner) ? '<span class="pill in" style="align-self:flex-start">Locked in</span>' : `<div><button class="btn primary" data-lockpitch="${esc(ro.winner.id)}">Lock in ${esc(pName(ro.winner))}</button></div>`)
      : `<span class="small muted">${ro.mine ? 'Waiting on ' + ro.waiting.map(m => esc(m.nick || 'Someone')).join(', ') : 'Tap the one you’d rather do.'}</span>`}
  </section>`;
}
// Everyone has swiped and nothing got a yes from all of them: show the closest pick and ways out.
function settleCard(items) {
  const vs = active(), n = vs.length;
  const waiting = vs.filter(m => items.some(p => !swipeOf(p.id, m.id)));
  if (waiting.length) return `<div class="empty"><b>You’ve swiped them all.</b><span>Waiting on ${waiting.map(m => esc(m.nick || 'Someone')).join(', ')}. Results are below, and you can lock one in any time.</span>${S.readOnly ? '' : '<button class="btn sm" data-act="nudgeSwipe">Nudge them</button>'}</div>`;
  if (runoffState()) return '';
  const ranked = [...items].sort((a, b) => fitScore(b) - fitScore(a) || (b.vibeMatch || 0) - (a.vibeMatch || 0)), top = ranked[0], y = yesOf(top);
  const second = ranked[1] && fitScore(ranked[1]) ? ranked[1] : null, liveWith = items.filter(okForAll).sort((a, b) => fitScore(b) - fitScore(a))[0];
  if (liveWith) return `<section class="card settle stack"><span class="label">No perfect match, but</span><h2>Everyone can live with ${esc(pName(liveWith))}</h2>
    <p class="small muted">${yesOf(liveWith)} said yes and the rest said it could work. Nobody passed.</p>${fitChips(liveWith)}
    <div class="row" style="gap:6px"><button class="btn primary" data-lockpitch="${esc(liveWith.id)}">Go with ${esc(pName(liveWith))}</button>${second ? '<button class="btn" data-act="startRunoff">Final vote: top two</button>' : ''}</div></section>`;
  if (!fitScore(top)) return `<section class="card settle stack"><h2>Nobody loved these</h2><p class="small muted">Every pitch got passed. Say what you want in “Steer the pitches” and get a new round. It learns from what you passed on.</p>
    ${S.sample ? `<div><button class="btn primary" data-act="genPitches">Pitch a new round</button></div>` : ''}</section>`;
  const passers = vs.filter(m => swipeOf(top.id, m.id) === -1);
  return `<section class="card settle stack">
    <span class="label">No perfect match</span>
    <h2>Closest: ${esc(pName(top))}</h2>
    <p class="small muted">${y} of ${n} said yes${workableOf(top) ? `, ${workableOf(top)} said it could work` : ''}${passers.length ? `. ${passers.map(m => esc(m.nick || 'Someone')).join(', ')} passed` : ''}.${second ? ` Runner-up: ${esc(pName(second))}.` : ''}</p>
    ${fitChips(top)}
    <div class="row" style="gap:6px">
      ${y > n / 2 && ruleCheck(optOf('pitch', top.id)).ok ? `<button class="btn primary" data-lockpitch="${esc(top.id)}">Go with ${esc(pName(top))} (majority)</button>` : ''}
      ${second ? `<button class="btn ${y > n / 2 && ruleCheck(optOf('pitch', top.id)).ok ? '' : 'primary'}" data-act="startRunoff">Final vote: top two</button>` : ''}
      ${S.sample ? '<button class="btn ghost" data-act="genPitches">Pitch a new round</button>' : ''}
    </div>
  </section>`;
}
function startRunoff() {
  const items = S.trip.pitches?.items || [], ranked = [...items].sort((a, b) => fitScore(b) - fitScore(a) || (b.vibeMatch || 0) - (a.vibeMatch || 0));
  if (ranked.length < 2) return;
  saveTrip({ runoff: { key: rid(6), ids: [ranked[0].id, ranked[1].id], by: S.uid, at: Date.now() } }).then(ok => ok && flash('Final vote started. Everyone picks one of the top two.'));
}

