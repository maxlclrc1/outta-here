/* ---------- home screen + trip creation ---------- */
/* ---------- book: flights ---------- */
function skyscanner(from, d, ds) { const y = s => s.slice(2).replace(/-/g, ''); return `https://www.skyscanner.com/transport/flights/${from.toLowerCase()}/${ds.code.toLowerCase()}/${y(d.start)}/${y(d.end)}/`; }
function flightsTab() {
  const d = dates(), ds = dest(); if (!d || !ds) return needDestDates('Flight search');
  const tk = tickets(), b = budgetCap(), nights = Math.max(1, nightsOf(d));
  const deals = S.trip.deals && S.trip.deals.city === ds.city && S.trip.deals.start === d.start ? S.trip.deals.data : null;
  const est = {}; for (const f of deals?.flights || []) est[String(f.from || '').toLowerCase()] = f;
  const groups = [...new Map(active().filter(m => m.home).map(m => [m.home.trim().toLowerCase(), m.home.trim()])).entries()];
  const noHome = active().filter(m => !m.home);
  const to = ds.code ? ds.code.toUpperCase() : ds.city;
  return `<section class="book-hero"><span class="label" style="color:inherit">Flights</span><h1>To ${esc(ds.city)}</h1>
      <div class="facts" style="color:inherit"><div><span class="label" style="color:inherit;opacity:.8">Dates</span><b>${short(d.start)} → ${short(d.end)}</b></div><div><span class="label" style="color:inherit;opacity:.8">Booked</span><b>${tk.have.length}/${tk.goal}</b></div>${b ? `<div><span class="label" style="color:inherit;opacity:.8">Flight budget</span><b>~${money(b.cap * .4)}</b></div>` : ''}</div>
      ${S.sample !== null ? `<div><button class="btn" data-act="deals" ${S.busy.deals ? 'disabled' : ''}>${S.busy.deals ? '<i class="spin"></i>Checking prices…' : deals ? 'Re-check typical prices' : 'Check typical prices with AI'}</button></div>` : ''}</section>
  ${groups.map(([key, home]) => { const who = active().filter(m => (m.home || '').trim().toLowerCase() === key), e = est[key] || Object.values(est).find(f => key.includes(String(f.from || '').toLowerCase().slice(0, 3)));
    const code = isCode(home) ? home.toUpperCase() : home;
    return `<section class="card fl-route ${who.some(m => m.id === S.uid) ? 'mine' : ''}">
      <div class="route-top"><span class="code" style="font-size:clamp(30px,8vw,44px)">${esc(code)}</span><span class="plane">✈</span><span class="code" style="font-size:clamp(30px,8vw,44px);color:var(--accent)">${esc(to)}</span>
        ${e ? `<span class="price">${esc(e.roundTrip)}<small>typical round trip</small></span>` : ''}</div>
      ${e?.tip ? `<p class="small">${esc(e.tip)}</p>` : ''}
      <div class="row" style="gap:6px">${who.map(m => `<span class="chip" style="cursor:default">${esc(m.nick || 'Someone')} ${tk.tk[m.id] ? '<b style="color:var(--good)">✓ booked</b>' : '<span class="muted">not booked</span>'}</span>`).join('')}</div>
      <div class="row" style="gap:6px"><a class="btn primary sm" href="${esc(gFlights(home, d, ds))}" target="_blank" rel="noopener">Google Flights</a>
        ${isCode(home) && isCode(ds.code) ? `<a class="btn sm" href="${esc(kayak(home.trim(), d, ds))}" target="_blank" rel="noopener">Kayak</a><a class="btn sm" href="${esc(skyscanner(home.trim(), d, ds))}" target="_blank" rel="noopener">Skyscanner</a>` : ''}
        ${who.some(m => m.id === S.uid) && !tk.tk[S.uid] ? `<button class="btn sm ghost" data-tab="tickets">I booked it</button>` : ''}</div>
    </section>`; }).join('')}
  ${noHome.length ? `<section class="card row" style="justify-content:space-between"><span class="small"><b>${noHome.map(m => esc(m.nick || 'Someone')).join(', ')}</b> ${noHome.length === 1 ? 'hasn’t' : 'haven’t'} said where they fly from.</span><button class="btn sm" data-tab="crew">Add home airport</button></section>` : ''}
  ${!ds.code ? `<p class="small muted">Add ${esc(ds.city)}’s airport code in Plan › Where to get Kayak and Skyscanner links.</p>` : ''}
  ${b ? `<section class="card stack"><h3>The budget play</h3><p class="small muted">The tightest budget in the crew is around <b>${b.label}</b>. A good split that works for everyone:</p>
    <div class="split"><div><span class="label">Flights</span><b>${money(b.cap * .4)}</b></div><div><span class="label">Stay</span><b>${money(b.cap * .35)}</b><span class="small muted">${money(b.cap * .35 / nights)}/night each</span></div><div><span class="label">Food & fun</span><b>${money(b.cap * .25)}</b><span class="small muted">${money(b.cap * .25 / nights)}/day</span></div></div></section>` : ''}
  ${deals ? `<section class="card stack"><h3>What the whole trip will cost</h3>${dealsBody(deals, b ? b.cap : 0)}</section>` : ''}`;
}

/* ---------- book: stays ---------- */
function findStays() {
  const n = active().length, b = budgetCap(), nights = Math.max(1, nightsOf(dates()));
  const prompt = `You're finding places for a group to stay.
${context()}
Stay budget: about ${b ? money(b.cap * .35) + ' per person for the whole stay (' + money(b.cap * .35 / nights) + ' per person per night)' : 'moderate'}.

Give 6 options for ${n} people: 3–4 specific real hotels that are well known and currently operating, and 2–3 vacation rental options described generically (for example "4-bedroom Airbnb-style house in Wynwood", not a specific listing). Work out how many rooms or beds the group needs. Prices are typical ranges, not live quotes.
Reply with only JSON: {"items":[{"name":"","kind":"hotel|rental|hostel","area":"neighborhood","sleeps":"e.g. 3 rooms, 2 queens each","perNight":"$X–Y per night for the group","perPerson":"$X–Y per person total","why":"one sentence on why it fits this group","pros":["2-3 short pros"],"lat":0,"lng":0}]}
lat/lng: your best estimate of the location.`;
  askAI('stays', prompt, data => {
    const items = (Array.isArray(data?.items) ? data.items : []).filter(x => x && x.name).slice(0, 8).map(x => ({
      id: rid(6), name: String(x.name).slice(0, 80), kind: ['hotel', 'rental', 'hostel'].includes(x.kind) ? x.kind : 'hotel', area: String(x.area || '').slice(0, 60),
      sleeps: String(x.sleeps || '').slice(0, 60), perNight: String(x.perNight || '').slice(0, 40), perPerson: String(x.perPerson || '').slice(0, 40),
      why: String(x.why || '').slice(0, 240), pros: arr(x.pros).slice(0, 3).map(p => String(p).slice(0, 50)), lat: +x.lat || null, lng: +x.lng || null }));
    if (!items.length) { flash('No stays came back. Try again.'); return; }
    return saveTrip({ stays: { city: dest()?.city || '', items, at: Date.now() } });
  });
}
function stayLinks(s, ds, d, n) {
  const q = encodeURIComponent(`${s.name} ${ds.city}`);
  if (s.kind === 'rental') return `<a class="btn sm primary" href="https://www.airbnb.com/s/${encodeURIComponent((s.area ? s.area + ', ' : '') + ds.city)}/homes?checkin=${d.start}&checkout=${d.end}&adults=${n}" target="_blank" rel="noopener">Airbnb</a><a class="btn sm" href="https://www.vrbo.com/search?destination=${encodeURIComponent((s.area ? s.area + ', ' : '') + ds.city)}&startDate=${d.start}&endDate=${d.end}&adults=${n}" target="_blank" rel="noopener">Vrbo</a>`;
  return `<a class="btn sm primary" href="https://www.google.com/travel/search?q=${q}" target="_blank" rel="noopener">Check prices</a><a class="btn sm" href="https://www.booking.com/searchresults.html?ss=${q}&checkin=${d.start}&checkout=${d.end}&group_adults=${n}&no_rooms=${Math.max(1, Math.ceil(n / 2))}" target="_blank" rel="noopener">Booking.com</a>`;
}
function staysTab() {
  const d = dates(), ds = dest(); if (!d || !ds) return needDestDates('Stay ideas');
  const n = Math.max(1, active().length), nights = Math.max(1, nightsOf(d)), b = budgetCap(), st = S.trip.stay;
  const opts = S.trip.stays && S.trip.stays.city === ds.city ? S.trip.stays.items : [];
  const ranked = opts.map((s, i) => ({ s, i, sc: score(rkey('st' + s.name)) })).sort((a, b2) => b2.sc.net - a.sc.net || a.i - b2.i);
  const perNightGroup = b ? b.cap * .35 * n / nights : 0;
  return `<section class="book-hero" style="--hc1:#0E9F6E;--hc2:#1098AD"><span class="label" style="color:inherit">Stay</span><h1>${st ? esc(st.name) : 'Where we’re sleeping'}</h1>
      <div class="facts" style="color:inherit"><div><span class="label" style="color:inherit;opacity:.8">Group</span><b>${n} people</b></div><div><span class="label" style="color:inherit;opacity:.8">Nights</span><b>${nights}</b></div>${b ? `<div><span class="label" style="color:inherit;opacity:.8">Budget / night</span><b>~${money(perNightGroup)} total</b></div>` : ''}</div>
      ${S.sample !== null ? `<div><button class="btn" data-act="findStays" ${S.busy.stays ? 'disabled' : ''}>${S.busy.stays ? '<i class="spin"></i>Finding stays…' : opts.length ? 'Find more options' : 'Find stays for us'}</button></div>` : ''}</section>
  ${needsCard('stays')}
  ${st ? `<section class="card stack locked-stay"><div class="row" style="justify-content:space-between"><span class="on-pill">Our stay</span><button class="btn sm ghost" data-act="unlockStay">Change</button></div>
      <h2>${esc(st.name)}</h2><span class="small muted">${esc([st.area, st.sleeps, st.perNight].filter(Boolean).join(' · '))}</span>
      ${+st.total ? `<b class="mono">${esc(stayPriceText(st))}</b>` : ''}
      <div class="row" style="gap:6px">${safeUrl(st.url) ? `<a class="btn sm primary" href="${esc(safeUrl(st.url))}" target="_blank" rel="noopener noreferrer">Open listing</a>` : stayLinks(st, ds, d, n)}<a class="btn sm" href="${maps(st.name, ds.city)}" target="_blank" rel="noopener">Map</a><button class="btn sm ghost" data-tab="map">Crew map</button></div>
      ${stayBookedBox(st)}</section>` : ''}
  ${ownStays().length ? `<section class="stack"><h3>Found by the crew</h3><div class="grid2">${ownStays().map(s => ownStayCard(s, ds, d, n)).join('')}</div></section>` : ''}
  ${ownStayForm()}
  ${opts.length ? `<section class="grid2">${ranked.map(({ s, i }) => `<article class="card stay">
      <div class="stay-top" style="--sc:${s.kind === 'rental' ? '#0E9F6E' : s.kind === 'hostel' ? '#E8590C' : '#3B5BDB'}"><span class="label" style="color:#fff">${s.kind === 'rental' ? 'Airbnb-style rental' : s.kind}</span><h3 style="color:#fff">${esc(s.name)}</h3><span style="color:rgba(255,255,255,.85)" class="small">${esc(s.area)}</span></div>
      <div class="stack" style="gap:8px;padding:14px 16px 16px">
        <div class="row" style="justify-content:space-between;align-items:baseline"><b class="mono">${esc(s.perNight)}</b><span class="small muted">${esc(s.perPerson)}</span></div>
        ${s.sleeps ? `<span class="small muted">Sleeps: ${esc(s.sleeps)}</span>` : ''}
        <p class="small">${esc(s.why)}</p>
        ${arr(s.pros).length ? `<div class="row" style="gap:4px">${arr(s.pros).map(p => `<span class="chip" style="cursor:default">${esc(p)}</span>`).join('')}</div>` : ''}
        <div class="row" style="gap:6px">${voteBtns(rkey('st' + s.name))}</div>
        <div class="row" style="gap:6px">${stayLinks(s, ds, d, n)}${st?.name !== s.name ? `<button class="btn sm ghost" data-lockstay="${i}">Lock as our stay</button>` : ''}</div>
      </div></article>`).join('')}</section>
    <p class="small muted">AI suggestions with typical prices. Live prices are on the booking sites.</p>`
  : !st && !ownStays().length ? `<div class="empty"><b>No options yet.</b><span>Let the AI find hotels and Airbnb-style rentals that fit ${n} people and the group budget, add a place you found, or search yourself below.</span></div>` : ''}
  <section class="card"><h3 style="margin-bottom:6px">Search everything yourself</h3>
    <div class="linkrow"><div><b>Airbnb for ${n}</b><div class="small muted">${b ? 'Under ' + money(perNightGroup) + '/night for the whole place' : 'Whole place for the group'}</div></div><a class="btn sm" href="${esc(airbnb(ds, d, n, perNightGroup))}" target="_blank" rel="noopener">Search</a></div>
    <div class="linkrow"><div><b>Booking.com</b><div class="small muted">${Math.ceil(n / 2)} rooms, cheapest first</div></div><a class="btn sm" href="${esc(booking(ds, d, n))}" target="_blank" rel="noopener">Search</a></div>
    <div class="linkrow"><div><b>Google Hotels</b><div class="small muted">Compare prices across sites</div></div><a class="btn sm" href="${esc(gHotels(ds, d))}" target="_blank" rel="noopener">Search</a></div>
  </section>`;
}
function ticketsTab() { return booking_time() || tickets().have.length ? ticketsSection() + arrivalsSection() : ticketsSection(); }

/* ---------- maps ---------- */
const kmBetween = (a, b) => { const R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lng - a.lng) * Math.PI / 180; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const KCOL = { stay: '#E9A514', nightlife: '#D41C78', food: '#0E9F6E', activity: '#3B5BDB', meet: '#151A33', lost: '#E5484D', plan: '#7048E8' };
function mapPoints() {
  const pts = [], seen = new Set(), push = p => { if (!p || !isFinite(p.lat) || !isFinite(p.lng) || !p.lat) return; const k = p.name.toLowerCase(); if (seen.has(k)) return; seen.add(k); pts.push(p); };
  const st = S.trip.stay; if (st && st.lat) push({ key: 'stay', name: st.name, lat: st.lat, lng: st.lng, kind: 'stay' });
  const geo = S.trip.geo || {};
  if (S.trip.meet?.text) { const g = geo[rkey(S.trip.meet.text)]; if (g) push({ key: 'meet', name: S.trip.meet.text, lat: g.lat, lng: g.lng, kind: 'meet' }); }
  // a family trip's or offsite's picks: meals as food, a bar or lounge as an evening (shown as “Evenings”), the rest as plans
  const calm = planKind().spots, calmPin = s => ({ food: 'food', chill: 'nightlife' })[calm.add(s).kind] || 'activity';
  for (const s of S.trip.spots?.items || []) push({ key: rkey('sp' + s.name), name: s.name, lat: s.lat, lng: s.lng, kind: calm ? calmPin(s) : /food/.test(s.type || '') ? 'food' : /activity|museum|park|tour|beach/.test(s.type || '') ? 'activity' : 'nightlife' });
  for (const i of visItems()) { if (i.hidden) continue; const g = geo[rkey(i.title)]; if (g) push({ key: rkey('it' + i.id), name: i.title, lat: g.lat, lng: g.lng, kind: i.kind === 'food' ? 'food' : i.kind === 'nightlife' ? 'nightlife' : 'activity' }); }
  for (const [k, g] of Object.entries(geo)) push({ key: k, name: g.name, lat: g.lat, lng: g.lng, kind: g.kind || 'plan' });
  return pts;
}
let mapW = 0;
window.addEventListener('resize', () => { clearTimeout(mapW); mapW = setTimeout(() => { if (document.querySelector('.map')) render(); }, 150); });
function lostAt() { return active().filter(m => m.lost && !m.lost.found && Date.now() - m.lost.at < 6 * 36e5); }
function mapView(height) {
  const pts = mapPoints(); if (!pts.length) return '';
  const lost = lostAt();
  // draw in roughly real pixels so labels stay the same size on a phone and a laptop
  const W = Math.round(Math.max(300, Math.min(840, (app.clientWidth || 600) - 34))), H = Math.round(Math.min(W * .72, height || 440)), P = 40;
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  let minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lngs), maxLo = Math.max(...lngs);
  const mid = (minLa + maxLa) / 2, kx = Math.cos(mid * Math.PI / 180);
  let spanX = (maxLo - minLo) * kx || .01, spanY = (maxLa - minLa) || .01;
  const sc = Math.min((W - 2 * P) / spanX, (H - 2 * P) / spanY);
  const ox = (W - spanX * sc) / 2, oy = (H - spanY * sc) / 2;
  const X = lng => ox + (lng - minLo) * kx * sc, Y = lat => oy + (maxLa - lat) * sc;
  const kmPerPx = 111.32 / sc, barKm = [0.25, 0.5, 1, 2, 5, 10, 20, 50].find(v => v / kmPerPx > 70) || 50, barPx = barKm / kmPerPx;
  const sel = pts.find(p => p.key === S.pinSel), stay = pts.find(p => p.kind === 'stay');
  const lostPts = new Map(); for (const m of lost) { const p = pts.find(q => q.name.toLowerCase() === (m.lost.where || '').toLowerCase()); if (p) lostPts.set(p.key, m); }
  return `<div class="map-wrap"><svg viewBox="0 0 ${W} ${H}" class="map" role="img" aria-label="Crew map with ${pts.length} places">
    <defs><pattern id="mgrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="var(--map-line)" stroke-width="1"/></pattern></defs>
    <rect width="${W}" height="${H}" fill="var(--map-bg)"/><rect width="${W}" height="${H}" fill="url(#mgrid)"/>
    ${stay ? pts.filter(p => p !== stay).map(p => `<line x1="${X(stay.lng)}" y1="${Y(stay.lat)}" x2="${X(p.lng)}" y2="${Y(p.lat)}" stroke="var(--map-route)" stroke-width="1.5" stroke-dasharray="4 5"/>`).join('') : ''}
    ${(() => {
      // place labels above, then below, each pin; skip a label that would collide (it shows when the pin is tapped)
      const placed = [], order = [...pts].sort((p, q) => (q === sel) - (p === sel) || (q.kind === 'stay') - (p.kind === 'stay') || lostPts.has(q.key) - lostPts.has(p.key));
      const hit = r => placed.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
      const lab = new Map();
      for (const p of pts) placed.push({ x: X(p.lng) - 12, y: Y(p.lat) - 12, w: 24, h: 24 });
      placed.push({ x: 8, y: H - 40, w: barPx + 74, h: 34 }, { x: W - 54, y: 10, w: 44, h: 44 }); // scale bar, compass
      for (const p of order) {
        const lm = lostPts.get(p.key), cut = W < 500 ? 20 : 30, txt = lm ? (lm.nick || 'Someone') + ' is here' : p.name.length > cut ? p.name.slice(0, cut - 1) + '…' : p.name;
        const w = txt.length * 7.4 + 10, x = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, X(p.lng))), y = Y(p.lat);
        for (const dy of [-17, 28]) { const r = { x: x - w / 2, y: y + dy - 13, w, h: 17 }; if (!hit(r)) { placed.push(r); lab.set(p, { txt, y: y + dy, x }); break; } }
      }
      return pts.map(p => { const x = X(p.lng), y = Y(p.lat), on = sel === p, lm = lostPts.get(p.key), l = lab.get(p);
        return `<g class="pin" data-pin="${esc(p.key)}" tabindex="0" role="button" aria-label="${esc(p.name)}">
          <circle cx="${x}" cy="${y}" r="18" fill="transparent"/>
          ${lm ? `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${KCOL.lost}" stroke-width="3" class="pulse-ring"/>` : ''}
          <circle cx="${x}" cy="${y}" r="${on ? 14 : 10}" fill="${KCOL[p.kind] || KCOL.plan}" stroke="var(--surface)" stroke-width="3"/>
          ${l ? `<text x="${l.x}" y="${l.y}" text-anchor="middle" class="pin-label">${esc(l.txt)}</text>` : ''}</g>`; }).join(''); })()}
    <g transform="translate(${W - 34},34)"><circle r="16" fill="var(--surface)" stroke="var(--map-line)"/><path d="M0 -10 L5 4 L0 1 L-5 4Z" fill="var(--ink)"/><text y="-19" text-anchor="middle" class="pin-label" style="font-size:10px">N</text></g>
    <g transform="translate(18,${H - 20})"><rect x="-6" y="-16" width="${barPx + 70}" height="26" rx="6" fill="var(--surface)" opacity=".85"/><line x1="0" y1="0" x2="${barPx}" y2="0" stroke="var(--ink)" stroke-width="3"/><text x="${barPx + 8}" y="4" class="pin-label" style="text-anchor:start;font-size:11px">${barKm < 1 ? barKm * 1000 + ' m' : barKm + ' km'}</text></g>
  </svg>
  <div class="legend" style="margin-top:8px">${[['stay', 'Stay'], ['nightlife', planKind().evening || 'Nightlife'], ['food', 'Food'], ['activity', 'Plans'], ['meet', 'Meet-up']].filter(([k]) => pts.some(p => p.kind === k)).map(([k, l]) => `<span><i class="sw" style="background:${KCOL[k]}"></i>${l}</span>`).join('')}</div>
  ${sel ? (() => { const ds = dest(), km = stay && sel !== stay ? kmBetween(stay, sel) : null;
    return `<div class="card stack pin-card"><div class="row" style="justify-content:space-between"><b>${esc(sel.name)}</b><span class="kind">${esc(sel.kind)}</span></div>
      ${km !== null ? `<span class="small muted">${(km * 0.621).toFixed(1)} mi from ${esc(stay.name)} · about ${Math.max(1, Math.round(km / 5 * 60))} min walk</span>` : ''}
      <div class="row" style="gap:6px"><a class="btn sm primary" href="https://www.google.com/maps/dir/?api=1${stay && sel !== stay ? `&origin=${stay.lat},${stay.lng}` : ''}&destination=${sel.lat},${sel.lng}&travelmode=walking" target="_blank" rel="noopener">Directions</a><a class="btn sm" href="${maps(sel.name, ds?.city || '')}" target="_blank" rel="noopener">Open in Maps</a></div></div>`; })() : ''}
  </div>`;
}
function pinPlaces() {
  const ds = dest(); if (!ds) return;
  const geo = S.trip.geo || {}, names = [];
  for (const i of visItems()) if (!i.hidden && !geo[rkey(i.title)] && i.kind !== 'travel') names.push(i.title);
  if (S.trip.meet?.text && !geo[rkey(S.trip.meet.text)]) names.push(S.trip.meet.text);
  const st = S.trip.stay; const needStay = st && !st.lat;
  if (needStay) names.push(st.name);
  for (const s of S.trip.spots?.items || []) if (!s.lat) names.push(s.name);
  const uniq = [...new Set(names)].slice(0, 30);
  if (!uniq.length) { flash('Everything with a real place is already on the map.'); return; }
  const prompt = `Estimate map coordinates for these places in or near ${ds.city}. Some are itinerary titles: find the actual place they name. If a title is not a specific place (like "Pool day" or "Sleep in"), skip it.
Places:
${uniq.map((n, i) => `${i + 1}. ${n}`).join('\n')}
Reply with only JSON: {"places":[{"name":"exactly as given","lat":0,"lng":0,"kind":"nightlife|food|activity|stay"}]}`;
  askAI('pin', prompt, data => {
    const out = {}; let stayFix = null; const spotFix = {};
    for (const p of data?.places || []) {
      if (!p || !p.name || !isFinite(+p.lat) || !isFinite(+p.lng) || !+p.lat) continue;
      const g = { name: String(p.name).slice(0, 80), lat: +p.lat, lng: +p.lng, kind: ['nightlife', 'food', 'activity', 'stay'].includes(p.kind) ? p.kind : 'plan' };
      if (st && p.name === st.name) stayFix = g; else if ((S.trip.spots?.items || []).some(s => s.name === p.name)) spotFix[p.name] = g; else out[rkey(p.name)] = g;
    }
    const patch = { geo: out };
    if (stayFix) patch.stay = { lat: stayFix.lat, lng: stayFix.lng };
    if (Object.keys(spotFix).length) patch.spots = { ...S.trip.spots, items: S.trip.spots.items.map(s => spotFix[s.name] ? { ...s, lat: spotFix[s.name].lat, lng: spotFix[s.name].lng } : s) };
    return saveTrip(patch);
  });
}
function mapTab() {
  const ds = dest(); if (!ds) return needDestDates('The crew map', 'dest');
  const pts = mapPoints();
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px"><h2>Crew map</h2><span class="small muted">${isSmall() ? 'Your spots and plans' + (S.trip.city ? ' in ' + esc(S.trip.city) : '') : 'Your stay, spots and plans in ' + esc(ds.city)}. Tap a pin for walking time and directions.</span></div>
      <div class="row" style="gap:6px"><button class="btn sm lost-btn" data-act="lostOpen">I’m lost</button>${S.sample !== null ? `<button class="btn sm" data-act="pinPlaces" ${S.busy.pin ? 'disabled' : ''}>${S.busy.pin ? '<i class="spin"></i>Pinning…' : 'Pin everything'}</button>` : ''}</div></div>
    ${pts.length ? mapView() : `<div class="empty"><b>Nothing on the map yet.</b><span>${isSmall() ? 'Get spot picks or build the plan' : `Lock a stay, get ${planKind().spots ? 'picks' : 'nightlife picks'} or build the itinerary`}, then tap “Pin everything”.</span></div>`}
    <p class="small muted">Pins are approximate. Use Directions for turn-by-turn.</p>
  </section>
  ${lostAt().length ? `<section class="card stack"><h3>Lost right now</h3>${lostAt().map(m => `<div class="nudge"><b>${esc(m.nick || 'Someone')}</b><span class="small">near ${esc(m.lost.where)} · ${ago(m.lost.at)}</span></div>`).join('')}</section>` : ''}`;
}

