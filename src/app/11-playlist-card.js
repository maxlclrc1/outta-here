/* ---------- playlist ----------
   One playlist per crew that grows with every plan (or per plan when there's no crew).
   Each plan also votes on its own "song of the trip", which shows up in the recap. */
function subscribeSongs(path) {
  if (S.songPath === path) return;
  try { S.songUnsub?.(); } catch {}
  S.songPath = path; S.songs = []; S.songUnsub = null;
  if (S.demo || !S.db || !path) return;
  S.songUnsub = S.db.collection(path).orderBy('at').limit(300).onSnapshot(snap => { S.songs = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {});
}
const songVotes = s => Object.values(s.votes || {}).filter(v => v > 0).length;
const songQ = s => encodeURIComponent(`${s.title} ${s.artist || ''}`.trim());
function songOfPlan() {
  const v = S.trip?.songVotes || {}, cnt = {};
  for (const id of Object.values(v)) if (id) cnt[id] = (cnt[id] || 0) + 1;
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  return best ? { song: S.songs.find(s => s.id === best[0]), n: best[1] } : null;
}
function playlistCard(ctx = {}) {
  const crew = ctx.crew || S.crews.find(c => c.id === S.trip?.crewId), inPlan = !!S.trip && !ctx.crew;
  const songs = [...S.songs].sort((a, b) => songVotes(b) - songVotes(a) || (a.at || 0) - (b.at || 0));
  const mySotn = inPlan ? (S.trip.songVotes || {})[S.uid] : null, sotn = inPlan ? songOfPlan() : null;
  const who = id => crew ? crewNick(crew, id) : nameOf(id);
  return `<section class="card stack playlist">
    <div class="row" style="justify-content:space-between"><h2>${crew ? esc(crew.name) + ' playlist' : 'Playlist'}</h2><span class="small muted">${songs.length} song${songs.length === 1 ? '' : 's'}</span></div>
    <p class="small muted">${crew ? 'One playlist for the crew. It grows with every plan.' : 'Everyone adds songs.'} Upvote the ones that hit${inPlan ? ', and pick your song of the ' + (isSmall() ? 'night' : 'trip') + ' for the recap' : ''}.</p>
    ${sotn?.song ? `<div class="sotn"><span class="label">Song of the ${isSmall() ? 'night' : 'trip'} so far</span><b>${esc(sotn.song.title)}</b><span class="small">${sotn.song.artist ? esc(sotn.song.artist) + ' · ' : ''}${sotn.n} vote${sotn.n === 1 ? '' : 's'}</span></div>` : ''}
    <form id="songForm" class="row" style="gap:6px;align-items:flex-end">
      <label class="field" style="flex:2 1 150px"><span class="label">Song</span><input id="sg-title" maxlength="80" required placeholder="Dancing Queen"></label>
      <label class="field" style="flex:1 1 120px"><span class="label">Artist</span><input id="sg-artist" maxlength="60" placeholder="ABBA"></label>
      <label class="field" style="flex:2 1 160px"><span class="label">Link (optional)</span><input id="sg-link" maxlength="300" type="url" placeholder="Spotify or Apple Music link"></label>
      <button class="btn primary" type="submit">Add</button></form>
    ${songs.length ? `<ol class="songs">${songs.map((s, i) => { const v = songVotes(s), mine = (s.votes || {})[S.uid] > 0; return `<li class="song">
      <span class="song-n mono">${i + 1}</span>
      <div style="min-width:0;flex:1"><b>${esc(s.title)}</b>${s.artist ? ` <span class="muted">· ${esc(s.artist)}</span>` : ''}
        <div class="small muted">Added by ${esc(who(s.by))} · <a href="${s.link || 'https://open.spotify.com/search/' + songQ(s)}" target="_blank" rel="noopener">${s.link ? 'Listen' : 'Spotify'}</a>${s.link ? '' : ` · <a href="https://music.apple.com/us/search?term=${songQ(s)}" target="_blank" rel="noopener">Apple Music</a> · <a href="https://www.youtube.com/results?search_query=${songQ(s)}" target="_blank" rel="noopener">YouTube</a>`}</div></div>
      <div class="row" style="gap:4px;flex-wrap:nowrap">
        <button class="chip ${mine ? 'on' : ''}" data-songvote="${esc(s.id)}" aria-label="Upvote ${esc(s.title)}">▲ ${v}</button>
        ${inPlan ? `<button class="chip ${mySotn === s.id ? 'sotn-on' : ''}" data-sotn="${esc(s.id)}" title="My song of the ${isSmall() ? 'night' : 'trip'}">♫</button>` : ''}
        ${s.by === S.uid ? `<button class="x" data-delsong="${esc(s.id)}" aria-label="Remove ${esc(s.title)}">×</button>` : ''}</div></li>`; }).join('')}</ol>
      <div class="row" style="gap:6px"><button class="btn sm" data-act="copySongs">Copy the list</button><span class="small muted">Paste it into a Spotify or Apple Music playlist.</span></div>`
    : `<div class="empty"><span>No songs yet. Add the one that has to play ${inPlan ? 'at this ' + planWord() : 'this year'}.</span></div>`}
  </section>`;
}
const playlistTab = () => playlistCard();
async function addSong(title, artist, link) {
  const s = { title: title.slice(0, 80), artist: artist.slice(0, 60), link: /^https:\/\/\S+$/.test(link) ? link.slice(0, 300) : '', by: S.uid, at: Date.now(), votes: { [S.uid]: 1 } };
  const id = rid(8);
  if (S.demo || !S.db) { S.songs = [...S.songs, { id, ...s }]; render(); return; }
  S.songs = [...S.songs, { id, ...s }]; render();
  try { await S.db.doc(`${S.songPath}/${id}`).set(s); } catch (e) { flash(writeErr(e)); }
}
async function voteSong(id) {
  const s = S.songs.find(x => x.id === id); if (!s) return;
  const v = (s.votes || {})[S.uid] > 0 ? 0 : 1;
  s.votes = { ...(s.votes || {}), [S.uid]: v }; render();
  if (S.demo || !S.db) return;
  try { await S.db.doc(`${S.songPath}/${id}`).update({ votes: { [S.uid]: v } }); } catch (e) { flash(writeErr(e)); }
}
async function delSong(id) {
  S.songs = S.songs.filter(x => x.id !== id); render();
  if (S.demo || !S.db) return;
  try { await S.db.doc(`${S.songPath}/${id}`).delete(); } catch (e) { flash(writeErr(e)); }
}

/* ---------- per-size wording ---------- */
function draftNight() {
  const d = dates(); if (!d) return;
  const spots = (S.trip.spots?.items || []).map(s => s.name).join('; ');
  const prompt = `Plan ${size() === 'hangout' ? 'this evening' : 'this day out'} for a friend group: 3–5 stops with times, in order, close to each other.
${context()}
Spots the crew likes: ${spots || 'none yet, suggest real places'}
Reply with only JSON: {"items":[{"time":"HH:MM","title":"short title with the place name","kind":"food|activity|nightlife|chill","note":"one short line"}]}`;
  askAI('plan', prompt, data => {
    const items = (data?.items || []).filter(i => i && i.title).slice(0, 6).map(i => ({ id: rid(6), date: d.start, time: String(i.time || '').slice(0, 5), title: String(i.title).slice(0, 120), kind: i.kind || 'plan', note: String(i.note || '').slice(0, 200), ai: true }));
    if (!items.length) { flash('No plan came back. Try again.'); return; }
    return saveTrip({ itinerary: [...(S.trip.itinerary || []).filter(i => !i.ai), ...items] });
  });
}
const planWord = () => ({ hangout: 'hangout', day: 'day out', weekend: 'weekend', trip: 'trip' })[size()];
const SUPERS_SMALL = ['MVP of the night', 'Picked the best spot', 'Most likely to be late', 'First to leave', 'Last one standing', 'Best story of the night', 'Main character', 'Best dressed'];
const CHECKINS_SMALL = ['On my way', 'Here', 'Running late', 'Getting food', 'Heading home'];
const HYPES_SMALL = ['LET’S GOOO', 'Who’s driving?', 'Outfit check?', 'Running late lol'];
// story card for hangouts and days out: an event ticket instead of a boarding pass
async function makeEventCard() {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  try { await Promise.all(['900 120px Anybody', '600 40px "JetBrains Mono"', '700 40px Figtree'].map(f => document.fonts.load(f))); } catch {}
  const d = dates(), ds = dest(), cd = countdown(), t = S.trip, sz = SIZES[size()];
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0C0F21'); g.addColorStop(1, '#0B3B34'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(W * .8, H * .15, 0, W * .8, H * .15, 720); r.addColorStop(0, 'rgba(60,203,143,.45)'); r.addColorStop(1, 'rgba(60,203,143,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff'; x.font = CF(900, 60); x.fillText('OUTTA', 90, 180); let px = 90 + x.measureText('OUTTA').width; x.fillStyle = '#FF4FA3'; x.fillText('/', px, 180); px += x.measureText('/').width; x.fillStyle = '#fff'; x.fillText('HERE', px, 180);
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(70, 300, W - 140, 1160, 52); x.fill();
  const L = 140; x.fillStyle = '#6B7194'; x.font = CF(600, 30, 'mono'); x.fillText(`${sz.label.toUpperCase()} · ${(t.name || '').toUpperCase()}`.slice(0, 40), L, 410);
  const title = ds ? ds.city : t.name; x.fillStyle = '#151A33'; cfit(x, title, W - 2 * L, 120, 900); x.fillText(title, L, 560);
  const rows = [['WHEN', d ? fmt(d.start) + (t.time ? ' · ' + t12(t.time) : '') : 'TBD'], ['WHERE', t.venue || t.city || 'TBD'], ['CREW', S.members.filter(going).map(m => m.nick || 'Someone').join(' · ') || '—']];
  let y = 700; for (const [k, v] of rows) { x.fillStyle = '#6B7194'; x.font = CF(600, 30, 'mono'); x.fillText(k, L, y); x.fillStyle = '#151A33'; cfit(x, v, W - 2 * L, 54, 700, 'body'); x.fillText(v, L, y + 66); y += 170; }
  x.fillStyle = '#14915F'; x.font = CF(900, 110); x.fillText(cd && cd.n > 0 ? (cd.n === 1 ? 'TOMORROW' : `IN ${cd.n} DAYS`) : cd && cd.n === 0 ? 'TONIGHT' : 'SOON', L, 1330);
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = CF(700, 40, 'body'); x.fillText('Planned on Outta Here', 90, H - 130);
  c.toBlob(blob => { if (!blob) { flash('Couldn’t draw the card.'); return; } if (S.cardUrl) URL.revokeObjectURL(S.cardUrl); S.cardBlob = blob; S.cardUrl = URL.createObjectURL(blob); render(); }, 'image/png');
}

/* ---------- story card ---------- */
async function makeCard() {
  if (isSmall()) return makeEventCard();
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  try { await Promise.all(['900 120px Anybody', '600 40px "JetBrains Mono"', '700 40px Figtree'].map(f => document.fonts.load(f))); } catch {}
  const F = (w, s, fam) => `${w} ${s}px ${fam === 'mono' ? '"JetBrains Mono", monospace' : fam === 'body' ? 'Figtree, sans-serif' : 'Anybody, "Arial Narrow", sans-serif'}`;
  const fit = (ctx, text, max, size, w, fam) => { let s = size; do { ctx.font = F(w, s, fam); s -= 4; } while (ctx.measureText(text).width > max && s > 20); };
  const PINK = '#FF4FA3', INK = '#151A33', GREY = '#6B7194';
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0C0F21'); g.addColorStop(1, '#3A0B2C'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(W * .85, H * .12, 0, W * .85, H * .12, 760); r.addColorStop(0, 'rgba(255,79,163,.55)'); r.addColorStop(1, 'rgba(255,79,163,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H);
  x.font = F(900, 60); x.fillStyle = '#fff'; x.fillText('OUTTA', 90, 180); let px = 90 + x.measureText('OUTTA').width; x.fillStyle = PINK; x.fillText('/', px, 180); px += x.measureText('/').width; x.fillStyle = '#fff'; x.fillText('HERE', px, 180);

  const tw = W - 140, th = 1380, t = document.createElement('canvas'); t.width = tw; t.height = th; const y = t.getContext('2d');
  y.fillStyle = '#fff'; y.beginPath(); y.roundRect(0, 0, tw, th, 52); y.fill();
  const cut = 960;
  y.globalCompositeOperation = 'destination-out'; y.beginPath(); y.arc(0, cut, 44, 0, 7); y.arc(tw, cut, 44, 0, 7); y.fill(); y.globalCompositeOperation = 'source-over';
  y.strokeStyle = '#D5D8E6'; y.lineWidth = 4; y.setLineDash([18, 16]); y.beginPath(); y.moveTo(60, cut); y.lineTo(tw - 60, cut); y.stroke(); y.setLineDash([]);
  const L = 70, d = dates(), ds = dest(), hs = homes(), cd = countdown(), b = blend();
  y.fillStyle = GREY; y.font = F(600, 30, 'mono'); y.fillText('BOARDING PASS · GROUP TRIP', L, 110);
  y.fillStyle = INK; fit(y, S.trip.name, tw - 2 * L, 70, 800, 'body'); y.fillText(S.trip.name, L, 200);
  const from = hs.length === 0 ? 'HOME' : hs.length === 1 ? (isCode(hs[0]) ? hs[0].toUpperCase() : hs[0].toUpperCase().slice(0, 8)) : `${hs.length} CITIES`;
  const to = ds ? (ds.code ? ds.code.toUpperCase() : ds.city.toUpperCase()) : 'TBD';
  y.fillStyle = GREY; y.font = F(600, 28, 'mono'); y.fillText('FROM', L, 300); y.fillText('TO', tw / 2 + 40, 300);
  y.fillStyle = INK; fit(y, from, tw / 2 - L - 110, 190, 900); y.fillText(from, L, 470);
  y.fillStyle = PINK; fit(y, to, tw / 2 - L - 10, 190, 900); y.fillText(to, tw / 2 + 40, 470);
  y.font = F(900, 64); y.fillText('✈', tw / 2 - 60, 440);
  const cols = [['DATES', d ? `${short(d.start)} – ${short(d.end)}` : 'TBD'], ['NIGHTS', d ? String(nightsOf(d)) : String(S.trip.nights || '')], ['CREW', String(S.members.filter(going).length)]];
  const cx = [L, L + 540, L + 720];
  cols.forEach(([k, v], i) => { y.fillStyle = GREY; y.font = F(600, 28, 'mono'); y.fillText(k, cx[i], 600); y.fillStyle = INK; fit(y, v, (cx[i + 1] || tw - L) - cx[i] - 30, 46, 600, 'mono'); y.fillText(v, cx[i], 670); });
  if (ds) { y.fillStyle = GREY; y.font = F(600, 28, 'mono'); y.fillText('DESTINATION', L, 770); y.fillStyle = INK; fit(y, ds.city, tw - 2 * L, 60, 700, 'body'); y.fillText(ds.city, L, 840); }
  if (b) { y.fillStyle = PINK; fit(y, b.persona.toUpperCase(), tw - 2 * L, 44, 900); y.fillText(b.persona.toUpperCase(), L, 910); }
  if (cd && cd.n > 0) {
    y.fillStyle = PINK; y.font = F(900, 220); y.fillText(String(cd.n), L, 1200);
    const nw = y.measureText(String(cd.n)).width; y.fillStyle = INK; y.font = F(900, 70); y.fillText(cd.n === 1 ? 'DAY TO GO' : 'DAYS TO GO', L + nw + 30, 1190);
  } else { y.fillStyle = PINK; y.font = F(900, 120); y.fillText(cd ? cd.text.toUpperCase() : 'SOON', L, 1170); }
  const names = S.members.filter(going).map(m => m.nick || 'Someone').join(' · ');
  y.fillStyle = GREY; fit(y, names, tw - 2 * L, 34, 600, 'body'); y.fillText(names, L, 1290);
  x.drawImage(t, 70, 300);
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = F(700, 40, 'body'); x.fillText('Planned on Outta Here', 90, H - 130);
  c.toBlob(blob => { if (!blob) { flash('Couldn’t draw the card.'); return; } if (S.cardUrl) URL.revokeObjectURL(S.cardUrl); S.cardBlob = blob; S.cardUrl = URL.createObjectURL(blob); render(); }, 'image/png');
}
async function saveCard() {
  if (!S.downloads || !S.cardBlob) return;
  try { await S.downloads.save({ filename: (S.trip.name || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-story.png', data: S.cardBlob }); }
  catch (e) { if (e && e.code !== 'declined') flash('Couldn’t save the image here. Press and hold it instead.'); }
}

