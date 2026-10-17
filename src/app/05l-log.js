/* ---------- shared live change log ---------- */
// Every important change is written together with a log entry in the same save: what
// changed, who did it, when, who has to do something about it, and how to put it back.
// People it affects see it straight away (a toast and a banner until they tap "Got it"),
// and the author or an organizer can undo it or restore the earlier choice.
//   entry = { text, area, by, at, act: 'all' | 'some' | '', who: [uids], fx: [lines],
//             undo: { k: 'set', patch, clear, after } | { k: 'item', item, after } | { k: 'status', uid, status },
//             seen: { uid: true }, undone: { by, at } }
// `after` is what the change left behind. Undo only puts back what still looks exactly like
// that, so it never erases an edit someone made since (see undoPlan below).
const afterOf = (cur, p) => Array.isArray(p) ? p : isObj(p) && isObj(cur) ? merge(cur, p) : p;
function withLog(patch, e) {
  const id = rid(6), u = e.undo;
  if (u && !('after' in u) && S.trip) {
    if (u.k === 'set') e = { ...e, undo: { ...u, after: Object.fromEntries(Object.keys(u.patch).map(k => [k, (k in patch ? afterOf(S.trip[k], patch[k]) : S.trip[k]) ?? null])) } };
    if (u.k === 'item') e = { ...e, undo: { ...u, after: (Array.isArray(patch.itinerary) ? patch.itinerary : S.trip.itinerary || []).find(i => i.id === u.item.id) || null } };
  }
  return { ...patch, changes: { ...(patch.changes || {}), [id]: { by: S.uid, at: Date.now(), act: '', ...e, seen: { [S.uid]: true } } } };
}
const logList = (t = S.trip) => Object.entries(t.changes || {}).filter(([, x]) => x && x.text).map(([id, x]) => ({ id, ...x })).sort((a, b) => b.at - a.at);
const affects = (x, uid = S.uid) => x.act === 'all' || (x.act === 'some' && (x.who || []).includes(uid));
const needsMe = (x, uid = S.uid) => !x.undone && x.by !== uid && affects(x, uid) && !(x.seen || {})[uid];
const canUndo = x => x.undo && !x.undone && !S.readOnly && (x.by === S.uid || isOrganizer());
const logWho = x => x.by === S.uid ? 'You' : nameOf(x.by);
// Same value, whatever the key order; a missing value counts as null (as on the server).
const stableOf = v => JSON.stringify(v ?? null, (k, x) => isObj(x) ? Object.fromEntries(Object.keys(x).filter(y => x[y] != null).sort().map(y => [y, x[y]])) : x);
const same = (a, b) => stableOf(a) === stableOf(b);
const getPath = (o, path) => path.split('.').reduce((x, k) => isObj(x) ? x[k] : undefined, o);
// the values an undo patch sets, as paths: { decide: { style } } → 'decide.style'
const leaves = (v, pre) => isObj(v) && Object.keys(v).length ? Object.entries(v).flatMap(([k, x]) => leaves(x, pre + '.' + k)) : [[pre, v]];
// an object put back whole: keys added since the change are cleared too
const revertTo = (cur, old) => !isObj(old) || !isObj(cur) ? old : Object.fromEntries([...Object.keys(cur).filter(k => !(k in old)).map(k => [k, null]), ...Object.entries(old).map(([k, v]) => [k, revertTo(cur[k], v)])]);
const AREA_NAME = { itinerary: 'the itinerary', lockedDates: 'the locked dates', lockedDest: 'the locked destination', stay: 'the stay', meet: 'the meeting point', currency: 'the currency', decide: 'the decision rules', costs: 'the costs', time: 'the time', venue: 'the place' };
const changedSince = what => `Couldn’t undo: ${what} changed since. Nothing was put back, so the newer edit is kept.`;
// What undoing this change would write, and what must still be true when it's written.
function undoPlan(x, id) {
  const u = x.undo, t = S.trip, patch = {}, expect = {}, list = t.itinerary || [];
  // made before undo could check: only if nothing in the same area was logged since
  if (!('after' in u)) {
    if (u.k === 'set' && Object.values(u.patch).some(Array.isArray)) return { error: 'This change is from before Undo could check for newer edits, and it covers the whole itinerary, so it can’t be undone safely. Change it back by hand.' };
    if (logList().some(y => y.id !== id && y.at > x.at && y.area === x.area)) return { error: changedSince('something in the same part of the plan') };
    return { legacy: true };
  }
  if (u.k === 'item') {
    const key = 'itinerary#' + u.item.id, cur = list.find(i => i.id === u.item.id);
    if (u.after) {
      if (!cur) return { error: changedSince(`“${u.item.title}”`).replace('changed since', 'was removed since') };
      if (same(cur, u.item)) return { error: 'That’s already back the way it was.' };
      if (!same(cur, u.after)) return { error: changedSince(`“${cur.title}”`) };
      patch.itinerary = list.map(i => i.id === u.item.id ? u.item : i);
    } else {
      if (cur) return { error: `“${u.item.title}” is already back in the plan.` };
      patch.itinerary = [...list, u.item];
    }
    expect[key] = u.after; return { patch, expect };
  }
  const clear = new Set(u.clear || []), hit = [];
  for (const [k, old] of Object.entries(u.patch)) {
    const cur = t[k], aft = u.after[k];
    if (Array.isArray(old) || Array.isArray(aft)) {
      // a whole list (the itinerary shifted with new dates): put back only the items the change
      // touched that nobody has changed since; keep items added since; leave deletions alone
      const oldBy = new Map((old || []).map(i => [i.id, i])), aftBy = new Map((aft || []).map(i => [i.id, i])), curBy = new Map((cur || []).map(i => [i.id, i]));
      const edited = [...aftBy.values()].filter(i => curBy.has(i.id) && !same(curBy.get(i.id), i) && !same(curBy.get(i.id), oldBy.get(i.id)));
      if (edited.length) { hit.push(`${edited.length === 1 ? `“${curBy.get(edited[0].id).title}”` : edited.length + ' stops'} in ${AREA_NAME[k] || k}`); continue; }
      const next = [];
      for (const i of cur || []) {
        if (!aftBy.has(i.id) || !same(i, aftBy.get(i.id))) { next.push(i); continue; }
        if (oldBy.has(i.id)) { next.push(oldBy.get(i.id)); if (!same(i, oldBy.get(i.id))) expect[`${k}#${i.id}`] = i; } else expect[`${k}#${i.id}`] = i; // added by the change: removed again
      }
      for (const i of old || []) if (!aftBy.has(i.id) && !curBy.has(i.id)) { next.push(i); expect[`${k}#${i.id}`] = null; } // removed by the change: back
      if (!same(next, cur || [])) patch[k] = next;
      continue;
    }
    if (clear.has(k)) {
      if (same(cur, old)) continue;
      if (!same(cur, aft)) { hit.push(AREA_NAME[k] || k); continue; }
      patch[k] = revertTo(cur, old); expect[k] = aft; continue;
    }
    const paths = leaves(old, k).map(([p]) => p.slice(k.length + 1));
    const val = (o, p) => p ? getPath(o, p) : o;
    if (paths.every(p => same(val(cur, p), val(old, p)))) continue;
    if (paths.some(p => !same(val(cur, p), val(aft, p)))) { hit.push(AREA_NAME[k] || k); continue; }
    patch[k] = old; for (const p of paths) expect[p ? k + '.' + p : k] = val(aft, p);
  }
  if (hit.length) return { error: changedSince(hit.join(' and ')) };
  if (!Object.keys(patch).length) return { error: 'That’s already back the way it was.' };
  return { patch, expect };
}
function undoChange(id) {
  const x = (S.trip.changes || {})[id]; if (!x || !canUndo(x)) return;
  const u = x.undo, done = { changes: { [id]: { undone: { by: S.uid, at: Date.now() } } } };
  const note = e => withLog(done, { text: `Undone: ${x.text}`, area: x.area, act: x.act, who: x.who || [], ...e });
  if (u.k === 'status') {
    const m = S.members.find(z => z.id === u.uid); if (!m) return;
    // a drop-out set them to out; if their status changed since, that newer answer stands
    if (m.status !== 'out') return flash(m.status === u.status ? `${m.nick || 'They'} ${u.uid === S.uid ? 'are' : 'is'} already back.` : changedSince(`${m.nick || 'Their'} status`.replace(/^(.+?) status$/, '$1’s status')));
    if (u.uid === S.uid) saveMe({ status: u.status }, true); else if (!S.demo) S.db.doc(`trips/${S.tid}/members/${u.uid}`).update({ status: u.status }).catch(e => flash(writeErr(e)));
    flash(`${m.nick || 'They'} ${u.uid === S.uid ? 'are' : 'is'} back in.`);
    return saveTrip(note({ text: `${m.nick || 'Someone'} is back in` }));
  }
  const plan = undoPlan(x, id);
  if (plan.error) return flash(plan.error);
  if (plan.legacy) return legacyUndo(x, u, note);
  const text = u.k === 'item' ? (u.after ? `${u.item.title} moved back to ${dow(u.item.date)} ${u.item.time ? t12(u.item.time) : ''}`.trim() : `${u.item.title} is back in the plan`) : undefined;
  // the note and the change back are one save, made only if nothing changed in between
  return saveTrip({ ...plan.patch, ...note(text ? { text } : {}) }, S.tid, plan.expect).then(ok => ok && flash(u.k === 'item' ? (u.after ? 'Moved back.' : 'Put back in the plan.') : 'Put back the way it was.'));
}
// entries saved before undo recorded what it changed (the earlier behavior)
function legacyUndo(x, u, note) {
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
