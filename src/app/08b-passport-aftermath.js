/* ---------- plan passport ---------- */
// Once a plan is decided, its pass becomes a ticket: destination, dates, crew, status and
// countdown, with a stamp for each milestone the crew actually hits.
const MILESTONES = [['decided', 'Decided'], ['everyone', 'Everyone confirmed'], ['booked', 'Booked'], ['planned', 'Plan set'], ['happening', 'Happening'], ['memories', 'Memories']];
function milestonesNow() {
  const t = S.trip, sz = size(), ms = S.members.filter(m => m.status !== 'out'), d = t.lockedDates, st = stageOf(t, S.members);
  const goers = ms.filter(going);
  return {
    decided: !!(t.lockedDest && d),
    everyone: goers.length >= 2 && ms.every(m => ['confirmed', 'booked'].includes(m.status)),
    booked: sz === 'trip' ? tickets().on : sz === 'weekend' ? !!t.stay : !!(t.lockedDest && d) && taskList().filter(x => /book|ticket|table|reserv/i.test(x.title)).every(x => x.done),
    planned: (t.itinerary || []).length > 0 && taskList().every(x => x.done),
    happening: st === 'happening' || st === 'memories',
    memories: st === 'memories',
  };
}
// Milestone dates are written once, the first time each one is reached.
function syncMilestones() {
  if (!S.trip || S.demo || !S.db || !S.membersIn || S.readOnly) return null;
  const now = milestonesNow(), have = S.trip.miles || {}, patch = {};
  for (const [k] of MILESTONES) { if (now[k] && !have[k]) patch[k] = Date.now(); if (!now[k] && have[k]) patch[k] = null; }
  return Object.keys(patch).length ? patch : null;
}
function passport() {
  const t = S.trip, ds = dest(), d = dates(), sz = SIZES[size()], cd = countdown(), st = stageOf(t, S.members), now = milestonesNow(), miles = t.miles || {};
  const goers = S.members.filter(going), small = isSmall();
  const code = ds ? (ds.code ? ds.code.toUpperCase() : ds.city.toUpperCase().slice(0, 14)) : '—';
  const big = st === 'memories' ? 'DONE' : st === 'happening' ? 'NOW' : cd ? String(cd.n ?? 0) : '—';
  return `<section class="passport" style="--pc:${sz.color}">
    <div class="pp-band"><span>OUTTA/HERE · PLAN PASSPORT</span><span class="mono">${esc(S.tid || 'DEMO').toUpperCase()}</span></div>
    <div class="pp-body">
      <div class="pp-main">
        <span class="pp-k">${esc(t.name)}</span>
        <div class="pp-code">${esc(code)}</div>
        ${ds && ds.code ? `<span class="pp-city">${esc(ds.city)}</span>` : ''}
        <div class="pp-facts">
          <div><span>${small ? 'When' : 'Dates'}</span><b>${d ? (small ? fmt(d.start) : `${short(d.start)} – ${short(d.end)}`) : 'TBD'}</b></div>
          <div><span>${small ? 'Time' : 'Nights'}</span><b>${small ? (t.time ? t12(t.time) : 'TBD') : nightsOf(d)}</b></div>
          <div><span>Crew</span><b>${goers.length}</b></div>
        </div>
        <div class="avs">${goers.slice(0, 10).map(m => `<span class="av-sm" title="${esc(m.nick || 'Someone')}" style="background:${colorFor(m.id)}">${esc((m.nick || '?')[0].toUpperCase())}</span>`).join('')}</div>
      </div>
      <div class="pp-count"><b>${big}</b>${st === 'happening' ? '' : `<span>${st === 'memories' ? 'that’s a wrap' : cd && cd.n === 0 ? 'today' : cd && cd.n === 1 ? 'day to go' : 'days to go'}</span>`}<span class="stage-pill s-${st}">${STAGE_LABEL[st]}</span></div>
    </div>
    <div class="pp-stamps">${MILESTONES.map(([k, l], i) => `<div class="pp-stamp ${now[k] ? 'on' : ''}" style="--r:${[-8, 5, -4, 7, -6, 4][i]}deg"><b>${l}</b>${now[k] && miles[k] ? `<span>${short(iso(new Date(miles[k])))}</span>` : ''}</div>`).join('')}</div>
    <div class="pp-act"><button class="btn sm" data-act="passportImg">Share passport</button><button class="btn sm" data-act="card">Make story card</button>${size() !== 'trip' ? `<button class="btn sm ghost" data-act="growPlan">Make it a ${size() === 'weekend' ? 'trip' : 'weekend or trip'}</button>` : ''}</div>
    ${S.cardUrl ? `<div class="pp-media"><div class="row" style="align-items:flex-end;gap:14px"><img class="cardimg" src="${S.cardUrl}" alt="Story card for ${esc(t.name)}">
      <div class="stack" style="gap:8px">${S.downloads ? `<button class="btn primary sm" data-act="saveCard">Save image</button>` : `<span class="small muted">Press and hold the image to save it.</span>`}<button class="btn sm ghost" data-act="closeCard">Close</button></div></div></div>` : ''}
    ${S.img?.kind === 'passport' ? imgPanel() : ''}
  </section>`;
}
async function makePassportImg() {
  const t = S.trip, ds = dest(), d = dates(), st = stageOf(t, S.members), now = milestonesNow(), goers = S.members.filter(going), cd = countdown();
  try { await Promise.all(['900 120px Anybody', '700 40px Figtree', '600 30px "JetBrains Mono"'].map(f => document.fonts.load(f))); } catch {}
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const pc = SIZES[size()].color;
  x.fillStyle = '#0C0F21'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#F7F3EA'; x.beginPath(); x.roundRect(60, 60, W - 120, H - 120, 40); x.fill();
  x.fillStyle = pc; x.beginPath(); x.roundRect(60, 60, W - 120, 120, [40, 40, 0, 0]); x.fill();
  x.fillStyle = '#fff'; x.font = CF(600, 30, 'mono'); x.fillText('OUTTA/HERE · PLAN PASSPORT', 110, 132);
  x.fillStyle = '#151A33'; cfit(x, t.name.toUpperCase(), W - 240, 34, 600, 'mono'); x.fillText(t.name.toUpperCase(), 110, 260);
  const code = ds ? (ds.code ? ds.code.toUpperCase() : ds.city.toUpperCase()) : 'TBD';
  x.fillStyle = pc; cfit(x, code, W - 240, 230, 900); x.fillText(code, 110, 480);
  if (ds && ds.code) { x.fillStyle = '#151A33'; cfit(x, ds.city, W - 240, 52, 700, 'body'); x.fillText(ds.city, 110, 550); }
  const facts = [[isSmall() ? 'WHEN' : 'DATES', d ? (isSmall() ? fmt(d.start) : `${short(d.start)} – ${short(d.end)}`) : 'TBD'], ['CREW', String(goers.length)], ['STATUS', STAGE_LABEL[st].toUpperCase()]];
  facts.forEach(([k, v], i) => { const fx = 110 + i * 300; x.fillStyle = '#6B7194'; x.font = CF(600, 26, 'mono'); x.fillText(k, fx, 650); x.fillStyle = '#151A33'; cfit(x, v, 280, 40, 700, 'body'); x.fillText(v, fx, 700); });
  x.fillStyle = '#151A33'; cfit(x, goers.map(m => m.nick || 'Someone').join(' · '), W - 240, 34, 600, 'body'); x.fillText(goers.map(m => m.nick || 'Someone').join(' · '), 110, 790);
  x.strokeStyle = '#D5D8E6'; x.lineWidth = 4; x.setLineDash([16, 14]); x.beginPath(); x.moveTo(110, 850); x.lineTo(W - 110, 850); x.stroke(); x.setLineDash([]);
  MILESTONES.forEach(([k, l], i) => {
    const cx = 200 + (i % 3) * 340, cy = 960 + Math.floor(i / 3) * 190, on = now[k];
    x.save(); x.translate(cx, cy); x.rotate(([-8, 5, -4, 7, -6, 4][i]) * Math.PI / 180);
    x.strokeStyle = on ? pc : '#D5D8E6'; x.lineWidth = 6; x.beginPath(); x.roundRect(-140, -55, 280, 110, 18); x.stroke();
    x.fillStyle = on ? pc : '#B8BCCD'; x.textAlign = 'center'; cfit(x, l.toUpperCase(), 250, 30, 900); x.fillText(l.toUpperCase(), 0, 12); x.restore(); x.textAlign = 'left';
  });
  if (cd && st !== 'memories' && st !== 'happening') { x.fillStyle = '#fff'; x.font = CF(600, 30, 'mono'); x.fillText(`${cd.n} DAYS TO GO`, 110, H - 20); }
  setImg('passport', c, slug(t.name) + '-passport.png');
}

/* ---------- the aftermath ---------- */
// The best night is what the crew voted for; if nobody voted, it's the day with the
// most going on (check-ins, posts and photos). Every number says where it came from.
const localDay = at => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function nightStats() {
  const d = dates(); if (!d) return [];
  return span(d.start, d.end).map(day => {
    const checkins = S.members.reduce((n, m) => n + (m.checkins || []).filter(c => localDay(c.at) === day || (localDay(c.at) === add(day, 1) && new Date(c.at).getHours() < 6)).length, 0);
    const posts = S.feed.filter(f => f.by !== 'ai' && f.at && localDay(f.at) === day).length;
    const photos = S.photos.filter(p => p.at && localDay(p.at) === day).length;
    const hang = Object.values((S.trip.hangover || {})[add(day, 1)] || {}), hangAvg = hang.length ? hang.reduce((a, b) => a + b, 0) / hang.length : 0;
    return { day, checkins, posts, photos, hangAvg, score: checkins + posts + photos * 2 + hangAvg * 2 };
  });
}
function bestNight() {
  const votes = Object.values(S.trip.nightVotes || {}).filter(Boolean), stats = nightStats();
  if (votes.length) {
    const c = {}; for (const v of votes) c[v] = (c[v] || 0) + 1;
    const [day, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return { day, why: `Voted by ${n} of ${active().length}`, st: stats.find(s => s.day === day) };
  }
  const top = [...stats].sort((a, b) => b.score - a.score)[0];
  if (!top || !top.score) return null;
  return { day: top.day, why: 'The busiest day by check-ins, posts and photos', st: top };
}
function nightVoteCard() {
  const d = dates(); if (!d || isSmall()) return '';
  const mine = (S.trip.nightVotes || {})[S.uid], days = span(d.start, d.end), c = {};
  for (const v of Object.values(S.trip.nightVotes || {})) if (v) c[v] = (c[v] || 0) + 1;
  return `<section class="card stack"><div class="row" style="justify-content:space-between"><h3>Best night</h3><span class="small muted">Goes in the Wrapped</span></div>
    <div class="row" style="gap:6px">${days.map(day => `<button class="chip ${mine === day ? 'on' : ''}" data-nightvote="${day}">${fmt(day, { weekday: 'short', month: 'short', day: 'numeric' })}${c[day] ? ` · ${c[day]}` : ''}</button>`).join('')}</div></section>`;
}

