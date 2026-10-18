/* ---------- "describe your plan": one sentence in, a real plan out ----------
   The new-plan screen leads with one box: "Long weekend in Greece with five friends in June, around €500
   each, beaches and nightlife." The words are read right here (no AI call: the AI only works inside a plan,
   and this has to be instant and free). What was understood shows as chips you can tap to change; anything
   the sentence didn't say is a dashed "Add …" chip or a marked guess, never a made-up fact. Creating uses
   the same plan fields as the step-by-step form (still there, under the box), then lands on the plan home,
   where inviting (WhatsApp first) is the next move. The place and vibe go into the pitch note, so the AI's
   pitches start from them. */
const ND_NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, a: 1, couple: 2, few: 3 };
const ND_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const ND_VIBES = [['beaches', /\bbeach(es)?\b|\bsea\b|\bswim/], ['nightlife', /nightlife|\bclub(s|bing)?\b|\bpart(y|ying)\b|\bbars?\b|\bdrinks\b/], ['food', /\bfood(ie)?\b|\beat(ing)?\b|restaurants?/],
  ['nature', /\bhik(e|ing)\b|nature|mountains?|\blakes?\b/], ['chill', /\bchill|relax|\bspa\b|slow/], ['culture', /culture|museums?|history|art\b/], ['wine', /\bwine/], ['skiing', /\bski(ing)?\b|snow/],
  ['sun', /\bsun(ny|shine)?\b|\bwarm\b/], ['cheap', /\bcheap|budget-friendly|low.?cost/], ['music', /\bmusic\b|concerts?|\bgigs?\b/], ['adventure', /adventure|road ?trip/]];
const num = w => /^\d+$/.test(w) ? +w : ND_NUMS[w] || 0;
const monthWin = m => { // the next time that month comes round, from today
  const y0 = +TODAY.slice(0, 4), mNow = +TODAY.slice(5, 7) - 1, y = m < mNow ? y0 + 1 : y0;
  const a = `${y}-${String(m + 1).padStart(2, '0')}-01`, z = add(add(m === 11 ? `${y + 1}-01-01` : `${y}-${String(m + 2).padStart(2, '0')}-01`, 0), -1);
  return [a < TODAY ? TODAY : a, z];
};
// The sentence → fields. `found` lists what the words actually said; everything else is a default.
function readPlan(text) {
  const s = ' ' + String(text || '').replace(/\s+/g, ' ').trim() + ' ', l = s.toLowerCase(), found = new Set(), f = {};
  // what size of plan
  f.size = /\b(dinner|drinks|brunch|lunch|game night|movie night|hangout|bbq|picnic|karaoke)\b/.test(l) ? 'hangout'
    : /\b(day trip|day out|beach day|concert|hike)\b/.test(l) ? 'day'
    : /\b(weekend|getaway)\b/.test(l) ? 'weekend'
    : /\b(trip|week|vacation|holiday|\d+\s*(nights|days))\b/.test(l) ? 'trip' : '';
  if (f.size) found.add('kind'); else f.size = 'weekend';
  const nm = l.match(/\b(\d+|two|three|four|five|six|seven)\s+nights?\b/), dm = l.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/);
  f.nights = isSmallSize(f.size) ? 0 : nm ? num(nm[1]) : dm ? Math.max(1, num(dm[1]) - 1) : /\blong weekend\b/.test(l) ? 3 : /\ba week\b/.test(l) ? 7 : SIZES[f.size].nights;
  // what kind of plan
  f.mode = /bachelorette|\bhen\b/.test(l) ? 'bachelorette' : /bachelor|\bstag\b/.test(l) ? 'bachelor' : /birthday|\bbday\b/.test(l) ? 'birthday' : /\bfamily|\bkids\b|\bparents\b/.test(l) ? 'family'
    : /\bteam\b|offsite|\bwork\b|company/.test(l) ? 'work' : /festival/.test(l) ? 'festival' : /couples|double date/.test(l) ? 'couples' : 'friends';
  if (!MODES[f.mode]) f.mode = 'friends'; if (f.mode !== 'friends') found.add('kind');
  const hon = s.match(/\b([A-Z][a-z]+)['’]s\s+(bachelorette|bachelor|birthday|hen|stag|bday)/i); f.honoree = hon ? hon[1] : '';
  // who's coming: "with five friends" is you plus five; "six of us" or "6 people" is everyone
  const w1 = l.match(/\bwith\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a few|a couple of)\s+(friends|people|mates|others|guys|girls)\b/), w2 = l.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(of us|people|friends|guys|girls|mates)\b/);
  f.people = w1 ? num(w1[1].replace(/^a (few|couple of)$/, '$1').replace(' of', '')) + 1 : w2 ? num(w2[1]) + (w2[2] === 'friends' ? 1 : 0) : 0;
  if (f.people) found.add('who');
  // when: a month, "this/next weekend", "next month"; otherwise the form's usual window
  const mi = ND_MONTHS.findIndex(m => new RegExp(`\\b(in |for |this |next )?${m}\\b`).test(l) || new RegExp(`\\b${m.slice(0, 3)}\\b`).test(l) && m !== 'may');
  const fri = (() => { let d = TODAY; while (D(d).getUTCDay() !== 5) d = add(d, 1); return d; })();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], wd = isSmallSize(f.size) ? days.findIndex(d => new RegExp(`\\b${d}\\b`).test(l)) : -1;
  if (wd >= 0) { let d = TODAY; while (D(d).getUTCDay() !== wd) d = add(d, 1); f.start = f.end = d; f.when = days[wd][0].toUpperCase() + days[wd].slice(1); found.add('when'); }
  else if (mi >= 0) { [f.start, f.end] = monthWin(mi); f.when = ND_MONTHS[mi][0].toUpperCase() + ND_MONTHS[mi].slice(1); found.add('when'); }
  else if (/\bthis weekend\b|\btonight\b|\bthis week\b/.test(l)) { f.start = TODAY; f.end = /\btonight\b/.test(l) ? TODAY : add(fri, 2); f.when = /\btonight\b/.test(l) ? 'Tonight' : 'This week'; found.add('when'); }
  else if (/\bnext weekend\b/.test(l)) { f.start = add(fri, 7); f.end = add(fri, 9); f.when = 'Next weekend'; found.add('when'); }
  else if (/\bnext month\b/.test(l)) { const m = (+TODAY.slice(5, 7)) % 12; [f.start, f.end] = monthWin(m); f.when = 'Next month'; found.add('when'); }
  else { const [, a, b] = whenChips(f.size)[isSmallSize(f.size) ? 1 : 1]; f.start = a; f.end = b; f.when = isSmallSize(f.size) ? 'This week' : 'In 1–3 months'; }
  // budget per person: "€500 each", "around 300 dollars", "£80 a head"
  const bm = s.match(/([€$£])\s?(\d[\d,.]*)\s?(k\b)?|(\d[\d,.]*)\s?(k\b)?\s?(€|euros?\b|eur\b|\$|dollars?\b|usd\b|£|pounds?\b|gbp\b)/i);
  if (bm) {
    const n = parseFloat((bm[2] || bm[4]).replace(/,/g, '')) * (bm[3] || bm[5] ? 1000 : 1), sym = (bm[1] || bm[6] || '').toLowerCase();
    f.currency = /€|eur/.test(sym) ? 'EUR' : /£|pound|gbp/.test(sym) ? 'GBP' : 'USD'; if (!CUR_CODES.includes(f.currency)) f.currency = '';
    const total = /\b(total|in total|for everyone|for all of us)\b/.test(l.slice(l.indexOf(String(bm[0]).toLowerCase())));
    f.budget = Math.round(total && f.people ? n / f.people : n); if (f.budget > 0) found.add('budget');
  }
  // the place: "in Greece", "to Lisbon", "at Joe's"
  const pm = s.match(/\b(?:in|to|at|around|near)\s+((?:[A-Z][\p{L}'’.-]+)(?:\s+(?:[A-Z][\p{L}'’.-]+|de|del|la|el))*)/u);
  const bad = new RegExp(`^(${ND_MONTHS.join('|')}|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)`, 'i');
  f.place = pm && !bad.test(pm[1]) ? pm[1].replace(/[.,]+$/, '') : ''; if (f.place) found.add('place');
  // vibe words
  f.vibe = ND_VIBES.filter(([, rx]) => rx.test(l)).map(([k]) => k).slice(0, 4); if (f.vibe.length) found.add('vibe');
  // a name: the guest of honor's, or the place and the kind of plan
  const kindWord = /\blong weekend\b/.test(l) ? 'long weekend' : SIZES[f.size].label.toLowerCase();
  const act = (l.match(/\b(dinner|drinks|brunch|lunch|game night|movie night|bbq|picnic|karaoke|day trip|beach day|concert|hike)\b/) || [])[1];
  f.name = (f.honoree ? `${f.honoree}’s ${f.mode === 'birthday' ? 'birthday' : MODES[f.mode].label.toLowerCase()}` : act ? `${wd >= 0 ? f.when + ' ' : ''}${act}` : f.place ? `${f.place} ${kindWord}` : shapeKind(f.mode, f.size)).replace(/^./, c => c.toUpperCase()).slice(0, 60);
  f.found = [...found];
  return f;
}
// "Friends hangout", "Bachelorette weekend": the kind and the size, without saying the size twice
const shapeKind = (mode, size) => { const ml = modeLabel(MODES[mode], size), sl = SIZES[size].label; return ml.toLowerCase().includes(sl.toLowerCase()) ? ml : `${ml} ${sl.toLowerCase()}`; };
const shapeBudgetText = f => f.budget ? `${new Intl.NumberFormat('en', { style: 'currency', currency: f.currency || myCur(), maximumFractionDigits: 0 }).format(f.budget)} each` : '';
const shapeWhenText = f => `${f.when}${f.start && f.end ? ` · ${f.start === f.end ? short(f.start) : short(f.start) + ' – ' + short(f.end)}` : ''}`;
// the box at the top of the new-plan screen
function describeBox() {
  const v = DRAFT['nd-text'] ?? S.shapeText ?? '';
  const eg = ['Long weekend in Greece with five friends in June, around €500 each, beaches and nightlife', 'Dinner Friday with the crew in Brooklyn, $40 each', 'Sarah’s bachelorette in Nashville in October, 8 of us'];
  return `<form id="describeForm" class="nd">
    <label class="nd-box"><span class="sr-only">Describe your plan</span><textarea id="nd-text" rows="3" maxlength="300" placeholder="${esc(eg[0])}…" enterkeyhint="go">${esc(v)}</textarea></label>
    <div class="nd-egs" aria-label="Examples">${eg.map(x => `<button type="button" class="nd-eg" data-ndeg="${esc(x)}">${esc(x.split(',')[0])}</button>`).join('')}</div>
    <button class="btn primary big chunky nd-go" type="submit">Plan it</button>
  </form>
  <div class="nd-or"><span>or start step by step</span></div>`;
}
// "Your plan is taking shape": the understood details as chips, three steps, one button
function shapeStep() {
  const f = S.shape, small = isSmallSize(f.size), cv = coverOf({ mode: f.mode, size: f.size, name: 'new' }, 'new-' + f.size + f.mode), got = new Set(f.found || []);
  const chip = (k, ic, label, text, need) => `<button type="button" class="sh-chip ${text ? (got.has(k) ? 'is-set' : 'is-guess') : 'is-empty'} ${S.shapeEdit === k ? 'on' : ''}" data-shedit="${k}" aria-expanded="${S.shapeEdit === k}">
      <span class="sh-ic" aria-hidden="true">${ic}</span><span class="sh-t"><span class="sh-k">${label}${text && !got.has(k) ? ' · a guess' : ''}</span><b>${text ? esc(text) : need}</b></span></button>`;
  const kind = `${shapeKind(f.mode, f.size)}${small ? '' : ` · ${f.nights} night${f.nights === 1 ? '' : 's'}`}`;
  const editors = {
    name: `<label class="nf-field"><span>Name</span><input id="sh-name" maxlength="60" value="${esc(f.name)}"></label>`,
    kind: `<div class="row" style="gap:8px"><label class="nf-field" style="flex:1 1 140px"><span>Size</span><select id="sh-size">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}" ${k === f.size ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <label class="nf-field" style="flex:1 1 160px"><span>Kind</span><select id="sh-mode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${k === f.mode ? 'selected' : ''}>${esc(modeLabel(v, f.size))}</option>`).join('')}</select></label>
      ${small ? '' : `<label class="nf-field" style="flex:0 1 100px"><span>Nights</span><select id="sh-nights">${[1, 2, 3, 4, 5, 6, 7, 10, 14].map(n => `<option ${n === f.nights ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}</div>`,
    who: `<label class="nf-field"><span>How many people, you included?</span><input id="sh-people" type="number" min="2" max="40" inputmode="numeric" value="${f.people || ''}" placeholder="6"></label>`,
    when: `<div class="nf-dates"><label><span>${small ? 'From' : 'Earliest'}</span><input id="sh-start" type="date" value="${f.start}" min="${TODAY}"></label><span class="nf-arrow" aria-hidden="true">→</span><label><span>${small ? 'Until' : 'Latest'}</span><input id="sh-end" type="date" value="${f.end}" min="${TODAY}"></label></div><p class="nf-hint">A wide window is fine. Everyone taps the days they’re free.</p>`,
    budget: `<div class="row" style="gap:8px"><label class="nf-field" style="flex:1 1 140px"><span>Per person, all in</span><input id="sh-budget" type="number" min="0" inputmode="numeric" value="${f.budget || ''}" placeholder="500"></label><label class="nf-field" style="flex:0 1 150px"><span>Currency</span><select id="sh-cur">${curOptions(f.currency || myCur())}</select></label></div>`,
    place: `<label class="nf-field"><span>${small ? 'Which city?' : 'Where (a country, region or city)'}</span><input id="sh-place" maxlength="50" value="${esc(f.place)}" placeholder="${small ? 'Brooklyn' : 'Greece'}"></label>`,
    vibe: `<label class="nf-field"><span>The vibe</span><input id="sh-vibe" maxlength="80" value="${esc(f.vibe.join(', '))}" placeholder="beaches, nightlife"></label>`,
  };
  const steps = [['📅', small ? 'Pick the day' : 'Find the dates', 'Everyone taps when they’re free.'], ['📍', small ? 'Choose the spot' : 'Choose where', f.place ? `Ideas around ${esc(f.place)}${f.vibe.length ? ', matched to the vibe' : ''}.` : 'A few options matched to your vibe.'], ['💌', 'Get everyone in', 'One WhatsApp invite. Friends tap and answer.']];
  const needCity = small && !f.place;
  return flowStep(2, { eyebrow: 'New plan', title: 'Your plan is taking shape', sub: 'Here’s what we got. Tap anything to change it.', back: 'shapeBack', color: planColor({ mode: f.mode, size: f.size }) },
    `<div class="sh">
      <div class="nf-preview ${cv.cls}" style="${cv.style}" aria-hidden="true"><div class="ovh-top"><span class="ovh-chip">${esc(kind)}</span></div><b class="nf-pv-title">${esc(f.name)}</b></div>
      <div class="sh-chips">
        ${chip('name', '✏️', 'Name', f.name, 'Add a name')}
        ${chip('kind', '🎉', 'Kind', kind, '')}
        ${chip('place', '📍', small ? 'City' : 'Where', f.place, small ? 'Add the city' : 'Anywhere')}
        ${chip('when', '📅', 'When', shapeWhenText(f), 'Add when')}
        ${chip('who', '👯', 'Who', f.people ? `You + ${f.people - 1} ${f.people - 1 === 1 ? 'friend' : 'friends'}` : '', 'How many?')}
        ${chip('budget', '💸', 'Budget', shapeBudgetText(f), 'Add a budget')}
        ${chip('vibe', '✨', 'Vibe', f.vibe.join(' · '), 'Add the vibe')}
      </div>
      ${S.shapeEdit ? `<div class="sh-edit" data-key="sh-edit-${S.shapeEdit}">${editors[S.shapeEdit]}<div class="row" style="gap:8px"><button type="button" class="btn sm chunky primary" data-act="shapeSave">Done</button><button type="button" class="btn sm ghost" data-act="shapeCancel">Cancel</button></div></div>` : ''}
      <div class="sh-steps"><span class="g-k">Next, together</span>${steps.map(([ic, t, d], i) => `<div class="sh-step"><span class="sh-n" aria-hidden="true">${ic}</span><div><b>${i + 1}. ${t}</b><span class="small muted">${d}</span></div></div>`).join('')}</div>
      ${needCity ? '<p class="nf-hint" style="color:var(--warn)">Add the city so the ideas are real places nearby.</p>' : ''}
      <div class="nf-cta"><button class="btn primary big chunky" data-act="shapeCreate" ${S.busy.create || needCity || S.shapeEdit ? 'disabled' : ''}>${S.busy.create ? '<i class="spin"></i>Creating…' : 'Create plan & invite friends'}</button></div>
    </div>`);
}
function shapeRead(text) {
  const t = String(text || '').trim();
  if (t.length < 3) { flash('Tell us a little about the plan first.'); $('#nd-text')?.focus(); return; }
  S.shapeText = t; S.shape = readPlan(t); S.shapeEdit = null; S.creating = 'shape'; delete DRAFT['nd-text'];
  render(); window.scrollTo({ top: 0 });
}
// a chip's editor → the plan; what you set yourself counts as said, not guessed
function shapeSave() {
  const f = S.shape, k = S.shapeEdit, v = id => ($('#' + id)?.value ?? '').trim();
  if (k === 'name') { if (!v('sh-name')) { flash('Give it a name.'); return; } f.name = v('sh-name').slice(0, 60); }
  if (k === 'kind') { f.size = SIZES[v('sh-size')] ? v('sh-size') : f.size; f.mode = MODES[v('sh-mode')] ? v('sh-mode') : f.mode; f.nights = isSmallSize(f.size) ? 0 : +v('sh-nights') || SIZES[f.size].nights; }
  if (k === 'who') { const n = Math.round(+v('sh-people')); f.people = n >= 2 ? Math.min(40, n) : 0; }
  if (k === 'when') { let a = v('sh-start'), b = v('sh-end'); if (!isDay(a) || !isDay(b)) { flash('Pick both days.'); return; } if (b < a) [a, b] = [b, a]; if (span(a, b).length >= 92) b = add(a, 90); f.start = a; f.end = b; f.when = 'Between'; }
  if (k === 'budget') { f.budget = Math.max(0, Math.round(+v('sh-budget') || 0)); f.currency = CUR_CODES.includes(v('sh-cur')) ? v('sh-cur') : f.currency; }
  if (k === 'place') f.place = v('sh-place').slice(0, 50);
  if (k === 'vibe') f.vibe = v('sh-vibe').split(/[,·]+/).map(x => x.trim()).filter(Boolean).slice(0, 5);
  f.found = [...new Set([...(f.found || []), k])];
  for (const id of ['sh-name', 'sh-size', 'sh-mode', 'sh-nights', 'sh-people', 'sh-start', 'sh-end', 'sh-budget', 'sh-cur', 'sh-place', 'sh-vibe']) delete DRAFT[id];
  S.shapeEdit = null; render();
}
// The same plan the step-by-step form makes, then the plan home with "Get everyone into the plan" (WhatsApp) up next.
async function shapeCreate() {
  const f = S.shape; if (!f || S.busy.create) return;
  const small = isSmallSize(f.size); if (small && !f.place) { flash('Add the city so the ideas are real places nearby.'); return; }
  const id = rid(10), currency = CUR_CODES.includes(f.currency) ? f.currency : myCur();
  const pays = paysDefault(f.mode, f.size);
  // what the AI pitches start from: the place, the vibe and the group size, in the organizer's words
  const note = [f.place && !small ? f.place : '', f.vibe.join(', '), f.people ? `about ${f.people} people` : ''].filter(Boolean).join(' · ').slice(0, 120);
  const trip = { name: f.name.slice(0, 60), size: f.size, city: small ? f.place : '', currency, winStart: f.start, winEnd: f.end, nights: small ? 0 : f.nights, destinations: [], vibes: [], itinerary: [], lockedDates: null, lockedDest: null,
    mode: f.mode, honoreeName: f.honoree || '', honoreeFree: !(small && f.mode === 'birthday'), people: { [S.uid]: true }, createdBy: S.uid, createdAt: Date.now(), pays, ...(pays === 'one' ? { payer: S.uid } : {}), ...(note ? { pitchNote: note } : {}) };
  S.busy.create = true; render();
  try {
    await S.db.doc('trips/' + id).set(trip);
    await seedMembers(id, null);
    // your budget, as the plan reads it: your own share when splitting, the group's total when you're covering it
    const b = pays === 'split' ? f.budget : pays === 'one' && f.people ? f.budget * f.people : 0;
    if (b > 0) await S.db.doc(`trips/${id}/members/${S.uid}`).update({ budget: b });
    try { localStorage.setItem('outta_lastcur', currency); if (small) localStorage.setItem('outta_city', f.place); } catch {}
    celebrate(trip.name, planColor(trip));
    S.shape = null; S.shapeText = ''; S.shapeEdit = null; S.creating = null; S.newCrew = null; S.newMode = null; S.newSize = null; S.newPays = null; S.fromCrewPage = false;
    openTrip(id, 'overview');
  } catch (e) { flash(writeErr(e)); }
  finally { S.busy.create = false; render(); }
}
