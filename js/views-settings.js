'use strict';

/* ============================================================
   Tempo — settings
   ============================================================ */

function renderSettings() {
  const permission = notificationPermission();
  const reminderOptions = REMINDER_OPTIONS.map((option) => {
    const value = option.value === '' ? '' : String(option.value);
    const selected = (data.settings.defaultReminder == null && value === '')
      || (data.settings.defaultReminder != null && String(data.settings.defaultReminder) === value);
    return `<option value="${value}" ${selected ? 'selected' : ''}>${option.label}</option>`;
  }).join('');

  const durationOptions = DURATION_OPTIONS.map((minutes) =>
    `<option value="${minutes}" ${Number(data.settings.defaultDuration) === minutes ? 'selected' : ''}>${fmtDuration(minutes)}</option>`
  ).join('');

  const isEmpty = !data.appointments.length && !data.clients.length;
  const databaseMode = typeof TempoAPI !== 'undefined' && TempoAPI.isDatabase();

  return `
    <div class="settings-grid">
      <div class="settings-col">
        <section class="card settings-card">
          <div class="card-head">
            <div>
              <h2>Reminders</h2>
              <div class="sub">Choose how Tempo nudges you before appointments</div>
            </div>
            ${notificationBadgeHTML(permission)}
          </div>
          <div class="settings-body">
            ${notificationPanelHTML(permission)}

            <div class="setting-row">
              <div class="setting-info">
                <strong>Browser notifications</strong>
                <p>Show a desktop notification when a reminder is due. In-app alerts stay on either way.</p>
              </div>
              <div class="setting-control">
                <label class="switch" title="${permission === 'granted' ? 'Toggle browser notifications' : 'Allow notifications first'}">
                  <input type="checkbox" id="settingNotifications" data-setting="notifications"
                    ${data.settings.notifications && permission === 'granted' ? 'checked' : ''}
                    ${permission === 'granted' ? '' : 'disabled'}>
                  <span class="switch-track"></span>
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <strong>Default reminder</strong>
                <p>Applied automatically to new appointments. You can change it each time.</p>
              </div>
              <div class="setting-control">
                <select class="filter-select" id="settingReminder" aria-label="Default reminder">
                  ${reminderOptions}
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <strong>Default duration</strong>
                <p>How long new appointments last unless you say otherwise.</p>
              </div>
              <div class="setting-control">
                <select class="filter-select" id="settingDuration" aria-label="Default duration">
                  ${durationOptions}
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <strong>In-app reminders</strong>
                <p>Reminders land in the bell menu and as a toast while Tempo is open.</p>
              </div>
              <div class="setting-control">
                <span class="setting-value" style="color:var(--green)">Always on</span>
              </div>
            </div>
          </div>
        </section>

        <section class="card settings-card" id="dataSettings">
          <div class="card-head">
            <div>
              <h2>Your data</h2>
              <div class="sub">${databaseMode
                ? 'Appointments, reminders, and clients are saved to MySQL'
                : 'Everything is stored locally in this browser'}</div>
            </div>
          </div>
          <div class="settings-body">
            <div class="data-stats">
              <div class="data-stat"><strong>${data.appointments.length}</strong><span>appointments</span></div>
              <div class="data-stat"><strong>${data.clients.length}</strong><span>clients</span></div>
            </div>
            <div class="data-actions">
              <button class="data-action" data-action="export-json" type="button">
                <span class="data-action-icon">${icon('download')}</span>
                <span class="data-action-main"><strong>Export backup</strong><span>Download clients, appointments, and settings as JSON</span></span>
                ${icon('chevron-right', 'chev')}
              </button>
              <button class="data-action" data-action="export-csv" type="button">
                <span class="data-action-icon">${icon('list')}</span>
                <span class="data-action-main"><strong>Export appointments as CSV</strong><span>Open in Excel, Numbers, or Google Sheets</span></span>
                ${icon('chevron-right', 'chev')}
              </button>
              <button class="data-action" data-action="import-data" type="button">
                <span class="data-action-icon">${icon('upload')}</span>
                <span class="data-action-main"><strong>Import data</strong><span>Merge or replace from a Tempo JSON backup or appointment CSV</span></span>
                ${icon('chevron-right', 'chev')}
              </button>
              <button class="data-action danger" data-action="clear-data" type="button">
                <span class="data-action-icon">${icon('trash')}</span>
                <span class="data-action-main"><strong>Clear all data</strong><span>${databaseMode
                  ? 'Remove every appointment and client from the database'
                  : 'Remove every appointment and client from this browser'}</span></span>
                ${icon('chevron-right', 'chev')}
              </button>
              ${isEmpty ? `
                <button class="data-action" data-action="load-demo" type="button">
                  <span class="data-action-icon">${icon('sparkle')}</span>
                  <span class="data-action-main"><strong>Load sample data</strong><span>Restore the demo schedule to explore Tempo</span></span>
                  ${icon('chevron-right', 'chev')}
                </button>` : ''}
            </div>
            <p class="data-note">
              ${databaseMode
                ? "Tempo saves this workspace to the appointment_reminder_system database. Export a backup before clearing data. Reminder history is not included in backups."
                : "Tempo does not have an account or cloud sync. If you clear your browser's site data, your appointments go with it — export a backup first. Reminder history is not included in backups."}
            </p>
          </div>
        </section>
      </div>

      <div class="settings-col">
        <aside class="about-card">
          <div class="about-brand">
            <div class="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8.5" stroke="white" stroke-width="2"/>
                <path d="M12 7.5V12l3 2" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div>
              <strong>Tempo</strong>
              <span>Appointments, in rhythm</span>
            </div>
          </div>
          <p>A calm place for your schedule. Tempo keeps appointments, reminders, and client details together — ${databaseMode ? 'saved to your local MySQL database.' : 'entirely in this browser.'}</p>
          <span class="about-version">${icon('sparkle')}Version 2.0 · ${databaseMode ? 'Database-backed' : 'Local-first'}</span>
          <div class="about-links">
            <span>${icon('database')}${databaseMode ? 'Saved to appointment_reminder_system' : 'Data never leaves this device'}</span>
            <span>${icon('bell')}Reminders work while Tempo is open</span>
            <span>${icon('download')}Export a backup anytime</span>
          </div>
        </aside>

        <section class="card settings-card">
          <div class="card-head">
            <div>
              <h2>Good to know</h2>
              <div class="sub">A few small details</div>
            </div>
          </div>
          <div class="settings-body">
            <div class="setting-row">
              <div class="setting-info">
                <strong>Keyboard friendly</strong>
                <p>Press <kbd class="kbd">/</kbd> to search, <kbd class="kbd">N</kbd> for a new appointment, and <kbd class="kbd">Esc</kbd> to close a dialog.</p>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <strong>Overlap warnings</strong>
                <p>Tempo points out double bookings while you edit, but never stops you from saving.</p>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <strong>Notifications on file://</strong>
                <p>Desktop notifications need a local web address. Open Tempo through <code>localhost</code> for the full experience; in-app reminders work everywhere.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>`;
}

function notificationBadgeHTML(permission) {
  if (permission === 'granted') {
    return `<span class="perm-badge granted"><span class="status-dot sd-confirmed"></span>On</span>`;
  }
  if (permission === 'default') {
    return `<span class="perm-badge default"><span class="status-dot sd-scheduled"></span>Off</span>`;
  }
  if (permission === 'denied') {
    return `<span class="perm-badge denied"><span class="status-dot sd-completed"></span>Blocked</span>`;
  }
  return `<span class="perm-badge unsupported"><span class="status-dot sd-completed"></span>Unavailable</span>`;
}

function notificationPanelHTML(permission) {
  if (permission === 'granted') {
    return `
      <div class="notify-panel">
        <div class="notify-panel-top">
          <span class="notify-panel-icon">${icon('bell-ring')}</span>
          <div class="notify-panel-main">
            <strong>${data.settings.notifications ? 'Browser reminders are on' : 'Browser reminders are paused'}</strong>
            <p>${data.settings.notifications
              ? "When a reminder is due, you'll get a desktop notification (if Tempo is open in a tab)."
              : 'Your reminders only appear inside Tempo right now. Switch them back on whenever you like.'}</p>
          </div>
        </div>
        <div class="test-row">
          ${data.settings.notifications
            ? `<button class="btn btn-secondary btn-sm" data-action="test-notification" type="button">${icon('bell')}Send test notification</button>`
            : `<button class="btn btn-primary btn-sm" data-action="enable-notifications" type="button">${icon('bell')}Turn alerts on</button>`}
        </div>
      </div>`;
  }

  if (permission === 'denied') {
    return `
      <div class="notify-panel">
        <div class="notify-panel-top">
          <span class="notify-panel-icon">${icon('alert')}</span>
          <div class="notify-panel-main">
            <strong>Notifications are blocked</strong>
            <p>Your browser is blocking notifications for this page. Use the site settings in your browser's address bar to allow them, then reload Tempo.</p>
          </div>
        </div>
      </div>`;
  }

  if (permission === 'unsupported') {
    return `
      <div class="notify-panel">
        <div class="notify-panel-top">
          <span class="notify-panel-icon">${icon('bell')}</span>
          <div class="notify-panel-main">
            <strong>In-app reminders are active</strong>
            <p>This browser doesn't support desktop notifications. You'll still see reminders in the bell menu and as toasts.</p>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="notify-panel">
      <div class="notify-panel-top">
        <span class="notify-panel-icon">${icon('bell-ring')}</span>
        <div class="notify-panel-main">
          <strong>Turn on browser reminders</strong>
          <p>Allow notifications and Tempo will give you a desktop nudge before each appointment.</p>
        </div>
      </div>
      <div class="test-row">
        <button class="btn btn-primary btn-sm" data-action="enable-notifications" type="button">${icon('bell')}Enable notifications</button>
      </div>
      ${location.protocol === 'file:' ? '<p style="margin:8px 0 0;font-size:10px;color:var(--muted-2);line-height:1.5">Tip: if the prompt does not appear, open Tempo through a local web server (localhost). In-app reminders always work.</p>' : ''}
    </div>`;
}
