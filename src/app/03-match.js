/* ---------- group fit: evidence, not a score ---------- */
// For any option: does it fit people's budgets, can they make the dates, and how did
// they rate it. Shown as plain facts so the trade-offs are visible.
const WORKABLE = 0.5;
const workableOf = p => active().filter(m => swipeOf(p.id, m.id) === WORKABLE).length;
const rated = p => active().filter(m => swipeOf(p.id, m.id));
const okForAll = p => { const vs = active(); return vs.length >= 2 && vs.every(m => swipeOf(p.id, m.id) >= WORKABLE); };
const fitScore = p => yesOf(p) * 2 + workableOf(p);
function groupFit(p) {
  const vs = active(), out = [], r = moneyRange(p.perPerson), pm = paysMode();
  const nB = pm === 'company' ? 0 : vs.filter(m => hasBudget(m.id) && (+m.budget > 0 || m.budgetSet)).length, f = r && nB ? (p.id && (S.trip.pitches?.items || []).some(x => x.id === p.id) ? bq({ pitch: p.id }) || NO_FIT : budgetFit({ low: r[0], high: r[1] })) : null;
  if (f && f.pending) out.push({ ok: 'meh', text: 'Checking budgets…' });
  else if (f && f.unavailable) out.push({ ok: 'meh', text: 'Budget check unavailable right now' });
  else if (f && f.n && pm === 'one') {
    const whose = isPayer() ? 'your' : 'the', was = f.stale ? ' (earlier check)' : '';
    out.push(f.over.length ? { ok: false, text: `Over ${whose} total budget${was}` } : f.stretch.length ? { ok: 'meh', text: `A stretch for ${whose} total budget${was}` } : { ok: f.stale ? 'meh' : true, text: `Fits ${whose} total budget${was}` });
  } else if (f && f.n) {
    const { over, stretch } = f, was = f.stale ? ' (earlier check)' : '';
    out.push(over.length ? { ok: false, text: `Over budget for ${budgetWho(over)}${was}` } : stretch.length ? { ok: 'meh', text: `A stretch for ${budgetWho(stretch)}${was}` } : { ok: f.stale ? 'meh' : true, text: (f.n === vs.length ? `Fits ${vs.length}/${vs.length} budgets` : `Fits every budget set (${f.n} of ${vs.length})`) + was });
  } else if (pm === 'company') out.push({ ok: 'meh', text: 'Company expense, no personal budgets' });
  else out.push({ ok: 'meh', text: nB ? 'No price to check yet' : pm === 'one' ? 'No total budget set yet' : 'Nobody set a budget yet' });
  const days = span(p.start, p.end), can = vs.filter(m => fitOf(m, days)), cant = vs.filter(m => !fitOf(m, days)), picked = vs.filter(m => (m.days || []).length);
  if (picked.length) out.push(cant.filter(m => (m.days || []).length).length ? { ok: false, text: `${listNames(cant.filter(m => (m.days || []).length))} can’t make ${p.start === p.end ? 'that day' : 'those dates'}` } : { ok: true, text: `Free: ${can.length}/${vs.length}` });
  const rs = rated(p);
  if (rs.length) {
    const no = rs.filter(m => swipeOf(p.id, m.id) === -1);
    out.push(okForAll(p) ? { ok: true, text: yesOf(p) === vs.length ? 'Everyone said yes' : 'Everyone rated it at least workable' } : no.length ? { ok: false, text: `${listNames(no)} passed` } : { ok: 'meh', text: `${yesOf(p)} yes · ${workableOf(p)} could work` });
  }
  return out;
}
// a pitch's price in a list: unchanged when splitting, the group total when one person or the company pays
const pitchShort = (p, split) => { const pp = pitchPay(p); return pp.split ? split : pp.short; };
const fitChips = p => `<div class="fit">${groupFit(p).map(f => `<span class="fit-c ${f.ok === true ? 'y' : f.ok === false ? 'n' : 'm'}">${f.ok === true ? '✓' : f.ok === false ? '✕' : '~'} ${esc(f.text)}</span>`).join('')}</div>`;

/* ---------- trip match (swipe) ---------- */
const GRADS = [['#FF4FA3', '#7048E8'], ['#FF8A3D', '#D41C78'], ['#12B5A6', '#3B5BDB'], ['#F2B32B', '#E8590C'], ['#7048E8', '#1098AD'], ['#E5484D', '#7A1FA2']];
const hashStr = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const swipeOf = (pid, uid) => ((S.trip.swipes || {})[pid] || {})[uid] || 0;
function matchedPitch() {
  const p = S.trip.pitches?.items || [], vs = active();
  if (vs.length < 2) return null;
  return p.find(x => vs.every(m => swipeOf(x.id, m.id) === 1)) || null;
}
function dateOptions() {
  const t = S.trip, len = nightsSet(t) + 1, days = span(t.winStart, t.winEnd), ms = active(), out = [];
  for (let i = 0; i + len <= days.length; i++) {
    const d = days.slice(i, i + len), ok = ms.filter(m => fitOf(m, d)).length;
    out.push({ start: d[0], end: d[len - 1], ok });
  }
  out.sort((a, b) => b.ok - a.ok || (a.start < b.start ? -1 : 1));
  const picked = [];
  for (const w of out) { if (picked.every(p => Math.abs(D(p.start) - D(w.start)) >= 3 * 864e5)) picked.push(w); if (picked.length === 4) break; }
  return picked;
}
function genPitches() {
  takeNote();
  if (isSmall()) return genPlanPitches();
  const opts = dateOptions(); if (!opts.length) { flash('Set a date window first.'); return; }
  const b = budgetCap();
  const prompt = `You're pitching ${size() === 'weekend' ? 'weekend getaways (1–2 nights, ideally a few hours’ drive or a short flight away)' : 'group trips'} to a ${planKind().group}. They will each swipe yes or no on every pitch, like a dating app, so make each pitch exciting, specific and honest.
Trip type: ${mode().label}. ${mode().ai}
Crew: ${active().length} people ${size() === 'trip' ? 'flying' : 'coming'} from ${homes().join(', ') || 'unknown cities'}.
Per-person budget cap (all-in, flights included): ${b ? `${b.label}. That's the range the tightest budget in the crew falls in; keep every pitch at or under ${money(b.cap)}` : 'not set, assume moderate'}.
Trip length: ${nightsSet(S.trip)} nights.
${blend() ? 'Crew vibe quiz:\n' + blendText() : 'Vibe: ' + vibeDefault('pitch')}
Destinations already suggested by the crew: ${(S.trip.destinations || []).map(d => d.city).join(', ') || 'none'}
${pitchMemory()}
Date options (each pitch must use one of these exactly):
${opts.map((o, i) => `${i + 1}) ${o.start} to ${o.end} (${o.ok}/${active().length} free)`).join('\n')}

Give 6 pitches with 6 different destinations: include the crew's suggestions that fit, plus fresh ideas that fit the budget from those home cities. Every pitch must work for the lowest budget in the crew. Make them genuinely different from each other so the swipes tell us something. Prefer the date options most people can make. Be realistic about prices.
Reply with only JSON: {"pitches":[{"city":"","code":"IATA airport code","start":"YYYY-MM-DD","end":"YYYY-MM-DD","tagline":"punchy, 4-9 words","why":"1-2 sentences on why THIS crew would love it","perPerson":"$650–800 all-in","vibeMatch":87,"highlights":["3 short, specific highlights"],"weather":"short"}]}`;
  askAI('pitch', prompt, data => {
    const valid = new Map(opts.map(o => [o.start, o]));
    const items = (Array.isArray(data?.pitches) ? data.pitches : []).filter(p => p && p.city).slice(0, 8).map(p => {
      const o = valid.get(p.start) || opts[0];
      return { id: rid(6), city: String(p.city).slice(0, 40), code: isCode(p.code) ? p.code.toUpperCase() : '', start: o.start, end: o.end,
        tagline: String(p.tagline || '').slice(0, 80), why: String(p.why || '').slice(0, 300), perPerson: String(p.perPerson || '').slice(0, 30),
        vibeMatch: Math.max(0, Math.min(100, Math.round(+p.vibeMatch || 0))), highlights: arr(p.highlights).slice(0, 3).map(h => String(h).slice(0, 80)), weather: String(p.weather || '').slice(0, 60) };
    });
    if (!items.length) { flash('No pitches came back. Try again.'); return; }
    return saveTrip({ pitches: { items, at: Date.now() }, pitchHistory: nextHistory(), runoff: null });
  });
}
async function swipe(pid, v) {
  votePop(v === 1 ? 'I’d go! ♥' : v === -1 ? 'Passed' : 'Could work ≈', v === 1 ? 'y' : v === -1 ? 'n' : 'm');
  await saveTrip({ swipes: { [pid]: { [S.uid]: v } } });
  const m = matchedPitch();
  if (m && v === 1 && m.id === pid) { celebrate(m.city, GRADS[hashStr(m.city) % GRADS.length][0], 'It’s a match!'); flash(`It’s a match! Everyone’s down for ${m.city}.`); }
}
// A vote from the buttons under the card throws the card the same way a swipe does, then saves.
function castVote(pid, v, btn) {
  const card = document.getElementById('pitch');
  if (card && card.dataset.pid === pid && btn?.classList.contains('swipe-btn') && !calm()) {
    card.classList.add(v === 1 ? 'fly-yes' : v === -1 ? 'fly-no' : 'fly-meh'); setTimeout(() => swipe(pid, v), 230); return;
  }
  return swipe(pid, v);
}
// a quick cheer for a vote, over the bottom of the screen, and a tap on phones
function votePop(text, kind) {
  document.querySelector('.vote-pop')?.remove();
  const el = document.createElement('div'); el.className = `vote-pop vp-${kind}`; el.setAttribute('aria-hidden', 'true'); el.textContent = text;
  document.body.appendChild(el); setTimeout(() => el.remove(), 1100);
  if (navigator.vibrate) try { navigator.vibrate(10); } catch {}
}
function lockPitch(pid) {
  const p = (S.trip.pitches?.items || []).find(x => x.id === pid); if (!p) return;
  if (p.small) return lockSmallPitch(p);
  const ds = [...(S.trip.destinations || [])];
  let d = ds.find(x => x.city.toLowerCase() === p.city.toLowerCase());
  if (!d) { d = { id: rid(6), city: p.city, code: p.code }; ds.push(d); }
  saveTrip(withLog({ destinations: ds, lockedDest: d.id, lockedDates: { start: p.start, end: p.end } }, { area: 'dest', text: `Locked in: ${p.city}, ${dayRange(p.start, p.end)}`, act: 'all', undo: { k: 'set', patch: { lockedDest: S.trip.lockedDest || null, lockedDates: S.trip.lockedDates || null } } })).then(ok => { if (!ok) return; celebrate(p.city, GRADS[hashStr(p.city) % GRADS.length][0], 'Locked in!'); flash(`Locked: ${p.city}, ${short(p.start)} – ${short(p.end)}. Time to book flights.`); });
}
// Once a place is locked, lead with it and the next step; the votes and other options
// are one tap away instead of competing for attention.
function matchTab() {
  if (!S.trip.lockedDest || S.demo) return matchBody();
  const ds = dest(), d = S.trip.lockedDates, p = (S.trip.pitches?.items || []).find(lockedOn);
  return `<section class="card stack decided-sum"><div class="row" style="justify-content:space-between"><span class="on-pill">Decided</span>${S.readOnly ? '' : '<button class="btn sm ghost" data-act="unlockDest">Change it</button>'}</div>
    <h2>${esc(ds?.city || '')}</h2><span class="small muted">${[d && dayRange(d.start, d.end), p && pitchShort(p, p.perPerson ? p.perPerson + ' each' : ''), p && p.tagline].filter(Boolean).map(esc).join(' · ')}</span></section>
  <details class="card more-opts"><summary>See the votes and other options</summary><div class="stack" style="margin-top:12px">${matchBody()}</div></details>`;
}
function matchBody() {
  const items = S.trip.pitches?.items || [], vs = active(), m = matchedPitch();
  const next = items.find(x => !swipeOf(x.id, S.uid));
  const pitchCard = p => { const [c1, c2] = GRADS[hashStr(p.city) % GRADS.length], mark = p.small ? '' : p.code || p.city.slice(0, 3).toUpperCase();
    return `<article class="pitch" id="pitch" data-key="pitch-${esc(p.id)}" data-pid="${esc(p.id)}">
      <span class="stamp yes" id="stamp-yes">I'D GO</span><span class="stamp no" id="stamp-no">PASS</span><span class="stamp meh">COULD WORK</span>
      <div class="pitch-top" style="background:linear-gradient(135deg,${c1},${c2})">
        ${mark ? `<span class="p-mark" aria-hidden="true">${esc(mark)}</span>` : ''}
        <div class="p-top-row"><span class="p-count">${items.indexOf(p) + 1} of ${items.length}</span>${+p.vibeMatch ? `<span class="p-vibe">${Math.round(+p.vibeMatch)}% your vibe</span>` : ''}</div>
        <h2>${esc(p.small ? p.title : p.city)}</h2>${p.small && p.where ? `<span class="p-where">${esc(p.where)}</span>` : ''}
        <span class="p-tag">${esc(p.tagline)}</span>
      </div>
      <div class="pitch-body">
        <div class="facts"><div><span class="label">${p.small ? 'When' : 'Dates'}</span><b>${p.small ? fmt(p.start) + (p.time ? ' · ' + t12(p.time) : '') : short(p.start) + ' → ' + short(p.end)}</b></div>${(pp => `<div class="${pp.split ? '' : pp.missing ? 'p-total p-na' : 'p-total'}"><span class="label">${pp.label}</span><b>${esc(pp.main)}</b>${pp.split ? '' : `<span class="small muted">${esc(pp.each)}</span>`}</div></div>${pp.split ? '' : `<span class="small pay-who">${esc(pp.who)}</span>`}`)(pitchPay(p))}
        <p class="p-why">${esc(p.why)}</p>
        ${fitChips(p)}
        ${arr(p.highlights).length || p.weather ? `<details class="p-more"><summary class="small">See details</summary>${p.weather ? `<p class="small" style="margin:6px 0 0"><b>Weather:</b> ${esc(p.weather)}</p>` : ''}${arr(p.highlights).length ? `<ul style="margin:6px 0 0;padding-left:18px">${arr(p.highlights).map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</details>` : ''}
      </div>
    </article>`; };
  // how far the crew is: every person's swipe on every pitch
  const total = items.length * vs.length, done = items.reduce((n, p) => n + vs.filter(x => swipeOf(p.id, x.id)).length, 0), left = items.filter(p => !swipeOf(p.id, S.uid)).length;
  const progress = items.length && vs.length ? `<div class="vprog">
      <div class="vprog-top"><span><b>${done}/${total}</b> swipes in</span><span class="small ${left ? 'muted' : 'vp-done'}">${left ? `${left} left for you` : done === total ? 'Everyone’s swiped ✓' : 'You’re done ✓'}</span></div>
      <div class="setup-bar ${done === total ? 'full' : ''}" role="progressbar" aria-label="Swipes in" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${Math.round(done / total * 100)}%"></i></div>
      <div class="vprog-crew">${vs.map(x => { const fin = items.every(p => swipeOf(p.id, x.id)); return `<span class="vp-av ${fin ? 'fin' : ''}" style="background:${colorFor(x.id)}" title="${esc(x.nick || 'Someone')}${fin ? ': all swiped' : ''}">${esc((x.nick || '?')[0].toUpperCase())}${fin ? '<i aria-hidden="true">✓</i>' : ''}</span>`; }).join('')}</div>
    </div>` : '';
  // your vote on a pitch, changeable any time: pass, could work, yes
  const voteSeg = p => { const mine = swipeOf(p.id, S.uid);
    return `<div class="vseg" role="group" aria-label="Your vote on ${esc(pName(p))}">${[[-1, '✕', 'Pass'], [WORKABLE, '≈', 'Could work'], [1, '♥', 'Yes']].map(([v, ic, l]) => `<button class="vs-opt v${v === 1 ? 'y' : v === -1 ? 'n' : 'm'} ${mine === v ? 'on' : ''}" data-swipe="${esc(p.id)}|${v}" aria-pressed="${mine === v}" aria-label="${l}" title="${l}">${ic}</button>`).join('')}</div>`; };
  const more = `${steerField()}${S.demo ? '' : ruleLine()}${(() => { const c = S.crews.find(x => x.id === S.trip.crewId); return c && !S.demo ? dnaCard(c, true) : ''; })()}<span class="small muted">Not feeling them? Add your own picks below.</span>`;
  return `${S.sample === null ? whereTab() : ''}<section class="card stack vote-head">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div class="stack" style="gap:2px"><h2>${isSmall() ? 'Plan Match' : 'Trip Match'}</h2><span class="small muted">Swipe on ${isSmall() ? 'plans' : 'trips'} picked for the crew. Everyone says yes to the same one? It’s a match.</span></div>
      ${S.sample !== null ? `<button class="btn ${items.length ? '' : 'primary chunky'}" data-act="genPitches" ${S.busy.pitch ? 'disabled' : ''}>${S.busy.pitch ? '<i class="spin"></i>Pitching…' : items.length ? 'New pitches' : isSmall() ? 'Pitch us some plans' : 'Pitch us some trips'}</button>` : ''}</div>
    ${progress}
    ${items.length ? `<details class="m-more" data-key="m-more"><summary class="small">Steer the pitches · how the vote works</summary><div class="stack" style="gap:12px;margin-top:10px">${more}</div></details>` : more}
  </section>
  ${runoffCard()}
  ${m ? `<section class="match" data-key="match-${esc(m.id)}"><span class="m-confetti" aria-hidden="true">${'<i></i>'.repeat(10)}</span><span class="label" style="color:rgba(255,255,255,.85)">Everyone swiped yes</span><h1 style="color:#fff">It’s a match!</h1>
      <p style="font-size:17px">${esc(m.city)} · ${dayRange(m.start, m.end)}${m.time ? ' · ' + t12(m.time) : ''} · ${esc(pitchShort(m, m.perPerson))}</p>
      <div class="m-crew">${avStack(vs, 8)}</div>
      <div>${S.trip.lockedDest && dest()?.city === m.city && S.trip.lockedDates?.start === m.start ? `<span class="on-pill" style="background:#fff;color:#151A33">Locked in</span>` : `<button class="btn chunky m-lock" data-lockpitch="${esc(m.id)}">Lock it in</button>`}</div></section>` : ''}
  ${!items.length && S.sample === null ? ''
  : !items.length ? `<div class="empty"><b>No pitches yet.</b><span>The more the crew fills in (${size() === 'trip' ? 'home airports, ' : size() === 'weekend' ? 'where everyone’s coming from, ' : ''}budgets, free days, the vibe quiz), the better the pitches get.</span></div>`
  : next ? `<section class="stack deck" style="align-items:center">${pitchCard(next)}
      <div class="vote-row"><button class="swipe-btn no" data-swipe="${esc(next.id)}|-1" aria-label="Pass"><span aria-hidden="true">✕</span><b>Pass</b></button><button class="swipe-btn meh" data-swipe="${esc(next.id)}|0.5" aria-label="Could work"><span aria-hidden="true">≈</span><b>Could work</b></button><button class="swipe-btn yes" data-swipe="${esc(next.id)}|1" aria-label="I'd go"><span aria-hidden="true">♥</span><b>I’d go</b></button></div>
      <span class="small muted">Or swipe the card: right if you’re in, left to pass.</span></section>`
  : !m && active().length >= 2 ? settleCard(items) : `<div class="empty"><b>You’ve swiped them all.</b><span>Pick one from the scoreboard below and lock it in.</span></div>`}
  ${items.length ? `<section class="card scoreboard"><h3 style="margin-bottom:6px">Scoreboard</h3>
    ${[...items].sort((a, b) => fitScore(b) - fitScore(a)).map(p => {
      const yes = vs.filter(x => swipeOf(p.id, x.id) === 1), waiting = vs.filter(x => !swipeOf(p.id, x.id)), mine = swipeOf(p.id, S.uid), n = Math.max(1, vs.length);
      return `<div class="linkrow sb-row ${lockedOn(p) ? 'is-locked' : ''}"><div class="sb-main"><b>${esc(p.city)}</b> <span class="small muted">${p.start === p.end ? short(p.start) : short(p.start) + ' – ' + short(p.end)} · ${esc(pitchShort(p, p.perPerson))}</span>
        <div class="vbar" aria-hidden="true"><i class="y" style="width:${yes.length / n * 100}%"></i><i class="m" style="width:${workableOf(p) / n * 100}%"></i></div>
        <div class="small muted">${yes.length} yes · ${workableOf(p)} could work${waiting.length ? ` · waiting on ${waiting.map(x => esc(x.nick || 'Someone')).join(', ')}` : ''}</div>${fitChips(p)}${lockedOn(p) ? '' : ruleChip('pitch', p.id)}</div>
        <div class="sb-side">${mine && !S.readOnly ? voteSeg(p) : ''}${lockedOn(p) ? '<span class="pill lvl-confirmed">Locked</span>' : S.readOnly ? '' : `<button class="btn sm chunky ${yes.length && !S.trip.lockedDest ? 'primary' : ''}" data-lockpitch="${esc(p.id)}">Lock it in</button>`}</div></div>`; }).join('')}
  </section>` : ''}
  ${S.sample === null ? '' : whereTab()}`;
}
function bindSwipe() {
  const el = document.getElementById('pitch'); if (!el || el._swipe) return; el._swipe = true;
  let x0 = null, dx = 0;
  const yes = document.getElementById('stamp-yes'), no = document.getElementById('stamp-no');
  el.addEventListener('pointerdown', e => { if (e.button || e.target.closest('summary,details')) return; x0 = e.clientX; dx = 0; el.classList.add('dragging'); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (x0 === null) return; dx = e.clientX - x0; el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; yes.style.opacity = Math.max(0, Math.min(1, dx / 100)); no.style.opacity = Math.max(0, Math.min(1, -dx / 100)); });
  const end = () => {
    if (x0 === null) return; x0 = null; el.classList.remove('dragging');
    if (Math.abs(dx) > 100) { el.style.transform = `translateX(${dx > 0 ? 600 : -600}px) rotate(${dx > 0 ? 30 : -30}deg)`; const pid = el.dataset.pid; setTimeout(() => swipe(pid, dx > 0 ? 1 : -1), 180); }
    else { el.style.transform = ''; yes.style.opacity = 0; no.style.opacity = 0; }
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

