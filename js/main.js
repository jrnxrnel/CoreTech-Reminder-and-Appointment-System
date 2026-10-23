'use strict';

/* ============================================================
   Tempo — main controller
   ============================================================ */

const VIEW_RENDERERS = {
  dashboard: renderDashboard,
  calendar: renderCalendar,
  appointments: renderAppointments,
  clients: renderClients,
  settings: renderSettings
};

function renderView() {
  const container = $('#view');
  if (!container) return;

  const active = document.activeElement;
  let focusState = null;
  if (active && active.id && container.contains(active)) {
    focusState = {
      id: active.id,
      start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
    };
  }

  const renderer = VIEW_RENDERERS[ui.view] || renderDashboard;
  container.innerHTML = renderer();

  if (focusState) {
    const restored = document.getElementById(focusState.id);
    if (restored && typeof restored.focus === 'function') {
      restored.focus({ preventScroll: true });
      if (focusState.start != null && typeof restored.setSelectionRange === 'function') {
        try {
          restored.setSelectionRange(focusState.start, focusState.end);
        } catch (error) { /* not all inputs support selection */ }
      }
    }
  }

  afterViewRender();
}

function renderAll() {
  renderShell();
  renderView();
}

function defaultWeekScrollLeft(weekScroll) {
  const todayCol = weekScroll.querySelector('.week-col.today');
  if (!todayCol) return 0;
  const scrollerRect = weekScroll.getBoundingClientRect();
  const colRect = todayCol.getBoundingClientRect();
  const centered = colRect.left - scrollerRect.left - (weekScroll.clientWidth - colRect.width) / 2;
  return clamp(centered, 0, Math.max(0, weekScroll.scrollWidth - weekScroll.clientWidth));
}

function afterViewRender() {
  const weekScroll = $('#weekScroll');
  if (!weekScroll) return;
  const startHour = Number(weekScroll.dataset.startHour) || 0;
  const defaultTop = Math.max(0, (8 - startHour) * HOUR_HEIGHT - 8);
  weekScroll.scrollTop = ui.weekScrollTop != null ? ui.weekScrollTop : defaultTop;
  const maxLeft = Math.max(0, weekScroll.scrollWidth - weekScroll.clientWidth);
  weekScroll.scrollLeft = maxLeft > 0
    ? clamp(ui.weekScrollLeft != null ? ui.weekScrollLeft : defaultWeekScrollLeft(weekScroll), 0, maxLeft)
    : 0;
  weekScroll.addEventListener('scroll', () => {
    ui.weekScrollTop = weekScroll.scrollTop;
    ui.weekScrollLeft = weekScroll.scrollLeft;
  }, { passive: true });
}

/* ---------------- Routing ---------------- */

function viewFromHash() {
  return location.hash.replace(/^#\/?/, '').trim();
}

function initRoute() {
  const requested = viewFromHash();
  if (VIEW_RENDERERS[requested]) {
    ui.view = requested;
  } else {
    ui.view = 'dashboard';
    try {
      history.replaceState(null, '', '#dashboard');
    } catch (error) { /* fine on file:// */ }
  }
}

function navigate(view) {
  if (!VIEW_RENDERERS[view]) return;
  closeSidebar();
  closeBell();
  closeSearchResults();
  if (location.hash === `#${view}`) {
    ui.view = view;
    renderAll();
    window.scrollTo({ top: 0, behavior: 'auto' });
  } else {
    location.hash = view;
  }
}

function onRouteChange() {
  const requested = viewFromHash();
  if (!VIEW_RENDERERS[requested]) {
    ui.view = 'dashboard';
    try { history.replaceState(null, '', '#dashboard'); } catch (error) { /* ignore */ }
  } else {
    ui.previousView = ui.view;
    ui.view = requested;
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
  renderAll();
}

/* ---------------- Primary click handling ---------------- */

function onDocumentClick(event) {
  const target = event.target;
  const overlay = target.closest('.modal-overlay');
  if (overlay && target === overlay) {
    closeModal();
    return;
  }

  if (!target.closest('.search-wrap')) closeSearchResults();
  if (!target.closest('.bell-wrap')) closeBell();

  if (target.closest('#menuBtn')) {
    toggleSidebar();
    return;
  }
  if (target.closest('#sidebarBackdrop')) {
    closeSidebar();
    return;
  }
  if (target.closest('#bellBtn')) {
    toggleBell();
    return;
  }
  if (target.closest('#newApptBtn')) {
    openAppointmentModal();
    return;
  }
  if (target.closest('#searchWrap') && !target.closest('input') && !target.closest('button')) {
    $('#globalSearch')?.focus();
    return;
  }

  const navEl = target.closest('[data-nav]');
  if (navEl) {
    closeSidebar();
    navigate(navEl.dataset.nav);
    return;
  }

  const actionEl = target.closest('[data-action]');
  if (actionEl) {
    handleAction(actionEl, event);
    return;
  }

  const apptEl = target.closest('[data-appt-id]');
  if (apptEl) {
    openAppointmentModal(apptEl.dataset.apptId);
    return;
  }

  const clientCard = target.closest('[data-client-card]');
  if (clientCard) {
    openClientAppointments(clientCard.dataset.clientCard);
    return;
  }

  const dateCell = target.closest('[data-date-cell]');
  if (dateCell) {
    openAppointmentModal(null, { date: dateCell.dataset.dateCell });
    return;
  }

  const weekCol = target.closest('[data-week-col]');
  if (weekCol) {
    handleWeekSlotClick(event, weekCol);
    return;
  }
}

function handleAction(el, event) {
  const action = el.dataset.action;
  switch (action) {
    case 'close-modal':
      closeModal();
      break;
    case 'dismiss-toast':
      el.closest('.toast')?.remove();
      break;

    case 'new-on':
      openAppointmentModal(null, {
        date: el.dataset.date || todayISO(),
        time: el.dataset.time || ''
      });
      break;
    case 'edit-appointment':
      openAppointmentModal(el.dataset.id);
      break;
    case 'delete-appointment':
      deleteAppointment(el.dataset.id);
      break;

    case 'add-client':
      openClientModal();
      break;
    case 'edit-client':
      openClientModal(el.dataset.id);
      break;
    case 'delete-client':
      deleteClient(el.dataset.id);
      break;
    case 'client-appointments':
      openClientAppointments(el.dataset.client);
      break;
    case 'clear-client-search':
      ui.clientSearch = '';
      renderView();
      break;

    case 'stat-today':
      ui.calendarCursor = new Date();
      ui.calendarMode = 'month';
      ui.weekScrollTop = null;
      ui.weekScrollLeft = null;
      navigate('calendar');
      break;
    case 'stat-week':
      ui.filters = { search: '', status: 'all', range: 'week', client: 'all' };
      navigate('appointments');
      break;
    case 'stat-pending':
      ui.filters = { search: '', status: 'scheduled', range: 'upcoming', client: 'all' };
      navigate('appointments');
      break;
    case 'stat-clients':
      navigate('clients');
      break;

    case 'filter-status':
      ui.filters.status = el.dataset.status || 'all';
      renderView();
      break;
    case 'clear-filters':
      ui.filters = defaultFilters();
      renderView();
      break;

    case 'calendar-prev':
    case 'calendar-next': {
      const direction = action === 'calendar-prev' ? -1 : 1;
      ui.calendarCursor = ui.calendarMode === 'week'
        ? addDaysDate(ui.calendarCursor, direction * 7)
        : addMonthsDate(ui.calendarCursor, direction);
      ui.weekScrollTop = null;
      ui.weekScrollLeft = null;
      renderView();
      break;
    }
    case 'calendar-today':
      ui.calendarCursor = new Date();
      ui.weekScrollTop = null;
      ui.weekScrollLeft = null;
      renderView();
      break;
    case 'calendar-mode':
      if (el.dataset.mode && el.dataset.mode !== ui.calendarMode) {
        ui.calendarMode = el.dataset.mode;
        ui.weekScrollTop = null;
        ui.weekScrollLeft = null;
        renderView();
      }
      break;
    case 'day-details':
      openDayModal(el.dataset.date);
      break;

    case 'enable-notifications':
      enableNotifications();
      break;
    case 'test-notification':
      sendTestNotification();
      break;
    case 'mark-all-read':
      markAllNotificationsRead();
      break;
    case 'alert-view':
      viewAlert(el.dataset.id);
      break;
    case 'alert-snooze':
      snoozeAlert(el.dataset.id);
      break;
    case 'alert-dismiss':
      dismissAlert(el.dataset.id);
      break;

    case 'export-json':
      exportJSONBackup();
      break;
    case 'export-csv':
      exportAppointmentsCSV();
      break;
    case 'import-data':
      $('#importFile')?.click();
      break;
    case 'clear-data':
      clearAllData();
      break;
    case 'load-demo':
      loadDemoData();
      break;

    case 'search-appointment': {
      const input = $('#globalSearch');
      if (input) input.value = '';
      closeSearchResults();
      closeBell();
      openAppointmentModal(el.dataset.id);
      break;
    }
    case 'search-client': {
      const input = $('#globalSearch');
      if (input) input.value = '';
      closeSearchResults();
      closeBell();
      openClientModal(el.dataset.id);
      break;
    }
    default:
      break;
  }
}

function openClientAppointments(clientId) {
  const client = getClient(clientId);
  if (!client) {
    toast('Client not found', 'error', 'They may have been deleted.');
    return;
  }
  ui.filters = { search: '', status: 'all', range: 'all', client: clientId };
  navigate('appointments');
}

function handleWeekSlotClick(event, column) {
  const body = $('#weekBody');
  if (!body) return;
  const startHour = Number(body.dataset.startHour) || 0;
  const rect = column.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  let minutes = startHour * 60 + (offsetY / HOUR_HEIGHT) * 60;
  minutes = clamp(Math.round(minutes / 15) * 15, 0, 23 * 60 + 45);
  openAppointmentModal(null, {
    date: column.dataset.weekCol,
    time: minutesToTime(minutes)
  });
}

/* ---------------- Change / input ---------------- */

function onDocumentChange(event) {
  const target = event.target;

  if (target.id === 'filterRange') {
    ui.filters.range = target.value;
    renderView();
    return;
  }
  if (target.id === 'filterClient') {
    ui.filters.client = target.value;
    renderView();
    return;
  }
  if (target.id === 'settingNotifications') {
    data.settings.notifications = target.checked;
    saveData();
    renderShell();
    if (ui.view === 'settings') renderView();
    toast(
      target.checked ? 'Browser notifications on' : 'Browser notifications paused',
      'info',
      target.checked ? "We'll nudge you when a reminder is due." : 'In-app reminders will still appear.'
    );
    return;
  }
  if (target.id === 'settingReminder') {
    data.settings.defaultReminder = target.value === '' ? null : Number(target.value);
    saveData();
    return;
  }
  if (target.id === 'settingDuration') {
    data.settings.defaultDuration = clamp(Number(target.value) || 45, 5, 720);
    saveData();
    return;
  }
  if (target.id === 'importFile') {
    const file = target.files && target.files[0];
    target.value = '';
    if (file) handleImportFile(file);
  }
}

function onDocumentInput(event) {
  const target = event.target;
  if (target.id === 'globalSearch') {
    renderGlobalSearch(target.value);
    return;
  }
  if (target.id === 'apptSearch') {
    ui.filters.search = target.value;
    renderView();
    return;
  }
  if (target.id === 'clientSearch') {
    ui.clientSearch = target.value;
    renderView();
  }
}

/* ---------------- Keyboard ---------------- */

function onDocumentKeydown(event) {
  const target = event.target;

  if (isModalOpen()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key === 'Tab') {
      trapModalFocus(event);
      return;
    }
  }

  if (target.id === 'globalSearch') {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSearchSelection(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSearchSelection(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activateSearchSelection();
      return;
    }
    if (event.key === 'Escape' && !$('#globalSearchResults')?.hidden) {
      event.preventDefault();
      closeSearchResults();
      return;
    }
  }

  if (event.key === 'Escape') {
    const bellPanel = $('#bellPanel');
    if (bellPanel && !bellPanel.hidden) {
      closeBell();
      return;
    }
    if (!$('#globalSearchResults')?.hidden) {
      closeSearchResults();
      return;
    }
    if ($('#sidebar')?.classList.contains('open')) {
      closeSidebar();
      return;
    }
  }

  if (isTypingTarget(target)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  if (event.key === '/') {
    event.preventDefault();
    const input = $('#globalSearch');
    if (input) {
      input.focus();
      input.select();
    }
    return;
  }

  if (event.key.toLowerCase() === 'n' && !isModalOpen()) {
    event.preventDefault();
    openAppointmentModal();
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    const interactive = target.closest('button, a, input, select, textarea');
    if (interactive) return;
    const clickable = target.closest('.appt-row[role="button"], .client-card[role="button"], .cal-cell[data-date-cell]');
    if (clickable) {
      event.preventDefault();
      clickable.click();
    }
  }
}

function trapModalFocus(event) {
  const modal = $('#modalRoot .modal');
  if (!modal) return;
  const focusable = $$(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    modal
  ).filter((el) => el.getClientRects().length > 0);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!modal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------------- Startup ---------------- */

function bindEvents() {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('change', onDocumentChange);
  document.addEventListener('input', onDocumentInput);
  document.addEventListener('keydown', onDocumentKeydown);
  window.addEventListener('hashchange', onRouteChange);
  window.addEventListener('focus', checkReminders);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkReminders();
      if (!$('#bellPanel')?.hidden) renderBell();
    }
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeSidebar();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (ui.view === 'calendar') renderView();
    }, 160);
  });
}

function startReminderLoop() {
  checkReminders();
  setInterval(checkReminders, 30000);
  setInterval(() => {
    if (document.hidden || isModalOpen()) return;
    if (!$('#bellPanel')?.hidden) renderBell();
    if (ui.view === 'dashboard') renderView();
  }, 60000);
}

async function init() {
  if (typeof TempoAPI !== 'undefined') {
    TempoAPI.setErrorHandler((error) => {
      toast('Could not save to the database', 'error', error.message || 'Check that MySQL and the Node server are running.');
    });
  }

  const result = await loadData();
  loadReminderState();
  if (pruneAlerts()) saveData();
  initRoute();

  bindEvents();
  renderAll();
  startReminderLoop();

  if (result.seeded) {
    setTimeout(() => {
      toast(
        'Welcome to Tempo',
        'info',
        'A sample schedule is ready to explore. Clear it anytime in Settings.'
      );
    }, 900);
  }
  if (result.storageError) {
    setTimeout(() => {
      toast('Local storage is unavailable', 'warn', 'Changes may not persist after you close this page.');
    }, 1600);
  }
  if (result.apiUnavailable && location.protocol !== 'file:') {
    setTimeout(() => {
      toast(
        'Using local browser storage',
        'warn',
        'The database API is unavailable. Start MySQL in XAMPP and the Node server to save to MySQL.'
      );
    }, 2200);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
