'use strict';

/* ============================================================
   Tempo — modals: appointments, clients, day view, confirms
   ============================================================ */

let modalOpener = null;

function isModalOpen() {
  return !!$('#modalRoot .modal');
}

function mountModal(html) {
  const root = $('#modalRoot');
  if (!root) return;
  if (!root.querySelector('.modal')) modalOpener = document.activeElement;
  root.innerHTML = html;
  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    const target = root.querySelector('[data-autofocus]') ||
      root.querySelector('.modal input:not([type="hidden"]), .modal select, .modal textarea') ||
      root.querySelector('.modal-close');
    if (target) target.focus();
  }, 30);
}

function closeModal() {
  const root = $('#modalRoot');
  if (!root || !root.firstElementChild) return;
  root.innerHTML = '';
  document.body.style.overflow = '';
  if (modalOpener && document.contains(modalOpener)) {
    try { modalOpener.focus(); } catch (error) { /* ignore */ }
  }
  modalOpener = null;
}

/* ---------------- Appointment editor ---------------- */

function defaultStartTime(dateISO) {
  if (dateISO !== todayISO()) return '09:00';
  const now = new Date();
  let minutes = now.getHours() * 60 + now.getMinutes();
  minutes = Math.ceil((minutes + 1) / 30) * 30;
  if (minutes >= 1440) minutes = 23 * 60 + 30;
  return minutesToTime(minutes);
}

function reminderSelectOptions(current) {
  const values = REMINDER_OPTIONS.map((option) => ({
    value: option.value === '' ? '' : String(option.value),
    label: option.label
  }));
  const currentValue = current == null || current === '' ? '' : String(current);
  if (currentValue !== '' && !values.some((option) => option.value === currentValue)) {
    values.push({ value: currentValue, label: reminderLabel(Number(currentValue)) });
  }
  return values.map((option) =>
    `<option value="${option.value}" ${option.value === currentValue ? 'selected' : ''}>${option.label}</option>`
  ).join('');
}

function openAppointmentModal(id = null, options = {}) {
  if (typeof closeBell === 'function') closeBell();
  if (typeof closeSearchResults === 'function') closeSearchResults();

  const existing = id ? data.appointments.find((a) => a.id === id) : null;
  if (id && !existing) {
    toast('Appointment not found', 'error', 'It may have been deleted.');
    return;
  }

  const date = existing?.date || (isValidDateStr(options.date) ? options.date : todayISO());
  const start = existing?.start || (isValidTimeStr(options.time) ? options.time : defaultStartTime(date));
  const duration = existing ? existing.duration : data.settings.defaultDuration;
  const status = existing?.status || 'scheduled';
  const reminder = existing ? existing.reminderMinutes : data.settings.defaultReminder;
  const clientId = existing?.clientId || options.clientId || '';

  const clientOptions = [
    `<option value="">No client</option>`,
    ...data.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map((client) =>
      `<option value="${esc(client.id)}" ${clientId === client.id ? 'selected' : ''}>${esc(client.name)}${client.company ? ` — ${esc(client.company)}` : ''}</option>`
    )
  ].join('');

  const statusButtons = STATUS_ORDER.map((value) => `
    <button type="button" data-status-choice="${value}" class="${status === value ? 'active' : ''}">
      <span class="status-dot ${STATUS_META[value].dot}"></span>${STATUS_META[value].label}
    </button>`).join('');

  const html = `
    <div class="modal-overlay" data-modal-overlay>
      <form class="modal wide" id="appointmentForm" role="dialog" aria-modal="true" aria-labelledby="appointmentModalTitle">
        <div class="modal-head">
          <div>
            <span class="modal-eyebrow">${existing ? 'Edit appointment' : 'New appointment'}</span>
            <h2 class="modal-title" id="appointmentModalTitle">${existing ? esc(existing.title) : 'Add to your schedule'}</h2>
            <p class="modal-sub">${existing ? 'Update the details or change the status.' : 'A few details and Tempo will handle the nudge.'}</p>
          </div>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="Close">${icon('x')}</button>
        </div>

        <div class="modal-body">
          <div class="form-grid">
            <div class="field span-2" id="titleField">
              <label for="apptTitle">Title</label>
              <input id="apptTitle" type="text" maxlength="160" required data-autofocus
                     placeholder="e.g. Discovery call" value="${esc(existing?.title || '')}">
              <span class="field-error">Give this appointment a title.</span>
            </div>

            <div class="field span-2">
              <div class="form-section-label">
                <label for="apptClient">Client</label>
                <button class="text-btn" type="button" id="quickClientToggle">+ New client</button>
              </div>
              <select id="apptClient">${clientOptions}</select>
              <div class="quick-client-panel" id="quickClientPanel" hidden>
                <div class="form-grid">
                  <div class="field span-2">
                    <label for="qcName">Client name</label>
                    <input id="qcName" type="text" maxlength="120" placeholder="Full name">
                  </div>
                  <div class="field">
                    <label for="qcEmail">Email <span class="optional">optional</span></label>
                    <input id="qcEmail" type="email" maxlength="160" placeholder="name@example.com">
                  </div>
                  <div class="field">
                    <label for="qcPhone">Phone <span class="optional">optional</span></label>
                    <input id="qcPhone" type="tel" maxlength="60" placeholder="(555) 000-0000">
                  </div>
                </div>
                <div class="quick-client-actions">
                  <button class="btn btn-ghost btn-sm" type="button" id="quickClientCancel">Cancel</button>
                  <button class="btn btn-primary btn-sm" type="button" id="quickClientSave">${icon('check')}Add &amp; select</button>
                </div>
              </div>
            </div>

            <div class="field">
              <label for="apptDate">Date</label>
              <input id="apptDate" type="date" required value="${date}">
            </div>
            <div class="field">
              <label for="apptStart">Start time</label>
              <input id="apptStart" type="time" required value="${start}">
            </div>
            <div class="field">
              <label for="apptDuration">Duration <span class="optional">minutes</span></label>
              <input id="apptDuration" type="number" min="5" max="720" step="5" required value="${duration}">
            </div>
            <div class="field">
              <label for="apptReminder">Reminder</label>
              <select id="apptReminder">${reminderSelectOptions(reminder)}</select>
            </div>

            <div class="span-2" id="conflictWrap" hidden></div>

            <div class="field span-2">
              <label>Status</label>
              <div class="status-choice" role="group" aria-label="Appointment status">
                ${statusButtons}
              </div>
              <input type="hidden" id="apptStatus" value="${status}">
            </div>

            <div class="field span-2">
              <label for="apptLocation">Location <span class="optional">optional</span></label>
              <input id="apptLocation" type="text" maxlength="240" placeholder="Office, video link, or address"
                     value="${esc(existing?.location || '')}">
            </div>

            <div class="field span-2">
              <label for="apptNotes">Notes <span class="optional">optional</span></label>
              <textarea id="apptNotes" maxlength="5000" placeholder="Anything worth remembering…">${esc(existing?.notes || '')}</textarea>
            </div>
          </div>
        </div>

        <div class="modal-foot">
          <div class="foot-left">
            ${existing ? `<button class="btn btn-danger btn-sm" type="button" id="deleteApptBtn">${icon('trash')}Delete</button>` : ''}
          </div>
          <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
          <button class="btn btn-primary" type="submit">${existing ? 'Save changes' : 'Create appointment'}</button>
        </div>
      </form>
    </div>`;

  mountModal(html);
  const form = $('#appointmentForm');
  if (!form) return;

  const titleInput = $('#apptTitle');
  const dateInput = $('#apptDate');
  const startInput = $('#apptStart');
  const durationInput = $('#apptDuration');
  const statusInput = $('#apptStatus');
  const clientSelect = $('#apptClient');
  const quickPanel = $('#quickClientPanel');

  form.querySelectorAll('[data-status-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      statusInput.value = button.dataset.statusChoice;
      form.querySelectorAll('[data-status-choice]').forEach((b) => {
        b.classList.toggle('active', b === button);
      });
      refreshConflict();
    });
  });

  function refreshConflict() {
    const wrap = $('#conflictWrap');
    if (!wrap) return;
    const dateValue = dateInput.value;
    const startValue = startInput.value;
    const durationValue = Number(durationInput.value) || 0;
    if (!isValidDateStr(dateValue) || !isValidTimeStr(startValue) || durationValue < 5 ||
        statusInput.value === 'cancelled') {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }

    const startMinutes = timeToMinutes(startValue);
    const endMinutes = startMinutes + durationValue;
    const conflicts = data.appointments.filter((appt) => {
      if (existing && appt.id === existing.id) return false;
      if (appt.date !== dateValue || appt.status === 'cancelled') return false;
      const otherStart = timeToMinutes(appt.start);
      const otherEnd = otherStart + (Number(appt.duration) || 60);
      return startMinutes < otherEnd && otherStart < endMinutes;
    }).sort(compareByStart);

    if (!conflicts.length) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }

    const names = conflicts.slice(0, 2).map((appt) =>
      `<strong>${esc(appt.title)}</strong> at ${esc(fmtTime(appt.start))}`
    ).join(', ');
    const extra = conflicts.length > 2 ? ` and ${conflicts.length - 2} more` : '';
    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="conflict-note">
        ${icon('alert')}
        <div><strong>Heads up:</strong> this overlaps with ${names}${extra}. You can still save.</div>
      </div>`;
  }

  [dateInput, startInput, durationInput].forEach((input) => {
    input.addEventListener('input', refreshConflict);
    input.addEventListener('change', refreshConflict);
  });
  refreshConflict();

  $('#quickClientToggle')?.addEventListener('click', () => {
    quickPanel.hidden = !quickPanel.hidden;
    if (!quickPanel.hidden) $('#qcName')?.focus();
  });
  $('#quickClientCancel')?.addEventListener('click', () => {
    quickPanel.hidden = true;
  });

  $('#quickClientSave')?.addEventListener('click', () => {
    const nameInput = $('#qcName');
    const name = nameInput.value.trim();
    if (!name) {
      toast('Client needs a name', 'error', 'Add a name before saving the client.');
      nameInput.focus();
      return;
    }
    const client = normalizeClientRecord({
      name,
      email: $('#qcEmail').value.trim(),
      phone: $('#qcPhone').value.trim(),
      createdAt: new Date().toISOString()
    });
    if (!client) return;
    data.clients.push(client);
    saveData();

    const option = document.createElement('option');
    option.value = client.id;
    option.textContent = client.name;
    clientSelect.appendChild(option);
    clientSelect.value = client.id;

    $('#qcName').value = '';
    $('#qcEmail').value = '';
    $('#qcPhone').value = '';
    quickPanel.hidden = true;
    renderShell();
    toast('Client added', 'success', `${client.name} is now linked to this appointment.`);
  });

  $('#deleteApptBtn')?.addEventListener('click', () => {
    closeModal();
    deleteAppointment(existing.id);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      $('#titleField')?.classList.add('invalid');
      titleInput.focus();
      return;
    }
    $('#titleField')?.classList.remove('invalid');

    const dateValue = dateInput.value;
    const startValue = startInput.value;
    const durationValue = clamp(Math.round(Number(durationInput.value) || 60), 5, 720);
    if (!isValidDateStr(dateValue) || !isValidTimeStr(startValue)) {
      toast('Check the date and time', 'error', 'Choose a valid date and start time.');
      return;
    }

    const newStatus = STATUS_META[statusInput.value] ? statusInput.value : 'scheduled';
    const reminderRaw = $('#apptReminder').value;
    const reminderValue = reminderRaw === '' ? null : clamp(Number(reminderRaw), 0, 10080);
    const selectedClient = clientSelect.value;
    const location = $('#apptLocation').value.trim().slice(0, 240);
    const notes = $('#apptNotes').value.slice(0, 5000);
    const nowISO = new Date().toISOString();

    if (existing) {
      const scheduleChanged = existing.date !== dateValue ||
        existing.start !== startValue ||
        Number(existing.reminderMinutes) !== Number(reminderValue) ||
        existing.duration !== durationValue;

      Object.assign(existing, {
        title: title.slice(0, 160),
        clientId: selectedClient && getClient(selectedClient) ? selectedClient : null,
        date: dateValue,
        start: startValue,
        duration: durationValue,
        status: newStatus,
        reminderMinutes: reminderValue,
        location,
        notes,
        updatedAt: nowISO
      });

      if (scheduleChanged || ['completed', 'cancelled'].includes(newStatus)) {
        resetReminderStateFor(existing.id);
        data.alerts = (data.alerts || []).filter((alert) => alert.appointmentId !== existing.id);
      }
    } else {
      data.appointments.push({
        id: uid('apt'),
        title: title.slice(0, 160),
        clientId: selectedClient && getClient(selectedClient) ? selectedClient : null,
        date: dateValue,
        start: startValue,
        duration: durationValue,
        status: newStatus,
        reminderMinutes: reminderValue,
        location,
        notes,
        createdAt: nowISO,
        updatedAt: nowISO
      });
    }

    saveData();
    closeModal();
    renderAll();
    toast(
      existing ? 'Appointment updated' : 'Appointment created',
      'success',
      `${fmtDate(dateValue, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(startValue)}`
    );
    setTimeout(checkReminders, 250);
  });
}

/* ---------------- Delete appointment ---------------- */

function deleteAppointment(id) {
  const appt = data.appointments.find((a) => a.id === id);
  if (!appt) return;
  confirmModal({
    title: 'Delete this appointment?',
    message: `<strong>${esc(appt.title)}</strong> on ${esc(fmtDate(appt.date, { weekday: 'long', month: 'long', day: 'numeric' }))} at ${esc(fmtTime(appt.start))} will be removed. This cannot be undone.`,
    confirmLabel: 'Delete appointment',
    onConfirm: () => {
      data.appointments = data.appointments.filter((a) => a.id !== id);
      data.alerts = (data.alerts || []).filter((alert) => alert.appointmentId !== id);
      resetReminderStateFor(id);
      saveData();
      renderAll();
      toast('Appointment deleted', 'success', `${appt.title} was removed from your schedule.`);
    }
  });
}

/* ---------------- Client editor ---------------- */

function openClientModal(id = null) {
  if (typeof closeBell === 'function') closeBell();
  if (typeof closeSearchResults === 'function') closeSearchResults();
  const existing = id ? data.clients.find((c) => c.id === id) : null;
  if (id && !existing) {
    toast('Client not found', 'error', 'They may have been deleted.');
    return;
  }

  const html = `
    <div class="modal-overlay" data-modal-overlay>
      <form class="modal" id="clientForm" role="dialog" aria-modal="true" aria-labelledby="clientModalTitle">
        <div class="modal-head">
          <div>
            <span class="modal-eyebrow">Client</span>
            <h2 class="modal-title" id="clientModalTitle">${existing ? 'Edit client' : 'Add a client'}</h2>
            <p class="modal-sub">${existing ? 'Keep their details and history up to date.' : 'A name is all you need. Everything else is optional.'}</p>
          </div>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="Close">${icon('x')}</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="field span-2" id="clientNameField">
              <label for="clientName">Name</label>
              <input id="clientName" type="text" maxlength="120" required data-autofocus
                     placeholder="Full name" value="${esc(existing?.name || '')}">
              <span class="field-error">A client name is required.</span>
            </div>
            <div class="field span-2">
              <label for="clientCompany">Company <span class="optional">optional</span></label>
              <input id="clientCompany" type="text" maxlength="120" placeholder="Company or organization"
                     value="${esc(existing?.company || '')}">
            </div>
            <div class="field">
              <label for="clientEmail">Email <span class="optional">optional</span></label>
              <input id="clientEmail" type="email" maxlength="160" placeholder="name@example.com"
                     value="${esc(existing?.email || '')}">
            </div>
            <div class="field">
              <label for="clientPhone">Phone <span class="optional">optional</span></label>
              <input id="clientPhone" type="tel" maxlength="60" placeholder="(555) 000-0000"
                     value="${esc(existing?.phone || '')}">
            </div>
            <div class="field span-2">
              <label for="clientNotes">Notes <span class="optional">optional</span></label>
              <textarea id="clientNotes" maxlength="2000" placeholder="Preferences, context, or anything useful…">${esc(existing?.notes || '')}</textarea>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <div class="foot-left">
            ${existing ? `<button class="btn btn-danger btn-sm" type="button" id="deleteClientBtn">${icon('trash')}Delete</button>` : ''}
          </div>
          <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
          <button class="btn btn-primary" type="submit">${existing ? 'Save changes' : 'Add client'}</button>
        </div>
      </form>
    </div>`;

  mountModal(html);
  const form = $('#clientForm');
  if (!form) return;

  $('#deleteClientBtn')?.addEventListener('click', () => {
    closeModal();
    deleteClient(existing.id);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nameInput = $('#clientName');
    const name = nameInput.value.trim();
    if (!name) {
      $('#clientNameField')?.classList.add('invalid');
      nameInput.focus();
      return;
    }
    $('#clientNameField')?.classList.remove('invalid');

    const values = {
      name: name.slice(0, 120),
      company: $('#clientCompany').value.trim().slice(0, 120),
      email: $('#clientEmail').value.trim().slice(0, 160),
      phone: $('#clientPhone').value.trim().slice(0, 60),
      notes: $('#clientNotes').value.slice(0, 2000)
    };

    if (existing) {
      Object.assign(existing, values);
    } else {
      data.clients.push({
        id: uid('cli'),
        ...values,
        createdAt: new Date().toISOString()
      });
    }

    saveData();
    closeModal();
    renderAll();
    toast(existing ? 'Client updated' : 'Client added', 'success', values.name);
  });
}

function deleteClient(id) {
  const client = data.clients.find((c) => c.id === id);
  if (!client) return;
  const linked = data.appointments.filter((a) => a.clientId === id).length;
  confirmModal({
    title: `Delete ${client.name}?`,
    message: linked
      ? `Their ${plural(linked, 'appointment')} will be kept, but no longer linked to a client. This cannot be undone.`
      : 'This client has no appointments. Deleting them cannot be undone.',
    confirmLabel: 'Delete client',
    onConfirm: () => {
      data.clients = data.clients.filter((c) => c.id !== id);
      data.appointments.forEach((appt) => {
        if (appt.clientId === id) appt.clientId = null;
      });
      if (ui.filters.client === id) ui.filters.client = 'all';
      saveData();
      renderAll();
      toast('Client deleted', 'success', `${client.name} was removed.`);
    }
  });
}

/* ---------------- Day details ---------------- */

function openDayModal(iso) {
  if (!isValidDateStr(iso)) return;
  const appts = appointmentsForDate(iso);
  const dateLabel = fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' });
  const rows = appts.map((appt) => {
    const client = getClient(appt.clientId);
    return `
      <button class="day-detail-item" type="button" data-appt-id="${esc(appt.id)}">
        <span class="day-detail-time">${esc(fmtTimeNumeric(appt.start))}<br><span style="color:var(--muted-2);font-weight:500">${esc(fmtTime(appt.start).split(' ')[1] || '')}</span></span>
        <span class="day-detail-main">
          <strong>${esc(appt.title)}</strong>
          <span>${client ? esc(client.name) + ' · ' : ''}${esc(fmtDuration(appt.duration))}${appt.location ? ' · ' + esc(appt.location) : ''}</span>
        </span>
        ${statusPill(appt.status)}
      </button>`;
  }).join('');

  mountModal(`
    <div class="modal-overlay" data-modal-overlay>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dayModalTitle">
        <div class="modal-head">
          <div>
            <span class="modal-eyebrow">Day view</span>
            <h2 class="modal-title" id="dayModalTitle">${esc(dateLabel)}</h2>
            <p class="modal-sub">${plural(appts.length, 'appointment')} scheduled</p>
          </div>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="Close">${icon('x')}</button>
        </div>
        <div class="modal-body">
          ${appts.length
            ? `<div class="day-detail-list">${rows}</div>`
            : `<div class="empty-state compact">
                 <div class="empty-icon">${icon('calendar')}</div>
                 <h3>Nothing on this day</h3>
                 <p>An open day. Add something if you like.</p>
               </div>`}
        </div>
        <div class="modal-foot">
          <div class="foot-left">
            <button class="btn btn-primary btn-sm" type="button" data-action="new-on" data-date="${iso}">${icon('plus')}Add appointment</button>
          </div>
          <button class="btn btn-secondary" type="button" data-action="close-modal" data-autofocus>Close</button>
        </div>
      </div>
    </div>`);
}

/* ---------------- Confirmation dialog ---------------- */

function confirmModal({ title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', tone = 'danger', onConfirm }) {
  const iconName = tone === 'warn' ? 'alert' : 'trash';
  mountModal(`
    <div class="modal-overlay" data-modal-overlay>
      <div class="modal narrow" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMessage">
        <div class="modal-body">
          <div class="confirm-body">
            <div class="confirm-icon ${tone === 'warn' ? 'warn' : ''}">${icon(iconName)}</div>
            <h3 id="confirmTitle">${esc(title)}</h3>
            <p id="confirmMessage">${message}</p>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" type="button" data-action="close-modal" data-autofocus>${esc(cancelLabel)}</button>
          <button class="btn ${tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}" type="button" id="confirmAction">${esc(confirmLabel)}</button>
        </div>
      </div>
    </div>`);

  const button = $('#confirmAction');
  if (!button) return;
  button.addEventListener('click', () => {
    button.disabled = true;
    closeModal();
    try {
      onConfirm?.();
    } catch (error) {
      console.error(error);
      toast('Something went wrong', 'error', 'Please try again.');
    }
  });
}
