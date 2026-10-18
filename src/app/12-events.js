/* ---------- events ---------- */
app.addEventListener('click', e => {
  const t = e.target.closest('button,[data-open],[data-pin],[data-act]'); if (!t) return;
  const ds = t.dataset;
  if (ds.act === 'home') return goHome();
  if (ds.act === 'reloadView') { lastView = null; S.tab = 'overview'; return render(); }
  if (ds.act === 'remindOpen') { S.remindOpen = !S.remindOpen; return render(); }
  if (ds.remind) { const p = remindPrefs(); p[ds.remind] = !p[ds.remind]; lsSet('outta_remind', p); return render(); }
  if (ds.act === 'notifyAsk') { try { Notification.requestPermission().then(render); } catch {} return; }
  if (ds.act === 'theme') { const day = document.documentElement.dataset.theme !== 'light'; document.documentElement.dataset.theme = day ? 'light' : 'dark'; try { localStorage.setItem('outta_theme', day ? 'light' : 'dark'); } catch {} return render(); }
  if (ds.act === 'demo') return openDemo();
  if (ds.act === 'peek') { S.peek = true; return render(); }
  if (ds.open) return openTrip(ds.open);
  if (ds.homedel) { S.confirmHome = ds.homedel; return render(); }
  if (ds.homeview) { homeMode = ds.homeview; try { localStorage.setItem('outta_homeview', homeMode); } catch {} return render(); }
  if (ds.calnav !== undefined) return calNav(+ds.calnav);
  if (ds.calday) { S.calDay = ds.calday; render(); if (matchMedia('(max-width:700px)').matches) $('.mcal + section')?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }); return; }
  if (ds.share) {
    const t = S.trips.find(x => x.id === ds.share); if (!t) return;
    const w = SIZES[sizeOf(t)].label.toLowerCase();
    S.shareHome = t.id;
    if (!canInvite(t)) { flash('Only organizers can invite people to this one.'); return; }
    return sendInvite(inviteText(t), linkFor(t), t.name).then(render);
  }
  if (ds.startcrew) return startNewPlan(ds.startcrew);
  if (ds.act === 'clearCrew') { S.newCrew = null; return render(); }
  if (ds.delcrew) { S.confirmCrew = ds.delcrew; return render(); }
  if (ds.act === 'delCrewCancel') { S.confirmCrew = null; return render(); }
  if (ds.delcrewdo) return once('delcrew', () => S.db ? S.db.doc('crews/' + ds.delcrewdo).delete().then(() => { S.confirmCrew = null; flash('Crew deleted. Its plans are kept.'); goHome(); }, e => flash(writeErr(e))) : null);
  if (ds.act === 'homeCancel') { S.confirmHome = null; return render(); }
  if (ds.homedo) return once('delete', () => deleteTrip(ds.homedo));
  if (ds.act === 'newTrip') return startNewPlan();
  if (ds.pickcrew !== undefined) { S.newCrew = ds.pickcrew || null; S.creating = 'size'; render(); window.scrollTo({ top: 0 }); return; }
  if (ds.size) { S.newSize = ds.size; S.creating = 'mode'; render(); window.scrollTo({ top: 0 }); return; }
  if (ds.act === 'backSize') { S.creating = 'size'; return render(); }
  if (ds.act === 'backCrew') { S.creating = 'crew'; return render(); }
  if (ds.act === 'newCrew') { S.crewView = null; S.creating = 'newCrew'; render(); setTimeout(() => $('#nc-name')?.focus(), 50); return; }
  if (ds.crew) return openCrew(ds.crew);
  if (ds.act === 'copyCrewInvite') { const c = S.crews.find(x => x.id === ds.cid); return sendInvite(crewInviteText(c), crewLink(ds.cid), c?.name || 'Outta Here'); }
  if (ds.mode) { S.newMode = ds.mode; S.newPays = null; S.creating = 'form'; render(); window.scrollTo({ top: 0 }); return; }
  if (ds.act === 'backModes') { S.creating = 'mode'; return render(); }
  if (ds.when) { const [x, y] = ds.when.split('|'); for (const [id, v] of [['nt-start', x], ['nt-end', y]]) { const el = $('#' + id); if (el) el.value = v; DRAFT[id] = v; } return render(); }
  if (ds.act === 'cancelNew') { S.creating = null; S.newCrew = null; S.newSize = null; return render(); }
  if (ds.sec) { const sec = sections().find(x => x.k === ds.sec); S.tab = S.secTab[ds.sec] || (ds.sec === 'live' && !isLive() && !S.secTab.live ? 'live' : sec.tabs[0][0]); S.tabPicked = true; S.show = null; clearInterval(showTimer); render(); window.scrollTo({ top: 0 }); return; }
  if (ds.tab) { if (ds.tab === 'wrapped' && S.tid) lsSet('outta_wrapped_' + S.tid, true); S.guideJump = !!ds.guide; S.tab = TAB_ALIAS[ds.tab] || ds.tab; S.secTab[secOf(S.tab).k] = S.tab; S.tabPicked = true; if (ds.tab !== 'recap') { S.show = null; clearInterval(showTimer); } render(); window.scrollTo({ top: 0 }); return; }
  if (ds.tpluse) { S.repeat = { tpl: ds.tpluse, cid: S.crewView || S.trip?.crewId }; render(); setTimeout(() => $('#repeat-box')?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }), 60); return; }
  if (ds.tpldel) { const cid = S.crewView || S.trip?.crewId; if (S.db && cid) S.db.doc('crews/' + cid).update({ templates: { [ds.tpldel]: null } }).then(() => flash('Template deleted.'), e => flash(writeErr(e))); return; }
  if (ds.act === 'repeatClose') { S.repeat = null; return render(); }
  { const cid = S.crewView || S.trip?.crewId;
    if (ds.dnaedit) { S.dnaEdit = ds.dnaedit; render(); setTimeout(() => $('#dna-fix-' + ds.dnaedit)?.focus(), 50); return; }
    if (ds.dnahide) return dnaSave(cid, { hidden: { [ds.dnahide]: true } });
    if (ds.dnashow) return dnaSave(cid, { hidden: { [ds.dnashow]: null } });
    if (ds.dnareset) { S.dnaEdit = null; return dnaSave(cid, { fix: { [ds.dnareset]: null } }); }
    if (ds.dnaforget) { flash('Forgotten. It won’t shape new pitches.'); return dnaSave(cid, { forget: { [ds.dnaforget]: true } }); }
    if (ds.dnanote) return dnaSave(cid, { notes: { [ds.dnanote]: null } }); }
  if (ds.act === 'repeatGo') return once('repeat', repeatGo);
  if (ds.ack) return ackChange(ds.ack);
  if (ds.undo) return undoChange(ds.undo);
  if (ds.act === 'ackAll') return saveTrip({ changes: Object.fromEntries(logList().filter(x => needsMe(x)).map(x => [x.id, { seen: { [S.uid]: true } }])) });
  if (!S.trip) return;
  if (ds.jgo) return jGo(ds.jgo);
  if (ds.jnudge) return jNudge(ds.jnudge);
  if (ds.act === 'repeatOpen') { S.repeat = {}; render(); setTimeout(() => $('#repeat-box')?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }), 60); return; }
  if (ds.act === 'tplSave') return once('tpl', saveTemplate);
  if (ds.act === 'applyOutline') return applyOutline();
  if (ds.act === 'dropOutline') return saveTrip({ itinTpl: null });
  if (ds.status) return setStatus(ds.status);
  if (ds.kids) return setKids(kidsOf(meDoc()) + +ds.kids);
  if (ds.act === 'rsvpNudge') return rsvpNudge();
  if (ds.act === 'rsvpCountOut') return rsvpCountOut();
  if (ds.act === 'rsvpClear') return saveTrip({ rsvpBy: null });
  if (ds.budget) { saveMe({ budget: +ds.budget }); delete DRAFT['me-budget']; return; }
  if (ds.act === 'setupNext') return setupGo(1);
  if (ds.act === 'setupBack') return setupGo(-1);
  if (ds.act === 'setupLater') { setupSave(); S.setup = null; S.tab = 'overview'; render(); window.scrollTo({ top: 0 }); flash('No problem. Finish it any time in Home › Crew.'); return; }
  if (ds.join) return joinPlan(ds.join);
  if (ds.runoff) { const ro = runoffState(); if (!ro || ro.winner) return; return saveTrip({ roVotes: { [ro.key]: { [S.uid]: ds.runoff } } }); }
  if (ds.act === 'startRunoff') return startRunoff();
  if (ds.act === 'endRunoff') return saveTrip({ runoff: null });
  if (ds.act === 'nudgeSwipe') return sendInvite(`Swipe on our ${planWord()} options for ${S.trip.name}. We’re waiting on you!`, inviteLink(), S.trip.name);
  if (ds.day) {
    const days = new Set(meDoc()?.days || []), pref = new Set(meDoc()?.pref || []), d = ds.day;
    if (!days.has(d)) days.add(d); else if (!pref.has(d)) pref.add(d); else { days.delete(d); pref.delete(d); }
    return saveMe({ days: [...days].sort(), pref: [...pref].filter(x => days.has(x)).sort() });
  }
  if (ds.taskdone) { const x = (S.trip.tasks || {})[ds.taskdone]; if (x) { patchTask(ds.taskdone, { done: !x.done, doneBy: x.done ? '' : S.uid }); if (!x.done) flash(`Done: ${x.title}`); } return; }
  if (ds.taketask) return patchTask(ds.taketask, { owner: S.uid });
  if (ds.deltask) return saveTrip({ tasks: { [ds.deltask]: null } });
  if (ds.taskidea) return addTask(ds.taskidea);
  if (ds.recover !== undefined) { S.recover = ds.recover || null; S.rc = null; S.alts = null; render(); if (S.recover) setTimeout(() => $('#recover-box')?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }), 60); return; }
  if (ds.act === 'recoverApply' || ds.act === 'recoverDrop') { const ch = draftChange(); if (ch) applyChange(ch, readRcActs()); return; }
  if (ds.check) return saveTrip({ check: { votes: { [S.uid]: ds.check } } });
  if (ds.act === 'checkClose') return saveTrip({ check: null });
  if (ds.act === 'recoverAlts') return recoverAlts();
  if (ds.swapin !== undefined) { const o = S.alts?.options?.[+ds.swapin]; if (o) swapItem(o.title); return; }
  if (ds.act === 'linkReset') return saveTrip({ inviteKey: rid(6), invitesOff: false }).then(ok => ok && flash('New link made. Old invite links stop working for people who haven’t joined.'));
  if (ds.act === 'linkToggle') { const off = !S.trip.invitesOff; return saveTrip({ invitesOff: off }).then(ok => ok && flash(off ? 'Invites are off. Nobody new can join.' : 'Invites are back on.')); }
  if (ds.rmmember) { S.confirmRm = ds.rmmember; return render(); }
  if (ds.act === 'rmCancel') { S.confirmRm = null; return render(); }
  if (ds.rmdo) return removeMember(ds.rmdo);
  if (ds.mkorg) { const on = !(S.trip.orgs || {})[ds.mkorg]; return saveTrip({ orgs: { [ds.mkorg]: on || null } }).then(ok => ok && flash(on ? 'Now an organizer.' : 'No longer an organizer.')); }
  if (ds.act === 'passportImg') return makePassportImg();
  if (ds.nightvote) { const cur = (S.trip.nightVotes || {})[S.uid]; return saveTrip({ nightVotes: { [S.uid]: cur === ds.nightvote ? null : ds.nightvote } }); }
  if (ds.act === 'nextPlan') return S.trip.crewId ? startNewPlan(S.trip.crewId) : (goHome(), startNewPlan());
  if (ds.act === 'wiAdd') { S.whatif = [...(S.whatif || [{}]), {}]; return render(); }
  if (ds.wirm !== undefined) { const l = (S.whatif || [{}]).filter((_, j) => j !== +ds.wirm); S.whatif = l.length ? l : [{}]; return render(); }
  if (ds.wiapply !== undefined) return whatifApply(+ds.wiapply);
  if (ds.act === 'costAI') return estimateCosts();
  if (ds.costkeep) { const h = costHints()[ds.costkeep]; if (h) saveTrip({ costs: { [ds.costkeep]: { low: h.low, high: h.high, src: h.src, note: h.note, by: S.uid, at: Date.now() } } }); return; }
  if (ds.flex) { const f = { ...(meDoc()?.flex || {}) }; f[ds.flex] = !f[ds.flex]; return saveMe({ flex: f }, true); }
  if (ds.act === 'allDays') return saveMe({ days: span(S.trip.winStart, S.trip.winEnd) }, true);
  if (ds.act === 'noDays') return saveMe({ days: [], pref: [] }, true);
  if (ds.act === 'weekends') return saveMe({ days: span(S.trip.winStart, S.trip.winEnd).filter(x => [0, 5, 6].includes(D(x).getUTCDay())) }, true);
  if ((ds.lockdates || ds.lockdest || ds.lockpitch) && !canLock()) { flash('Only organizers can lock this one. Your vote still counts.'); return; }
  if (ds.lockdates || ds.lockdest || ds.lockpitch) { const g = lockGate(ds.lockpitch ? 'pitch' : ds.lockdest ? 'dest' : 'dates', ds.lockpitch || ds.lockdest || ds.lockdates); if (!g.ok) { flash(g.why); return; } }
  if (ds.consent) return toggleConsent(ds.consent);
  if (ds.need) { const [sec, k] = ds.need.split('|'); return toggleNeed(sec, k); }
  if (ds.decide) { if (!isOrganizer() || ds.decide === decideOf().style) return; return saveTrip(withLog({ decide: { style: ds.decide, ...(ds.decide === 'pick' && !decideOf().by ? { by: add(TODAY, 3) } : {}) } }, { area: 'rules', text: `How we decide: ${STYLES[ds.decide][0]}`, act: 'all', undo: { k: 'set', patch: { decide: { style: decideOf().style } } } })); }
  if (ds.lockdates) { const [start, end] = ds.lockdates.split('|'); return saveTrip(withLog({ lockedDates: { start, end } }, { area: 'dates', text: `${start === end ? 'Day' : 'Dates'} locked: ${dayRange(start, end)}`, act: 'all', undo: { k: 'set', patch: { lockedDates: S.trip.lockedDates || null } } })).then(ok => ok && celebrate(dayRange(start, end), planColor(S.trip), start === end ? 'Day locked!' : 'Dates locked!')); }
  if (ds.act === 'unlockDates') return saveTrip(withLog({ lockedDates: null }, { area: 'dates', text: 'Dates unlocked', act: 'all', undo: { k: 'set', patch: { lockedDates: S.trip.lockedDates || null } } }));
  if (ds.vote) { const set = new Set(meDoc()?.votes || []); set.has(ds.vote) ? set.delete(ds.vote) : set.add(ds.vote); return saveMe({ votes: [...set] }, true); }
  if (ds.lockdest) return saveTrip(withLog({ lockedDest: ds.lockdest }, { area: 'dest', text: `${isSmall() ? 'Plan' : 'Destination'} locked: ${(S.trip.destinations || []).find(x => x.id === ds.lockdest)?.city || ''}`, act: 'all', undo: { k: 'set', patch: { lockedDest: S.trip.lockedDest || null } } }));
  if (ds.act === 'unlockDest') return saveTrip(withLog({ lockedDest: null }, { area: 'dest', text: `${dest()?.city || 'Destination'} unlocked`, act: 'all', undo: { k: 'set', patch: { lockedDest: S.trip.lockedDest || null } } }));
  if (ds.deldest) return saveTrip({ destinations: (S.trip.destinations || []).filter(x => x.id !== ds.deldest), ...(S.trip.lockedDest === ds.deldest ? { lockedDest: null } : {}) });
  if (ds.vibe) { const set = new Set(S.trip.vibes || []); set.has(ds.vibe) ? set.delete(ds.vibe) : set.add(ds.vibe); return saveTrip({ vibes: [...set] }); }
  if (ds.act === 'card') return makeCard();
  if (ds.act === 'genPitches') return genPitches();
  if (ds.act === 'growPlan') return growPlan();
  if (ds.setsize) { const k = ds.setsize, small = ['hangout', 'day'].includes(k), n = small ? 0 : (isSmall() ? SIZES[k].nights : nightsSet(S.trip)); return saveTrip({ size: k, nights: n, ...(n !== nightsSet(S.trip) ? { lockedDates: null } : {}), ...(S.trip.winEnd < add(TODAY, SIZES[k].win) ? { winEnd: add(TODAY, SIZES[k].win) } : {}) }); }
  if (ds.act === 'copyInvite') return sendInvite(inviteText(S.trip), inviteLink(), S.trip.name);
  if (ds.setnights) return saveTrip({ nights: +ds.setnights, lockedDates: null });
  if (ds.act === 'ciJump') return jumpTo('#ci-text');
  if (ds.act === 'meetJump') return jumpTo('#meet-where');
  if (ds.pin) { S.pinSel = S.pinSel === ds.pin ? null : ds.pin; return render(); }
  if (ds.act === 'pinPlaces') return pinPlaces();
  if (ds.act === 'lostOpen') { S.lostOpen = true; return render(); }
  if (ds.act === 'lostClose') { S.lostOpen = false; return render(); }
  if (ds.lostat) return sendLost(ds.lostat);
  if (ds.found) return foundLost(ds.found);
  if (ds.hang) { const n = +ds.hang, day = isLive() ? TODAY : dates()?.start, cur = ((S.trip.hangover || {})[day] || {})[S.uid]; return saveTrip({ hangover: { [day]: { [S.uid]: cur === n ? 0 : n } } }); }
  if (ds.act === 'hangPlan') return hangPlan(isLive() ? TODAY : dates()?.start);
  if (ds.act === 'hangApply') return applyHang();
  if (ds.act === 'hangCancel') { S.hangPlan = null; return render(); }
  if (ds.act === 'writeRecap') return writeRecap(ds.day);
  if (ds.act === 'findStays') return findStays();
  if (ds.lockstay !== undefined) { if (!canLock()) { flash('Only organizers can lock this one. Your vote still counts.'); return; } const it = S.trip.stays?.items?.[+ds.lockstay]; if (it) return setStay({ ...it }).then(ok => ok && flash(`Locked ${it.name} as your stay.`)); return; }
  if (ds.act === 'unlockStay') return saveTrip(withLog({ stay: null }, { area: 'stay', text: `Stay unlocked: ${S.trip.stay?.name || ''}`, act: 'all', undo: { k: 'set', patch: { stay: S.trip.stay }, clear: ['stay'] } }));
  if (ds.act === 'addStayOpen') { S.addStay = true; render(); setTimeout(() => $('#os-url')?.focus(), 60); return; }
  if (ds.act === 'addStayClose') { S.addStay = false; return render(); }
  if (ds.lockown) { if (!canLock()) { flash('Only organizers can lock this one. Your vote still counts.'); return; } const s = (S.trip.myStays || {})[ds.lockown]; if (s) return setStay(stayFromOwn(ds.lockown, s)).then(ok => ok && flash(`Locked ${s.name} as your stay.`)); return; }
  if (ds.delown) return saveTrip({ myStays: { [ds.delown]: null } });
  if (ds.delspend) return saveMySpend((S.mySpend || []).filter(x => x.id !== ds.delspend));
  if (ds.delpot) return delSub('pot', ds.delpot);
  if (ds.act === 'copyPot') { const ins = S.pot.filter(p => p.kind === 'in'), tin = ins.reduce((a, p) => a + p.amount, 0), bal = tin - S.pot.filter(p => p.kind === 'out').reduce((a, p) => a + p.amount, 0); return copy(`Pot check! Only ${money2(bal)} left in the ${S.trip.name} pot. Chip in about $30 each to ${nameOf(S.trip.potKeeper || S.trip.createdBy)} so the Ubers keep coming.`); }
  if (ds.act === 'wrapNext') { S.wrapI = (S.wrapI || 0) + 1; return render(); }
  if (ds.act === 'wrapPrev') { S.wrapI = Math.max(0, (S.wrapI || 0) - 1); return render(); }
  if (ds.act === 'wrappedCard') return makeWrappedCard();
  if (ds.setpays) { const k = ds.setpays; return saveTrip({ pays: k, ...(k === 'one' && !S.trip.payer ? { payer: S.trip.createdBy || S.uid } : {}) }); }
  if (ds.setmode) { S.wrapI = 0; return saveTrip({ mode: ds.setmode }); }
  if (ds.reveal) { const it = (S.trip.itinerary || []).map(i => i.id === ds.reveal ? { ...i, revealed: true } : i); flash('Surprise revealed.'); return saveTrip({ itinerary: it }); }
  if (ds.swipe) { const [pid, v] = ds.swipe.split('|'); return castVote(pid, +v, t); }
  if (ds.lockpitch) return lockPitch(ds.lockpitch);
  if (ds.checkin) { const c = { text: ds.checkin, at: Date.now() }; return saveMe({ checkin: c, checkins: [...(meDoc()?.checkins || []), c].slice(-40) }, true); }
  if (ds.act === 'clearMeet') return saveTrip(withLog({ meet: null }, { area: 'meet', text: 'Meeting point cleared', act: 'all', undo: { k: 'set', patch: { meet: S.trip.meet } } }));
  if (ds.hype) return postFeed(ds.hype);
  if (ds.delfeed) return delSub('feed', ds.delfeed);
  if (ds.bkdone) { const it = S.bucket.find(x => x.id === ds.bkdone); if (!it) return; const s2 = new Set(it.doneBy || []); const da = { ...(it.doneAt || {}) }; if (s2.has(S.uid)) { s2.delete(S.uid); delete da[S.uid]; } else { s2.add(S.uid); da[S.uid] = Date.now(); } return putSub('bucket', it.id, { doneBy: [...s2], doneAt: da }, true); }
  if (ds.delbk) return delSub('bucket', ds.delbk);
  if (ds.super) { const [k, id] = ds.super.split('|'); const cur = ((S.trip.superVotes || {})[k] || {})[S.uid]; return saveTrip({ superVotes: { [k]: { [S.uid]: cur === id ? '' : id } } }); }
  if (ds.act === 'awardsCard') return makeAwards();
  if (ds.act === 'collage') return makeCollage();
  if (ds.act === 'saveImg') return saveImg();
  if (ds.act === 'closeImg') { S.img = null; return render(); }
  if (ds.show !== undefined) return openShow(+ds.show);
  if (ds.act === 'showClose') return closeShow();
  if (ds.act === 'showNext') { S.show = (S.show + 1) % S.photos.length; return openShow(S.show); }
  if (ds.act === 'showPrev') { S.show = (S.show - 1 + S.photos.length) % S.photos.length; return openShow(S.show); }
  if (ds.delphoto) return delPhoto(ds.delphoto);
  if (ds.act === 'syncCrew') { const c = S.crews.find(x => x.id === S.trip.crewId); return saveCrew(c ? c.name : S.trip.name); }
  if (ds.qrunoff) { const [k, v] = ds.qrunoff.split('|'); const cur = (meDoc()?.runoff || {})[k]; return saveMe({ runoff: { ...(meDoc()?.runoff || {}), [k]: cur === v ? '' : v } }, true); }
  if (ds.act === 'delTicket') return delTicket();
  if (ds.act === 'askDelete') { S.confirm = 'delete'; return render(); }
  if (ds.act === 'askLeave') { S.confirm = 'leave'; return render(); }
  if (ds.act === 'cancelConfirm') { S.confirm = null; return render(); }
  if (ds.act === 'doDelete') return once('delete', () => deleteTrip(S.tid));
  if (ds.act === 'doLeave') return leaveTrip();
  if (ds.act === 'closeCard') { S.cardUrl = null; S.cardBlob = null; return render(); }
  if (ds.act === 'saveCard') return saveCard();
  if (ds.act === 'copyNudge') {
    const lines = nudges().map(x => `• ${x.m.nick || 'Someone'}: ${x.todo.join(', ')}`);
    return copy(`${S.trip.name} check-in! We're close, just need:\n${lines.join('\n')}\n\nTakes 2 minutes. Open Outta Here and knock it out.`);
  }
  if (ds.quiz) { const [k, v] = ds.quiz.split('|'); return saveMe({ quiz: { ...(meDoc()?.quiz || {}), [k]: v } }, true); }
  if (ds.react) { const [key, v] = ds.react.split('|'); const nv = score(key).mine === +v ? 0 : +v; return saveTrip({ reactions: { [key]: { [S.uid]: nv } } }); }
  if (ds.split) { const s = new Set(S.split || active().map(m => m.id)); s.has(ds.split) ? s.delete(ds.split) : s.add(ds.split); S.split = s; return render(); }
  if (ds.delexp) return delSub('expenses', ds.delexp);
  if (ds.claim) return putSub('packing', ds.claim, { claimedBy: S.uid }, true);
  if (ds.unclaim) return putSub('packing', ds.unclaim, { claimedBy: null }, true);
  if (ds.pack) { const s = new Set(meDoc()?.packed || []); s.has(ds.pack) ? s.delete(ds.pack) : s.add(ds.pack); return saveMe({ packed: [...s] }); }
  if (ds.delpack) return delSub('packing', ds.delpack);
  if (ds.act === 'pack') return buildPacking();
  if (ds.act === 'spots') return findSpots();
  if (ds.act === 'deals') return findDeals();
  if (ds.act === 'plan') return draftPlan();
  if (ds.act === 'clearAI') return saveTrip({ itinerary: (S.trip.itinerary || []).filter(i => !isDraft(i)) });
  if (ds.addspot) {
    const s = S.trip.spots.items[+ds.addspot], d = dates(); if (!s || !d) return;
    const days = span(d.start, d.end).slice(0, -1);
    const pref = days.find(x => (s.bestNight || '').toLowerCase().startsWith(dow(x).toLowerCase())) || days[0] || d.start;
    flash(`Added ${s.name} to ${fmt(pref)}`);
    const at = planKind().spots?.add(s) || { time: s.type === 'late-night food' ? '01:30' : '22:30', kind: 'nightlife' };
    return saveTrip({ itinerary: [...(S.trip.itinerary || []), { id: rid(6), date: pref, ...at, title: s.name, note: s.why || '', src: 'pick' }] });
  }
  if (ds.delitem) { const it = (S.trip.itinerary || []).find(i => i.id === ds.delitem); if (!it) return; return saveTrip(withLog({ itinerary: (S.trip.itinerary || []).filter(i => i.id !== ds.delitem), ...(it.secret ? {} : { dropped: dropTitle(S.trip.dropped, it.title) }) }, { area: 'plan', text: `${it.title} removed from the plan`, act: it.secret ? '' : 'all', undo: { k: 'item', item: it } })); }
  if (ds.edititem) { S.editItem = ds.edititem; render(); setTimeout(() => $('#ei-time')?.focus(), 50); return; }
  if (ds.act === 'editItemCancel') { S.editItem = null; return render(); }
});
app.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'me-nick') saveMe({ nick: e.target.value.trim().slice(0, 30) }, true, true);
  if (/^cost-(low|high|src)-/.test(id)) saveCostLine(id.replace(/^cost-(low|high|src)-/, ''));
  { const w = id.match(/^wi-(start|nights|dest|stay)-(\d)$/); if (w) whatifSet(+w[2], { [w[1]]: w[1] === 'nights' ? +e.target.value : e.target.value || undefined }); }
  { const rk = { 'recover-who': 'who', 'recover-item': 'item', 'rc-line': 'line', 'rc-amount': 'amount', 'rc-start': 'start', 'rc-end': 'end', 'rc-reopen': 'reopen' }[id];
    if (rk) { S.rc = { ...(S.rc || {}), acts: readRcActs(), [rk]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }; if (rk === 'item') S.alts = null; if (rk === 'start' && !S.rc.end && S.trip.lockedDates) { const L = S.trip.lockedDates; S.rc.end = add(e.target.value, span(L.start, L.end).length - 1); } delete DRAFT[id]; render(); } }
  if (id.startsWith('rc-act-')) S.rc = { ...(S.rc || {}), acts: readRcActs() };
  if (id === 'mute-plan') { lsSet('outta_mute_' + S.tid, e.target.checked); flash(e.target.checked ? 'Muted. It won’t show up in Needs you.' : 'Reminders are back on for this plan.'); }
  if (id === 'perm-invite' || id === 'perm-lock') saveTrip({ perm: { [id.slice(5)]: e.target.value } });
  if (id === 'me-budgetPublic') saveMe({ budgetPublic: e.target.checked }, true, true);
  if (id.startsWith('nd-share-')) setNeed({ share: { ...(needsOf(meDoc() || {}).share || {}), [id.slice(9)]: e.target.value } });
  if (['nd-dietNote', 'nd-accessNote', 'nd-depart', 'nd-arrive', 'nd-maxTravel'].includes(id)) { setNeed({ [id.slice(3)]: id === 'nd-maxTravel' ? +e.target.value : e.target.value.trim().slice(0, 80) }); delete DRAFT[id]; }
  if (id === 'nd-noRedeye' || id === 'nd-noFly') setNeed({ [id.slice(3)]: e.target.checked });
  if (id === 'dec-pct') saveTrip({ decide: { pct: +e.target.value } });
  if (id === 'dec-by') saveTrip({ decide: { by: e.target.value || '' } });
  if (id === 'me-hardBudget') saveMe({ hard: { ...(meDoc()?.hard || {}), budget: e.target.checked } }, true);
  if (id === 'me-hardDays') saveMe({ hard: { ...(meDoc()?.hard || {}), days: e.target.checked } }, true);
  if (id === 'me-condUnder' || id === 'me-condNote') { const u = Math.max(0, Math.round(+$('#me-condUnder').value || 0)), note = $('#me-condNote').value.trim().slice(0, 80); saveMe({ cond: u || note ? { under: u, note } : null }, true); }
  if (id === 'me-hideLoc') saveMe({ hideLoc: e.target.checked }, true, true);
  if (id === 'my-flight-price') { const v = Math.round(+e.target.value || 0); if (v > 0) saveTrip({ tickets: { [S.uid]: { price: v } } }).then(ok => ok && flash('Got it. Your flight is in the cost now.')); }
  if (id === 'set-cur' && CUR_CODES.includes(e.target.value)) { saveTrip(withLog({ currency: e.target.value }, { area: 'money', text: `Currency changed to ${e.target.value}`, undo: { k: 'set', patch: { currency: cur() } } })); flash(`Now in ${e.target.value}. Amounts already typed in weren’t converted.`); }
  if (id === 'my-cur' && CUR_CODES.includes(e.target.value)) { try { localStorage.setItem('outta_mycur', e.target.value); } catch {} render(); }
  if (id === 'cost-buffer') saveTrip({ costBuffer: +e.target.value });
  if (id.startsWith('task-owner-')) patchTask(id.slice(11), { owner: e.target.value });
  if (id.startsWith('task-due-')) patchTask(id.slice(9), { due: e.target.value });
  if (id === 'rsvp-by') saveTrip({ rsvpBy: e.target.value || null });
  if (id === 'me-home') saveMe({ home: e.target.value.trim().slice(0, 40) }, true, true);
  if (id === 'me-budget') saveMe({ budget: Math.max(0, Math.round(+e.target.value || 0)) }, true, true);
  if (id === 'ph-files') { const files = [...e.target.files]; e.target.value = ''; once('photos-up', () => uploadPhotos(files)); return; }
  if (id === 'set-honoree') { saveTrip({ honoree: e.target.value || null }); return; }
  if (id === 'set-payer') { if (e.target.value) saveTrip({ payer: e.target.value }); return; }
  if (e.target.name === 'nt-pays') { S.newPays = e.target.value; return render(); }
  if (id === 'set-free') { saveTrip({ honoreeFree: e.target.checked }); return; }
  if (id === 'pot-keeper') { saveTrip({ potKeeper: e.target.value }); return; }
  if (id === 'tk-file') { S.tkFile = e.target.files[0] || null; render(); }
  if (id === 'me-venmo') saveMe({ venmo: handle(e.target.value).slice(0, 40) }, true, true);
  if (id === 'me-cash') saveMe({ cashapp: handle(e.target.value).slice(0, 40) }, true, true);
  if (id === 'nights') saveTrip({ nights: +e.target.value, lockedDates: null });
  if (id === 'win-start' || id === 'win-end') {
    delete DRAFT['win-start']; delete DRAFT['win-end'];
    let a = $('#win-start').value, b = $('#win-end').value;
    if (!a || !b) return;
    if (b < a) { flash('The latest date has to be after the earliest one.'); render(); return; }
    if (span(a, b).length >= 92) { b = add(a, 90); flash('The window can be up to 3 months, so the end moved to ' + short(b) + '.'); }
    const patch = { winStart: a, winEnd: b }, L = S.trip.lockedDates;
    if (L && (L.start < a || L.end > b)) { patch.lockedDates = null; flash('Your locked dates were outside the new window, so they’re unlocked.'); }
    saveTrip(patch);
    return;
  }
  if (id.startsWith('me-') || id === 'nights') delete DRAFT[id];
});
// Escape closes whatever is open on top (a sheet, a confirmation, an inline editor) and
// puts focus back on the button that opened it.
let opener = null;
app.addEventListener('click', e => { const b = e.target.closest('button'); if (b) opener = b; }, true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const layers = [
    [S.lostOpen, () => { S.lostOpen = false; }], [S.show !== null && S.show !== undefined, () => { S.show = null; clearInterval(showTimer); }],
    [S.confirmCrew, () => { S.confirmCrew = null; }], [S.confirmHome, () => { S.confirmHome = null; }], [S.confirm, () => { S.confirm = null; }], [S.confirmRm, () => { S.confirmRm = null; }],
    [S.editItem, () => { S.editItem = null; }], [S.repeat, () => { S.repeat = null; }], [S.recover, () => { S.recover = null; S.rc = null; }],
    [S.addStay, () => { S.addStay = false; }], [S.remindOpen, () => { S.remindOpen = false; }], [S.dnaEdit, () => { S.dnaEdit = null; }],
  ];
  const top = layers.find(([on]) => on); if (!top) return;
  e.preventDefault(); top[1](); render();
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
});
app.addEventListener('keydown', e => { const p = e.target.closest && e.target.closest('[data-pin]'); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); p.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
// swipe left/right on a phone to move between the tabs of a menu
let swipe0 = null;
app.addEventListener('touchstart', e => {
  swipe0 = null;
  if (!S.tid || e.touches.length !== 1 || e.target.closest('input,textarea,select,.pitch,.map,.subtabs,.wslide,.show,.sheet,.cal,.feed,.board,.photos')) return;
  swipe0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
}, { passive: true });
app.addEventListener('touchend', e => {
  if (!swipe0) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe0.x, dy = t.clientY - swipe0.y, quick = Date.now() - swipe0.at < 600;
  swipe0 = null;
  if (!quick || Math.abs(dx) < 80 || Math.abs(dy) > 50) return;
  const sec = secOf(S.tab), i = sec.tabs.findIndex(x => x[0] === S.tab), j = i + (dx < 0 ? 1 : -1);
  if (i < 0 || j < 0 || j >= sec.tabs.length) return;
  S.tab = sec.tabs[j][0]; S.secTab[sec.k] = S.tab; S.tabPicked = true;
  render(); window.scrollTo({ top: 0 });
}, { passive: true });
// opening an invite link while the app is already open only changes the #code, so watch for it
window.addEventListener('hashchange', () => { const h = (location.hash || '').slice(1); if (!S.db) return; const cm = h.match(/^c-([a-z0-9]{6,20})$/); if (cm && cm[1] !== S.crewView) return joinCrew(cm[1]); const th = parseTripHash(h); if (th && th.key) S.linkKey = th.key; if (th && th.tid !== S.tid) return openTrip(th.tid); if (/^[a-z0-9]{6,20}$/.test(h) && h !== S.tid) openTrip(h); });
let lastDown = null;
app.addEventListener('pointerdown', e => { const f = e.target.closest && e.target.closest('input,textarea,select'); lastDown = f && f.id ? { id: f.id, at: Date.now() } : null; }, true);
// keep half-typed text when someone else's change re-renders the page
const DRAFT = {};
app.addEventListener('input', e => {
  if (e.target.id && e.target.type !== 'file') DRAFT[e.target.id] = e.target.value;
  // the new plan's cover preview shows the name as it's typed
  if (e.target.id === 'me-home' || e.target.id === 'me-budget') setupLive();
  if (e.target.id === 'nt-name') { const t = $('.nf-pv-title'), v = e.target.value.trim(); if (t) { t.textContent = v || e.target.placeholder; t.classList.toggle('is-ph', !v); } }
});
const clearDrafts = f => f.querySelectorAll('[id]').forEach(el => delete DRAFT[el.id]);
app.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  clearDrafts(f);
  if (f.id === 'newTrip') return once('create', createTrip);
  if (f.id === 'newCrewForm') { const n = $('#nc-name').value.trim(); if (n) return once('crew', () => createCrew(n)); return; }
  if (f.id === 'dnaNote') { const text = $('#dna-note').value.trim().slice(0, 80); if (!text) return; $('#dna-note').value = ''; return dnaSave(S.crewView || S.trip?.crewId, { notes: { [rid(6)]: { text, by: S.uid, at: Date.now() } } }); }
  if (f.classList.contains('dna-fix')) { const k = f.dataset.k, v = ($('#dna-fix-' + k)?.value || '').trim().slice(0, 50); S.dnaEdit = null; render(); return dnaSave(S.crewView || S.trip?.crewId, { fix: { [k]: v || null } }); }
  if (f.id === 'tkForm') return once('ticket-send', sendTicket);
  if (f.id === 'swapForm') return swapItem($('#swap-title').value);
  if (f.id === 'ownStayForm') return addOwnStay(e.submitter?.dataset.how === 'lock');
  if (f.id === 'stayBookForm') { const v = Math.max(0, Math.round(+($('#sb-total')?.value || 0))); return saveTrip({ stay: { booked: true, bookedBy: S.uid, bookedAt: Date.now(), ...(v ? { total: v } : {}) } }).then(ok => ok && flash('Stay marked as booked.')); }
  if (f.id === 'addTask') { addTask($('#task-title').value); $('#task-title').value = ''; return; }
  if (f.id === 'lostForm') return sendLost($('#lost-where').value);
  if (f.id === 'spendForm') { const note = $('#sp-note').value.trim(), amount = Math.round(+$('#sp-amt').value * 100) / 100; if (!note || !(amount > 0)) return; return saveMySpend([...(S.mySpend || []), { id: rid(6), note: note.slice(0, 50), amount, at: Date.now() }]); }
  if (f.id === 'potIn') { const amount = Math.round(+$('#pi-amt').value * 100) / 100; if (!(amount > 0)) return; return putSub('pot', rid(8), { kind: 'in', by: $('#pi-by').value, amount, note: '', at: Date.now() }); }
  if (f.id === 'potOut') { const amount = Math.round(+$('#po-amt').value * 100) / 100, note = $('#po-note').value.trim(); if (!(amount > 0) || !note) return; return putSub('pot', rid(8), { kind: 'out', by: S.uid, amount, note: note.slice(0, 50), at: Date.now() }); }
  if (f.id === 'arrForm') {
    const arrive = $('#arr-time').value, apt = $('#arr-apt').value.trim();
    if (!arrive) { flash('Add when you land.'); return; }
    return saveMe({ arrive, arrAirport: isCode(apt) ? apt.toUpperCase() : apt.slice(0, 3).toUpperCase(), flight: $('#arr-flight').value.trim().slice(0, 20) }, true);
  }
  if (f.id === 'editItemForm') return saveItemEdit(f.dataset.id);
  if (f.id === 'meetForm') { const text = $('#meet-where').value.trim(), time = $('#meet-time').value; if (!text) return; const old = S.trip.meet, meet = { text: text.slice(0, 80), time, by: S.uid, at: Date.now() }; return saveTrip(withLog({ ...(old ? { meet: null } : {}) }, { area: 'meet', text: `Meet ${old ? 'moved to' : 'at'} ${text.slice(0, 80)}${time ? ', ' + t12(time) : ''}`, act: 'all', undo: { k: 'set', patch: { meet: old || null }, clear: ['meet'], after: { meet } } })).then(() => saveTrip({ meet })); }
  if (f.id === 'ciForm') { const text = $('#ci-text').value.trim(); if (!text) return; const c = { text: text.slice(0, 60), at: Date.now() }; return saveMe({ checkin: c, checkins: [...(meDoc()?.checkins || []), c].slice(-40) }, true); }
  if (f.id === 'feedForm') return postFeed($('#fd-text').value, $('#fd-secret')?.checked);
  if (f.id === 'bkForm') { const text = $('#bk-text').value.trim(); if (!text) return; return putSub('bucket', rid(8), { text: text.slice(0, 80), points: +$('#bk-pts').value || 1, doneBy: [], by: S.uid, at: Date.now() }); }
  if (f.id === 'crewForm') { const n = $('#crew-name').value.trim(); if (n) return saveCrew(n); return; }
  if (f.id === 'expForm') {
    const title = $('#ex-what').value.trim(), amount = Math.round(+$('#ex-amt').value * 100) / 100, paidBy = $('#ex-by').value;
    const ids = new Set(active().map(m => m.id));
    const split = [...(S.split || new Set([...ids].filter(id => !(honoreeFree() && id === S.trip.honoree))))].filter(id => ids.has(id));
    if (!title || !(amount > 0)) return;
    if (!split.length) { flash('Pick at least one person to split with.'); return; }
    S.split = null;
    return putSub('expenses', rid(8), { title: title.slice(0, 60), amount, paidBy, split, by: S.uid, at: Date.now() });
  }
  if (f.id === 'packForm') {
    const text = $('#pk-text').value.trim(); if (!text) return;
    return putSub('packing', rid(8), { text: text.slice(0, 80), kind: $('#pk-kind').value, claimedBy: null, at: Date.now() });
  }
  if (f.id === 'addDest') {
    const city = $('#ad-city').value.trim(), code = $('#ad-code').value.trim();
    if (!city) return;
    const d = { id: rid(6), city: city.slice(0, 50), code: isCode(code) ? code.toUpperCase() : '' };
    await saveTrip({ destinations: [...(S.trip.destinations || []), d] });
    const set = new Set(meDoc()?.votes || []); set.add(d.id); saveMe({ votes: [...set] }, true);
    return;
  }
  if (f.classList.contains('addItem')) {
    const date = f.dataset.date, title = $('#ai-title-' + date).value.trim(), time = $('#ai-time-' + date).value;
    if (!title) return;
    saveTrip({ itinerary: [...(S.trip.itinerary || []), { id: rid(6), date, time, title: title.slice(0, 120), kind: 'plan', note: '', secret: !!$('#ai-secret-' + date)?.checked }] });
  }
});

