'use strict';

/* ============================================================
   Tempo — app shell: navigation, sidebar alert and bell
   ============================================================ */

function pageMeta() {
  const longDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric'
  });
  switch (ui.view) {
    case 'calendar':
      return { title: 'Calendar', subtitle: 'Your schedule at a glance' };
    case 'appointments':
      return { title: 'Appointments', subtitle: 'Everything you have planned' };
    case 'clients':
      return { title: 'Clients', subtitle: 'The people you meet with' };
    case 'settings':
      return { title: 'Settings', subtitle: 'Reminders, data, and preferences' };
    case 'dashboard':
    default:
      return { title: 'Overview', subtitle: longDate };
  }
}

function renderShell() {
  if (!data) return;

  const meta = pageMeta();
  const title = $('#pageTitle');
  const subtitle = $('#pageSubtitle');
  if (title) title.textContent = meta.title;
  if (subtitle) subtitle.textContent = meta.subtitle;
  document.title = `${meta.title} · Tempo`;

  $$('.nav-item[data-nav]').forEach((button) => {
    button.classList.toggle('active', button.dataset.nav === ui.view);
    button.removeAttribute('aria-current');
    if (button.dataset.nav === ui.view) button.setAttribute('aria-current', 'page');
  });

  const upcomingCount = data.appointments.filter((a) =>
    ['scheduled', 'confirmed'].includes(a.status) && apptEnd(a).getTime() >= Date.now()
  ).length;
  const apptCount = $('#navApptCount');
  const clientCount = $('#navClientCount');
  if (apptCount) apptCount.textContent = upcomingCount > 99 ? '99+' : (upcomingCount || '');
  if (clientCount) clientCount.textContent = data.clients.length > 99 ? '99+' : (data.clients.length || '');

  const storageStatus = $('#storageStatus');
  if (storageStatus) {
    const databaseMode = typeof TempoAPI !== 'undefined' && TempoAPI.isDatabase();
    storageStatus.textContent = databaseMode ? 'Saved to database' : 'Saved on this device';
    storageStatus.title = databaseMode
      ? 'Workspace data is saved to MySQL.'
      : 'Workspace data is saved in this browser.';
  }

  renderSidebarAlertCard();
  renderBell();
}

function renderSidebarAlertCard() {
  const root = $('#sidebarAlertCard');
  if (!root) return;

  const permission = notificationPermission();
  let html = '';

  if (permission === 'granted' && data.settings.notifications) {
    html = `
      <div class="sidebar-alert-top">
        <span class="sidebar-alert-icon">${icon('bell-ring')}</span>
        <strong>Reminders are on</strong>
      </div>
      <p>We'll nudge you before your appointments begin.</p>
      <span class="alert-status"><span class="dot"></span>Browser notifications enabled</span>`;
  } else if (permission === 'granted') {
    html = `
      <div class="sidebar-alert-top">
        <span class="sidebar-alert-icon">${icon('bell')}</span>
        <strong>Alerts are paused</strong>
      </div>
      <p>Browser notifications are allowed, but switched off.</p>
      <button class="btn btn-primary btn-sm" data-action="enable-notifications">Turn alerts on</button>`;
  } else if (permission === 'denied') {
    html = `
      <div class="sidebar-alert-top">
        <span class="sidebar-alert-icon">${icon('alert')}</span>
        <strong>Notifications blocked</strong>
      </div>
      <p>Allow notifications for this site in your browser to get desktop nudges.</p>
      <button class="btn btn-secondary btn-sm" data-nav="settings">See reminder settings</button>`;
  } else if (permission === 'unsupported') {
    html = `
      <div class="sidebar-alert-top">
        <span class="sidebar-alert-icon">${icon('bell')}</span>
        <strong>In-app reminders</strong>
      </div>
      <p>This browser has no desktop notifications, but Tempo will still alert you inside the app.</p>
      <span class="alert-status"><span class="dot"></span>In-app reminders active</span>`;
  } else {
    html = `
      <div class="sidebar-alert-top">
        <span class="sidebar-alert-icon">${icon('bell')}</span>
        <strong>Stay on time</strong>
      </div>
      <p>Turn on reminders and get a gentle nudge before each appointment.</p>
      <button class="btn btn-primary btn-sm" data-action="enable-notifications">Enable reminders</button>`;
  }

  root.innerHTML = html;
}

/* ---------------- Notification center ---------------- */

function renderBell() {
  if (!data) return;
  const alerts = (data.alerts || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const unread = alerts.filter((a) => !a.read).length;

  const badge = $('#bellBadge');
  if (badge) {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.hidden = unread === 0;
  }

  const bellBtn = $('#bellBtn');
  if (bellBtn) {
    bellBtn.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
  }

  const sub = $('#bellSub');
  if (sub) {
    sub.textContent = alerts.length === 0
      ? 'Reminders appear here'
      : unread
        ? `${unread} unread`
        : 'All caught up';
  }

  const markAll = $('[data-action="mark-all-read"]');
  if (markAll) {
    markAll.hidden = unread === 0;
    markAll.textContent = 'Mark all read';
  }

  const list = $('#bellList');
  if (!list) return;

  if (!alerts.length) {
    list.innerHTML = `
      <div class="bell-empty">
        <div class="empty-icon">${icon('bell')}</div>
        <div>You're all caught up.</div>
        <div style="margin-top:3px;font-size:10.5px;color:var(--muted-2)">Reminders for upcoming appointments will land here.</div>
      </div>`;
    return;
  }

  list.innerHTML = alerts.slice(0, 25).map((alert) => {
    const appointment = alert.appointmentId
      ? data.appointments.find((a) => a.id === alert.appointmentId)
      : null;
    const canSnooze = appointment && apptEnd(appointment).getTime() > Date.now();
    return `
      <div class="bell-alert ${alert.read ? '' : 'unread'}">
        <div class="bell-alert-icon">${icon('bell')}</div>
        <div class="bell-alert-main">
          <div class="bell-alert-title">
            ${alert.read ? '' : '<span class="unread-dot"></span>'}
            <span>${esc(alert.title)}</span>
          </div>
          <p>${esc(alert.body)}</p>
          <span class="bell-alert-time">${relativeLabel(alert.createdAt)}</span>
          <div class="bell-alert-actions">
            ${appointment ? `<button class="bell-action primary" data-action="alert-view" data-id="${esc(alert.id)}">View</button>` : ''}
            ${canSnooze ? `<button class="bell-action" data-action="alert-snooze" data-id="${esc(alert.id)}" title="Remind me again in 10 minutes">Snooze 10m</button>` : ''}
            <button class="bell-action" data-action="alert-dismiss" data-id="${esc(alert.id)}">Dismiss</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleBell() {
  const panel = $('#bellPanel');
  const button = $('#bellBtn');
  if (!panel) return;
  const willOpen = panel.hidden;
  if (willOpen) {
    renderBell();
    panel.hidden = false;
    button?.setAttribute('aria-expanded', 'true');
    if (typeof closeSearchResults === 'function') closeSearchResults();
  } else {
    closeBell();
  }
}

function closeBell() {
  const panel = $('#bellPanel');
  const button = $('#bellBtn');
  if (panel) panel.hidden = true;
  button?.setAttribute('aria-expanded', 'false');
}

/* ---------------- Mobile sidebar ---------------- */

function openSidebar() {
  $('#sidebar')?.classList.add('open');
  const backdrop = $('#sidebarBackdrop');
  if (backdrop) backdrop.hidden = false;
}

function closeSidebar() {
  $('#sidebar')?.classList.remove('open');
  const backdrop = $('#sidebarBackdrop');
  if (backdrop) backdrop.hidden = true;
}

function toggleSidebar() {
  if ($('#sidebar')?.classList.contains('open')) closeSidebar();
  else openSidebar();
}
