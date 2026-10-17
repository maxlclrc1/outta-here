/* ---------- money: spend-o-meter + group pot ---------- */
function myShare() {
  let share = 0;
  for (const e of S.expenses) { let sp = (e.split || []).filter(Boolean); if (honoreeFree() && sp.length > 1) sp = sp.filter(id => id !== S.trip.honoree); if (sp.includes(S.uid)) share += e.amount / sp.length; }
  return share;
}
function meterTab() {
  const me = meDoc(), budget = +(me?.budget || 0), d = dates();
  const exp = honoreeFree() && isHonoree() ? 0 : myShare(), pot = S.pot.filter(p => p.kind === 'in' && p.by === S.uid).reduce((a, p) => a + p.amount, 0);
  const own = (S.mySpend || []).reduce((a, x) => a + (+x.amount || 0), 0), spent = exp + pot + own;
  const pct = budget ? spent / budget : 0, left = budget - spent;
  const daysLeft = d ? Math.max(1, span(TODAY > d.start ? TODAY : d.start, d.end).length) : 1;
  const state = !budget ? 'none' : pct >= 1 ? 'over' : pct >= .8 ? 'warn' : 'ok';
  const R = 70, C = 2 * Math.PI * R, arc = Math.min(1, pct) * C;
  return `<section class="card stack meter-card">
    <div class="row" style="justify-content:space-between"><h2>My spend</h2><span class="small muted">Only you see this page</span></div>
    ${isHonoree() && honoreeFree() ? `<div class="banner"><span><b>You’re covered.</b> As the ${esc(mode().honoree)}, your share of group costs is split across the crew.</span></div>` : ''}
    <div class="meter-row">
      <svg viewBox="0 0 180 180" width="170" height="170" class="ring" role="img" aria-label="${budget ? Math.round(pct * 100) + '% of budget spent' : 'No budget set'}">
        <circle cx="90" cy="90" r="${R}" fill="none" stroke="var(--line)" stroke-width="16"/>
        <circle cx="90" cy="90" r="${R}" fill="none" stroke="var(--meter-${state})" stroke-width="16" stroke-linecap="round" stroke-dasharray="${arc} ${C}" transform="rotate(-90 90 90)"/>
        <text x="90" y="86" text-anchor="middle" class="ring-big">${budget ? Math.round(pct * 100) + '%' : '—'}</text>
        <text x="90" y="110" text-anchor="middle" class="ring-small">${budget ? 'of ' + money(budget) : 'no budget'}</text></svg>
      <div class="stack" style="gap:6px;min-width:0">
        <span class="label">Spent so far</span><b class="tile-big">${money2(spent)}</b>${alsoMine(spent)}
        ${budget ? (left >= 0 ? `<span>${money2(left)} left · <b>${money(left / daysLeft)}/day</b> for ${daysLeft} day${daysLeft === 1 ? '' : 's'}</span>` : `<span style="color:var(--meter-over)"><b>${money2(-left)} over budget</b></span>`) : `<span class="small muted">Set your budget in Home › Crew to turn on the meter.</span>`}
        ${state === 'warn' ? `<span class="pill maybe" style="align-self:flex-start">Heads up: ${Math.round(pct * 100)}% used</span>` : state === 'over' ? `<span class="pill out" style="align-self:flex-start;color:var(--meter-over)">Over budget</span>` : ''}
      </div></div>
    <div><div class="linkrow"><span>Your share of group expenses</span><span class="mono">${money2(exp)}</span></div>
      ${HIDE_TABS[size()].includes('pot') ? '' : `<div class="linkrow"><span>Put in the group pot</span><span class="mono">${money2(pot)}</span></div>`}
      ${(S.mySpend || []).map(x => `<div class="linkrow"><span>${esc(x.note)}</span><span class="row" style="gap:6px"><span class="mono">${money2(+x.amount)}</span><button class="x" data-delspend="${esc(x.id)}" aria-label="Remove ${esc(x.note)}">×</button></span></div>`).join('')}</div>
    <form id="spendForm" class="row" style="gap:6px;align-items:flex-end">
      <label class="field" style="flex:2 1 160px"><span class="label">Log something you paid yourself</span><input id="sp-note" maxlength="50" required placeholder="${({ hangout: 'Cab home', day: 'Train tickets', weekend: 'Gas', trip: 'My flight' })[size()]}"></label>
      <label class="field" style="flex:0 1 110px"><span class="label">Amount</span><input id="sp-amt" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="248"></label>
      <button class="btn" type="submit">Add</button></form>
  </section>`;
}
async function saveMySpend(items) {
  S.mySpend = items; render();
  if (S.demo) return;
  const key = `oh_spend_${S.tid}`;
  if (S.db && S.realId) { try { await S.db.doc(`data/users/${S.realId}/spend-${S.tid}`).set({ items }); return; } catch {} }
  try { localStorage.setItem(key, JSON.stringify(items)); } catch {}
}
function potTab() {
  const ins = S.pot.filter(p => p.kind === 'in'), outs = S.pot.filter(p => p.kind === 'out');
  const tin = ins.reduce((a, p) => a + p.amount, 0), tout = outs.reduce((a, p) => a + p.amount, 0), bal = tin - tout;
  const ms = active().filter(m => !(honoreeFree() && m.id === S.trip.honoree));
  const by = {}; for (const p of ins) by[p.by] = (by[p.by] || 0) + p.amount;
  const fair = Math.max(0, ...ms.map(m => by[m.id] || 0)); // everyone matches whoever put in the most
  const behind = ms.filter(m => (by[m.id] || 0) < fair - 0.5);
  const low = tin > 0 && (bal <= 0 || bal < tin * .25);
  const keeper = S.trip.potKeeper || S.trip.createdBy;
  const d = dates(), daysLeft = d ? Math.max(1, span(TODAY > d.start ? TODAY : d.start, d.end).length) : 1;
  const topUp = Math.max(10, Math.ceil(((tout / Math.max(1, d ? span(d.start, TODAY < d.end ? TODAY : d.end).length : 1)) * daysLeft - bal) / Math.max(1, ms.length) / 5) * 5);
  const hist = [...S.pot].sort((a, b) => (b.at || 0) - (a.at || 0));
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Group pot</h2><span class="small muted">For Ubers, groceries, drinks</span></div>
    <div class="pot-big ${low ? 'low' : ''}"><span class="label">In the pot</span><b>${money2(bal)}</b>${alsoMine(bal)}<span class="small muted">${money2(tin)} in · ${money2(tout)} spent</span>
      <div class="bigbar" style="margin-top:6px"><i style="width:${tin ? Math.max(0, bal / tin * 100) : 0}%;background:${low ? 'var(--meter-over)' : 'var(--good)'}"></i></div></div>
    ${low ? `<div class="lost-banner" style="background:color-mix(in oklab,var(--gold) 22%,var(--surface));color:var(--ink);border-color:var(--gold)"><div><b>The pot’s running low.</b><div class="small">Top up about ${money(topUp)} each to cover the rest of the ${planWord()}.</div></div><button class="btn sm" data-act="copyPot">Copy reminder</button></div>` : ''}
    <div class="row" style="gap:8px;align-items:center"><span class="small">Holding the pot:</span><select aria-label="Who holds the pot" id="pot-keeper" style="width:auto">${active().map(m => `<option value="${esc(m.id)}" ${keeper === m.id ? 'selected' : ''}>${esc(m.nick || 'Someone')}</option>`).join('')}</select></div>
    <div>${ms.map(m => `<div class="nudge"><b>${esc(m.nick || 'Someone')}</b><span class="row" style="gap:8px"><span class="mono small">${money2(by[m.id] || 0)}</span>${behind.includes(m) ? `<span class="pill maybe">${money2(fair - (by[m.id] || 0))} behind</span>` : '<span class="pill in">Even</span>'}</span></div>`).join('')}</div>
    ${S.copyText ? `<textarea aria-label="Text to copy" id="copybox" readonly>${esc(S.copyText)}</textarea>` : ''}
  </section>
  <section class="grid2">
    <form id="potIn" class="card stack"><h3>Chip in</h3>
      <div class="row" style="gap:6px;align-items:flex-end"><label class="field"><span class="label">Amount</span><input id="pi-amt" type="number" min="1" step="1" inputmode="decimal" required placeholder="50"></label>
      <label class="field"><span class="label">From</span><select id="pi-by">${active().map(m => `<option value="${esc(m.id)}" ${m.id === S.uid ? 'selected' : ''}>${esc(m.nick || 'Someone')}</option>`).join('')}</select></label></div>
      ${keeper !== S.uid ? `<div class="row" style="gap:6px">${payLinks(keeper, 50, S.trip.name + ' pot')}</div>` : ''}
      <div><button class="btn primary" type="submit">Add to pot</button></div></form>
    <form id="potOut" class="card stack"><h3>Spend from the pot</h3>
      <div class="row" style="gap:6px;align-items:flex-end"><label class="field" style="flex:2 1 140px"><span class="label">What</span><input id="po-note" maxlength="50" required placeholder="Uber XL to Wynwood"></label>
      <label class="field"><span class="label">Amount</span><input id="po-amt" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="38"></label></div>
      <div><button class="btn" type="submit">Log it</button></div></form>
  </section>
  ${hist.length ? `<section class="card"><h3 style="margin-bottom:6px">Pot history</h3>${hist.map(p => `<div class="linkrow"><div style="min-width:0"><b>${p.kind === 'in' ? esc(nameOf(p.by)) + ' chipped in' : esc(p.note || 'Spent')}</b><div class="small muted">${p.kind === 'out' ? 'logged by ' + esc(nameOf(p.by)) + ' · ' : ''}${ago(p.at)}</div></div>
    <span class="row" style="gap:6px"><span class="mono" style="color:${p.kind === 'in' ? 'var(--good)' : 'inherit'}">${p.kind === 'in' ? '+' : '−'}${money2(p.amount)}</span><button class="x" data-delpot="${esc(p.id)}" aria-label="Remove">×</button></span></div>`).join('')}</section>` : ''}`;
}

/* ---------- memories ---------- */
function awardsTab() {
  const rs = superResults(), d = dates(), over = d && TODAY > d.end;
  return `${nightVoteCard()}<section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px"><h2>${isSmall() ? 'Awards' : 'Trip awards'}</h2><span class="small muted">${over ? `The ${planWord()}’s over. Time to vote.` : `Voting is for after the ${planWord()}, but you can start now.`}</span></div>
      <button class="btn sm" data-act="awardsCard">Make awards card</button></div>
    ${S.img?.kind === 'awards' ? imgPanel() : ''}
    ${rs.map(r => `<div class="q"><div class="row" style="justify-content:space-between"><b>${esc(r.c)}</b>${r.winners.length ? `<span class="small">${r.winners.length > 1 ? 'Tie: ' : '♛ '}<b>${r.winners.map(id => esc(nameOf(id))).join(' & ')}</b> <span class="muted">(${r.cnt[r.winners[0]]} vote${r.cnt[r.winners[0]] === 1 ? '' : 's'})</span></span>` : '<span class="small muted">No votes yet</span>'}</div>
      <div class="row" style="gap:6px">${active().map(m => `<button class="chip ${r.mine === m.id ? 'on' : ''}" data-super="${r.key}|${esc(m.id)}">${esc(m.nick || 'Someone')}${r.cnt[m.id] ? ` <b class="mono">${r.cnt[m.id]}</b>` : ''}</button>`).join('')}</div></div>`).join('')}
  </section>`;
}
function photosTab() {
  const photos = [...S.photos].sort((a, b) => (a.at || 0) - (b.at || 0));
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Photo album</h2><span class="small muted">${photos.length} photo${photos.length === 1 ? '' : 's'}</span></div>
    ${S.assets && !S.demo ? `<label class="btn primary" style="align-self:flex-start;cursor:pointer">${S.busy.photos ? `<i class="spin"></i>Uploading ${esc(S.busy.photos)}…` : 'Add photos'}<input id="ph-files" type="file" accept="image/*" multiple hidden></label>`
      : `<p class="small muted">${S.demo ? 'Photo uploads work on real trips.' : IN_CLAUDE ? 'Photo uploads aren’t available for you here. They’ll work for everyone once the app has its own site.' : 'Photo uploads aren’t available right now.'}</p>`}
    ${photos.length ? `<div class="row" style="gap:6px"><button class="btn sm" data-show="0">▶ Play recap</button><button class="btn sm" data-act="collage">Make collage</button></div>
      ${S.img?.kind === 'collage' ? imgPanel() : ''}
      <div class="photos">${photos.map((p, i) => { const sc = score(rkey('ph' + p.id)); return `<div class="ph"><button class="ph-open" data-show="${i}" aria-label="Open photo ${i + 1}"><img src="/_blob/${esc(p.asset)}" alt="Photo by ${esc(nameOf(p.by))}" loading="lazy"></button>
        <button class="ph-like ${sc.mine > 0 ? 'on' : ''}" data-react="${rkey('ph' + p.id)}|1" aria-label="Like photo">♥ ${sc.up || ''}</button>${p.by === S.uid ? `<button class="x" data-delphoto="${esc(p.id)}" aria-label="Delete photo">×</button>` : ''}</div>`; }).join('')}</div>`
      : `<div class="empty"><span>Everyone’s photos land here. Like the best ones: the top photo makes it into your ${isSmall() ? 'recap' : 'Trip Wrapped'}.</span></div>`}
  </section>
  ${S.show !== null && photos[S.show] ? `<div class="show" role="dialog" aria-label="Trip recap">
    <img src="/_blob/${esc(photos[S.show].asset)}" alt="Photo ${S.show + 1} of ${photos.length}">
    <div class="ctl"><button class="btn sm" data-act="showPrev">‹ Prev</button><span class="chip">${S.show + 1}/${photos.length} · ${esc(nameOf(photos[S.show].by))}</span><button class="btn sm" data-act="showNext">Next ›</button><button class="btn sm" data-act="showClose">Close</button></div></div>` : ''}`;
}
function wrapData() {
  const d = dates(), ds = dest(), ms = active();
  const total = S.expenses.reduce((a, e) => a + (+e.amount || 0), 0) + S.pot.filter(p => p.kind === 'out').reduce((a, p) => a + p.amount, 0);
  const spots = (S.trip.spots?.items || []).map(s => ({ s, sc: score(rkey('sp' + s.name)) })).sort((a, b) => b.sc.net - a.sc.net);
  const owl = ms.map(m => ({ m, n: (m.checkins || []).filter(c => { const h = new Date(c.at).getHours(); return h >= 0 && h < 6; }).length, last: Math.max(0, ...(m.checkins || []).map(c => { const h = new Date(c.at).getHours(); return h < 6 ? h + 24 : h; })) })).sort((a, b) => b.n - a.n || b.last - a.last)[0];
  const photo = [...S.photos].map(p => ({ p, sc: score(rkey('ph' + p.id)).net })).sort((a, b) => b.sc - a.sc)[0];
  const pts = {}; for (const b of S.bucket) for (const id of b.doneBy || []) pts[id] = (pts[id] || 0) + (b.points || 1);
  const champ = Object.entries(pts).sort((a, b) => b[1] - a[1])[0];
  const msgs = {}; for (const f of S.feed) if (f.by !== 'ai') msgs[f.by] = (msgs[f.by] || 0) + 1;
  const hyper = Object.entries(msgs).sort((a, b) => b[1] - a[1])[0];
  const hs = {}; for (const day of Object.values(S.trip.hangover || {})) for (const [id, v] of Object.entries(day)) (hs[id] ||= []).push(v);
  const wrecked = Object.entries(hs).map(([id, v]) => [id, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1])[0];
  const awards = superResults().filter(r => r.winners.length).slice(0, 4);
  return { night: d ? bestNight() : null, d, ds, ms, total, topSpot: spots[0]?.s, owl: owl && owl.n ? owl : null, photo: photo?.p, champ, hyper, wrecked, awards, over: d && TODAY > d.end, b: blend() };
}
function wrappedTab() {
  const w = wrapData(); if (!w.d || !w.ds) return needDestDates(isSmall() ? 'The recap' : 'Your Trip Wrapped');
  const nights = nightsOf(w.d);
  const slides = [
    { c: ['#D41C78', '#7048E8'], k: `${w.over ? '' : 'So far · '}${esc(S.trip.name)}`, h: `Your ${esc(w.ds.city)} Wrapped`, s: `${nights ? nights + ' night' + (nights === 1 ? '' : 's') + ' · ' : ''}${w.ms.length} ${w.ms.length === 1 ? 'person' : 'people'} · ${dayRange(w.d.start, w.d.end)}` },
    { c: ['#0E9F6E', '#1098AD'], k: 'The damage', h: money(w.total), s: w.total ? `spent as a group. That’s about ${money(w.total / Math.max(1, w.ms.length))} each.` : 'No group spending logged. Suspicious.', src: `From ${S.expenses.length} logged expense${S.expenses.length === 1 ? '' : 's'}${S.pot.some(p => p.kind === 'out') ? ' and the group pot' : ''}` },
    w.night && { c: ['#151A33', '#7048E8'], k: 'Best night', h: esc(fmt(w.night.day, { weekday: 'long' })), s: esc([fmt(w.night.day, { month: 'long', day: 'numeric' }), w.night.st?.checkins && `${w.night.st.checkins} check-ins`, w.night.st?.posts && `${w.night.st.posts} posts`, w.night.st?.photos && `${w.night.st.photos} photos`].filter(Boolean).join(' · ')), src: esc(w.night.why) },
    w.topSpot && { c: ['#7048E8', '#3B5BDB'], k: 'Crew favorite spot', h: esc(w.topSpot.name), s: esc(w.topSpot.area || w.topSpot.type || ''), src: 'From the crew’s votes on the spot picks' },
    w.owl && { c: ['#151A33', '#3A0B2C'], k: 'Night owl', h: esc(w.owl.m.nick || 'Someone'), s: `${w.owl.n} check-in${w.owl.n === 1 ? '' : 's'} between midnight and 6am.`, src: 'From everyone’s check-ins' },
    w.photo && { c: ['#F08C00', '#D41C78'], k: `Photo of the ${isSmall() ? 'night' : 'trip'}`, h: '', img: w.photo.asset, s: `by ${esc(nameOf(w.photo.by))}`, src: 'Most upvoted in the album' },
    S.photos.length > 1 && { c: ['#3B5BDB', '#151A33'], k: 'The album', h: '', imgs: S.photos.filter(p => p.asset && p !== w.photo).slice(0, 4).map(p => p.asset), s: `${S.photos.length} photos from ${new Set(S.photos.map(p => p.by)).size} people`, src: 'From the shared album' },
    w.champ && { c: ['#F2B32B', '#E8590C'], k: 'Bucket list champion', h: esc(nameOf(w.champ[0])), s: `${w.champ[1]} points of chaos`, src: 'From the bucket list' },
    w.wrecked && { c: ['#5C6A7A', '#151A33'], k: 'Most wrecked', h: esc(nameOf(w.wrecked[0])), s: `average hangover score ${w.wrecked[1].toFixed(1)}/5`, src: 'From the morning hangover check-ins' },
    w.hyper && { c: ['#E64980', '#7048E8'], k: 'Hype machine', h: esc(nameOf(w.hyper[0])), s: `${w.hyper[1]} messages in the hype feed`, src: 'From the hype feed' },
    w.awards.length && { c: ['#FFC94D', '#E8590C'], k: 'The awards', h: '', list: w.awards.map(r => [r.c, r.winners.map(nameOf).join(' & ')]), src: 'Voted by the crew' },
    w.b && { c: ['#D41C78', '#151A33'], k: 'You were', h: esc(w.b.persona), s: 'Same time next year?', src: 'From everyone’s vibe quiz answers' },
    { c: ['#0C0F21', '#3A0B2C'], k: w.over ? 'That’s a wrap' : 'So far', h: esc(S.trip.name), s: [`${span(w.d.start, w.d.end).length} day${span(w.d.start, w.d.end).length === 1 ? '' : 's'}`, `${w.ms.length} ${w.ms.length === 1 ? 'person' : 'people'}`, S.photos.length && `${S.photos.length} photos`, S.feed.length && `${S.feed.filter(f => f.by !== 'ai').length} posts`].filter(Boolean).join(' · '), end: true },
  ].filter(Boolean);
  const i = Math.min(S.wrapI || 0, slides.length - 1), sl = slides[i];
  return `<section class="stack" style="align-items:center">
    <div class="wslide" style="background:linear-gradient(160deg,${sl.c[0]},${sl.c[1]})">
      <div class="wbars">${slides.map((_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div>
      <span class="label" style="color:rgba(255,255,255,.85)">${sl.k}</span>
      ${sl.img ? `<img src="/_blob/${esc(sl.img)}" alt="Top photo" class="wimg">` : ''}
      ${sl.h ? `<h1>${sl.h}</h1>` : ''}
      ${sl.list ? `<div class="stack" style="gap:10px">${sl.list.map(([c, n]) => `<div><span class="label" style="color:rgba(255,255,255,.75)">${esc(c)}</span><div class="wname">${esc(n)}</div></div>`).join('')}</div>` : ''}
      ${sl.imgs && sl.imgs.length ? `<div class="wgrid">${sl.imgs.map(a => `<img src="/_blob/${esc(a)}" alt="">`).join('')}</div>` : ''}
      ${sl.s ? `<p>${sl.s}</p>` : ''}
      ${sl.src ? `<span class="wsrc">${sl.src}</span>` : ''}
      ${sl.end && !S.demo ? `<div style="position:relative;z-index:2"><button class="btn" data-act="nextPlan">Plan the next one</button></div>` : ''}
      <button class="wnav left" data-act="wrapPrev" aria-label="Previous slide"></button><button class="wnav right" data-act="wrapNext" aria-label="Next slide"></button>
    </div>
    <div class="row" style="gap:8px;justify-content:center"><button class="btn sm" data-act="wrapPrev" ${i === 0 ? 'disabled' : ''}>‹ Back</button><span class="small muted mono">${i + 1}/${slides.length}</span><button class="btn sm primary" data-act="wrapNext" ${i === slides.length - 1 ? 'disabled' : ''}>Next ›</button></div>
    <button class="btn" data-act="wrappedCard">Make shareable Wrapped card</button>
    ${S.img?.kind === 'wrapped' ? imgPanel() : ''}
  </section>`;
}
async function makeWrappedCard() {
  const w = wrapData(); if (!w.d || !w.ds) return;
  try { await Promise.all(['900 120px Anybody', '700 40px Figtree', '600 30px "JetBrains Mono"'].map(f => document.fonts.load(f))); } catch {}
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#D41C78'); g.addColorStop(.55, '#7048E8'); g.addColorStop(1, '#151A33'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.8)'; x.font = CF(600, 32, 'mono'); x.fillText((S.trip.name || '').toUpperCase().slice(0, 40), 80, 150);
  x.fillStyle = '#fff'; cfit(x, w.ds.city.toUpperCase(), W - 160, 170, 900); x.fillText(w.ds.city.toUpperCase(), 80, 320); x.font = CF(900, 120); x.fillText('WRAPPED', 80, 450);
  const rows = [['DAMAGE', w.total ? money(w.total) : '—'], w.topSpot && ['FAVORITE SPOT', w.topSpot.name], w.owl && ['NIGHT OWL', w.owl.m.nick || 'Someone'], w.champ && ['BUCKET CHAMP', nameOf(w.champ[0])], w.wrecked && ['MOST WRECKED', nameOf(w.wrecked[0])], w.hyper && ['HYPE MACHINE', nameOf(w.hyper[0])], ...w.awards.slice(0, 2).map(r => [r.c.toUpperCase(), r.winners.map(nameOf).join(' & ')])].filter(Boolean).slice(0, 8);
  let y = 620;
  for (const [k, v] of rows) { x.fillStyle = '#FFC94D'; cfit(x, k, W - 160, 30, 600, 'mono'); x.fillText(k, 80, y); x.fillStyle = '#fff'; cfit(x, v, W - 160, 72, 900); x.fillText(v, 80, y + 80); y += 150; }
  if (w.b) { x.fillStyle = '#fff'; cfit(x, w.b.persona.toUpperCase(), W - 160, 46, 900); x.fillText(w.b.persona.toUpperCase(), 80, H - 200); }
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = CF(700, 38, 'body'); x.fillText('Planned on Outta Here', 80, H - 100);
  setImg('wrapped', c, slug(S.trip.name) + '-wrapped.png');
}

const SETTINGS_HTML = () => `  ${crewSection()}
  ${S.demo ? '' : accessCard()}
  <section class="card stack">
    <h3>Settings</h3>
    ${S.demo ? '' : `<label class="check-line"><input type="checkbox" id="mute-plan" ${isMuted(S.tid) ? 'checked' : ''}> Mute reminders for this ${planWord()}</label>`}
    ${S.confirm === 'delete' ? `<div class="banner"><span><b>Delete “${esc(S.trip.name)}” for everyone?</b> The crew, votes, expenses and packing list all go. This can’t be undone.</span><div class="row" style="gap:6px"><button class="btn sm danger-fill" data-act="doDelete">Delete ${planWord()}</button><button class="btn sm" data-act="cancelConfirm">Cancel</button></div></div>`
    : S.confirm === 'leave' ? `<div class="banner"><span><b>Leave this ${planWord()}?</b> ${size() === 'trip' ? 'Your days, votes and boarding pass are removed.' : 'Your days and votes are removed.'} It disappears from your plans.</span><div class="row" style="gap:6px"><button class="btn sm danger-fill" data-act="doLeave">Leave ${planWord()}</button><button class="btn sm" data-act="cancelConfirm">Cancel</button></div></div>`
    : `<div class="row" style="gap:8px">${meDoc() && !S.demo ? `<button class="btn sm danger" data-act="askLeave">Leave ${planWord()}</button>` : ''}${canDelete(S.trip) ? `<button class="btn sm danger" data-act="askDelete">Delete ${planWord()}</button>` : `<span class="small muted">Only organizers can delete it.</span>`}</div>`}
  </section>`;

/* ---------- live quick actions + mobile gestures ---------- */
function liveQuick() {
  const meet = S.trip.meet, myCi = meDoc()?.checkin;
  return `<section class="quick" aria-label="Quick actions">
    <button class="qa qa-lost" data-act="lostOpen"><b>I’m lost</b><span>Send the crew my spot</span></button>
    <button class="qa" data-act="ciJump"><b>Check in</b><span>${myCi ? 'You: ' + esc(myCi.text) : 'Where are you?'}</span></button>
    <button class="qa" data-act="meetJump"><b>Meet-up</b><span>${meet?.text ? esc(meet.text) + (meet.time ? ' · ' + esc(tShow(meet.time)) : '') : 'Not set yet'}</span></button>
    <button class="qa" data-tab="map"><b>Map</b><span>${mapPoints().length} places pinned</span></button>
  </section>`;
}
function jumpTo(sel) { const el = $(sel); if (!el) return; el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); setTimeout(() => el.focus({ preventScroll: true }), 300); }

