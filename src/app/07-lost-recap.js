/* ---------- I'm lost ---------- */
function lostBanner() {
  const ls = lostAt(); if (!ls.length) return '';
  return ls.map(m => `<div class="lost-banner" role="alert"><div style="min-width:0"><b>${m.id === S.uid ? 'You sent an SOS' : esc(m.nick || 'Someone') + ' is lost'}</b><div class="small">Near ${esc(m.lost.where)} · ${ago(m.lost.at)}</div></div>
    <div class="row" style="gap:6px"><a class="btn sm" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(m.lost.where + ' ' + (dest()?.city || ''))}&travelmode=walking" target="_blank" rel="noopener">Directions</a>
    <button class="btn sm" data-found="${esc(m.id)}">${m.id === S.uid ? 'I’m good now' : 'Found them'}</button></div></div>`).join('');
}
function lostSheet() {
  const places = [S.trip.stay?.name, S.trip.meet?.text, ...visItems().filter(i => i.date === (isLive() ? TODAY : dates()?.start) && !i.hidden && i.kind !== 'travel').map(i => i.title), ...(S.trip.spots?.items || []).slice(0, 6).map(s => s.name)].filter(Boolean);
  return `<div class="sheet-bg" data-act="lostClose"></div><div class="sheet" role="dialog" aria-label="I'm lost">
    <h2>Where are you?</h2><p class="small muted">The crew gets an alert with your spot and directions to you. Tap the closest place or type a landmark or cross street.</p>
    <div class="row" style="gap:6px">${[...new Set(places)].slice(0, 10).map(p => `<button class="chip" data-lostat="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    <form id="lostForm" class="row" style="gap:6px"><input id="lost-where" maxlength="80" placeholder="Collins Ave & 8th St" style="flex:1 1 200px"><button class="btn lost-btn" type="submit">Send SOS</button></form>
    <p class="small muted">Tip: also share your live location from Google Maps or Find My with the group chat.</p>
    <button class="btn sm ghost" data-act="lostClose">Cancel</button></div>`;
}
function sendLost(where) {
  where = String(where || '').trim().slice(0, 80); if (!where) return;
  S.lostOpen = false;
  const me = meDoc();
  saveMe({ lost: { where, at: Date.now() }, checkin: { text: 'Lost near ' + where, at: Date.now() }, checkins: [...(me?.checkins || []), { text: 'Lost near ' + where, at: Date.now() }].slice(-40) }, true);
  postFeed(`SOS: ${me?.nick || 'Someone'} is lost near ${where}. Check the map.`);
  flash('SOS sent. The crew can see where you are.');
}
function foundLost(uid) {
  if (uid === S.uid) return saveMe({ lost: null }, true);
  const m = S.members.find(x => x.id === uid); if (!m) return;
  m.lost = null; render();
  if (!S.demo && S.db) S.db.doc(`trips/${S.tid}/members/${uid}`).update({ lost: null }).catch(e => flash(writeErr(e)));
  postFeed(`Found ${m.nick || 'them'}. Crisis over.`);
}

/* ---------- hangover index + daily recap ---------- */
const HANG = ['Fresh', 'Fine', 'Rough', 'Wrecked', 'Dead'];
function hangoverCard(day) {
  const votes = (S.trip.hangover || {})[day] || {}, vals = Object.values(votes).filter(v => v > 0), avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, mine = votes[S.uid];
  const today = visItems().filter(i => i.date === day);
  return `<section class="card stack"><div class="row" style="justify-content:space-between"><h3>Hangover index</h3>${vals.length ? `<span class="hang-avg" style="--h:${avg}">${avg.toFixed(1)} · ${HANG[Math.round(avg) - 1]}</span>` : ''}</div>
    <span class="small muted">How are you feeling this morning?</span>
    <div class="row" style="gap:6px">${HANG.map((h, i) => `<button class="chip ${mine === i + 1 ? 'on' : ''}" data-hang="${i + 1}">${i + 1} · ${h}</button>`).join('')}</div>
    ${vals.length ? `<span class="small muted">${vals.length} voted: ${active().filter(m => votes[m.id]).map(m => `${esc(m.nick || 'Someone')} ${votes[m.id]}`).join(', ')}</span>` : ''}
    ${S.hangPlan ? `<div class="card stack" style="background:var(--bg)"><b>Easier plan for today</b>${S.hangPlan.note ? `<span class="small">${esc(S.hangPlan.note)}</span>` : ''}
        ${S.hangPlan.items.map(i => `<div class="tline"><span class="mono small">${esc(tShow(i.time))}</span><div><b>${esc(i.title)}</b>${i.note ? `<div class="small muted">${esc(i.note)}</div>` : ''}</div><span></span></div>`).join('')}
        <div class="row" style="gap:6px"><button class="btn sm primary" data-act="hangApply">Use this plan</button><button class="btn sm ghost" data-act="hangCancel">Keep the original</button></div></div>`
    : avg >= 3 && today.length && S.sample !== null ? `<div class="row" style="justify-content:space-between;gap:8px"><span class="small"><b>The crew is ${HANG[Math.round(avg) - 1].toLowerCase()}.</b> Want a gentler day?</span><button class="btn sm primary" data-act="hangPlan" ${S.busy.hang ? 'disabled' : ''}>${S.busy.hang ? '<i class="spin"></i>Rewriting…' : 'Make today easier'}</button></div>` : ''}
  </section>`;
}
function hangPlan(day) {
  const items = visItems().filter(i => i.date === day && !i.hidden).sort(byTime);
  const votes = Object.values((S.trip.hangover || {})[day] || {}), avg = votes.reduce((a, b) => a + b, 0) / Math.max(1, votes.length);
  const prompt = `A group on a trip is hungover. Hangover index ${avg.toFixed(1)} out of 5 (5 = dead).
${context()}
Today's plan (${day}):
${items.map(i => `${i.time || '?'} ${i.title}${i.note ? ' (' + i.note + ')' : ''}`).join('\n')}

Rewrite today so it's gentler: start later, add a recovery meal and chill time, swap exhausting things for easy ones, but keep the best evening plan if it's still realistic. Keep it fun.
Reply with only JSON: {"note":"one funny sentence about the state of the crew","items":[{"time":"HH:MM","title":"","kind":"food|activity|nightlife|chill","note":""}]}`;
  askAI('hang', prompt, data => {
    const its = (data?.items || []).filter(i => i && i.title).slice(0, 8).map(i => ({ time: String(i.time || '').slice(0, 5), title: String(i.title).slice(0, 120), kind: i.kind || 'chill', note: String(i.note || '').slice(0, 200) }));
    if (!its.length) { flash('No plan came back. Try again.'); return; }
    S.hangPlan = { day, note: String(data.note || '').slice(0, 200), items: its };
  });
}
function applyHang() {
  const p = S.hangPlan; if (!p) return;
  const keep = (S.trip.itinerary || []).filter(i => i.date !== p.day || i.secret);
  S.hangPlan = null;
  saveTrip({ itinerary: [...keep, ...p.items.map(i => ({ id: rid(6), date: p.day, ...i, ai: true }))] });
  flash('Today’s plan is updated.');
}
function recapCard(day) {
  const d = dates(); if (!d || day <= d.start) return '';
  const y = add(day, -1), r = (S.trip.recaps || {})[y];
  return `<section class="card stack recap-card"><span class="label">Yesterday’s recap · ${fmt(y)}</span>
    ${r ? `<h3>${esc(r.title)}</h3><p>${esc(r.text)}</p>` : `<p class="small muted">The AI writes a short, funny recap of yesterday from your check-ins, plans, bucket list and photos, and posts it to Hype.</p>`}
    ${S.sample !== null && !r ? `<div><button class="btn sm primary" data-act="writeRecap" data-day="${y}" ${S.busy.recap ? 'disabled' : ''}>${S.busy.recap ? '<i class="spin"></i>Writing…' : 'Write yesterday’s recap'}</button></div>` : ''}
  </section>`;
}
function writeRecap(y) {
  const inDay = at => at && new Date(at).toISOString().slice(0, 10) === y;
  const local = at => new Date(at).toTimeString().slice(0, 5);
  const checks = active().flatMap(m => (m.checkins || []).filter(c => inDay(c.at)).map(c => `${local(c.at)} ${m.nick}: ${c.text}`)).sort();
  const plans = (S.trip.itinerary || []).filter(i => i.date === y).map(i => `${i.time || ''} ${i.title}`);
  const bucket = S.bucket.flatMap(b => Object.entries(b.doneAt || {}).filter(([, at]) => inDay(at)).map(([id]) => `${nameOf(id)} did "${b.text}"`));
  const feed = S.feed.filter(f => inDay(f.at) && !f.secret && f.by !== 'ai').map(f => `${nameOf(f.by)}: ${f.text}`).slice(-20);
  const exp = S.expenses.filter(e => inDay(e.at)).map(e => `${e.title} $${e.amount}`);
  const pics = S.photos.filter(p => inDay(p.at)).length;
  const hang = Object.entries((S.trip.hangover || {})[y] || {}).map(([id, v]) => `${nameOf(id)} ${v}/5`);
  const prompt = `Write a short, funny recap of yesterday (${y}) for a group trip's chat. Light roast, PG-13, warm, specific to what actually happened. 3–5 sentences. Use people's names. Don't invent events beyond what's listed; you can be playful about gaps.
${context()}
Plans: ${plans.join('; ') || 'none'}
Check-ins: ${checks.join('; ') || 'none'}
Bucket list: ${bucket.join('; ') || 'nothing checked off'}
Chat: ${feed.join(' | ') || 'quiet'}
Spending: ${exp.join('; ') || 'none logged'}
Photos added: ${pics}
Morning hangover scores: ${hang.join(', ') || 'none'}
Reply with only JSON: {"title":"a punchy 3-6 word headline","text":"the recap"}`;
  askAI('recap', prompt, async data => {
    if (!data?.text) { flash('No recap came back. Try again.'); return; }
    const r = { title: String(data.title || 'Yesterday').slice(0, 80), text: String(data.text).slice(0, 900), at: Date.now() };
    await saveTrip({ recaps: { [y]: r } });
    putSub('feed', rid(10), { by: 'ai', kind: 'recap', text: `${r.title}. ${r.text}`, at: Date.now() });
  });
}

