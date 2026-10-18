/* ---------- render ---------- */
/* ---------- rendering: patch the page in place so things can animate ---------- */
// Replacing all of #app on every change made the app feel static: nothing could transition,
// and new items just appeared. morph() keeps existing elements and only changes what differs.
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Rows carry their item's id on their buttons (data-delexp="…", data-open="…"), so a row
// whose buttons all point at one id is keyed by it. That way adding or deleting an item
// animates that item instead of shuffling the content of every row below it.
const ID_ATTRS = ['data-open', 'data-crew', 'data-pickcrew', 'data-share', 'data-homedel', 'data-pack', 'data-claim', 'data-lockpitch', 'data-found', 'data-reveal', 'data-delfeed', 'data-delpack', 'data-delspend', 'data-delpot', 'data-delphoto', 'data-delitem', 'data-delexp', 'data-deldest', 'data-delbk'];
const ID_SEL = ID_ATTRS.map(a => `[${a}]`).join(',');
function keyOf(n) {
  if (n.nodeType !== 1) return '';
  const k = n.getAttribute('data-key') || n.id;
  if (k) return k;
  const vals = new Set();
  for (const el of [n, ...n.querySelectorAll(ID_SEL)]) for (const a of ID_ATTRS) { const v = el.getAttribute(a); if (v) vals.add(v); }
  return vals.size === 1 ? '~' + [...vals][0] : '';
}
function patchKids(parent, next, born) {
  const kids = [...next.childNodes], keys = kids.map(keyOf), want = new Set(keys.filter(Boolean));
  let cur = parent.firstChild;
  kids.forEach((nk, i) => {
    const k = keys[i];
    let m = null;
    if (k) for (let c = cur; c; c = c.nextSibling) if (c.nodeName === nk.nodeName && keyOf(c) === k) { m = c; break; }
    if (!m && cur && cur.nodeType === nk.nodeType && cur.nodeName === nk.nodeName && (!k || k[0] === '~')) {
      const ck = keyOf(cur);
      if (!ck || (ck[0] === '~' && !want.has(ck))) m = cur;
    }
    if (m) { if (m !== cur) parent.insertBefore(m, cur); else cur = cur.nextSibling; patchNode(m, nk, born); }
    else { parent.insertBefore(nk, cur); if (nk.nodeType === 1) born.push(nk); }
  });
  while (cur) { const n = cur.nextSibling; cur.remove(); cur = n; }
}
function morph(root, html) {
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const born = [];
  patchKids(root, tpl.content, born);
  return born;
}
function patchNode(el, nk, born) {
  if (el.nodeType !== 1) { if (el.nodeValue !== nk.nodeValue) el.nodeValue = nk.nodeValue; return; }
  for (const { name, value } of [...nk.attributes]) if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  for (const { name } of [...el.attributes]) if (!nk.hasAttribute(name) && !(name === 'open' && el.tagName === 'DETAILS')) el.removeAttribute(name);
  const tag = el.tagName;
  // never change the field someone is typing in; their draft wins until they leave it
  if (el === document.activeElement && (tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'file'].includes(el.type)))) return;
  if (tag === 'TEXTAREA') { if (el.value !== nk.value) el.value = nk.value; return; }
  if (tag === 'INPUT') {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = nk.hasAttribute('checked');
    else if (el.type !== 'file' && el.value !== (nk.getAttribute('value') || '')) el.value = nk.getAttribute('value') || '';
    return;
  }
  if (tag === 'IFRAME' || tag === 'CANVAS' || tag === 'VIDEO') return;
  patchKids(el, nk, born);
  if (tag === 'SELECT') { const o = [...el.options].findIndex(o => o.hasAttribute('selected')); el.selectedIndex = o < 0 ? 0 : o; }
}
// motion helpers (Web Animations, so nothing lingers in the markup)
const EASE = 'cubic-bezier(.2,.8,.2,1)';
function enter(els, step = 32) {
  if (calm()) return;
  els.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: Math.min(i, 8) * step, easing: EASE, fill: 'backwards' }));
}
function popIn(els) {
  if (calm()) return;
  for (const el of els) {
    if (!el.isConnected || el.closest('[data-noanim]') || getComputedStyle(el).display.startsWith('inline') && !el.matches('.chip,.pill,.btn')) continue;
    el.animate([{ opacity: 0, transform: 'translateY(6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE });
  }
}
let lastView = '';
const viewKey = () => S.tid && S.trip ? `t:${S.tid}:${S.tab}${S.setup ? ':setup' + S.setup.step : ''}` : `h:${S.loading ? 'load' : ''}:${S.creating && S.creating !== 'newCrew' ? S.creating : ''}:${S.crewView || ''}:${homeMode}`;

function render() {
  // switching menus cross-fades; going into or out of Live fades slower so the dark mode eases in
  const next = S.tid && S.trip ? secOf(TAB_ALIAS[S.tab] || S.tab).k : 'none', prev = app.dataset.sec;
  if (prev && next !== prev && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.dataset.vt = next === 'live' || prev === 'live' ? 'live' : 'sec';
    document.startViewTransition(paint).finished.finally(() => { delete document.documentElement.dataset.vt; });
    return;
  }
  paint();
}
function paint() {
  MEMO = new Map();
  try { paintNow(); } finally { MEMO = null; }
}
function paintNow() {
  try { if (S.tid && S.trip) announceChanges(); } catch {}
  const a = document.activeElement, fid = (a && a !== document.body && a.id) || (lastDown && Date.now() - lastDown.at < 800 ? lastDown.id : ''), sel = a && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  const scrollTabs = $('.tabs')?.scrollLeft;
  const vk = viewKey(), fresh = vk !== lastView || !app.firstChild; lastView = vk;
  if (S.tid && S.trip && !S.demo) try { sessionStorage.setItem('outta_tab_' + S.tid, S.tab); } catch {}
  let html;
  try { html = S.tid && S.trip ? tripView() : homeView(); }
  catch (e) {
    // one broken screen shouldn't take the whole app down
    console.error(e);
    html = `${topBar()}<section class="card stack" style="margin-top:20px"><h2>This screen hit a problem</h2><p class="muted">Something in this ${S.tid ? planWord() : 'page'} couldn’t be shown. Your data is safe.</p>
      <div class="row" style="gap:8px"><button class="btn primary" data-act="reloadView">Try again</button><button class="btn" data-act="home">Back home</button></div></section>`;
  }
  let born = [];
  if (fresh) app.innerHTML = html; else born = morph(app, html);
  const sk = S.tid && S.trip ? secOf(S.tab).k : 'none';
  app.dataset.sec = sk; document.body.dataset.sec = sk;
  for (const [id, v] of Object.entries(DRAFT)) { const el = document.getElementById(id); if (el && el.tagName !== 'BUTTON') el.value = v; }
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch {} } }
  if (scrollTabs) { const t = $('.tabs'); if (t) t.scrollLeft = scrollTabs; }
  bindSwipe();
  // a sheet that just opened takes focus, so keyboard and screen reader users land in it
  const dlg = $('.sheet[role=dialog], .show[role=dialog]');
  if (dlg && !dlg.contains(document.activeElement)) (dlg.querySelector('input, button:not([disabled])') || dlg).focus({ preventScroll: true });
  applyBeacon(); checkMilestones();
  const stb = $('.subtabs'), son = $('.subtab.on'); if (stb && son) stb.scrollLeft = son.offsetLeft - stb.clientWidth / 2 + son.clientWidth / 2;
  const fd = $('#feed'); if (fd) fd.scrollTop = fd.scrollHeight;
  syncPulse(); rememberSeen();
  if (fresh) enter([...app.children].filter(el => !el.matches('.top,.bottomnav,.subtabs,.mini,.fab-lost,script')));
  else popIn(born);
}

// Placeholders shaped like what's coming, so the screen doesn't jump when it arrives.
const skel = (kind = 'plan') => kind === 'rows'
  ? `<div class="skel-list" aria-busy="true" aria-label="Loading your plans">${'<div class="skel skel-row"></div>'.repeat(3)}</div>`
  : `<div class="skel-list" aria-busy="true" aria-label="Loading">${'<div class="skel skel-strip"></div><div class="skel skel-hero"></div><div class="skel skel-card"></div>'}</div>`;
function topBar() {
  const day = document.documentElement.dataset.theme === 'light';
  return `<div class="top"><button class="logo" data-act="home">Outta<span>/</span>Here</button>
    <div class="row" style="gap:10px;flex-wrap:nowrap"><button class="theme-t" data-act="theme" aria-label="${day ? 'Switch to night mode' : 'Switch to day mode'}" title="${day ? 'Night mode' : 'Day mode'}">${day ? '☾' : '☀'}</button></div></div>`;
}

function pass() {
  if (isSmall()) return passSmall();
  const d = dates(), ds = dest(), b = budgetCap(), ms = active();
  const from = homes().map(h => isCode(h) ? h.toUpperCase() : h).slice(0, 3);
  const inN = S.members.filter(going).length;
  return `<section class="pass">
    <div class="pass-main">
      <div class="row" style="justify-content:space-between"><span class="label">${esc(S.trip.name)}</span>
        ${planOn() ? `<span class="on-pill">${size() === 'trip' ? 'Trip' : 'Weekend'} is on</span>` : booking_time() ? `<span class="pill in">${size() === 'trip' ? 'Booking flights' : 'Booking'}</span>` : stagePill(S.trip, S.members)}</div>
      <div class="route">
        <span class="code ${from.length ? '' : 'code-tbd'}">${from.length ? esc(homes().length > 1 ? homes().length + ' CITIES' : from[0]) : 'US'}</span>
        <span class="plane" aria-hidden="true">${size() === 'trip' ? '✈' : '→'}</span>
        <span class="code ${ds ? '' : 'code-tbd'}" style="color:var(--accent)">${ds ? esc(ds.code ? ds.code.toUpperCase() : ds.city) : 'TBD'}</span>
      </div>
      <div class="facts">
        <div><span class="label">Dates${d && !d.locked ? ' · best so far' : ''}</span><b>${d ? short(d.start) + ' → ' + short(d.end) : 'TBD'}</b></div>
        <div><span class="label">Nights</span><b>${d ? nightsOf(d) : S.trip.nights}</b></div>
        <div><span class="label">Budget cap / person</span><b>${b ? b.label : 'TBD'}</b></div>
        ${(() => { const c = countdown(); return c ? `<div><span class="label">Countdown</span><b style="color:var(--accent)">${c.text}</b></div>` : ''; })()}
      </div>
      ${(() => { const t = tickets(); if (size() !== 'trip' || (!booking_time() && !t.have.length)) return ''; return `<button class="stack" data-tab="tickets" style="gap:6px;background:none;border:0;padding:0;text-align:left;color:inherit;font:inherit;cursor:pointer">
        <div class="row" style="justify-content:space-between"><span class="small"><b>${t.have.length}/${t.goal}</b> boarding passes in</span>${t.on ? '<span class="small" style="color:var(--good)">Everyone’s booked</span>' : `<span class="small muted">${t.goal - t.have.length} more to make it official</span>`}</div>
        <div class="bigbar"><i style="width:${t.goal ? Math.min(100, t.have.length / t.goal * 100) : 0}%"></i></div></button>`; })()}
      <div class="row" style="gap:6px"><button class="btn sm" data-act="card">Make story card</button></div>
      ${S.cardUrl ? `<div class="row" style="align-items:flex-end;gap:14px"><img class="cardimg" src="${S.cardUrl}" alt="Story card for ${esc(S.trip.name)}">
        <div class="stack" style="gap:8px">${S.downloads ? `<button class="btn primary sm" data-act="saveCard">Save image</button>` : `<span class="small muted">Press and hold the image to save it.</span>`}<button class="btn sm ghost" data-act="closeCard">Close</button></div></div>` : ''}
    </div>
    <div class="pass-stub">
      <div><span class="label">Crew</span><div class="code" style="font-size:40px">${inN}<span class="muted" style="font-size:22px">/${S.members.length}</span></div><span class="small muted">going</span></div>
    </div>
  </section>`;
}

function crewTab() {
  const m = meDoc() || { nick: S.myName, home: '', budget: '' };
  const ns = nudges();
  return `${inviteCard()}
  ${rsvpCard()}
  <section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Who’s holding things up</h2>
      ${ns.length ? `<button class="btn primary sm" data-act="copyNudge">Copy nudge for the group chat</button>` : ''}</div>
    ${ns.length ? `<div>${ns.map(x => `<div class="nudge"><b>${esc(x.m.nick || 'Someone')}${x.m.id === S.uid ? ' (you)' : ''}</b><span class="small muted">${x.todo.join(' · ')}</span></div>`).join('')}</div>`
      : `<p class="small" style="color:var(--good)">Nobody. Everyone’s done their part.</p>`}
    ${S.copyText ? `<textarea aria-label="Text to copy" id="copybox" readonly>${esc(S.copyText)}</textarea>` : ''}
  </section>
  <section class="card stack">
    <h2>Your details</h2>
    <p class="small muted">Your budget is never shown to the group. They only see the cap that works for everyone.</p>
    <div class="row">
      <label class="field"><span class="label">Name</span><input id="me-nick" maxlength="30" value="${esc(m.nick)}" placeholder="What the crew calls you"></label>
      ${isSmall() ? '' : `<label class="field"><span class="label">${size() === 'trip' ? 'Flying from' : 'Coming from'}</span><input id="me-home" maxlength="40" value="${esc(m.home)}" placeholder="${size() === 'trip' ? 'JFK or New York' : 'Your city or neighborhood'}"></label>`}
      ${!hasBudget(S.uid) ? '' : `<label class="field"><span class="label">${budgetIsTotal() ? `Budget for everyone (total, ${cur()})` : isSmall() ? `Your max, your share (${cur()})` : `Your max, your share (all in, ${cur()})`}</span><input id="me-budget" type="number" min="0" step="${isSmall() ? 5 : 50}" inputmode="numeric" value="${m.budget ? esc(m.budget) : ''}" placeholder="${isSmall() ? '60' : size() === 'weekend' ? '400' : '800'}"></label>`}
    </div>
    <div class="row">
      <label class="field"><span class="label">Venmo</span><input id="me-venmo" maxlength="40" value="${esc(m.venmo || '')}" placeholder="@your-handle"></label>
      <label class="field"><span class="label">Cash App</span><input id="me-cash" maxlength="40" value="${esc(m.cashapp || '')}" placeholder="$yourtag"></label>
    </div>
    <p class="small muted">Payment handles are shown to the crew so they can pay you back.</p>
      ${myPrivacy()}
  </section>
  ${myLimits()}
  ${myNeeds()}
  <section class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:6px"><h2>The crew</h2><span class="small muted">Invite more with the card above</span></div>
    ${S.members.length ? S.members.filter(x => !x.removed).map(x => `<div class="crew-row">
      <div class="av" style="background:${colorFor(x.id)}">${esc((x.nick || '?')[0].toUpperCase())}</div>
      <div style="min-width:0"><b>${esc(x.nick || 'Someone')}${withKids(x)}${x.id === S.uid ? ' <span class="muted small">(you)</span>' : ''}</b>
        <div class="small muted">${x.home && !isSmall() ? (size() === 'trip' ? '✈ ' : 'from ') + esc(x.home) + ' · ' : ''}${(x.days || []).length} ${(x.days || []).length === 1 ? 'day' : 'days'} free · ${(x.votes || []).length ? 'voted' : 'no vote yet'}${x.budget || x.budgetSet ? ' · budget set' : ''}</div></div>
      <div class="cr-side"><span class="pill lvl-${x.status || 'maybe'}">${LEVEL_LABEL[x.status || 'maybe']}</span>${x.id === S.trip.createdBy || (S.trip.orgs || {})[x.id] ? '<span class="small muted">Organizer</span>' : ''}
        ${isOrganizer() && !S.demo && x.id !== S.uid && x.id !== S.trip.createdBy ? (S.confirmRm === x.id ? `<span class="row" style="gap:4px"><button class="btn sm danger-fill" data-rmdo="${esc(x.id)}">Remove</button><button class="btn sm ghost" data-act="rmCancel">Cancel</button></span>` : `<span class="row" style="gap:8px"><button class="linkbtn small" data-mkorg="${esc(x.id)}">${(S.trip.orgs || {})[x.id] ? 'Not organizer' : 'Make organizer'}</button><button class="linkbtn small" data-rmmember="${esc(x.id)}">Remove</button></span>`) : ''}</div>
    </div>`).join('') : `<p class="muted">Nobody yet. Add your details above.</p>`}
  </section>`;
}

const monthName = d => D(d).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
function datesTab() {
  if (!S.trip.lockedDates || S.demo) return datesBody();
  const d = S.trip.lockedDates, ms = active(), can = ms.filter(m => fitOf(m, span(d.start, d.end)));
  return `<section class="card stack decided-sum"><div class="row" style="justify-content:space-between"><span class="on-pill">Decided</span>${S.readOnly ? '' : '<button class="btn sm ghost" data-act="unlockDates">Change it</button>'}</div>
    <h2>${dayRange(d.start, d.end)}</h2><span class="small muted">${can.length === ms.length ? 'Everyone can make it.' : `${can.length} of ${ms.length} marked these days as free.`}</span></section>
  <details class="card more-opts"><summary>See everyone’s days and other options</summary><div class="stack" style="margin-top:12px">${datesBody()}</div></details>`;
}
function datesBody() {
  const t = S.trip, days = span(t.winStart, t.winEnd), ms = active(), mine = new Set(meDoc()?.days || []), myPref = new Set(meDoc()?.pref || []), flex = meDoc()?.flex || {};
  const best = bestWindows(), bestSet = new Set(best[0] ? span(best[0].start, best[0].end) : []);
  const max = Math.max(1, ms.length);
  const cells = days.map((d, i) => {
    const head = i === 0 ? '<span></span>'.repeat((D(d).getUTCDay() + 6) % 7) : D(d).getUTCDate() === 1 ? `<span class="cal-month">${monthName(d)}</span>${'<span></span>'.repeat((D(d).getUTCDay() + 6) % 7)}` : '';
    const n = ms.filter(m => (m.days || []).includes(d)).length, np = ms.filter(m => (m.pref || []).includes(d)).length, others = n - (mine.has(d) ? 1 : 0);
    // your days are solid; everyone else's show as dots, so your own answer is what stands out
    return `${head}<button class="day ${mine.has(d) ? 'mine' : ''} ${myPref.has(d) ? 'pref' : ''} ${bestSet.has(d) ? 'best' : ''}" data-day="${d}" aria-pressed="${mine.has(d)}" title="${fmt(d)} · ${n} free${np ? ` · ${np} prefer it` : ''}" aria-label="${fmt(d)}${mine.has(d) ? ', you’re free' : ''}${myPref.has(d) ? ', a favorite' : ''}${others ? `, ${others} more free` : ''}">${D(d).getUTCDate()}<small class="dots" aria-hidden="true">${others ? '•'.repeat(Math.min(others, 4)) + (others > 4 ? '+' : '') : ''}</small>${myPref.has(d) ? '<i class="star" aria-hidden="true">★</i>' : ''}</button>`;
  });
  // a window the others can already do and you haven't answered for: one tap says it works for you
  const ask = !S.readOnly && meDoc() && best.find(w => w.miss.some(m => m.id === S.uid) && w.ok.length && span(w.start, w.end).some(d => !mine.has(d)));
  const settingsOpen = !t.winStart || !t.winEnd || !days.length;
  return `<section class="grid2">
    <div class="card stack avail">
      <div class="stack" style="gap:2px"><h2>${isSmall() ? 'Which days work for you?' : 'When are you free?'}</h2><span class="small muted">${S.starMode ? 'Tap your favorite days ★. Tap again to unstar.' : 'Tap the days you could do. Tap again to take one off.'}</span></div>
      ${ask ? `<div class="avail-ask"><span class="avail-ask-t">🙌 <b>${esc(listNames(ask.ok))}</b> ${ask.ok.length === 1 ? 'can' : 'can'} do <b>${ask.start === ask.end ? fmt(ask.start) : dayRange(ask.start, ask.end)}</b>. Can you?</span>
        <div class="row" style="gap:8px"><button class="btn primary chunky" data-addwin="${ask.start}|${ask.end}">Works for me</button><span class="small muted">or tap your days below</span></div></div>` : ''}
      <div class="row avail-quick" style="gap:6px"><button class="btn sm chunky" data-act="allDays">All of them</button><button class="btn sm chunky" data-act="weekends">Fri–Sun</button><button class="btn sm chunky ${S.starMode ? 'on' : ''}" data-act="starMode" aria-pressed="${!!S.starMode}">★ Favorites</button>${mine.size ? '<button class="btn sm ghost" data-act="noDays">Clear</button>' : ''}</div>
      <div class="cal">${days.length ? `<span class="cal-month first">${monthName(days[0])}</span>` : ''}${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x => `<span class="dow">${x}</span>`).join('')}${cells.join('')}</div>
      <div class="legend"><span><i class="sw" style="background:var(--accent)"></i>Your days</span><span><b class="dots-k">•••</b> Friends free</span><span>★ Favorite</span><span><i class="sw" style="box-shadow:inset 0 -3px 0 var(--gold)"></i>${isSmall() ? 'Best day' : 'Best window'}</span></div>
      <div class="avail-done ${mine.size ? 'on' : ''}" aria-live="polite">${mine.size ? `<span class="avail-n" data-key="avail-n-${mine.size}">✓ <b>${mine.size}</b> ${mine.size === 1 ? 'day' : 'days'} saved</span><span class="small muted">The crew sees them right away.</span><button class="btn sm chunky" data-tab="overview">Back to the plan</button>` : `<span class="small muted">Nothing picked yet. Your days save as you tap.</span>`}</div>
      <details class="dates-more" data-key="dates-more" ${settingsOpen ? 'open' : ''}><summary class="small">${isSmall() ? 'Flexibility and the days that could work' : 'Flexibility, trip window and length'}</summary><div class="stack" style="gap:12px;margin-top:10px">
      ${isSmall() ? '' : `<div class="stack" style="gap:6px"><span class="label">How flexible are you?</span>
        <div class="row" style="gap:6px"><button class="chip ${flex.late ? 'on' : ''}" data-flex="late" aria-pressed="${!!flex.late}">I can arrive a day late</button><button class="chip ${flex.early ? 'on' : ''}" data-flex="early" aria-pressed="${!!flex.early}">I can leave a day early</button></div>
        <span class="small muted">Counts you in for dates where you’d miss the first or last day.</span></div>`}
      <div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:12px">
        <span class="label">${isSmall() ? 'Days that could work' : 'Trip window'}</span>
        <div class="win-edit">
          <label class="field"><span class="small muted">Earliest</span><input id="win-start" type="date" value="${esc(t.winStart)}"></label>
          <label class="field"><span class="small muted">Latest</span><input id="win-end" type="date" value="${esc(t.winEnd)}"></label>
          <label class="field" ${isSmall() ? 'hidden' : ''}><span class="small muted">Trip length</span><select id="nights">${(isSmall() ? [0] : [1,2,3,4,5,6,7,10,14]).map(n => `<option value="${n}" ${n === nightsSet(t) ? 'selected' : ''}>${n === 0 ? 'Same day' : n + ' night' + (n === 1 ? '' : 's')}</option>`).join('')}</select></label>
        </div>
        <span class="small muted">Change these any time. Days people already tapped are kept.</span>
      </div></div></details>
    </div>
    <div class="card stack">
      <h2>${isSmall() ? 'Best day' : 'Best dates'}</h2>${S.demo ? '' : ruleLine()}
      ${t.lockedDates ? `<div class="banner"><span><b>Locked:</b> ${dayRange(t.lockedDates.start, t.lockedDates.end)}</span><button class="btn sm" data-act="unlockDates">Unlock</button></div>` : ''}
      ${best.length ? best.map((w, i) => `<div class="stack bw ${i === 0 ? 'bw-top' : ''} ${w.ok.length === ms.length ? 'bw-all' : ''}" style="gap:6px">
        <div class="row" style="justify-content:space-between"><b class="mono">${dayRange(w.start, w.end)}</b><span class="small bw-n"><b>${w.ok.length}/${ms.length}</b> can go</span></div>
        <div class="bar"><i style="width:${Math.round(w.ok.length / max * 100)}%"></i></div>
        <div class="bw-crew">${avStack([...w.ok, ...w.miss.map(m => ({ ...m, faded: true }))], 8)}</div>
        ${w.miss.length ? `<span class="small muted">Missing: ${w.miss.map(m => esc(m.nick || 'Someone')).join(', ')}</span>` : `<span class="small" style="color:var(--good)">Everyone can make it</span>`}
        ${w.late.length || w.early.length || w.pref.length ? `<span class="small muted">${[w.late.length && `${esc(listNames(w.late))} ${w.late.length === 1 ? 'arrives' : 'arrive'} a day late`, w.early.length && `${esc(listNames(w.early))} ${w.early.length === 1 ? 'leaves' : 'leave'} a day early`, w.pref.length && `★ ${w.pref.length === ms.length ? 'everyone prefers' : w.pref.length + ' prefer'} ${isSmall() ? 'this day' : 'these dates'}`].filter(Boolean).join(' · ')}</span>` : ''}
        ${t.lockedDates && t.lockedDates.start === w.start && t.lockedDates.end === w.end ? '' : ruleChip('dates', w.start + '|' + w.end)}
        <div>${t.lockedDates && t.lockedDates.start === w.start && t.lockedDates.end === w.end ? '<span class="pill in">Locked</span>' : `<button class="btn sm chunky ${i === 0 && !t.lockedDates ? 'primary' : ''}" data-lockdates="${w.start}|${w.end}">${t.lockedDates ? 'Switch to these' : isSmall() ? 'Lock this day' : 'Lock these dates'}</button>`}</div>
      </div>`).join('') : `<div class="empty">${(() => { const f = shorterFit(); return f
        ? `<b>No ${nightsSet(t) ? nightsSet(t) + '-night stretch' : 'day'} works yet</b><span>But a ${f.n}-night trip, ${fmt(f.w.start)} → ${fmt(f.w.end)}, works for ${f.w.ok.length} of ${ms.length}.</span><button class="btn sm primary" data-setnights="${f.n}">Switch to ${f.n} night${f.n === 1 ? '' : 's'}</button>`
        : `<span>No ${nightsSet(t) ? nightsSet(t) + '-night stretch' : 'day'} overlaps yet. Once people tap their free days, the best windows show up here.</span>`; })()}</div>`}
    </div>
  </section>`;
}

function whereTab() {
  const ds = S.trip.destinations || [], my = new Set(meDoc()?.votes || []), max = Math.max(1, active().length);
  const sorted = [...ds].sort((a, b) => votesFor(b.id).length - votesFor(a.id).length);
  return `<section class="card stack own-picks">
    <div class="stack" style="gap:2px"><h2>${isSmall() ? 'Your own ideas' : 'Your own picks'}</h2><span class="small muted">${S.sample === null ? `Add ${isSmall() ? 'ideas' : 'cities'}, vote for every one you’d do, and lock the winner.` : `Not feeling the pitches? Add your own ${isSmall() ? 'ideas' : 'cities'}, vote for every one you’d do, and lock one in.`}</span></div>
    ${S.trip.lockedDest ? `<div class="banner"><span><b>Locked:</b> ${esc(dest()?.city || '')}</span><button class="btn sm" data-act="unlockDest">Unlock</button></div>` : ''}
    ${sorted.length ? sorted.map(d => { const v = votesFor(d.id); return `<div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:12px">
      <div class="row" style="justify-content:space-between"><div class="row" style="gap:8px"><h3>${esc(d.city)}</h3>${d.code ? `<span class="mono small muted">${esc(d.code.toUpperCase())}</span>` : ''}</div>
        <div class="row" style="gap:6px"><button class="chip ${my.has(d.id) ? 'on' : ''}" data-vote="${esc(d.id)}">${my.has(d.id) ? '✓ Voted' : 'Vote'}</button>
        ${S.trip.lockedDest !== d.id ? `<button class="btn sm ghost" data-lockdest="${esc(d.id)}">Lock</button>` : ''}
        <button class="x" data-deldest="${esc(d.id)}" aria-label="Remove ${esc(d.city)}">×</button></div></div>
      <div class="bar"><i style="width:${Math.round(v.length / max * 100)}%"></i></div>
      <span class="small muted">${v.length} vote${v.length === 1 ? '' : 's'}${v.length ? ': ' + v.map(m => esc(m.nick || 'Someone')).join(', ') : ''}</span>${S.trip.lockedDest === d.id ? '' : ruleChip('dest', d.id)}
    </div>`; }).join('') : `<div class="empty"><span>No ideas yet. Throw one out.</span></div>`}
    <form id="addDest" class="row" style="border-top:1px solid var(--line);padding-top:14px;align-items:flex-end">
      <label class="field" style="flex:2 1 200px"><span class="label">${isSmall() ? 'Idea' : 'City'}</span><input id="ad-city" maxlength="50" required placeholder="${isSmall() ? 'Tacos + karaoke' : size() === 'weekend' ? 'Catskills' : 'Miami'}"></label>
      <label class="field" style="flex:0 1 110px" ${size() === 'trip' ? '' : 'hidden'}><span class="label">Airport (optional)</span><input id="ad-code" maxlength="3" placeholder="MIA"></label>
      <button class="btn primary" type="submit">Add</button>
    </form>
  </section>`;
}

function needDestDates(what, need = 'both') {
  const small = isSmall(), noDest = need !== 'dates' && !dest(), noDates = need !== 'dest' && !dates();
  const W = small ? 'the plan' : 'where you’re going', N = small ? 'the day' : 'your dates';
  const title = noDest && noDates ? (small ? 'First, pick the plan and the day' : 'First, decide where and when') : noDest ? `First, pick ${W}` : `First, pick ${N}`;
  return `<div class="empty"><b>${title}</b>
    <span>${esc(what)} ${/s$/.test(what) ? 'show' : 'shows'} up once you have ${noDest && noDates ? `${W} and ${N}` : noDest ? W : N}. ${small ? 'Plan Match settles it: the AI pitches plans' : 'Trip Match settles both: the AI pitches trips'} that fit everyone and the crew swipes.</span>
    <div class="row" style="gap:6px"><button class="btn sm primary" data-tab="match">Open ${small ? 'Plan' : 'Trip'} Match</button>${noDates ? `<button class="btn sm" data-tab="dates">${small ? 'Pick the day' : 'Pick dates'}</button>` : ''}</div></div>`;
}

function ticketsSection() {
  const t = tickets(), me = meDoc(), mine = t.tk[S.uid], imIn = going(me);
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Boarding passes</h2>${t.on ? '<span class="on-pill">Trip is on</span>' : `<span class="pill maybe">${t.have.length}/${t.goal} in</span>`}</div>
    <p class="small muted">The trip is official once everyone who’s in has booked a flight and sent in their boarding pass or confirmation.${booking_time() ? '' : ' Lock the dates and the destination first so nobody books the wrong flight.'}</p>
    <div class="bigbar"><i style="width:${t.goal ? Math.min(100, t.have.length / t.goal * 100) : 0}%"></i></div>
    <div>${t.ins.map(m => { const x = t.tk[m.id]; return `<div class="nudge"><b>${esc(m.nick || 'Someone')}${m.id === S.uid ? ' (you)' : ''}</b><span class="row" style="gap:8px">${x ? `${x.flight ? `<span class="small mono">${esc(x.flight)}</span>` : ''}<span class="pill in">✓ Booked</span>` : '<span class="pill out">Not yet</span>'}</span></div>`; }).join('') || '<p class="small muted">Nobody has tapped “I’m in” yet.</p>'}</div>
    ${imIn ? (mine ? `<div class="card stack" style="background:var(--bg)"><b>Your boarding pass is in ✓</b>
        ${mine.asset ? (mine.type === 'application/pdf' ? `<div><a class="btn sm" href="/_blob/${esc(mine.asset)}" target="_blank" rel="noopener">View your PDF</a></div>` : `<img class="ticket-img" src="/_blob/${esc(mine.asset)}" alt="Your boarding pass">`) : ''}
        <span class="small muted">Only you see the file. The crew just sees that you’re booked${mine.flight ? ', plus your flight number' : ''}.</span>
        <div><button class="btn sm danger" data-act="delTicket">Remove</button></div></div>`
      : `<form id="tkForm" class="card stack" style="background:var(--bg)">
        <b>Booked your flight? Send it in.</b>
        <div class="row" style="align-items:flex-end">
          ${S.assets || S.demo ? `<label class="field" style="flex:2 1 220px"><span class="label">Boarding pass or confirmation</span><input id="tk-file" type="file" accept="image/*,application/pdf"></label>` : ''}
          <label class="field"><span class="label">Flight number</span><input id="tk-flight" maxlength="20" placeholder="B6 1123"></label>
          <label class="field" style="flex:0 1 140px"><span class="label">What you paid</span><input id="tk-price" type="number" min="0" inputmode="numeric" placeholder="Optional"></label>
        </div>
        ${S.tkFile ? `<span class="small">Selected: <b>${esc(S.tkFile.name)}</b></span>` : ''}
        <div><button class="btn primary" type="submit" ${S.busy.ticket ? 'disabled' : ''}>${S.busy.ticket ? '<i class="spin"></i>Uploading…' : 'Send it in'}</button></div>
        ${S.assets || S.demo ? '<span class="small muted">A photo, screenshot or PDF works.</span>' : '<span class="small muted">File uploads aren’t available for you here, so add your flight number to mark yourself booked.</span>'}
      </form>`) : `<p class="small muted">Tap “I’m in” on the pass above, then send in your boarding pass here.</p>`}
  </section>`;
}
function dealsBody(x, cap) {
  const v = { fits: ['in', 'Fits the budget'], tight: ['maybe', 'Tight'], over: ['out', 'Over budget'] }[x.verdict] || null;
  const pk = planKind(), pp = pk.dealsFun ? { ...x.perPerson, [pk.dealsFun]: x.perPerson?.[pk.dealsFun] || x.perPerson?.nightlife, nightlife: undefined } : x.perPerson || {};
  return `${v ? `<div class="row"><span class="pill ${v[0]}">${v[1]}</span>${cap ? `<span class="small muted">vs. ${money(cap)} cap</span>` : ''}</div>` : ''}
    <div class="split">${['flights', 'stay', 'food', pk.dealsFun || 'nightlife', 'total'].filter(k => pp[k]).map(k => `<div><span class="label">${k}</span><b style="font-size:16px">${esc(pp[k])}</b></div>`).join('')}</div>
    ${(x.flights || []).length ? `<div><span class="label">Typical round trips</span>${x.flights.map(f => `<div class="linkrow"><div style="min-width:0"><b>${esc(f.from)}</b><div class="small muted">${esc(f.tip)}</div></div><span class="mono">${esc(f.roundTrip)}</span></div>`).join('')}</div>` : ''}
    ${x.stay?.areas?.length ? `<div><span class="label">Where to stay cheap</span>${x.stay.areas.map(a => `<div class="linkrow"><div style="min-width:0"><b>${esc(a.name)}</b><div class="small muted">${esc(a.why)}</div></div><span class="mono small">${esc(a.perNight)}</span></div>`).join('')}
      ${x.stay.groupPlay ? `<p class="small" style="margin-top:6px">${esc(x.stay.groupPlay)}</p>` : ''}</div>` : ''}
    ${(x.savings || []).length ? `<div><span class="label">Save money</span><ul style="margin:6px 0 0;padding-left:18px">${x.savings.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    <p class="small muted">AI estimates from typical prices, not live fares. Check the search links before booking.</p>`;
}

function spotsTab() {
  const d = dates(), ds = dest();
  if (!ds) return needDestDates(isSmall() ? 'Spot picks' : mode().nightlife || 'Nightlife picks', 'dest');
  const spots = S.trip.spots && S.trip.spots.city === ds.city ? S.trip.spots.items : null;
  const mq = meDoc()?.quiz || {}, b = blend(), pk = planKind(), Q = quiz();
  const ranked = spots ? spots.map((s, i) => ({ s, i, sc: score(rkey('sp' + s.name)) })).sort((a, b) => b.sc.net - a.sc.net || a.i - b.i) : [];
  return `<section class="grid2">
    <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:4px"><h2>Vibe quiz</h2><span class="label">${Q.filter(q => q.o.includes(mq[q.k])).length}/${Q.length}</span></div>
      ${Q.map(q => `<div class="q"><span class="small"><b>${esc(q.q)}</b></span><div class="row" style="gap:6px">${q.o.map(o => `<button class="chip ${mq[q.k] === o ? 'on' : ''}" data-quiz="${q.k}|${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`).join('')}
    </div>
    ${b ? `<div class="blend">
      <span class="label">${b.n} of ${active().length} took the quiz</span>
      <h2>${esc(b.persona)}</h2>
      ${Q.map(q => { const top = b.res[q.k].slice(0, 3), w = b.win[q.k]; if (!top.length) return '';
        const myRun = (meDoc()?.runoff || {})[q.k];
        return `<div class="stack" style="gap:4px"><div class="row" style="justify-content:space-between"><span class="label">${esc(q.q)}</span>${w.how !== 'majority' ? `<span class="tie">Tie</span>` : ''}</div>
        ${top.map(x => `<div class="row" style="gap:8px;flex-wrap:nowrap"><span class="small" style="flex:0 0 46%">${x.a === w.a ? '<b>★ ' : ''}${x.pct}% ${esc(x.a)}${x.a === w.a ? '</b>' : ''}</span><div class="bar" style="flex:1"><i style="width:${x.pct}%"></i></div></div>`).join('')}
        ${w.how !== 'majority' ? `<div class="runoff"><span class="small">${w.how === 'runoff' ? `Runoff winner: <b>${esc(w.a)}</b> (${w.tied.map(a => (w.rv[a] || 0)).join('–')})` : w.votes ? `Runoff is tied too, so a coin flip picked <b>${esc(w.a)}</b>` : `Coin flip picked <b>${esc(w.a)}</b> for now. Vote in the runoff to decide it yourselves.`}</span>
          <div class="row" style="gap:6px">${w.tied.map(a => `<button class="chip ${myRun === a ? 'on' : ''}" data-qrunoff="${q.k}|${esc(a)}">${esc(a)}</button>`).join('')}</div></div>` : ''}</div>`; }).join('')}
      <span class="small" style="opacity:.75">Screenshot this and drop it in the chat.</span>
    </div>` : `<div class="empty"><b>Your crew’s vibe shows up here.</b><span>Answer the ${Q.length} questions. Once ${pk.spots ? 'everyone answers' : 'friends answer'} too, you’ll see the blend, like “${Q === pk.quiz ? pk.blendEg : `60% ${Q[0].o[0]}, 40% ${Q[0].o[1]}`}”, and the AI uses it for its picks.</span></div>`}
  </section>
  <section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>${pk.spots ? pk.spots.heading : 'Where we’re going out in'} ${esc(ds.city)}</h2></div>
    ${S.sample !== null ? `<div><button class="btn primary" data-act="spots" ${S.busy.spots ? 'disabled' : ''}>${S.busy.spots ? '<i class="spin"></i>Scouting spots…' : spots ? 'Find new spots' : 'Find our spots'}</button></div>` : `<p class="small muted">${IN_CLAUDE ? "AI picks aren’t available for you right now." : "AI picks are off. Add your Anthropic API key to turn them on."}</p>`}
  </section>
  ${spots ? `<section class="grid2">${ranked.map(({ s, i }) => `<article class="card spot">
      <div class="spot-head"><div style="min-width:0"><span class="kind">${esc(s.type)}</span><h3>${esc(s.name)}</h3><span class="small muted">${esc(s.area)}</span></div><span class="mono" style="color:var(--accent)">${esc(s.price)}</span></div>
      <p class="small">${esc(s.why)}</p>
      <div class="meta">${s.cover ? `<span>${pk.spots ? 'Entry' : 'Cover'} <b>${esc(s.cover)}</b></span>` : ''}${s.bestNight ? `<span>Best <b>${esc(s.bestNight)}</b></span>` : ''}${s.dress ? `<span>Dress <b>${esc(s.dress)}</b></span>` : ''}</div>
      ${s.tip ? `<p class="small muted">Tip: ${esc(s.tip)}</p>` : ''}
      <div class="row" style="gap:6px;margin-top:auto">${voteBtns(rkey('sp' + s.name))}<a class="btn sm" href="${maps(s.name, ds.city)}" target="_blank" rel="noopener">Map</a>${d ? `<button class="btn sm" data-addspot="${i}">Add to itinerary</button>` : ''}</div>
    </article>`).join('')}</section>
    <p class="small muted">AI picks. Check hours, covers and age rules before you go.</p>`
  : `<div class="empty"><span>${isSmall() ? 'Take the vibe quiz, then let AI pull spots that fit your crew, budget and the day.' : pk.spots ? pk.spots.empty : 'Take the vibe quiz, then let AI pull clubs, bars, rooftops and a late-night food spot that fit your crew, budget and the nights you’re there.'}</span></div>`}`;
}

function planTab() {
  const d = dates();
  if (!d) return needDestDates(isSmall() ? 'The plan' : 'The itinerary', 'dates');
  const days = span(d.start, d.end), items = visItems();
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>${isSmall() ? 'The plan' : 'Itinerary'}</h2>
      <div class="row" style="gap:6px">${items.some(isDraft) ? `<button class="btn sm ghost" data-act="clearAI">Remove AI items</button>` : ''}
      ${S.sample !== null ? `<button class="btn primary" data-act="plan" ${S.busy.plan ? 'disabled' : ''}>${S.busy.plan ? '<i class="spin"></i>Drafting…' : items.some(i => i.ai) ? 'Redraft with AI' : 'Draft it with AI'}</button>` : ''}</div></div>
    ${S.trip.itinTpl && S.trip.itinTpl.length && !S.readOnly ? `<div class="cost-flag soft row" style="justify-content:space-between;gap:8px"><span><b>Last time’s outline</b> · ${S.trip.itinTpl.length} stop${S.trip.itinTpl.length === 1 ? '' : 's'}${S.trip.repeatOf?.name ? ` from ${esc(S.trip.repeatOf.name)}` : ''}</span><span class="row" style="gap:6px"><button class="btn sm primary" data-act="applyOutline">Put it on these dates</button><button class="btn sm ghost" data-act="dropOutline">Skip it</button></span></div>` : ''}
    ${!d.locked ? `<p class="small muted">Using the best dates so far. ${isSmall() ? 'Lock the day in When so the plan doesn’t shift.' : 'Lock dates in Dates so the plan doesn’t shift.'}</p>` : ''}
  </section>
  ${needsCard('plan')}
  ${days.map((day, i) => { const list = items.filter(x => x.date === day).sort(byTime); return `<section class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:4px"><h3>${days.length === 1 ? fmt(day) : `Day ${i + 1} · ${fmt(day)}`}</h3>${days.length === 1 ? '' : i === 0 ? `<span class="label">${size() === 'trip' ? 'Arrive' : 'Head out'}</span>` : i === days.length - 1 ? '<span class="label">Head home</span>' : ''}</div>
    ${list.length ? list.map(x => S.editItem === x.id ? editItemForm(x, days) : `<div class="tline"><span class="mono small">${esc(tShow(x.time) || '—')}</span><div style="min-width:0"><span class="kind">${esc(x.kind || '')}</span> <b>${esc(x.title)}</b>${x.secret && !x.hidden ? (x.revealed ? ' <span class="secret-tag">Revealed surprise</span>' : ` <span class="secret-tag">Surprise · hidden from the ${esc(mode().honoree || 'guest')}</span> <button class="linkbtn small" data-reveal="${esc(x.id)}">Reveal</button>`) : ''}${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</div>${x.hidden ? '<span></span>' : `<div class="row" style="gap:4px;flex-wrap:nowrap">${voteBtns(rkey('it' + x.id))}${S.readOnly ? '' : `<button class="x" data-edititem="${esc(x.id)}" aria-label="Move or edit ${esc(x.title)}" title="Move or edit">✎</button>`}<button class="x" data-delitem="${esc(x.id)}" aria-label="Remove">×</button></div>`}</div>`).join('') : `<p class="small muted">Nothing planned yet.</p>`}
    <form class="row addItem" data-date="${day}" style="margin-top:8px;gap:6px">
      <input id="ai-time-${day}" type="time" style="width:auto;flex:0 0 auto" aria-label="Time">
      <input id="ai-title-${day}" maxlength="120" placeholder="Add something" style="flex:1 1 160px" aria-label="What">
      <button class="btn sm" type="submit">Add</button>
      ${honoreeMode() && !isHonoree() ? `<label class="row small" style="gap:6px;flex:1 1 100%"><input type="checkbox" id="ai-secret-${day}" style="width:auto"> Surprise (hidden from the ${esc(mode().honoree)})</label>` : ''}
    </form>
  </section>`; }).join('')}`;
}

const money2 = n => fmtMoney(Math.round(n * 100) / 100, cur(), true);
const byAt = (a, b) => (a.at || 0) - (b.at || 0);
function payLinks(toId, amt, note) {
  const m = S.members.find(x => x.id === toId) || {};
  const v = handle(m.venmo), c = handle(m.cashapp), a = Math.round(amt * 100) / 100;
  const out = [];
  if (v) out.push(`<a class="btn sm" href="https://venmo.com/${encodeURIComponent(v)}?txn=pay&amount=${a}&note=${encodeURIComponent(note)}" target="_blank" rel="noopener">Venmo @${esc(v)}</a>`);
  if (c) out.push(`<a class="btn sm" href="https://cash.app/$${encodeURIComponent(c)}/${a}" target="_blank" rel="noopener">Cash App $${esc(c)}</a>`);
  return out.length ? out.join('') : `<span class="small muted">${esc(nameOf(toId))} hasn’t added Venmo or Cash App yet (Crew tab)</span>`;
}

function moneyTab() {
  const ms = active(), pm = paysMode(), payer = esc(nameOf(payerId()));
  const split = S.split || new Set(ms.map(m => m.id).filter(id => !(honoreeFree() && id === S.trip.honoree)));
  const { out: all } = settle(), out = pm === 'one' && !isPayer() ? all.filter(t => t.from === S.uid || t.to === S.uid) : all;
  // under a company, each person's total is what they claim back
  const claims = pm === 'company' ? Object.entries(S.expenses.reduce((a, e) => (e.paidBy && (a[e.paidBy] = (a[e.paidBy] || 0) + (+e.amount || 0)), a), {})).sort((a, b) => b[1] - a[1]) : [];
  const total = S.expenses.reduce((a, e) => a + (+e.amount || 0), 0);
  const exps = [...S.expenses].sort((a, b) => (b.at || 0) - (a.at || 0));
  return `${pm === 'one' ? `<div class="banner"><span>${isPayer() ? `<b>You’re covering this ${planWord()}.</b> When someone pays for something, you pay them back.` : `<b>Covered by ${payer}.</b> If you pay for something for the group, log it and ${payer} pays you back.`}</span></div>` : pm === 'company' ? `<div class="banner"><span><b>The company’s paying.</b> Log what you pay for the group, then claim it back.</span></div>` : ''}
  <section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>${isSmall() ? 'Expenses' : 'Trip expenses'}</h2><span class="mono">${money2(total)} total ${alsoMine(total)}</span></div>
    <form id="expForm" class="stack">
      <div class="row" style="align-items:flex-end">
        <label class="field" style="flex:2 1 180px"><span class="label">What</span><input id="ex-what" maxlength="60" required placeholder="Dinner at Catch"></label>
        <label class="field"><span class="label">Amount</span><input id="ex-amt" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="340"></label>
        <label class="field"><span class="label">Paid by</span><select id="ex-by">${ms.map(m => `<option value="${esc(m.id)}" ${m.id === S.uid ? 'selected' : ''}>${esc(m.nick || 'Someone')}</option>`).join('')}</select></label>
      </div>
      ${pm !== 'split' ? '' : `<div><span class="label">Split between</span><div class="row" style="gap:6px;margin-top:6px">${ms.map(m => `<button type="button" class="chip ${split.has(m.id) ? 'on' : ''}" data-split="${esc(m.id)}">${esc(m.nick || 'Someone')}</button>`).join('')}</div></div>`}
      <div><button class="btn primary" type="submit">Add expense</button></div>
    </form>
    ${exps.length ? `<div>${exps.map(e => `<div class="linkrow"><div style="min-width:0"><b>${esc(e.title)}</b><div class="small muted">${esc(nameOf(e.paidBy))} paid · ${pm === 'one' ? `covered by ${payer}` : pm === 'company' ? 'to claim back' : `split ${(e.split || []).length} ways · ${money2(e.amount / Math.max(1, (e.split || []).length))} each`}</div></div>
      <div class="row" style="gap:6px"><span class="mono">${money2(e.amount)}</span><button class="x" data-delexp="${esc(e.id)}" aria-label="Remove ${esc(e.title)}">×</button></div></div>`).join('')}</div>`
      : `<p class="small muted">No expenses yet. Log anything someone pays for the group.</p>`}
  </section>
  ${pm === 'company' ? (claims.length ? `<section class="card stack"><h2>To claim back</h2><div>${claims.map(([id, a]) => `<div class="linkrow"><b>${esc(nameOf(id))}${id === S.uid ? ' (you)' : ''}</b><span class="mono">${money2(a)}</span></div>`).join('')}</div><p class="small muted">What each person paid for the group. Claim it through your company’s expenses.</p></section>` : '') : exps.length && (pm === 'split' || out.length || isPayer()) ? `<section class="card stack"><h2>${pm === 'one' ? 'Paying people back' : 'Settle up'}</h2>
    ${out.length ? `<div>${out.map(t => `<div class="linkrow"><div><b>${esc(nameOf(t.from))}</b> pays <b>${esc(nameOf(t.to))}</b> <span class="mono">${money2(t.amt)}</span></div>${t.from === S.uid ? `<div class="row" style="gap:6px">${payLinks(t.to, t.amt, S.trip.name)}</div>` : ''}</div>`).join('')}</div>` : '<p class="small" style="color:var(--good)">Everyone’s even.</p>'}
    <p class="small muted">The fewest payments that square everyone up.</p></section>` : ''}`;
}

function packTab() {
  const ds = dest(), d = dates();
  const group = S.packing.filter(p => p.kind === 'group').sort(byAt), personal = S.packing.filter(p => p.kind !== 'group').sort(byAt);
  const packed = new Set(meDoc()?.packed || []);
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><h2>Packing list</h2>
      ${S.sample !== null && ds && d ? `<button class="btn primary" data-act="pack" ${S.busy.pack ? 'disabled' : ''}>${S.busy.pack ? '<i class="spin"></i>Building…' : S.packing.length ? 'Add AI suggestions' : 'Build it with AI'}</button>` : ''}</div>
    ${S.trip.weather ? `<p class="small"><span class="label">Weather</span> ${esc(S.trip.weather)}</p>` : ''}
    <form id="packForm" class="row" style="align-items:flex-end">
      <label class="field" style="flex:2 1 180px"><span class="label">Item</span><input id="pk-text" maxlength="80" required placeholder="Bluetooth speaker"></label>
      <label class="field" style="flex:1 1 170px"><span class="label">Type</span><select id="pk-kind"><option value="group">Group (one person brings)</option><option value="personal">Everyone packs</option></select></label>
      <button class="btn" type="submit">Add</button>
    </form>
  </section>
  <section class="grid2">
    <div class="card"><h3>Group stuff</h3><p class="small muted" style="margin-bottom:6px">Claim it so nobody brings three speakers.</p>
      ${group.length ? group.map(p => `<div class="check"><span class="txt"><b>${esc(p.text)}</b><div class="small ${p.claimedBy ? '' : 'muted'}">${p.claimedBy ? esc(nameOf(p.claimedBy)) + ' is bringing it' : 'Nobody yet'}</div></span>
        ${!p.claimedBy ? `<button class="btn sm" data-claim="${esc(p.id)}">I got it</button>` : p.claimedBy === S.uid ? `<button class="btn sm ghost" data-unclaim="${esc(p.id)}">Unclaim</button>` : ''}
        <button class="x" data-delpack="${esc(p.id)}" aria-label="Remove ${esc(p.text)}">×</button></div>`).join('') : '<p class="small muted">Nothing yet.</p>'}
    </div>
    <div class="card"><h3>Everyone packs</h3><p class="small muted" style="margin-bottom:6px">Tick things off as you pack.${personal.length ? ` ${personal.filter(p => packed.has(p.id)).length}/${personal.length} packed.` : ''}</p>
      ${personal.length ? personal.map(p => `<div class="check"><button class="box ${packed.has(p.id) ? 'on' : ''}" data-pack="${esc(p.id)}" aria-pressed="${packed.has(p.id)}" aria-label="Packed ${esc(p.text)}">${packed.has(p.id) ? '✓' : ''}</button><span class="txt ${packed.has(p.id) ? 'done' : ''}">${esc(p.text)}</span><button class="x" data-delpack="${esc(p.id)}" aria-label="Remove ${esc(p.text)}">×</button></div>`).join('') : '<p class="small muted">Nothing yet.</p>'}
    </div>
  </section>`;
}

// mirrors the server rule (lib/access.ts isOrg): the creator or an organizer. The server decides.
const canDelete = t => S.demo || S.isOwner || !!(t && (t.createdBy === S.uid || (t.orgs || {})[S.uid]));
async function deleteTrip(tid) {
  if (S.demo) { goHome(); return; }
  if (!S.db || !tid) return;
  // on the app's own server: one request deletes the plan, everything in it and its files, or
  // nothing at all (lib/deletePlan.ts). The plan stays open until that has succeeded.
  if (!IN_CLAUDE) {
    const t = (S.tid === tid && S.trip) || S.trips.find(x => x.id === tid) || {}, word = SIZES[t.size] ? SIZES[t.size].label : 'Trip';
    let r, j = {};
    try { r = await fetch('/api/plans/' + encodeURIComponent(tid), { method: 'DELETE', headers: { 'x-outta-user': S.uid } }); j = await r.json().catch(() => ({})); }
    catch { flash('Couldn’t reach the app, so nothing was deleted. Try again.'); return; }
    if (!r.ok) { flash(j.message || 'Couldn’t delete it, so nothing was deleted. Try again.'); return; }
    S.confirmHome = null; S.confirm = null;
    if (S.tid === tid) goHome(); else render();
    flash(word + ' deleted.' + (j.filesLeft ? ' A few of its files couldn’t be removed yet; they’ll be cleared the next time a plan is deleted.' : ''));
    return;
  }
  // in Claude there is no app server, so the pieces are deleted one by one
  if (S.tid === tid) stop();
  try {
    const t = (await S.db.doc('trips/' + tid).get()).data() || {};
    const word = SIZES[t.size] ? SIZES[t.size].label : 'Trip';
    if (S.assets) for (const x of Object.values(t.tickets || {})) if (x && x.asset) await S.assets.delete(x.asset).catch(() => {});
    if (S.assets) { const ph = await S.db.collection(`trips/${tid}/photos`).get(); for (const d of ph.docs) { const a = d.data().asset; if (a) await S.assets.delete(a).catch(() => {}); } }
    for (const c of ['members', 'expenses', 'packing', 'feed', 'bucket', 'photos', 'pot', 'songs']) {
      const snap = await S.db.collection(`trips/${tid}/${c}`).get();
      for (const d of snap.docs) await S.db.doc(`trips/${tid}/${c}/${d.id}`).delete();
    }
    await S.db.doc('trips/' + tid).delete();
    S.confirmHome = null; S.confirm = null;
    if (S.tid === tid) goHome(); else render();
    flash(word + ' deleted.');
  } catch (e) { flash(writeErr(e)); if (S.tid === tid) openTrip(tid, 'crew'); }
}
async function leaveTrip() {
  if (!S.db || S.demo) return;
  const tid = S.tid, mine = tickets().tk[S.uid];
  stop(); clearTimeout(meT); S.meDirty = false;
  try {
    if (mine) { if (mine.asset && S.assets) await S.assets.delete(mine.asset).catch(() => {}); await S.db.doc('trips/' + tid).update({ tickets: { [S.uid]: null } }); }
    const word = planWord();
    try { sessionStorage.removeItem('outta_tab_' + tid); } catch {}
    await S.db.doc('trips/' + tid).update({ people: { [S.uid]: null }, left: { [S.uid]: true } }).catch(() => {});
    await S.db.doc(`trips/${tid}/members/${S.uid}`).delete();
    goHome(); flash(`You left the ${word}.`);
  } catch (e) { flash(writeErr(e)); openTrip(tid, 'crew'); }
}
async function sendTicket() {
  const flight = ($('#tk-flight')?.value || '').trim().slice(0, 20), file = S.tkFile, price = Math.max(0, Math.round(+($('#tk-price')?.value || 0)));
  if (!file && !flight) { flash('Add your boarding pass or your flight number.'); return; }
  const tid = S.tid;
  if (file && file.size > 20 * 1024 * 1024) { flash('That file is over 20 MB. Try a screenshot instead.'); return; }
  let asset = null, type = '';
  if (file && S.assets && !S.demo) {
    S.busy.ticket = true; render();
    try { const r = await S.assets.upload(file, IN_CLAUDE ? undefined : { tid: S.tid }); asset = r.id; type = r.contentType; }
    catch (e) { S.busy.ticket = false; render(); flash(e && e.code === 'unsupported_type' ? 'Use a photo, screenshot or PDF.' : e && ['quota_exceeded', 'rate_limited', 'too_large', 'permission_denied'].includes(e.code) ? e.message : 'Upload failed. Try again, or just add your flight number.'); return; }
    S.busy.ticket = false;
  }
  if (S.tid !== tid) { flash('Your boarding pass upload finished after you left that plan. Open it and send it again.'); return; }
  S.tkFile = null;
  if (!await saveTrip({ tickets: { [S.uid]: { asset, type, flight, ...(price ? { price } : {}), at: Date.now() } } })) return;
  if (meDoc()?.status !== 'booked') saveMe({ status: 'booked', seen: true }, true);
  flash(tickets().on ? 'That’s everyone. The trip is ON.' : 'Boarding pass in. You’re marked as booked.');
}
async function delTicket() {
  const mine = tickets().tk[S.uid]; if (!mine) return;
  if (mine.asset && S.assets && !S.demo) await S.assets.delete(mine.asset).catch(() => {});
  saveTrip({ tickets: { [S.uid]: null } });
}

