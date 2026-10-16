/* ---------- to-dos: who's doing what ---------- */
// Each job has an owner and a due date, so the organizer isn't doing everything.
// Stored on the plan as tasks: { id: { title, owner, due, done, by, at } }.
const TASK_IDEAS = {
  hangout: ['Book the table', 'Pick where we meet', 'Send everyone the final details'],
  day: ['Check how we get there', 'Buy the tickets', 'Book lunch', 'Send everyone the final details'],
  weekend: ['Research stays', 'Book the stay', 'Sort out the drive', 'Plan the big night', 'Send everyone the final details'],
  trip: ['Research stays', 'Book the stay', 'Check airport transport', 'Book the big dinner', 'Send everyone the final details'],
};
const taskList = () => Object.entries(S.trip.tasks || {}).filter(([, x]) => x).map(([id, x]) => ({ id, ...x }))
  .sort((a, b) => (a.done - b.done) || ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (a.at || 0) - (b.at || 0)));
function tasksTab() {
  const list = taskList(), ms = S.members.filter(m => m.status !== 'out'), open = list.filter(x => !x.done);
  const load = ms.map(m => [m, open.filter(x => x.owner === m.id).length]).sort((a, b) => b[1] - a[1]);
  const lopsided = load.length > 1 && load[0][1] >= 3 && load[0][1] - load[load.length - 1][1] >= 3;
  const ideas = TASK_IDEAS[size()].filter(t => !list.some(x => x.title.toLowerCase() === t.toLowerCase()));
  const row = x => {
    const late = !x.done && x.due && x.due < TODAY;
    return `<div class="task ${x.done ? 'is-done' : ''}" data-key="task-${esc(x.id)}">
      <button class="box ${x.done ? 'on' : ''}" data-taskdone="${esc(x.id)}" aria-pressed="${!!x.done}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}: ${esc(x.title)}">${x.done ? '✓' : ''}</button>
      <div class="task-main" data-task="${esc(x.id)}">
        <b>${esc(x.title)}</b>
        <div class="task-meta">
          <select id="task-owner-${esc(x.id)}" aria-label="Who’s on it"><option value="">Nobody yet</option>${ms.map(m => `<option value="${esc(m.id)}" ${x.owner === m.id ? 'selected' : ''}>${esc(m.nick || 'Someone')}${m.id === S.uid ? ' (you)' : ''}</option>`).join('')}</select>
          <input id="task-due-${esc(x.id)}" type="date" value="${esc(x.due || '')}" aria-label="Due date">
          ${late ? '<span class="pill out" style="color:#D63B3B">Overdue</span>' : ''}
          ${!x.owner && !x.done ? `<button class="btn sm primary" data-taketask="${esc(x.id)}">I’ll take it</button>` : ''}
        </div>
      </div>
      <button class="x" data-deltask="${esc(x.id)}" aria-label="Delete ${esc(x.title)}">×</button>
    </div>`;
  };
  return `<section class="card stack">
    <div class="row" style="justify-content:space-between"><div class="stack" style="gap:2px"><h2>Who’s doing what</h2><span class="small muted">Give every job an owner and a date so it doesn’t all land on one person.</span></div>
      <span class="small muted">${list.filter(x => x.done).length}/${list.length} done</span></div>
    ${lopsided ? `<div class="banner"><span><b>${esc(load[0][0].nick || 'Someone')} has ${load[0][1]} open jobs.</b> ${esc(listNames(load.filter(([, n]) => n === 0).map(([m]) => m)))} ${load.filter(([, n]) => n === 0).length === 1 ? 'has' : 'have'} none. Spread it out.</span></div>` : ''}
    ${list.length ? `<div class="tasks">${list.map(row).join('')}</div>` : '<div class="empty"><span>No to-dos yet. Add the jobs that need doing, or start from the suggestions below.</span></div>'}
    <form id="addTask" class="row" style="gap:6px;align-items:flex-end"><label class="field" style="flex:1 1 220px"><span class="label">New to-do</span><input id="task-title" maxlength="80" required placeholder="${esc(TASK_IDEAS[size()][0])}"></label><button class="btn primary" type="submit">Add</button></form>
    ${ideas.length ? `<div class="stack" style="gap:6px"><span class="label">Suggestions</span><div class="row" style="gap:6px">${ideas.map(t => `<button class="chip" data-taskidea="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div></div>` : ''}
  </section>`;
}
function addTask(title) {
  title = String(title || '').trim().slice(0, 80); if (!title) return;
  const id = rid(6);
  saveTrip({ tasks: { [id]: { title, owner: '', due: '', done: false, by: S.uid, at: Date.now() } } });
}
const patchTask = (id, patch) => {
  const x = (S.trip.tasks || {})[id]; if (!x) return;
  const handed = patch.owner && patch.owner !== S.uid && patch.owner !== x.owner;
  saveTrip(handed ? withLog({ tasks: { [id]: patch } }, { area: 'tasks', text: `${nameOf(patch.owner)} is on “${x.title}”`, act: 'some', who: [patch.owner] }) : { tasks: { [id]: patch } });
};

