/* ---------- arrival board ---------- */
const tFmt = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const dFmt = s => s ? fmt(s.slice(0, 10)) : '';
function rides(list) {
  const by = {}; for (const m of list) (by[(m.arrAirport || '').toUpperCase() || '?'] ||= []).push(m);
  const out = [];
  for (const [apt, ms] of Object.entries(by)) {
    ms.sort((a, b) => a.arrive < b.arrive ? -1 : 1);
    let g = [];
    for (const m of ms) {
      if (g.length && (new Date(m.arrive) - new Date(g[0].arrive)) / 6e4 > 60) { if (g.length > 1) out.push({ apt, g }); g = []; }
      g.push(m);
    }
    if (g.length > 1) out.push({ apt, g });
  }
  return out;
}
function arrivalsSection(compact) {
  const ds = dest(), me = meDoc() || {}, list = active().filter(m => m.arrive).sort((a, b) => a.arrive < b.arrive ? -1 : 1);
  const tk = S.trip.tickets || {}, missing = active().filter(m => !m.arrive);
  const rs = rides(list);
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Arrival board</h2><span class="small muted">${list.length}/${active().length} posted</span></div>
    ${list.length ? `<div class="board"><div class="board-row head"><span>Lands</span><span>Who</span><span>Flight</span><span>At</span></div>
      ${list.map(m => `<div class="board-row"><span class="t">${tFmt(m.arrive)}<br><small>${dFmt(m.arrive)}</small></span><span>${esc(m.nick || 'Someone')}</span><span>${esc(m.flight || tk[m.id]?.flight || '—')}</span><span>${esc((m.arrAirport || '').toUpperCase() || '—')}</span></div>`).join('')}</div>` : `<p class="small muted">Nobody has posted when they land yet.</p>`}
    ${rs.length ? `<div><span class="label">Share a ride from the airport</span>${rs.map(r => { const wait = Math.round((new Date(r.g[r.g.length - 1].arrive) - new Date(r.g[0].arrive)) / 6e4);
      return `<div class="linkrow"><span><b>${r.g.map(m => esc(m.nick || 'Someone')).join(' + ')}</b> at ${esc(r.apt)}</span><span class="small muted">${tFmt(r.g[0].arrive)}–${tFmt(r.g[r.g.length - 1].arrive)}${wait ? ` · first one waits ${wait} min` : ''}</span></div>`; }).join('')}</div>` : ''}
    ${!compact && missing.length && list.length ? `<span class="small muted">Still missing: ${missing.map(m => esc(m.nick || 'Someone')).join(', ')}</span>` : ''}
    ${!compact && meDoc() ? `<form id="arrForm" class="row" style="align-items:flex-end;border-top:1px solid var(--line);padding-top:12px">
      <label class="field"><span class="label">You land</span><input id="arr-time" type="datetime-local" value="${esc(me.arrive || (dates() ? dates().start + 'T15:00' : ''))}"></label>
      <label class="field" style="flex:0 1 100px"><span class="label">Airport</span><input id="arr-apt" maxlength="3" value="${esc(me.arrAirport || ds?.code || '')}" placeholder="LAS"></label>
      <label class="field" style="flex:0 1 120px"><span class="label">Flight</span><input id="arr-flight" maxlength="20" value="${esc(me.flight || tk[S.uid]?.flight || '')}" placeholder="B6 1123"></label>
      <button class="btn primary" type="submit">${me.arrive ? 'Update' : 'Post'}</button></form>` : ''}
  </section>`;
}

/* ---------- live trip mode ---------- */
const CHECKINS = ['At the hotel', 'At the pool', 'Getting food', 'Out out', 'Heading back', 'Asleep'];
function ago(at) { const m = Math.round((Date.now() - at) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; }
// live only once the dates are actually locked, never from a best guess
const isLive = () => { const L = S.trip?.lockedDates; return !!L && TODAY >= L.start && TODAY <= L.end; };
function liveTab() {
  const d = dates(); if (!d) return needDestDates('Live mode', 'dates');
  const live = isLive(), days = span(d.start, d.end);
  const day = live ? TODAY : d.start, idx = days.indexOf(day);
  const now = new Date().toTimeString().slice(0, 5);
  const items = visItems().filter(i => i.date === day).sort(byTime);
  const nextId = live ? (items.find(i => timeKey(i.time) >= timeKey(now)) || {}).id : items[0]?.id;
  const meet = S.trip.meet, myCi = meDoc()?.checkin;
  return `${live ? '' : `<div class="banner"><span><b>Preview.</b> Live mode switches on by itself on ${fmt(d.start)}. This is what Day 1 will look like.</span></div>`}
  <section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="row" style="gap:8px">${live ? '<i class="live-dot" aria-hidden="true"></i><span class="label">Live</span>' : ''}<h2>${days.length === 1 ? (live ? 'Today · ' : '') + fmt(day) : `Day ${idx + 1} of ${days.length} · ${fmt(day)}`}</h2></div></div>
  </section>
  ${live ? liveQuick() : ''}
  ${recapCard(day)}
  ${isSmall() || !planKind().hangover ? '' : hangoverCard(day)}
  <section class="grid2">
    <div class="card stack"><h3>Today’s plan</h3>
      ${items.length ? `<div>${items.map(i => `<div class="tline ${i.id === nextId ? 'today-next' : ''}"><span class="mono small">${esc(tShow(i.time) || '—')}</span><div style="min-width:0">${i.id === nextId ? '<span class="kind">Up next</span> ' : ''}<b>${esc(i.title)}</b>${i.note ? `<div class="small muted">${esc(i.note)}</div>` : ''}</div><span></span></div>`).join('')}</div>`
        : `<p class="small muted">Nothing on the itinerary for today. <button class="btn sm ghost" data-tab="plan">Plan it</button></p>`}
    </div>
    <div class="card stack"><h3>Meet-up</h3>
      ${meet && meet.text ? `<div class="stack" style="gap:2px"><b style="font-size:18px">${esc(meet.text)}</b><span class="small muted">${meet.time ? 'at ' + esc(tShow(meet.time)) + ' · ' : ''}set by ${esc(nameOf(meet.by))} ${ago(meet.at)}</span>
        <div class="row" style="gap:6px"><a class="btn sm" href="${maps(meet.text, dest()?.city || '')}" target="_blank" rel="noopener">Open in Maps</a><button class="btn sm ghost" data-act="clearMeet">Clear</button></div></div>` : `<p class="small muted">No meet-up set.</p>`}
      <form id="meetForm" class="row" style="gap:6px;align-items:flex-end">
        <label class="field" style="flex:2 1 150px"><span class="label">Where</span><input id="meet-where" maxlength="80" placeholder="Hotel lobby"></label>
        <label class="field" style="flex:0 1 110px"><span class="label">When</span><input id="meet-time" type="time"></label>
        <button class="btn sm" type="submit">Set</button></form>
    </div>
  </section>
  <section class="card stack"><div class="row" style="justify-content:space-between"><h3>Where’s everyone</h3>${myCi ? `<span class="small muted">You: ${esc(myCi.text)} · ${ago(myCi.at)}</span>` : ''}</div>
    <div class="row" style="gap:6px">${(isSmall() ? CHECKINS_SMALL : planKind().checkins).map(c => `<button class="chip ${myCi?.text === c ? 'on' : ''}" data-checkin="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <form id="ciForm" class="row" style="gap:6px"><input aria-label="Where you are" id="ci-text" maxlength="60" placeholder="Or type it: “at the bar by the pool”" style="flex:1 1 200px"><button class="btn sm" type="submit">Check in</button></form>
    <div>${active().map(m => `<div class="nudge"><b>${esc(m.nick || 'Someone')}</b><span class="small ${m.checkin ? '' : 'muted'}">${m.checkin ? (m.hideLoc && m.id !== S.uid ? 'Checked in' : esc(m.checkin.text)) + ' · ' + ago(m.checkin.at) : 'No check-in yet'}</span></div>`).join('')}</div>
  </section>
  ${idx === 0 && size() === 'trip' ? arrivalsSection(true) : ''}`;
}

/* ---------- bucket list ---------- */
const PTS = { 1: 'Easy', 2: 'Bold', 3: 'Legendary' };
function bucketSection() {
  const items = [...S.bucket].sort((a, b) => (b.points || 1) - (a.points || 1) || (a.at || 0) - (b.at || 0));
  const score = {}; for (const i of items) for (const id of (i.doneBy || [])) score[id] = (score[id] || 0) + (i.points || 1);
  const board = active().map(m => ({ m, p: score[m.id] || 0 })).sort((a, b) => b.p - a.p);
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Bucket list</h2><span class="small muted">Do it, check it off, get points</span></div>
    ${board.some(x => x.p) ? `<div class="row" style="gap:8px">${board.map((x, i) => `<span class="chip ${i === 0 && x.p ? 'on' : ''}">${i === 0 && x.p ? '♛ ' : ''}${esc(x.m.nick || 'Someone')} <b class="mono">${x.p}</b></span>`).join('')}</div>` : ''}
    <div>${items.length ? items.map(i => { const done = (i.doneBy || []).includes(S.uid); return `<div class="check">
      <button class="box ${done ? 'on' : ''}" data-bkdone="${esc(i.id)}" aria-pressed="${done}" aria-label="I did ${esc(i.text)}">${done ? '✓' : ''}</button>
      <span class="txt"><b>${esc(i.text)}</b> <span class="pill ${i.points === 3 ? 'in' : 'maybe'}">${PTS[i.points] || 'Easy'} · ${i.points || 1}pt</span>
        ${(i.doneBy || []).length ? `<div class="small muted">Done by ${(i.doneBy || []).map(id => esc(nameOf(id))).join(', ')}</div>` : ''}</span>
      <button class="x" data-delbk="${esc(i.id)}" aria-label="Remove ${esc(i.text)}">×</button></div>`; }).join('') : '<p class="small muted">Add the stuff the crew wants to do: “Get on stage at karaoke”, “Watch the sunrise”, “Talk our way into VIP”.</p>'}</div>
    <form id="bkForm" class="row" style="gap:6px;align-items:flex-end">
      <label class="field" style="flex:2 1 180px"><span class="label">Add a challenge</span><input id="bk-text" maxlength="80" required placeholder="Karaoke solo"></label>
      <label class="field" style="flex:0 1 140px"><span class="label">Points</span><select id="bk-pts"><option value="1">Easy · 1</option><option value="2">Bold · 2</option><option value="3">Legendary · 3</option></select></label>
      <button class="btn" type="submit">Add</button></form>
  </section>`;
}

/* ---------- hype feed ---------- */
const HYPES = ['LET’S GOOO', 'Outfit check tonight?', 'Who’s packing already?', 'I just booked!'];
const HYPES_LIVE = ['LET’S GOOO', 'Where is everyone?', 'Who’s still up?', 'Best night yet'];
const tShow = t => /^\d{1,2}:\d{2}$/.test(t || '') ? t12(t) : t;
const linkify = t => esc(t).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
function hypeTab() {
  const cd = countdown(), ds = dest();
  const feed = [...S.feed].filter(f => !(f.secret && isHonoree())).sort((a, b) => (a.at || 0) - (b.at || 0));
  return `<section class="hype-hero"><span class="label" style="color:inherit;opacity:.8">${esc(S.trip.name)}</span>
      <h1>${cd && cd.n > 0 ? `${cd.n} day${cd.n === 1 ? '' : 's'} till ${esc(ds?.city || 'takeoff')}` : cd ? esc(cd.text) : 'Hype starts here'}</h1></section>
  <section class="card stack">
    <div class="feed" id="feed">${feed.length ? feed.map(f => `<div class="bubble ${f.by === S.uid ? 'mine' : ''} ${f.by === 'ai' ? 'ai' : ''}">${f.secret ? '<span class="secret-tag">Planners only</span><br>' : ''}${f.by !== S.uid ? `<span class="small" style="font-weight:700">${esc(nameOf(f.by))}</span><br>` : ''}${linkify(f.text)}
      <span class="small" style="opacity:.7;display:block;margin-top:2px">${ago(f.at)}${f.by === S.uid ? ` · <button class="linkbtn" data-delfeed="${esc(f.id)}">delete</button>` : ''}</span></div>`).join('') : '<p class="small muted">Drop links, outfit ideas and hype here so they don’t get buried in the group chat.</p>'}</div>
    <div class="row" style="gap:6px">${(isLive() ? planKind().hypesLive : isSmall() ? planKind().hypesSmall || HYPES_SMALL : planKind().hypes).map(h => `<button class="chip" data-hype="${esc(h)}">${esc(h)}</button>`).join('')}</div>
    <form id="feedForm" class="row" style="gap:6px"><input aria-label="Message to the crew" id="fd-text" maxlength="500" placeholder="Say something…" style="flex:1 1 200px" autocomplete="off"><button class="btn primary" type="submit">Send</button>
      ${honoreeMode() && !isHonoree() ? `<label class="row small" style="gap:6px;flex:1 1 100%"><input type="checkbox" id="fd-secret" style="width:auto"> Planners only (hidden from the ${esc(mode().honoree)})</label>` : ''}</form>
  </section>`;
}
function postFeed(text, secret) { text = String(text || '').trim().slice(0, 500); if (!text) return; putSub('feed', rid(10), { by: S.uid, text, at: Date.now(), ...(secret ? { secret: true } : {}) }); }

/* ---------- recap: superlatives + album ---------- */
const SUPERS = ['MVP', 'Most likely to lose their ID', 'Biggest spender', 'Best dressed', 'First to fall asleep', 'Last one standing', 'Main character', 'Most likely to miss the flight'];
function superResults() {
  const sv = S.trip.superVotes || {}, ids = new Set(S.members.map(m => m.id));
  return (isSmall() ? SUPERS_SMALL : (mode().supers || SUPERS).map(x => size() !== 'trip' && /flight/.test(x) ? 'Most likely to oversleep' : x)).map((c, i) => {
    const votes = sv['s' + i] || {}, cnt = {};
    for (const v of Object.values(votes)) if (v && ids.has(v)) cnt[v] = (cnt[v] || 0) + 1;
    const top = Math.max(0, ...Object.values(cnt));
    return { c, key: 's' + i, cnt, total: Object.values(cnt).reduce((a, b) => a + b, 0), winners: top ? Object.keys(cnt).filter(id => cnt[id] === top) : [], mine: votes[S.uid] };
  });
}
let showTimer = null;
function openShow(i) {
  S.show = i; clearInterval(showTimer);
  showTimer = setInterval(() => { if (S.show === null || S.tab !== 'recap') { clearInterval(showTimer); return; } S.show = (S.show + 1) % Math.max(1, S.photos.length); render(); }, 2800);
  render();
}
function closeShow() { S.show = null; clearInterval(showTimer); render(); }
async function uploadPhotos(files) {
  if (!S.assets || !files.length) return;
  const list = [...files].slice(0, 30), tid = S.tid; let n = 0;
  for (const f of list) {
    if (S.tid !== tid) { flash(`Stopped adding photos: you left that plan. ${n} of ${list.length} went in.`); return; }
    S.busy.photos = `${++n}/${list.length}`; render();
    if (f.size > 20 * 1024 * 1024) { flash(`${f.name} is over 20 MB, skipped.`); continue; }
    try { const r = await S.assets.upload(f, IN_CLAUDE ? undefined : { tid }); await putSub('photos', rid(10), { asset: r.id, by: S.uid, at: Date.now() }); }
    catch (e) { flash(e && e.code === 'unsupported_type' ? `${f.name} isn’t a supported image.` : e && ['quota_exceeded', 'rate_limited', 'too_large', 'permission_denied'].includes(e.code) ? e.message : 'An upload failed. Try again.'); if (e && ['quota_exceeded', 'rate_limited', 'permission_denied'].includes(e.code)) break; }
  }
  S.busy.photos = null; render();
}
async function delPhoto(id) {
  const p = S.photos.find(x => x.id === id); if (!p) return;
  if (S.assets) await S.assets.delete(p.asset).catch(() => {});
  delSub('photos', id);
}
function imgPanel() {
  return `<div class="row" style="align-items:flex-end;gap:14px"><img class="cardimg" src="${S.img.url}" alt="${S.img.kind === 'awards' ? 'Trip awards card' : 'Photo collage'}">
    <div class="stack" style="gap:8px">${S.downloads ? `<button class="btn primary sm" data-act="saveImg">Save image</button>` : `<span class="small muted">Press and hold the image to save it.</span>`}<button class="btn sm ghost" data-act="closeImg">Close</button></div></div>`;
}
function setImg(kind, canvas, name) {
  canvas.toBlob(blob => { if (!blob) { flash('Couldn’t draw the image.'); return; } if (S.img) URL.revokeObjectURL(S.img.url); S.img = { kind, blob, url: URL.createObjectURL(blob), name }; render(); }, 'image/png');
}
async function saveImg() {
  if (!S.downloads || !S.img) return;
  try { await S.downloads.save({ filename: S.img.name, data: S.img.blob }); } catch (e) { if (e && e.code !== 'declined') flash('Couldn’t save the image here. Press and hold it instead.'); }
}
const slug = s => (s || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CF = (w, s, fam) => `${w} ${s}px ${fam === 'mono' ? '"JetBrains Mono", monospace' : fam === 'body' ? 'Figtree, sans-serif' : 'Anybody, "Arial Narrow", sans-serif'}`;
function cfit(ctx, text, max, size, w, fam) { let s = size; do { ctx.font = CF(w, s, fam); s -= 3; } while (ctx.measureText(text).width > max && s > 18); }
async function makeAwards() {
  try { await Promise.all(['900 120px Anybody', '700 40px Figtree'].map(f => document.fonts.load(f))); } catch {}
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0C0F21'); g.addColorStop(1, '#2B0B3A'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(W * .15, H * .1, 0, W * .15, H * .1, 700); r.addColorStop(0, 'rgba(255,201,77,.45)'); r.addColorStop(1, 'rgba(255,201,77,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H);
  x.fillStyle = '#FFC94D'; x.font = CF(900, 120); x.fillText(isSmall() ? 'NIGHT' : 'TRIP', 80, 260); x.fillStyle = '#fff'; x.fillText('AWARDS', 80, 380);
  x.fillStyle = 'rgba(255,255,255,.75)'; cfit(x, S.trip.name, W - 160, 48, 700, 'body'); x.fillText(S.trip.name, 80, 460);
  let y = 590;
  for (const res of superResults()) {
    x.fillStyle = '#FF4FA3'; x.font = CF(600, 30, 'mono'); x.fillText(res.c.toUpperCase(), 80, y);
    const who = res.winners.length ? res.winners.map(nameOf).join(' & ') : '—';
    x.fillStyle = '#fff'; cfit(x, who, W - 160, 64, 900); x.fillText(who, 80, y + 72);
    y += 158;
  }
  x.fillStyle = 'rgba(255,255,255,.7)'; x.font = CF(700, 38, 'body'); x.fillText('Planned on Outta Here', 80, H - 90);
  setImg('awards', c, slug(S.trip.name) + '-awards.png');
}
async function makeCollage() {
  const ps = [...S.photos].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 9).reverse(); if (!ps.length) return;
  try { await document.fonts.load('900 80px Anybody'); } catch {}
  const imgs = (await Promise.all(ps.map(p => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = '/_blob/' + p.asset; })))).filter(Boolean);
  if (!imgs.length) { flash('Couldn’t load the photos.'); return; }
  const W = 1080, H = 1350, top = 190, gap = 8, n = imgs.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#0C0F21'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff'; cfit(x, S.trip.name.toUpperCase(), W - 80, 80, 900); x.fillText(S.trip.name.toUpperCase(), 40, 105);
  const d = dates(); x.fillStyle = '#FF4FA3'; x.font = CF(600, 30, 'mono'); x.fillText(`${dest()?.city || ''}${d ? ' · ' + short(d.start) + ' – ' + short(d.end) : ''}`.toUpperCase(), 40, 155);
  const cw = (W - gap * (cols + 1)) / cols, ch = (H - top - gap * (rows + 1)) / rows;
  imgs.forEach((im, i) => {
    const cx = gap + (i % cols) * (cw + gap), cy = top + gap + Math.floor(i / cols) * (ch + gap);
    const s = Math.max(cw / im.width, ch / im.height), sw = cw / s, sh = ch / s;
    x.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, cx, cy, cw, ch);
  });
  setImg('collage', c, slug(S.trip.name) + '-collage.png');
}

