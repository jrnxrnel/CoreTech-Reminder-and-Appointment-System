'use strict';

/* ============================================================
   Tempo — dashboard
   ============================================================ */

function renderDashboard() {
  return `
    <div class="dash">
      ${dashboardStatsHTML()}
      ${dashboardNextHTML()}
      <div class="dash-grid">
        ${dashboardScheduleHTML()}
        ${dashboardRemindersHTML()}
      </div>
    </div>`;
}

function dashboardStatsHTML() {
  const now = Date.now();
  const today = todayISO();
  const todays = data.appointments.filter((a) => a.date === today && a.status !== 'cancelled');
  const upcomingToday = todays.filter((a) => ['scheduled', 'confirmed'].includes(a.status) && apptStart(a).getTime() >= now);
  const weekStart = startOfWeekDate(new Date());
  const weekStartISO = toISO(weekStart);
  const weekEndISO = addDaysISO(weekStartISO, 6);
  const weekList = data.appointments.filter((a) =>
    a.date >= weekStartISO && a.date <= weekEndISO && a.status !== 'cancelled'
  );
  const pending = data.appointments.filter((a) =>
    a.status === 'scheduled' && apptEnd(a).getTime() >= now
  );
  const clientsWithUpcoming = data.clients.filter((c) => upcomingCountForClient(c.id) > 0).length;

  const todayNote = todays.length === 0
    ? 'Nothing scheduled yet'
    : upcomingToday.length
      ? `<strong>${upcomingToday.length}</strong> still ahead`
      : 'All done for today';
  const weekNote = `${fmtDateShort(weekStartISO)} – ${fmtDateShort(weekEndISO)}`;
  const pendingNote = pending.length ? 'Awaiting confirmation' : 'Everything confirmed';
  const clientNote = clientsWithUpcoming
    ? `<strong>${clientsWithUpcoming}</strong> with upcoming visits`
    : 'No upcoming visits';

  return `
    <section class="stats-grid" aria-label="Summary">
      <button class="stat-card" data-action="stat-today" type="button">
        <div class="stat-top">
          <span class="stat-label">Today</span>
          <span class="stat-icon indigo">${icon('calendar-check')}</span>
        </div>
        <div class="stat-value">${todays.length}</div>
        <div class="stat-bottom"><span class="stat-note">${todayNote}</span></div>
      </button>
      <button class="stat-card" data-action="stat-week" type="button">
        <div class="stat-top">
          <span class="stat-label">This week</span>
          <span class="stat-icon blue">${icon('calendar')}</span>
        </div>
        <div class="stat-value">${weekList.length}</div>
        <div class="stat-bottom"><span class="stat-note">${weekNote}</span></div>
      </button>
      <button class="stat-card" data-action="stat-pending" type="button">
        <div class="stat-top">
          <span class="stat-label">Awaiting confirmation</span>
          <span class="stat-icon amber">${icon('clock')}</span>
        </div>
        <div class="stat-value">${pending.length}</div>
        <div class="stat-bottom"><span class="stat-note">${pendingNote}</span></div>
      </button>
      <button class="stat-card" data-action="stat-clients" type="button">
        <div class="stat-top">
          <span class="stat-label">Clients</span>
          <span class="stat-icon green">${icon('users')}</span>
        </div>
        <div class="stat-value">${data.clients.length}</div>
        <div class="stat-bottom"><span class="stat-note">${clientNote}</span></div>
      </button>
    </section>`;
}

function dashboardNextHTML() {
  const next = nextAppointment();
  if (!next) {
    return `
      <section class="next-card next-empty" aria-label="Next appointment">
        <div class="next-main">
          <span class="next-eyebrow"><span class="pulse"></span>All clear</span>
          <h2 class="next-title">Your schedule is open</h2>
          <p class="next-meta">A little breathing room. Add an appointment when you're ready.</p>
        </div>
        <button class="btn" data-action="new-on" data-date="${todayISO()}" type="button">
          ${icon('plus')}Schedule something
        </button>
      </section>`;
  }

  const client = getClient(next.clientId);
  const now = Date.now();
  const startMs = apptStart(next).getTime();
  const endMs = apptEnd(next).getTime();
  const inProgress = now >= startMs && now < endMs;
  const locationIcon = /zoom|meet|video|call/i.test(next.location || '') ? 'video' : 'pin';

  return `
    <section class="next-card" aria-label="Next appointment">
      <div class="next-main">
        <span class="next-eyebrow"><span class="pulse"></span>${inProgress ? 'Happening now' : 'Up next'}</span>
        <h2 class="next-title">${esc(next.title)}</h2>
        <div class="next-meta">
          <span>${icon('calendar')}${esc(fmtDate(next.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</span>
          <span>${icon('clock')}${esc(fmtTimeRange(next))}</span>
          ${client ? `<span>${icon('users')}${esc(client.name)}</span>` : ''}
          ${next.location ? `<span>${icon(locationIcon)}${esc(next.location)}</span>` : ''}
        </div>
        <div class="next-tags">
          ${statusPill(next.status)}
          ${next.reminderMinutes != null
            ? `<span class="tag-soft">${icon('bell')}${esc(reminderLabel(next.reminderMinutes))}</span>`
            : ''}
          ${next.duration ? `<span class="tag-soft">${icon('clock')}${fmtDuration(next.duration)}</span>` : ''}
        </div>
      </div>
      <div class="next-side">
        <span class="next-count-label">${inProgress ? 'In progress' : 'Starts in'}</span>
        <span class="next-count-value">${inProgress ? `Until ${fmtTimeNumeric(apptEndTimeStr(next))}` : countdownLabel(startMs)}</span>
        <span class="next-count-date">${esc(fmtDateShort(next.date, true))} · ${esc(fmtTime(next.start))}</span>
        <button class="btn btn-sm" data-action="edit-appointment" data-id="${esc(next.id)}" type="button">
          View details ${icon('arrow-right')}
        </button>
      </div>
    </section>`;
}

function dashboardScheduleHTML() {
  const today = todayISO();
  const todays = appointmentsForDate(today);

  const items = todays.map((appt) => {
    const client = getClient(appt.clientId);
    const time = fmtTime(appt.start).split(' ');
    const isDone = ['completed', 'cancelled'].includes(appt.status);
    return `
      <button class="schedule-item" data-appt-id="${esc(appt.id)}" type="button" aria-label="Edit ${esc(appt.title)}">
        <div class="schedule-time">${esc(time[0] || '')}<span>${esc(time[1] || '')}</span></div>
        <div class="schedule-bar ${STATUS_META[appt.status].pill}"></div>
        <div class="schedule-main">
          <span class="schedule-title ${isDone ? 'done' : ''}">${esc(appt.title)}</span>
          <span class="schedule-sub">
            ${client ? `<span>${esc(client.name)}</span>` : ''}
            ${appt.location ? `<span>${icon('pin')}${esc(appt.location)}</span>` : ''}
            <em>${fmtDuration(appt.duration)}</em>
          </span>
        </div>
        <div class="schedule-side">
          ${statusPill(appt.status)}
        </div>
      </button>`;
  }).join('');

  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Today's schedule</h2>
          <div class="sub">${esc(fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
        </div>
        <button class="text-btn" data-nav="calendar">Open calendar</button>
      </div>
      ${todays.length
        ? `<div class="schedule-list">${items}</div>`
        : `<div class="empty-state compact">
             <div class="empty-icon">${icon('calendar-plus')}</div>
             <h3>Nothing scheduled today</h3>
             <p>Your day is wide open. Add an appointment to get started.</p>
             <button class="btn btn-primary btn-sm" data-action="new-on" data-date="${today}">${icon('plus')}New appointment</button>
           </div>`}
    </section>`;
}

function dashboardRemindersHTML() {
  const now = Date.now();
  const items = data.appointments
    .filter((a) => ['scheduled', 'confirmed'].includes(a.status) && a.reminderMinutes != null && apptEnd(a).getTime() >= now)
    .map((appt) => ({
      appt,
      remindAt: apptStart(appt).getTime() - Number(appt.reminderMinutes) * 60000
    }))
    .sort((a, b) => a.remindAt - b.remindAt)
    .slice(0, 4);

  const rows = items.map(({ appt, remindAt }) => {
    const sent = remindAt <= now;
    const lead = Number(appt.reminderMinutes);
    const badge = lead === 0 ? 'At start' : `${reminderLeadShort(lead)} before`;
    return `
      <button class="reminder-item" data-appt-id="${esc(appt.id)}" type="button">
        <span class="reminder-icon">${icon('bell')}</span>
        <span class="reminder-main">
          <span class="reminder-title">${esc(appt.title)}</span>
          <span class="reminder-meta">${esc(fmtDateShort(appt.date, true))} · ${esc(fmtTime(appt.start))}</span>
          <span class="reminder-when ${sent ? 'expired' : ''}">
            ${sent ? 'Reminder sent' : `Reminder ${relativeLabel(remindAt)}`}
          </span>
        </span>
        <span class="reminder-badge">${esc(badge)}</span>
      </button>`;
  }).join('');

  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Upcoming reminders</h2>
          <div class="sub">Gentle nudges before your next visits</div>
        </div>
        <button class="text-btn" data-nav="settings">Settings</button>
      </div>
      ${items.length
        ? `<div class="reminders-list">${rows}</div>
           <div class="dash-quick">
             <span>${data.settings.defaultReminder != null ? `Default: ${esc(reminderLabel(data.settings.defaultReminder))}` : 'Set a default reminder'}</span>
             <button class="text-btn" data-nav="settings">Manage defaults</button>
           </div>`
        : `<div class="empty-state compact">
             <div class="empty-icon">${icon('bell')}</div>
             <h3>No reminders scheduled</h3>
             <p>Add a reminder to an appointment and it will show up here.</p>
             <button class="btn btn-secondary btn-sm" data-nav="settings">Reminder settings</button>
           </div>`}
    </section>`;
}
