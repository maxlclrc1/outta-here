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
Reply with only JSON: {"items":[{"name":"","kind":"hotel|rental|hostel","area":"neighborhood","sleeps":"e.g. 3 rooms, 2 queens each","perNight":"$X–Y per night for the group","perPerson":"$X–Y per person total","why":"one sentence on why it fits this group","pros":["2-3 short pros"]}]}`;
  askAI('stays', prompt, data => {
    const items = (Array.isArray(data?.items) ? data.items : []).filter(x => x && x.name).slice(0, 8).map(x => ({
      id: rid(6), name: String(x.name).slice(0, 80), kind: ['hotel', 'rental', 'hostel'].includes(x.kind) ? x.kind : 'hotel', area: String(x.area || '').slice(0, 60),
      sleeps: String(x.sleeps || '').slice(0, 60), perNight: String(x.perNight || '').slice(0, 40), perPerson: String(x.perPerson || '').slice(0, 40),
      why: String(x.why || '').slice(0, 240), pros: arr(x.pros).slice(0, 3).map(p => String(p).slice(0, 50)) }));
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
      <div class="row" style="gap:6px">${safeUrl(st.url) ? `<a class="btn sm primary" href="${esc(safeUrl(st.url))}" target="_blank" rel="noopener noreferrer">Open listing</a>` : stayLinks(st, ds, d, n)}<a class="btn sm" href="${maps(st.name, ds.city)}" target="_blank" rel="noopener">Open in Maps</a></div>
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
