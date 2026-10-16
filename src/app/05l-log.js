/* ---------- shared live change log ---------- */
// Every important change is written together with a log entry in the same save: what
// changed, who did it, when, who has to do something about it, and how to put it back.
// People it affects see it straight away (a toast and a banner until they tap "Got it"),
// and the author or an organizer can undo it or restore the earlier choice.
//   entry = { text, area, by, at, act: 'all' | 'some' | '', who: [uids], fx: [lines],
//             undo: { k: 'set', patch, clear } | { k: 'item', item } | { k: 'status', uid, status },
//             seen: { uid: true }, undone: { by, at } }
function withLog(patch, e) {
  const id = rid(6);
  return { ...patch, changes: { ...(patch.changes || {}), [id]: { by: S.uid, at: Date.now(), act: '', ...e, seen: { [S.uid]: true } } } };
}
const logList = (t = S.trip) => Object.entries(t.changes || {}).filter(([, x]) => x && x.text).map(([id, x]) => ({ id, ...x })).sort((a, b) => b.at - a.at);
const affects = (x, uid = S.uid) => x.act === 'all' || (x.act === 'some' && (x.who || []).includes(uid));
const needsMe = (x, uid = S.uid) => !x.undone && x.by !== uid && affects(x, uid) && !(x.seen || {})[uid];
const canUndo = x => x.undo && !x.undone && !S.readOnly && (x.by === S.uid || isOrganizer());
const logWho = x => x.by === S.uid ? 'You' : nameOf(x.by);
function undoChange(id) {
  const x = (S.trip.changes || {})[id]; if (!x || !canUndo(x)) return;
  const u = x.undo, done = { changes: { [id]: { undone: { by: S.uid, at: Date.now() } } } };
  const note = e => withLog(done, { text: `Undone: ${x.text}`, area: x.area, act: x.act, who: x.who || [], ...e });
  if (u.k === 'set') {
    const clear = Object.fromEntries((u.clear || []).filter(k => S.trip[k]).map(k => [k, null]));
    const go = () => saveTrip(note({})).then(() => saveTrip(u.patch));
    return (Object.keys(clear).length ? saveTrip(clear).then(go) : go()).then(() => flash('Put back the way it was.'));
  }
  if (u.k === 'item') {
    const list = S.trip.itinerary || [], has = list.some(i => i.id === u.item.id);
    flash(has ? 'Moved back.' : 'Put back in the plan.');
    return saveTrip({ ...note({ text: has ? `${u.item.title} moved back to ${dow(u.item.date)} ${u.item.time ? t12(u.item.time) : ''}`.trim() : `${u.item.title} is back in the plan` }), itinerary: has ? list.map(i => i.id === u.item.id ? u.item : i) : [...list, u.item] });
  }
  if (u.k === 'status') {
    const m = S.members.find(z => z.id === u.uid); if (!m) return;
    if (u.uid === S.uid) saveMe({ status: u.status }, true); else if (!S.demo) S.db.doc(`trips/${S.tid}/members/${u.uid}`).update({ status: u.status }).catch(e => flash(writeErr(e)));
    flash(`${m.nick || 'They'} ${u.uid === S.uid ? 'are' : 'is'} back in.`);
    return saveTrip(note({ text: `${m.nick || 'Someone'} is back in` }));
  }
}
const ackChange = id => saveTrip({ changes: { [id]: { seen: { [S.uid]: true } } } });
function logRow(x, opts = {}) {
  const n = active().length, seen = Object.keys(x.seen || {}).filter(u => u !== x.by && affects(x, u)).length;
  const aff = x.act === 'all' ? Math.max(0, n - 1) : x.act === 'some' ? (x.who || []).filter(u => u !== x.by).length : 0;
  const forWho = x.act === 'all' ? 'Everyone should check' : x.act === 'some' ? `For ${listNames(S.members.filter(m => (x.who || []).includes(m.id)))}` : '';
  return `<div class="log-row ${x.undone ? 'undone' : ''} ${needsMe(x) ? 'mine' : ''}" data-key="log-${esc(x.id)}">
    <div class="log-head"><span class="av-sm" style="background:${colorFor(x.by)}">${esc((nameOf(x.by) || '?')[0].toUpperCase())}</span>
      <div class="stack" style="gap:2px;min-width:0;flex:1"><b>${esc(x.text)}</b>
      <span class="small muted">${esc(logWho(x))} · ${ago(x.at)}${forWho ? ` · ${esc(forWho)}` : ''}${aff && !x.undone ? ` · seen by ${seen} of ${aff}` : ''}${x.undone ? ` · undone by ${esc(x.undone.by === S.uid ? 'you' : nameOf(x.undone.by))}` : ''}</span></div></div>
    ${(x.fx || []).length && !opts.short ? `<ul class="small muted log-fx">${x.fx.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${needsMe(x) || canUndo(x) ? `<div class="row" style="gap:6px">${needsMe(x) ? `<button class="btn sm primary" data-ack="${esc(x.id)}">Got it</button>` : ''}${canUndo(x) ? `<button class="btn sm ghost" data-undo="${esc(x.id)}">${x.by === S.uid ? 'Undo' : 'Restore the earlier choice'}</button>` : ''}</div>` : ''}
  </div>`;
}
// Home › Changes: the whole log, newest first
function logTab() {
  const list = logList(), mine = list.filter(x => needsMe(x));
  return `<section class="card stack log">
    <div class="stack" style="gap:2px"><h2>What changed</h2><span class="small muted">Every important change, who made it and when. The people it affects see it right away. The person who made a change, or an organizer, can undo it.</span></div>
    ${mine.length > 1 ? `<div><button class="btn sm" data-act="ackAll">Mark all ${mine.length} as seen</button></div>` : ''}
    ${list.length ? `<div class="log-list">${list.slice(0, 60).map(x => logRow(x)).join('')}</div>` : '<div class="empty"><span>Nothing has changed yet. Locks, moves and swaps show up here.</span></div>'}
  </section>`;
}
// top of every tab: changes by someone else that need you, until you tap Got it
function liveBanner() {
  if (S.demo || !S.trip) return '';
  const list = logList().filter(x => needsMe(x)).slice(0, 2), more = logList().filter(x => needsMe(x)).length - list.length;
  if (!list.length || S.tab === 'log') return '';
  return `<section class="live-changes" aria-live="polite">${list.map(x => `<div class="lc-row"><span class="lc-dot" aria-hidden="true"></span><span class="small"><b>${esc(x.text)}</b> <span class="muted">· ${esc(nameOf(x.by))}</span>${(x.fx || [])[0] ? ` <span class="muted">· ${esc(x.fx[0])}</span>` : ''}</span><button class="btn sm" data-ack="${esc(x.id)}">Got it</button></div>`).join('')}
    ${more > 0 ? `<button class="linkbtn small" data-tab="log">${more} more change${more === 1 ? '' : 's'}</button>` : ''}</section>`;
}
// a toast the moment someone else's change arrives
let logKnown = null, logTid = null;
function announceChanges() {
  if (!S.trip || S.demo) return;
  const ids = logList().map(x => x.id);
  if (logTid !== S.tid || !logKnown) { logTid = S.tid; logKnown = new Set(ids); return; }
  const fresh = logList().filter(x => !logKnown.has(x.id) && x.by !== S.uid && affects(x));
  ids.forEach(id => logKnown.add(id));
  if (fresh.length) flash(fresh.length === 1 ? `${nameOf(fresh[0].by)}: ${fresh[0].text}` : `${fresh.length} new changes. See Home › Changes.`);
}
// for the home page's Needs you
const logNeeds = t => logList(t).filter(x => needsMe(x));
// move or edit one stop; the crew is told and it can be moved back
function editItemForm(x, days) {
  return `<form id="editItemForm" class="tline edit-line" data-id="${esc(x.id)}" data-key="edit-${esc(x.id)}">
    <div class="row" style="gap:6px;grid-column:1/-1">
      ${days.length > 1 ? `<select id="ei-date" style="width:auto" aria-label="Day">${days.map((d, i) => `<option value="${d}" ${d === x.date ? 'selected' : ''}>Day ${i + 1} · ${short(d)}</option>`).join('')}</select>` : ''}
      <input id="ei-time" type="time" value="${esc(x.time || '')}" style="width:auto" aria-label="Time">
      <input id="ei-title" maxlength="80" value="${esc(x.title)}" style="flex:1 1 160px" aria-label="What">
      <button class="btn sm primary" type="submit">Save</button><button class="btn sm ghost" type="button" data-act="editItemCancel">Cancel</button>
    </div></form>`;
}
function saveItemEdit(id) {
  const old = (S.trip.itinerary || []).find(i => i.id === id); S.editItem = null; if (!old) return render();
  const date = $('#ei-date')?.value || old.date, time = $('#ei-time')?.value || '', title = ($('#ei-title')?.value || '').trim().slice(0, 80) || old.title;
  if (date === old.date && time === (old.time || '') && title === old.title) return render();
  const when = (d, t) => `${d !== old.date || d !== date ? dow(d) + ' ' : ''}${t ? t12(t) : 'no set time'}`;
  const moved = date !== old.date || time !== (old.time || '');
  const text = moved ? `${old.title} moved to ${when(date, time)}` : `${old.title} is now ${title}`;
  const fx = [moved ? `Was ${dow(old.date)} ${old.time ? t12(old.time) : 'with no set time'}` : '', title !== old.title && moved ? `Now called ${title}` : ''].filter(Boolean);
  saveTrip(withLog({ itinerary: (S.trip.itinerary || []).map(i => i.id === id ? { ...i, date, time, title } : i) }, { area: 'plan', text, fx, act: old.secret ? '' : 'all', undo: { k: 'item', item: old } }));
  flash(`${text}. The crew sees it now.`);
}
