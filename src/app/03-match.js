/* ---------- group fit: evidence, not a score ---------- */
// For any option: does it fit people's budgets, can they make the dates, and how did
// they rate it. Shown as plain facts so the trade-offs are visible.
const WORKABLE = 0.5;
const workableOf = p => active().filter(m => swipeOf(p.id, m.id) === WORKABLE).length;
const rated = p => active().filter(m => swipeOf(p.id, m.id));
const okForAll = p => { const vs = active(); return vs.length >= 2 && vs.every(m => swipeOf(p.id, m.id) >= WORKABLE); };
const fitScore = p => yesOf(p) * 2 + workableOf(p);
function groupFit(p) {
  const vs = active(), out = [], r = moneyRange(p.perPerson);
  const withB = vs.filter(m => +m.budget > 0);
  if (r && withB.length) {
    const over = withB.filter(m => +m.budget < r[0]), stretch = withB.filter(m => +m.budget >= r[0] && +m.budget < r[1]);
    out.push(over.length ? { ok: false, text: `Over budget for ${budgetWho(over)}` } : stretch.length ? { ok: 'meh', text: `A stretch for ${budgetWho(stretch)}` } : { ok: true, text: withB.length === vs.length ? `Fits ${vs.length}/${vs.length} budgets` : `Fits every budget set (${withB.length} of ${vs.length})` });
  } else out.push({ ok: 'meh', text: withB.length ? 'No price to check yet' : 'Nobody set a budget yet' });
  const days = span(p.start, p.end), can = vs.filter(m => fitOf(m, days)), cant = vs.filter(m => !fitOf(m, days)), picked = vs.filter(m => (m.days || []).length);
  if (picked.length) out.push(cant.filter(m => (m.days || []).length).length ? { ok: false, text: `${listNames(cant.filter(m => (m.days || []).length))} can’t make ${p.start === p.end ? 'that day' : 'those dates'}` } : { ok: true, text: `Free: ${can.length}/${vs.length}` });
  const rs = rated(p);
  if (rs.length) {
    const no = rs.filter(m => swipeOf(p.id, m.id) === -1);
    out.push(okForAll(p) ? { ok: true, text: yesOf(p) === vs.length ? 'Everyone said yes' : 'Everyone rated it at least workable' } : no.length ? { ok: false, text: `${listNames(no)} passed` } : { ok: 'meh', text: `${yesOf(p)} yes · ${workableOf(p)} could work` });
  }
  return out;
}
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
  const prompt = `You're pitching ${size() === 'weekend' ? 'weekend getaways (1–2 nights, ideally a few hours’ drive or a short flight away)' : 'group trips'} to a friend group. They will each swipe yes or no on every pitch, like a dating app, so make each pitch exciting, specific and honest.
Trip type: ${mode().label}. ${mode().ai}
Crew: ${active().length} people ${size() === 'trip' ? 'flying' : 'coming'} from ${homes().join(', ') || 'unknown cities'}.
Per-person budget cap (all-in, flights included): ${b ? money(b.cap) : 'not set, assume moderate'}.
Trip length: ${nightsSet(S.trip)} nights.
${blend() ? 'Crew vibe quiz:\n' + blendText() : 'Vibe: fun, social, nightlife'}
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
        vibeMatch: Math.max(0, Math.min(100, Math.round(+p.vibeMatch || 0))), highlights: (p.highlights || []).slice(0, 3).map(h => String(h).slice(0, 80)), weather: String(p.weather || '').slice(0, 60) };
    });
    if (!items.length) { flash('No pitches came back. Try again.'); return; }
    return saveTrip({ pitches: { items, at: Date.now() }, pitchHistory: nextHistory(), runoff: null });
  });
}
async function swipe(pid, v) {
  await saveTrip({ swipes: { [pid]: { [S.uid]: v } } });
  const m = matchedPitch();
  if (m && v === 1 && m.id === pid) flash(`It’s a match! Everyone’s down for ${m.city}.`);
}
function lockPitch(pid) {
  const p = (S.trip.pitches?.items || []).find(x => x.id === pid); if (!p) return;
  if (p.small) return lockSmallPitch(p);
  const ds = [...(S.trip.destinations || [])];
  let d = ds.find(x => x.city.toLowerCase() === p.city.toLowerCase());
  if (!d) { d = { id: rid(6), city: p.city, code: p.code }; ds.push(d); }
  saveTrip({ destinations: ds, lockedDest: d.id, lockedDates: { start: p.start, end: p.end } });
  flash(`Locked: ${p.city}, ${short(p.start)} – ${short(p.end)}. Time to book flights.`);
}
function matchTab() {
  const items = S.trip.pitches?.items || [], vs = active(), m = matchedPitch();
  const next = items.find(x => !swipeOf(x.id, S.uid));
  const pitchCard = p => { const [c1, c2] = GRADS[hashStr(p.city) % GRADS.length];
    return `<article class="pitch" id="pitch" data-key="pitch-${esc(p.id)}" data-pid="${esc(p.id)}">
      <span class="stamp yes" id="stamp-yes">I'D GO</span><span class="stamp no" id="stamp-no">PASS</span>
      <div class="pitch-top" style="background:linear-gradient(135deg,${c1},${c2})">
        <span class="label" style="color:rgba(255,255,255,.8)">${items.indexOf(p) + 1} of ${items.length}</span>
        ${p.small ? `<h2 style="color:#fff;font-size:34px">${esc(p.title)}</h2>${p.where ? `<span style="color:rgba(255,255,255,.85)">${esc(p.where)}</span>` : ''}` : `<span class="code" style="color:#fff">${esc(p.code || p.city.slice(0, 3).toUpperCase())}</span>
        <h2 style="color:#fff">${esc(p.city)}</h2>`}
        <span style="color:#fff;font-weight:600">${esc(p.tagline)}</span>
      </div>
      <div class="pitch-body">
        <div class="facts"><div><span class="label">${p.small ? 'When' : 'Dates'}</span><b>${p.small ? fmt(p.start) + (p.time ? ' · ' + t12(p.time) : '') : short(p.start) + ' → ' + short(p.end)}</b></div><div><span class="label">Per person</span><b>${esc(p.perPerson || '?')}</b></div>${p.weather ? `<div><span class="label">Weather</span><b style="font-family:var(--f-body)">${esc(p.weather)}</b></div>` : ''}</div>
        ${fitChips(p)}
        <p>${esc(p.why)}</p>
        ${p.highlights.length ? `<ul style="margin:0;padding-left:18px">${p.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      </div>
    </article>`; };
  return `${S.sample === null ? whereTab() : ''}<section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px"><h2>${isSmall() ? 'Plan Match' : 'Trip Match'}</h2><span class="small muted">The AI pitches ${isSmall() ? 'whole plans' : 'complete trips'} that fit everyone’s budget, free days and vibe. Everyone swipes. If you all say yes to the same one, it’s a match. Not feeling them? Add your own picks below.</span></div>
      ${S.sample !== null ? `<button class="btn ${items.length ? '' : 'primary'}" data-act="genPitches" ${S.busy.pitch ? 'disabled' : ''}>${S.busy.pitch ? '<i class="spin"></i>Pitching…' : items.length ? 'New pitches' : isSmall() ? 'Pitch us some plans' : 'Pitch us some trips'}</button>` : ''}</div>
    ${steerField()}
    ${S.demo ? '' : ruleLine()}
    ${(() => { const c = S.crews.find(x => x.id === S.trip.crewId); return c && !S.demo ? dnaCard(c, true) : ''; })()}
  </section>
  ${runoffCard()}
  ${m ? `<section class="match"><span class="label" style="color:rgba(255,255,255,.85)">Everyone swiped yes</span><h1 style="color:#fff">It’s a match!</h1>
      <p style="font-size:17px">${esc(m.city)} · ${dayRange(m.start, m.end)}${m.time ? ' · ' + t12(m.time) : ''} · ${esc(m.perPerson)}</p>
      <div>${S.trip.lockedDest && dest()?.city === m.city && S.trip.lockedDates?.start === m.start ? `<span class="on-pill" style="background:#fff;color:#151A33">Locked in</span>` : `<button class="btn" data-lockpitch="${esc(m.id)}">Lock it in</button>`}</div></section>` : ''}
  ${!items.length && S.sample === null ? ''
  : !items.length ? `<div class="empty"><b>No pitches yet.</b><span>The more the crew fills in (${size() === 'trip' ? 'home airports, ' : size() === 'weekend' ? 'where everyone’s coming from, ' : ''}budgets, free days, the vibe quiz), the better the pitches get.</span></div>`
  : next ? `<section class="stack" style="align-items:center">${pitchCard(next)}
      <div class="row" style="justify-content:center;gap:22px"><button class="swipe-btn no" data-swipe="${esc(next.id)}|-1" aria-label="Pass">✕</button><button class="swipe-btn meh" data-swipe="${esc(next.id)}|0.5" aria-label="Could work">≈</button><button class="swipe-btn yes" data-swipe="${esc(next.id)}|1" aria-label="I'd go">♥</button></div>
      <span class="small muted">Swipe right if you’re in, left to pass. ≈ means it could work.</span></section>`
  : !m && active().length >= 2 ? settleCard(items) : `<div class="empty"><b>You’ve swiped them all.</b><span>Pick one from the scoreboard below and lock it in.</span></div>`}
  ${items.length ? `<section class="card"><h3 style="margin-bottom:6px">Scoreboard</h3>
    ${[...items].sort((a, b) => fitScore(b) - fitScore(a)).map(p => {
      const yes = vs.filter(x => swipeOf(p.id, x.id) === 1), waiting = vs.filter(x => !swipeOf(p.id, x.id)), mine = swipeOf(p.id, S.uid);
      return `<div class="linkrow"><div style="min-width:0"><b>${esc(p.city)}</b> <span class="small muted">${p.start === p.end ? short(p.start) : short(p.start) + ' – ' + short(p.end)} · ${esc(p.perPerson)}</span>
        <div class="small muted">${yes.length} yes · ${workableOf(p)} could work${waiting.length ? ` · waiting on ${waiting.map(x => esc(x.nick || 'Someone')).join(', ')}` : ''}</div>${fitChips(p)}${lockedOn(p) ? '' : ruleChip('pitch', p.id)}</div>
        <div class="row" style="gap:6px">${mine ? `<button class="chip ${mine === 1 ? 'on' : ''}" data-swipe="${esc(p.id)}|${mine === 1 ? -1 : 1}" title="Tap to change">${mine === 1 ? '♥ Yes' : mine === WORKABLE ? '≈ Could work' : '✕ Pass'}</button>` : ''}<div class="bar" style="width:80px"><i style="width:${yes.length / Math.max(1, vs.length) * 100}%"></i></div>${lockedOn(p) ? '<span class="pill lvl-confirmed">Locked</span>' : S.readOnly ? '' : `<button class="btn sm ${yes.length && !S.trip.lockedDest ? 'primary' : ''}" data-lockpitch="${esc(p.id)}">Lock it in</button>`}</div></div>`; }).join('')}
  </section>` : ''}
  ${S.sample === null ? '' : whereTab()}`;
}
function bindSwipe() {
  const el = document.getElementById('pitch'); if (!el || el._swipe) return; el._swipe = true;
  let x0 = null, dx = 0;
  const yes = document.getElementById('stamp-yes'), no = document.getElementById('stamp-no');
  el.addEventListener('pointerdown', e => { if (e.button) return; x0 = e.clientX; dx = 0; el.classList.add('dragging'); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (x0 === null) return; dx = e.clientX - x0; el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; yes.style.opacity = Math.max(0, Math.min(1, dx / 100)); no.style.opacity = Math.max(0, Math.min(1, -dx / 100)); });
  const end = () => {
    if (x0 === null) return; x0 = null; el.classList.remove('dragging');
    if (Math.abs(dx) > 100) { el.style.transform = `translateX(${dx > 0 ? 600 : -600}px) rotate(${dx > 0 ? 30 : -30}deg)`; const pid = el.dataset.pid; setTimeout(() => swipe(pid, dx > 0 ? 1 : -1), 180); }
    else { el.style.transform = ''; yes.style.opacity = 0; no.style.opacity = 0; }
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

