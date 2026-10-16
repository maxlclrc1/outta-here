/* ---------- personal needs ---------- */
// Food, access and travel needs, so plans work for everyone. Nobody is asked why. Each
// person picks, per section, who sees it: the crew with their name, the crew without it
// (the default), or organizers only. The AI always plans around every need, without
// names. Like budgets, this is kept private by the app, not by the server.
const DIETS = [['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['pescatarian', 'Pescatarian'], ['glutenfree', 'Gluten-free'], ['dairyfree', 'Dairy-free'], ['nuts', 'Nut allergy'], ['shellfish', 'Shellfish allergy'], ['halal', 'Halal'], ['kosher', 'Kosher'], ['nopork', 'No pork'], ['noalcohol', 'No alcohol']];
const ACCESS = [['stepfree', 'Step-free access'], ['shortwalks', 'Short walks only'], ['groundfloor', 'Ground-floor room'], ['seating', 'Needs a seat'], ['quiet', 'A quiet space'], ['ownroom', 'Own room'], ['animal', 'Service animal']];
const NEED_SECTIONS = [['diet', 'Food'], ['access', 'Getting around and rooms'], ['travel', 'Travel']];
const SHARE_LEVELS = [['anon', 'The crew, without my name'], ['named', 'The crew, with my name'], ['org', 'Only organizers']];
const needsOf = m => m.needs || {};
const shareOf = (m, sec) => (needsOf(m).share || {})[sec] || 'anon';
const tagLabel = (list, k) => (list.find(x => x[0] === k) || [k, k])[1];
const hasTravel = n => !!(n.depart || n.arrive || n.noRedeye || +n.maxTravel || n.noFly);
const hasSec = (n, sec) => sec === 'diet' ? !!((n.diet || []).length || n.dietNote) : sec === 'access' ? !!((n.access || []).length || n.accessNote) : hasTravel(n);
// can the person looking see this section of m's needs, and with m's name?
function needView(m, sec) {
  if (m.id === S.uid) return { see: true, named: true };
  const lv = shareOf(m, sec);
  if (lv === 'org') return { see: isOrganizer(), named: true };
  return { see: true, named: lv === 'named' };
}
// the crew's needs as this viewer may see them; tags are counted, names only where allowed
function crewNeeds() {
  const ms = active(), out = { diet: {}, access: {}, notes: [], travel: [], orgOnly: false };
  for (const m of ms) {
    const n = needsOf(m);
    for (const [sec, list] of [['diet', DIETS], ['access', ACCESS]]) {
      if (!hasSec(n, sec)) continue;
      const v = needView(m, sec); if (!v.see) continue;
      if (shareOf(m, sec) === 'org' && m.id !== S.uid) out.orgOnly = true;
      for (const k of n[sec] || []) { const e = out[sec][k] = out[sec][k] || { label: tagLabel(list, k), n: 0, names: [] }; e.n++; if (v.named) e.names.push(m.id === S.uid ? 'you' : m.nick || 'Someone'); }
      const note = n[sec + 'Note']; if (note) out.notes.push({ sec, text: note, name: v.named ? (m.id === S.uid ? 'you' : m.nick || 'Someone') : '' });
    }
    if (hasTravel(n)) { const v = needView(m, 'travel'); if (v.see) out.travel.push({ n, name: v.named ? (m.id === S.uid ? 'you' : m.nick || 'Someone') : '' }); }
  }
  return out;
}
// one set of travel limits that works for everyone
function travelLimits(list) {
  const ns = list.map(x => x.n), out = [];
  const dep = ns.map(n => n.depart).filter(Boolean).sort().pop(), arr = ns.map(n => n.arrive).filter(Boolean).sort()[0];
  const max = ns.map(n => +n.maxTravel).filter(x => x > 0).sort((a, b) => a - b)[0];
  if (dep) out.push(`Leave after ${t12(dep)}`);
  if (arr) out.push(`Arrive by ${t12(arr)}`);
  if (ns.some(n => n.noRedeye)) out.push('No red-eyes');
  if (max) out.push(`At most ${max}h of travel each way`);
  const nf = ns.filter(n => n.noFly).length; if (nf) out.push(`${nf === ns.length && ns.length > 1 ? 'Nobody' : nf === 1 ? '1 person' : nf + ' people'} ${nf === ns.length && ns.length > 1 ? 'wants to fly' : 'would rather not fly'}`);
  return out;
}
function needsCard(where) {
  if (S.demo) return '';
  const c = crewNeeds(), d = Object.values(c.diet), a = Object.values(c.access), tr = travelLimits(c.travel);
  if (!d.length && !a.length && !tr.length && !c.notes.length) return '';
  const chip = e => `<span class="need-c">${esc(e.label)}${e.n > 1 ? ` ×${e.n}` : ''}${e.names.length ? ` <span class="muted">(${esc(e.names.join(', '))})</span>` : ''}</span>`;
  const showTravel = where !== 'plan' || !isSmall();
  return `<section class="card stack needs-sum">
    <div class="stack" style="gap:2px"><h3>Plan around this</h3><span class="small muted">What the crew needs, shared the way each person chose. ${where === 'stays' ? 'Check rooms and access before you lock a stay.' : 'The AI already plans around it.'}</span></div>
    ${d.length ? `<div class="need-group"><span class="label">Food</span><div class="row" style="gap:6px">${d.map(chip).join('')}</div></div>` : ''}
    ${a.length ? `<div class="need-group"><span class="label">Getting around and rooms</span><div class="row" style="gap:6px">${a.map(chip).join('')}</div></div>` : ''}
    ${tr.length && showTravel ? `<div class="need-group"><span class="label">Travel</span><div class="row" style="gap:6px">${tr.map(x => `<span class="need-c">${esc(x)}</span>`).join('')}</div>${c.travel.some(x => x.name) ? `<span class="small muted">Includes limits from ${esc(listNames(c.travel.filter(x => x.name).map(x => ({ nick: x.name }))))}</span>` : ''}</div>` : ''}
    ${c.notes.length ? `<ul class="small need-notes">${c.notes.map(n => `<li>${esc(n.text)}${n.name ? ` <span class="muted">· ${esc(n.name)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    ${c.orgOnly ? '<span class="small muted">Some of this is only shown to organizers.</span>' : ''}
  </section>`;
}
// for the AI: everything, never with names
function needsText() {
  const ms = active(), count = (sec, list) => { const m = {}; for (const x of ms) for (const k of needsOf(x)[sec] || []) m[k] = (m[k] || 0) + 1; return Object.entries(m).map(([k, n]) => `${tagLabel(list, k)}${n > 1 ? ' ×' + n : ''}`); };
  const diet = count('diet', DIETS), acc = count('access', ACCESS), tr = travelLimits(ms.filter(m => hasTravel(needsOf(m))).map(m => ({ n: needsOf(m) })));
  const notes = ms.flatMap(m => ['dietNote', 'accessNote'].map(k => needsOf(m)[k]).filter(Boolean));
  if (!diet.length && !acc.length && !tr.length && !notes.length) return '';
  return `Practical needs in the group (never name anyone or mention these in a way that singles someone out; just make every suggestion work):
${diet.length ? `- Food: ${diet.join(', ')}. Every food stop must have good options for these.\n` : ''}${acc.length ? `- Access and rooms: ${acc.join(', ')}. Pick places and stays that work for this.\n` : ''}${tr.length ? `- Travel: ${tr.join('; ')}.\n` : ''}${notes.length ? `- Also: ${notes.join('; ')}\n` : ''}`.trim();
}
function myNeeds() {
  const m = meDoc(); if (!m || S.demo) return '';
  const n = needsOf(m), sh = sec => `<label class="row small need-share" style="gap:6px"><span class="muted">Who sees this</span><select id="nd-share-${sec}" style="width:auto">${SHARE_LEVELS.map(([k, l]) => `<option value="${k}" ${shareOf(m, sec) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const tags = (sec, list) => `<div class="row" style="gap:6px">${list.map(([k, l]) => `<button class="chip ${(n[sec] || []).includes(k) ? 'on' : ''}" data-need="${sec}|${k}" aria-pressed="${(n[sec] || []).includes(k)}">${l}</button>`).join('')}</div>`;
  return `<section class="card stack my-needs">
    <h2>Your needs</h2>
    <p class="small muted">So the plan works for you. No need to say why. You choose who sees each part, and the AI plans around all of it without using your name.</p>
    <div class="stack need-sec"><div class="row" style="justify-content:space-between;gap:8px"><span class="label">Food</span>${sh('diet')}</div>${tags('diet', DIETS)}
      <input id="nd-dietNote" maxlength="80" value="${esc(n.dietNote || '')}" placeholder="Anything else? e.g. severe, carry an EpiPen"></div>
    <div class="stack need-sec"><div class="row" style="justify-content:space-between;gap:8px"><span class="label">Getting around and rooms</span>${sh('access')}</div>${tags('access', ACCESS)}
      <input id="nd-accessNote" maxlength="80" value="${esc(n.accessNote || '')}" placeholder="Anything else the planner should know"></div>
    ${isSmall() ? '' : `<div class="stack need-sec"><div class="row" style="justify-content:space-between;gap:8px"><span class="label">Travel</span>${sh('travel')}</div>
      <div class="row" style="gap:8px">
        <label class="field" style="flex:1 1 130px"><span class="small muted">Leave no earlier than</span><input id="nd-depart" type="time" value="${esc(n.depart || '')}"></label>
        <label class="field" style="flex:1 1 130px"><span class="small muted">Arrive no later than</span><input id="nd-arrive" type="time" value="${esc(n.arrive || '')}"></label>
        <label class="field" style="flex:1 1 130px"><span class="small muted">Max travel each way</span><select id="nd-maxTravel"><option value="0">No limit</option>${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(h => `<option value="${h}" ${+n.maxTravel === h ? 'selected' : ''}>${h} hour${h === 1 ? '' : 's'}</option>`).join('')}</select></label>
      </div>
      <label class="check-line"><input type="checkbox" id="nd-noRedeye" ${n.noRedeye ? 'checked' : ''}> No overnight flights</label>
      <label class="check-line"><input type="checkbox" id="nd-noFly" ${n.noFly ? 'checked' : ''}> I’d rather not fly</label></div>`}
  </section>`;
}
function setNeed(patch) { const n = { ...needsOf(meDoc() || {}), ...patch }; saveMe({ needs: n }, true); }
function toggleNeed(sec, k) { const cur = new Set(needsOf(meDoc() || {})[sec] || []); cur.has(k) ? cur.delete(k) : cur.add(k); setNeed({ [sec]: [...cur] }); }
