'use strict';

/* ============================================================
   Tempo — reminders, notifications, import & export
   ============================================================ */

/* ---------------- Notification permission ---------------- */

async function enableNotifications() {
  if (!notificationSupported()) {
    toast('Desktop notifications unavailable', 'warn', 'Tempo will keep showing in-app reminders instead.');
    return;
  }

  let permission = notificationPermission();
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      permission = 'denied';
    }
  }

  if (permission === 'granted') {
    data.settings.notifications = true;
    saveData();
    renderShell();
    if (ui.view === 'settings') renderView();
    toast('Reminders enabled', 'success', "We'll nudge you before your appointments.");
    setTimeout(checkReminders, 300);
  } else if (permission === 'denied') {
    toast('Notifications are blocked', 'warn', 'Allow notifications for this site in your browser settings.');
    renderShell();
    if (ui.view === 'settings') renderView();
  } else {
    toast('Notifications not enabled', 'info', 'You can try again from Settings whenever you like.');
  }
}

function sendTestNotification() {
  createAlert({
    title: 'Test reminder',
    body: 'If you can see this, Tempo reminders are working.',
    appointmentId: null
  });
  saveData();
  renderBell();

  if (canShowBrowserNotifications()) {
    try {
      new Notification('Tempo test reminder', {
        body: 'Desktop notifications are working. Tempo will nudge you before appointments.',
        tag: 'tempo-test'
      });
    } catch (error) {
      /* In-app alert still delivered */
    }
    toast('Test reminder sent', 'success', 'Check the bell menu, or your desktop notifications.');
  } else {
    toast('Test reminder added', 'info', 'It is waiting in the bell menu.');
  }
}

/* ---------------- Reminder engine ---------------- */

function createAlert({ title, body, appointmentId = null }) {
  const alert = {
    id: uid('alt'),
    appointmentId,
    title,
    body,
    createdAt: Date.now(),
    read: false
  };
  data.alerts = [alert, ...(data.alerts || [])].slice(0, 40);
  return alert;
}

function fireReminder(appt) {
  const client = getClient(appt.clientId);
  const dateLabel = groupDateLabels(appt.date).relative;
  const body = `${dateLabel} at ${fmtTime(appt.start)}${client ? ` · ${client.name}` : ''}`;

  createAlert({
    title: `Reminder · ${appt.title}`,
    body,
    appointmentId: appt.id
  });
  saveData();
  renderBell();
  toast(`Reminder — ${appt.title}`, 'info', body);

  if (canShowBrowserNotifications()) {
    try {
      const notification = new Notification(`Tempo reminder: ${appt.title}`, {
        body,
        tag: reminderKey(appt)
      });
      notification.onclick = () => {
        window.focus();
        openAppointmentModal(appt.id);
        notification.close();
      };
    } catch (error) {
      /* In-app alert still delivered */
    }
  }
}

function checkReminders() {
  if (!data) return;
  const now = Date.now();
  let changed = false;

  data.appointments
    .filter((a) => ['scheduled', 'confirmed'].includes(a.status) && a.reminderMinutes != null)
    .sort(compareByStart)
    .forEach((appt) => {
      const startMs = apptStart(appt).getTime();
      const dueMs = startMs - Number(appt.reminderMinutes) * 60000;
      if (now < dueMs) return;
      if (now > startMs + 30 * 60000) return;

      const key = reminderKey(appt);
      const entry = reminderState[key] || {};
      if (entry.snoozedUntil) {
        if (now < entry.snoozedUntil) return;
      } else if (entry.notifiedAt) {
        return;
      }

      fireReminder(appt);
      reminderState[key] = { ...entry, notifiedAt: now, snoozedUntil: null };
      changed = true;
    });

  if (changed) saveReminderState();
}

/* ---------------- Notification center actions ---------------- */

function viewAlert(alertId) {
  const alert = (data.alerts || []).find((a) => a.id === alertId);
  if (!alert) return;
  alert.read = true;
  saveData();
  renderBell();
  closeBell();

  if (alert.appointmentId) {
    if (data.appointments.some((a) => a.id === alert.appointmentId)) {
      openAppointmentModal(alert.appointmentId);
    } else {
      toast('Appointment no longer exists', 'warn', 'This reminder was for a deleted appointment.');
    }
  } else {
    toast('Test reminder', 'success', 'Notifications are working on this device.');
  }
}

function snoozeAlert(alertId) {
  const alert = (data.alerts || []).find((a) => a.id === alertId);
  if (!alert || !alert.appointmentId) return;
  const appt = data.appointments.find((a) => a.id === alert.appointmentId);
  if (!appt) {
    dismissAlert(alertId);
    return;
  }

  const key = reminderKey(appt);
  reminderState[key] = {
    ...(reminderState[key] || {}),
    snoozedUntil: Date.now() + 10 * 60000,
    notifiedAt: Date.now()
  };
  saveReminderState();
  data.alerts = data.alerts.filter((a) => a.id !== alertId);
  saveData();
  renderBell();
  toast('Snoozed for 10 minutes', 'info', `We'll remind you about ${appt.title} again shortly.`);
}

function dismissAlert(alertId) {
  data.alerts = (data.alerts || []).filter((a) => a.id !== alertId);
  saveData();
  renderBell();
}

function markAllNotificationsRead() {
  if (!data.alerts?.length) return;
  data.alerts.forEach((alert) => { alert.read = true; });
  saveData();
  renderBell();
}

/* ---------------- Export ---------------- */

function exportJSONBackup() {
  const payload = {
    app: 'tempo',
    version: 1,
    exportedAt: new Date().toISOString(),
    clients: data.clients,
    appointments: data.appointments,
    settings: data.settings
  };
  downloadFile(
    `tempo-backup-${todayISO()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
  toast('Backup downloaded', 'success', `${plural(data.appointments.length, 'appointment')} and ${plural(data.clients.length, 'client')} saved.`);
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportAppointmentsCSV() {
  if (!data.appointments.length) {
    toast('Nothing to export', 'warn', 'Add an appointment first, then try again.');
    return;
  }

  const headers = ['Title', 'Client', 'Client Email', 'Date', 'Start', 'End', 'Duration (min)', 'Status', 'Location', 'Reminder (min)', 'Notes'];
  const rows = data.appointments.slice().sort(compareByStart).map((appt) => {
    const client = getClient(appt.clientId);
    return [
      appt.title,
      client?.name || '',
      client?.email || '',
      appt.date,
      appt.start,
      apptEndTimeStr(appt),
      appt.duration,
      STATUS_META[appt.status]?.label || appt.status,
      appt.location || '',
      appt.reminderMinutes == null ? '' : appt.reminderMinutes,
      appt.notes || ''
    ].map(csvCell).join(',');
  });

  downloadFile(
    `tempo-appointments-${todayISO()}.csv`,
    `\uFEFF${[headers.map(csvCell).join(','), ...rows].join('\r\n')}`,
    'text/csv;charset=utf-8'
  );
  toast('CSV downloaded', 'success', `${plural(data.appointments.length, 'appointment')} exported.`);
}

/* ---------------- Import ---------------- */

function parseCSVRows(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  const pushRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((value) => String(value).trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      pushRow();
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) pushRow();
  return rows;
}

function csvHeaderKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function csvIndex(headers, names) {
  for (const name of names) {
    const index = headers.indexOf(csvHeaderKey(name));
    if (index !== -1) return index;
  }
  return -1;
}

function csvDateToISO(value) {
  const text = String(value || '').trim();
  if (isValidDateStr(text)) return text;

  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (slash) {
    const date = new Date(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2]));
    return date.getFullYear() === Number(slash[3]) && date.getMonth() === Number(slash[1]) - 1 && date.getDate() === Number(slash[2])
      ? toISO(date)
      : '';
  }

  if (/^\d{5}$/.test(text)) {
    const serialDate = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86400000);
    return Number.isNaN(serialDate.getTime())
      ? ''
      : `${serialDate.getUTCFullYear()}-${pad2(serialDate.getUTCMonth() + 1)}-${pad2(serialDate.getUTCDate())}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? ''
    : toISO(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

function csvTimeToHHMM(value) {
  const text = String(value || '').trim();
  if (isValidTimeStr(text)) return text;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i.exec(text);
  if (!match) return '';
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (match[3]) {
    const isPM = /^p/i.test(match[3]);
    if (hours === 12) hours = isPM ? 12 : 0;
    else if (isPM) hours += 12;
  }
  if (hours < 0 || hours > 23 || minutes > 59) return '';
  return `${pad2(hours)}:${pad2(minutes)}`;
}

function csvStatusKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (STATUS_META[key]) return key;
  return STATUS_ORDER.find((status) => STATUS_META[status].label.toLowerCase() === key) || 'scheduled';
}

function prepareCSVImport(text) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return null;

  const headers = rows[0].map(csvHeaderKey);
  const idx = {
    title: csvIndex(headers, ['Title', 'Appointment', 'Event']),
    client: csvIndex(headers, ['Client', 'Client Name', 'Contact']),
    clientEmail: csvIndex(headers, ['Client Email', 'Email']),
    date: csvIndex(headers, ['Date', 'Appointment Date']),
    start: csvIndex(headers, ['Start', 'Start Time', 'Time']),
    end: csvIndex(headers, ['End', 'End Time']),
    duration: csvIndex(headers, ['Duration (min)', 'Duration', 'Minutes']),
    status: csvIndex(headers, ['Status']),
    location: csvIndex(headers, ['Location', 'Place']),
    reminder: csvIndex(headers, ['Reminder (min)', 'Reminder', 'Reminder Minutes']),
    notes: csvIndex(headers, ['Notes', 'Note', 'Description'])
  };

  if (idx.title === -1 || idx.date === -1 || idx.start === -1) return null;

  const rawClients = [];
  const rawAppointments = [];
  const clientsByKey = new Map();
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const read = (index) => (index >= 0 && index < cells.length ? String(cells[index] || '').trim() : '');
    const title = read(idx.title).slice(0, 160);
    const date = csvDateToISO(read(idx.date));
    const start = csvTimeToHHMM(read(idx.start));
    if (!title || !date || !start) {
      skipped++;
      continue;
    }

    let duration = Number(read(idx.duration));
    if (!Number.isFinite(duration) || duration <= 0) {
      const end = csvTimeToHHMM(read(idx.end));
      duration = end ? timeToMinutes(end) - timeToMinutes(start) : 60;
      if (duration <= 0) duration += 1440;
    }
    duration = clamp(Math.round(duration), 5, 720);

    const clientName = read(idx.client).slice(0, 120);
    const clientEmail = read(idx.clientEmail).slice(0, 160);
    let clientId = null;
    if (clientName) {
      const key = `${clientName.toLowerCase()}|${clientEmail.toLowerCase()}`;
      if (!clientsByKey.has(key)) {
        const client = {
          id: `csv_client_${rawClients.length + 1}`,
          name: clientName,
          company: '',
          email: clientEmail,
          phone: '',
          notes: ''
        };
        clientsByKey.set(key, client);
        rawClients.push(client);
      }
      clientId = clientsByKey.get(key).id;
    }

    let reminderMinutes = null;
    const reminderText = read(idx.reminder);
    if (reminderText !== '' && Number.isFinite(Number(reminderText))) {
      reminderMinutes = clamp(Math.round(Number(reminderText)), 0, 10080);
    }

    rawAppointments.push({
      title,
      clientId,
      date,
      start,
      duration,
      status: csvStatusKey(read(idx.status)),
      reminderMinutes,
      location: read(idx.location).slice(0, 240),
      notes: read(idx.notes).slice(0, 5000)
    });
  }

  if (!rawAppointments.length) return null;
  const prepared = prepareImport({ clients: rawClients, appointments: rawAppointments });
  if (!prepared) return null;
  prepared.skipped += skipped;
  return prepared;
}

async function handleImportFile(file) {
  if (!file) return;
  try {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    const looksLikeCSV = /\.csv$/i.test(file.name) || !/^[\s]*[\[{]/.test(text);
    const prepared = looksLikeCSV ? prepareCSVImport(text) : prepareImport(JSON.parse(text));
    if (!prepared) {
      toast('Nothing to import', 'error', 'This file has no valid appointments or clients.');
      return;
    }
    openImportPreview(prepared, file.name, looksLikeCSV ? 'CSV' : 'backup');
  } catch (error) {
    toast('Could not read that file', 'error', 'Choose a Tempo JSON backup or appointment CSV and try again.');
  }
}

function openImportPreview(prepared, filename, kind = 'backup') {
  if (typeof closeBell === 'function') closeBell();
  const countText = `${plural(prepared.appointments.length, 'appointment')} and ${plural(prepared.clients.length, 'client')}`;
  const skipped = prepared.skipped
    ? `<p class="data-note" style="margin-top:8px;padding-top:0;border-top:0;color:var(--amber)">${plural(prepared.skipped, 'row')} could not be read and will be skipped.</p>`
    : '';

  mountModal(`
    <div class="modal-overlay" data-modal-overlay>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="importTitle">
        <div class="modal-head">
          <div>
            <span class="modal-eyebrow">Import ${esc(kind)}</span>
            <h2 class="modal-title" id="importTitle">Bring your data in</h2>
            <p class="modal-sub">${esc(filename || 'Selected file')}</p>
          </div>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="Close">${icon('x')}</button>
        </div>
        <div class="modal-body">
          <div class="import-summary">
            <span class="icon-box">${icon('database')}</span>
            <div>
              <strong>${countText}</strong>
              <span>found in this file</span>
            </div>
          </div>
          <div class="import-options">
            <label class="import-option">
              <input type="radio" name="importMode" value="merge" checked>
              <span><strong>Merge with my current data</strong><span>Keep everything here and add the imported records.</span></span>
            </label>
            <label class="import-option">
              <input type="radio" name="importMode" value="replace">
              <span><strong>Replace everything</strong><span>Delete the current data first, then import this backup.</span></span>
            </label>
          </div>
          ${skipped}
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" type="button" data-action="close-modal" data-autofocus>Cancel</button>
          <button class="btn btn-primary" type="button" id="importConfirm">${icon('upload')}Import</button>
        </div>
      </div>
    </div>`);

  $('#importConfirm')?.addEventListener('click', () => {
    const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'merge';
    applyImport(prepared, mode);
    ui.calendarCursor = new Date();
    ui.weekScrollTop = null;
    ui.weekScrollLeft = null;
    if (mode === 'replace') ui.clientSearch = '';
    closeModal();
    renderAll();
    toast(
      'Import complete',
      'success',
      `${plural(prepared.appointments.length, 'appointment')} and ${plural(prepared.clients.length, 'client')} imported${prepared.skipped ? `, ${prepared.skipped} skipped` : ''}.`
    );
    setTimeout(checkReminders, 350);
  });
}

/* ---------------- Clear / demo ---------------- */

function clearAllData() {
  const appts = data.appointments.length;
  const clients = data.clients.length;
  confirmModal({
    title: 'Clear all data?',
    message: `This permanently removes <strong>${plural(appts, 'appointment')}</strong> and <strong>${plural(clients, 'client')}</strong> from this browser. Export a backup first if you might need them.`,
    confirmLabel: 'Delete everything',
    onConfirm: () => {
      data = emptyData();
      reminderState = {};
      saveReminderState();
      saveData();
      ui.filters = defaultFilters();
      ui.clientSearch = '';
      ui.calendarCursor = new Date();
      ui.weekScrollTop = null;
      ui.weekScrollLeft = null;
      renderAll();
      toast('All data cleared', 'success', 'Tempo is ready for a fresh start.');
    }
  });
}

function loadDemoData() {
  data = seedData();
  reminderState = {};
  saveReminderState();
  saveData();
  ui.filters = defaultFilters();
  ui.clientSearch = '';
  ui.calendarCursor = new Date();
  ui.weekScrollTop = null;
  ui.weekScrollLeft = null;
  navigate('dashboard');
  toast('Sample data loaded', 'success', 'Explore freely, then clear it in Settings.');
  setTimeout(checkReminders, 500);
}
