/* ---------- stays the crew found themselves ---------- */
// Anyone can add a place they found (Airbnb, Booking, VRBO, a friend's cabin) with a
// link and the real price. It sits next to the AI ideas, gets votes, and can be locked
// in the same way. A locked stay can be marked booked with what was actually paid.
const STAY_KIND_LABEL = { rental: 'Home rental', hotel: 'Hotel', hostel: 'Hostel', other: 'Other' };
const safeUrl = u => { try { const x = new URL(String(u || '').trim()); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function guessFromUrl(u) {
  const h = hostOf(u);
  if (/airbnb\./.test(h)) return { name: 'Airbnb listing', kind: 'rental' };
  if (/vrbo\.|homeaway\./.test(h)) return { name: 'VRBO listing', kind: 'rental' };
  if (/booking\.com/.test(h)) return { name: 'Booking.com stay', kind: 'hotel' };
  if (/hostelworld\./.test(h)) return { name: 'Hostelworld stay', kind: 'hostel' };
  if (/hotels\.com|expedia\.|marriott\.|hilton\.|hyatt\./.test(h)) return { name: 'Hotel listing', kind: 'hotel' };
  return h ? { name: h, kind: 'other' } : { name: '', kind: 'other' };
}
const ownStays = () => Object.entries(S.trip.myStays || {}).filter(([, s]) => s).map(([id, s]) => ({ id, ...s })).sort((a, b) => (a.at || 0) - (b.at || 0));
const nightsNow = () => Math.max(1, nightsOf(dates()));
function stayPriceText(s) {
  if (!+s.total) return s.perNight || 'No price yet';
  const n = nightsNow(), heads = planHeads();
  return `${money(s.total)} total · ${money(s.total / n)}/night · ${money(s.total / heads)} each`;
}
function ownStayCard(s, ds, d, n) {
  const locked = S.trip.stay && S.trip.stay.ownId === s.id;
  return `<article class="card stay own-stay" data-key="own-${esc(s.id)}">
    <div class="stay-top" style="--sc:#5C6A7A"><span class="label" style="color:#fff">${esc(STAY_KIND_LABEL[s.kind] || 'Stay')} · found by ${esc(nameOf(s.by))}</span><h3 style="color:#fff">${esc(s.name)}</h3>${s.area ? `<span style="color:rgba(255,255,255,.85)" class="small">${esc(s.area)}</span>` : ''}</div>
    <div class="stack" style="gap:8px;padding:14px 16px 16px">
      <b class="mono">${esc(stayPriceText(s))}</b>
      ${s.sleeps ? `<span class="small muted">Sleeps: ${esc(s.sleeps)}</span>` : ''}
      ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
      <div class="row" style="gap:6px">${voteBtns(rkey('st' + s.name))}</div>
      <div class="row" style="gap:6px">${safeUrl(s.url) ? `<a class="btn sm primary" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">Open listing</a>` : ''}
        ${locked ? '<span class="pill lvl-confirmed">Our stay</span>' : S.readOnly ? '' : `<button class="btn sm ${s.url ? 'ghost' : 'primary'}" data-lockown="${esc(s.id)}">Lock as our stay</button>`}
        ${s.by === S.uid && !locked && !S.readOnly ? `<button class="x" data-delown="${esc(s.id)}" aria-label="Remove ${esc(s.name)}">×</button>` : ''}</div>
    </div></article>`;
}
function ownStayForm() {
  if (S.readOnly) return '';
  if (!S.addStay) return `<section class="card row own-stay-cta"><span><b>Found a place yourself?</b> <span class="small muted">Add the Airbnb, hotel or cabin so the crew can vote on it and lock it in.</span></span><button class="btn primary" data-act="addStayOpen">Add a place</button></section>`;
  return `<form id="ownStayForm" class="card stack">
    <div class="row" style="justify-content:space-between"><h3>Add a place you found</h3><button type="button" class="btn sm ghost" data-act="addStayClose">Cancel</button></div>
    <label class="field" style="flex:none"><span class="label">Link</span><input id="os-url" type="url" inputmode="url" placeholder="https://www.airbnb.com/rooms/…" autocomplete="off"></label>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:2 1 200px"><span class="label">Name</span><input id="os-name" maxlength="80" placeholder="Cabin with the hot tub"></label>
      <label class="field" style="flex:1 1 140px"><span class="label">Type</span><select id="os-kind">${Object.entries(STAY_KIND_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
    </div>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:1 1 150px"><span class="label">Total for ${nightsNow()} night${nightsNow() === 1 ? '' : 's'} (${cur()})</span><input id="os-total" type="number" min="0" inputmode="decimal" placeholder="With fees, if you know them"></label>
      <label class="field" style="flex:1 1 120px"><span class="label">Sleeps</span><input id="os-sleeps" maxlength="40" placeholder="6 in 3 rooms"></label>
      <label class="field" style="flex:1 1 140px"><span class="label">Area</span><input id="os-area" maxlength="60" placeholder="Neighborhood"></label>
    </div>
    <label class="field" style="flex:none"><span class="label">Why this one</span><input id="os-note" maxlength="160" placeholder="Walkable to everything, has a pool"></label>
    <div class="row" style="gap:8px"><button class="btn primary" type="submit" data-how="add">Add it</button><button class="btn" type="submit" data-how="lock">Add and lock it in</button></div>
  </form>`;
}
async function addOwnStay(lock) {
  const url = safeUrl($('#os-url')?.value), g = url ? guessFromUrl(url) : { name: '', kind: 'other' };
  const name = ($('#os-name')?.value || '').trim().slice(0, 80) || g.name;
  if (!name) { flash('Give it a name or paste the link.'); return; }
  if (($('#os-url')?.value || '').trim() && !url) { flash('That link doesn’t look right. It should start with https://'); return; }
  const kindSel = $('#os-kind')?.value, kind = kindSel && kindSel !== 'other' ? kindSel : g.kind;
  const s = { name, url, kind, total: Math.max(0, Math.round(+($('#os-total')?.value || 0))), sleeps: ($('#os-sleeps')?.value || '').trim().slice(0, 40), area: ($('#os-area')?.value || '').trim().slice(0, 60), note: ($('#os-note')?.value || '').trim().slice(0, 160), by: S.uid, at: Date.now() };
  const id = rid(6);
  S.addStay = false;
  await saveTrip({ myStays: { [id]: s } });
  if (lock) await setStay(stayFromOwn(id, s));
  flash(lock ? `${name} is locked in as your stay.` : `Added ${name}. The crew can vote on it now.`);
}
// Updates merge into what's saved, so a new stay first clears the old one; otherwise
// its link and price would stick to the new one.
async function setStay(stay) { const old = S.trip.stay; if (old) await saveTrip({ stay: null }); return saveTrip(withLog({ stay }, { area: 'stay', text: `Stay ${old ? 'switched to' : 'locked:'} ${stay.name}`, act: 'all', undo: { k: 'set', patch: { stay: old || null }, clear: ['stay'] } })); }
function stayFromOwn(id, s) {
  const n = nightsNow();
  return { ...s, ownId: id, perNight: s.total ? `${money(s.total / n)}/night` : '', custom: true };
}
// once locked: mark it booked with what was paid
function stayBookedBox(st) {
  if (S.readOnly) return '';
  if (st.booked) return `<span class="small" style="color:var(--good)"><b>Booked</b>${+st.total ? ` · ${money(st.total)} total, ${money(st.total / planHeads())} each` : ''}${st.bookedBy ? ` · by ${esc(nameOf(st.bookedBy))}` : ''}</span>`;
  return `<form id="stayBookForm" class="row" style="gap:6px;align-items:flex-end"><label class="field" style="flex:0 1 200px"><span class="label">Booked it? Total paid (${cur()})</span><input id="sb-total" type="number" min="0" inputmode="decimal" value="${+st.total || ''}" placeholder="${+st.total ? '' : 'Total for all nights'}"></label><button class="btn sm" type="submit">Mark as booked</button></form>`;
}

