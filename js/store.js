'use strict';

/* ============================================================
   Tempo — state, storage, seed data and selectors
   ============================================================ */

const STORAGE_KEYS = {
  data: 'tempo.data.v1',
  reminders: 'tempo.reminders.v1',
  mode: 'tempo.mode.v1'
};

const DEFAULT_SETTINGS = {
  defaultReminder: 30,
  defaultDuration: 45,
  notifications: true
};

let data = null;
let reminderState = {};
let ui = {
  view: 'dashboard',
  calendarCursor: new Date(),
  calendarMode: 'month',
  weekScrollTop: null,
  weekScrollLeft: null,
  filters: defaultFilters(),
  clientSearch: '',
  searchActiveIndex: -1,
  previousView: null
};

function defaultFilters() {
  return { search: '', status: 'all', range: 'upcoming', client: 'all' };
}

function emptyData() {
  return {
    version: 1,
    initialized: true,
    clients: [],
    appointments: [],
    alerts: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

/* ---------------- Demo content ---------------- */

function seedData() {
  const today = todayISO();
  const now = new Date().toISOString();
  const clientSpecs = [
    { name: 'Maya Chen', company: 'Northwind Studio', email: 'maya@northwind.studio', phone: '(415) 555-0134', notes: 'Prefers mornings. New brand identity project.' },
    { name: 'Daniel Okafor', company: 'Brightline Legal', email: 'daniel@brightline.co', phone: '(212) 555-0188', notes: 'Quarterly strategy retainer.' },
    { name: 'Priya Raman', company: 'Lumen Health', email: 'priya@lumenhealth.com', phone: '(646) 555-0119', notes: 'Product launch planning.' },
    { name: 'Tom Becker', company: 'Becker & Co.', email: 'tom@beckerco.com', phone: '(312) 555-0162', notes: '' },
    { name: 'Sofia Alvarez', company: 'Independent', email: 'sofia.alvarez@email.com', phone: '(305) 555-0127', notes: 'Portfolio review.' }
  ];

  const clients = clientSpecs.map((spec, i) => ({
    id: uid('cli'),
    ...spec,
    createdAt: new Date(Date.now() - (28 - i * 4) * 86400000).toISOString()
  }));
  const [maya, daniel, priya, tom, sofia] = clients;

  const make = (offset, start, duration, title, client, status, reminder, location, notes = '') => ({
    id: uid('apt'),
    title,
    clientId: client ? client.id : null,
    date: addDaysISO(today, offset),
    start,
    duration,
    status,
    reminderMinutes: reminder,
    location,
    notes,
    createdAt: now,
    updatedAt: now
  });

  const appointments = [
    make(0, '09:30', 30, 'Discovery call', maya, 'confirmed', 15, 'Google Meet', 'Walk through the new brand direction and timeline.'),
    make(0, '11:00', 60, 'Strategy review', daniel, 'scheduled', 30, 'Conference Room B', 'Review Q4 priorities and the renewed retainer.'),
    make(0, '14:00', 45, 'Follow-up consultation', priya, 'confirmed', 30, 'Video call', ''),
    make(0, '16:30', 45, 'Portfolio review', sofia, 'scheduled', 60, 'Studio', 'Bring the latest case studies.'),
    make(1, '10:00', 60, 'Contract walkthrough', daniel, 'confirmed', 30, 'Video call', ''),
    make(1, '13:30', 30, 'Weekly check-in', maya, 'scheduled', 15, 'Phone call', ''),
    make(2, '09:00', 30, 'Team sync', null, 'scheduled', 10, 'Conference Room A', 'Internal planning session.'),
    make(3, '15:00', 90, 'Quarterly planning', priya, 'confirmed', 60, 'Lumen Health HQ', 'Bring the launch roadmap.'),
    make(6, '10:30', 60, 'Monthly review', tom, 'scheduled', 30, 'Office', ''),
    make(-1, '16:00', 30, 'Proposal catch-up', sofia, 'cancelled', null, 'Video call', 'Moved to next month.'),
    make(-2, '11:00', 60, 'Initial consultation', tom, 'completed', 15, 'Office', ''),
    make(-5, '14:00', 45, 'Onboarding call', sofia, 'completed', 30, 'Video call', '')
  ];

  return {
    version: 1,
    initialized: true,
    clients,
    appointments,
    alerts: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

/* ---------------- Normalization ---------------- */

function normalizeClientRecord(raw, forceNewId = false) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 120);
  if (!name) return null;
  return {
    id: forceNewId || !raw.id ? uid('cli') : String(raw.id),
    name,
    company: String(raw.company || '').trim().slice(0, 120),
    email: String(raw.email || '').trim().slice(0, 160),
    phone: String(raw.phone || '').trim().slice(0, 60),
    notes: String(raw.notes || '').slice(0, 2000),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
  };
}

function normalizeAppointmentRecord(raw, forceNewId = false) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim().slice(0, 160);
  const date = String(raw.date || '');
  const start = String(raw.start || '');
  if (!title || !isValidDateStr(date) || !isValidTimeStr(start)) return null;

  const duration = clamp(Math.round(Number(raw.duration) || 60), 5, 720);
  const status = STATUS_META[raw.status] ? raw.status : 'scheduled';
  let reminderMinutes = null;
  if (raw.reminderMinutes !== null && raw.reminderMinutes !== undefined && raw.reminderMinutes !== '') {
    const value = Number(raw.reminderMinutes);
    if (Number.isFinite(value)) reminderMinutes = clamp(Math.round(value), 0, 10080);
  }

  return {
    id: forceNewId || !raw.id ? uid('apt') : String(raw.id),
    title,
    clientId: raw.clientId ? String(raw.clientId) : null,
    date,
    start,
    duration,
    status,
    reminderMinutes,
    location: String(raw.location || '').slice(0, 240),
    notes: String(raw.notes || '').slice(0, 5000),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString()
  };
}

function sanitizeSettings(raw, base = DEFAULT_SETTINGS) {
  const result = { ...DEFAULT_SETTINGS, ...(base || {}) };
  if (!raw || typeof raw !== 'object') return result;
  if (raw.defaultReminder === null) {
    result.defaultReminder = null;
  } else if (raw.defaultReminder !== undefined && Number.isFinite(Number(raw.defaultReminder))) {
    result.defaultReminder = clamp(Math.round(Number(raw.defaultReminder)), 0, 10080);
  }
  if (raw.defaultDuration !== undefined && Number.isFinite(Number(raw.defaultDuration))) {
    result.defaultDuration = clamp(Math.round(Number(raw.defaultDuration)), 5, 720);
  }
  if (typeof raw.notifications === 'boolean') result.notifications = raw.notifications;
  return result;
}

function normalizeAlert(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  return {
    id: raw.id ? String(raw.id) : uid('alt'),
    appointmentId: raw.appointmentId ? String(raw.appointmentId) : null,
    title: title.slice(0, 180),
    body: String(raw.body || '').slice(0, 500),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
    read: !!raw.read
  };
}

function normalizeStoredData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const clients = [];
  const seenClients = new Set();
  for (const item of (Array.isArray(raw.clients) ? raw.clients : [])) {
    const client = normalizeClientRecord(item);
    if (!client) continue;
    if (seenClients.has(client.id)) client.id = uid('cli');
    seenClients.add(client.id);
    clients.push(client);
  }

  const appointments = [];
  const seenAppointments = new Set();
  for (const item of (Array.isArray(raw.appointments) ? raw.appointments : [])) {
    const appointment = normalizeAppointmentRecord(item);
    if (!appointment) continue;
    if (seenAppointments.has(appointment.id)) appointment.id = uid('apt');
    seenAppointments.add(appointment.id);
    appointment.clientId = appointment.clientId && seenClients.has(appointment.clientId) ? appointment.clientId : null;
    appointments.push(appointment);
  }

  let alerts = (Array.isArray(raw.alerts) ? raw.alerts : []).map(normalizeAlert).filter(Boolean);
  const appointmentIds = new Set(appointments.map((a) => a.id));
  const cutoff = Date.now() - 7 * 86400000;
  alerts = alerts
    .filter((a) => (!a.appointmentId || appointmentIds.has(a.appointmentId)) && a.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);

  return {
    version: 1,
    initialized: true,
    clients,
    appointments,
    alerts,
    settings: sanitizeSettings(raw.settings)
  };
}

/* ---------------- Storage ---------------- */

function persistenceMarker() {
  try {
    return localStorage.getItem(STORAGE_KEYS.mode) || '';
  } catch (error) {
    return '';
  }
}

function cacheDataLocally() {
  if (!data) return;
  try {
    localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(data));
  } catch (error) {
    /* The database remains the source of truth when it is available. */
  }
}

function buildSyncPayload() {
  if (!data) return null;
  return {
    clients: data.clients,
    appointments: data.appointments,
    alerts: data.alerts,
    settings: data.settings
  };
}

async function loadData() {
  let raw = null;
  let storageUnavailable = false;

  try {
    raw = localStorage.getItem(STORAGE_KEYS.data);
  } catch (error) {
    storageUnavailable = true;
  }

  let apiUnavailable = false;

  if (typeof TempoAPI !== 'undefined') {
    try {
      const remote = await TempoAPI.loadState();
      const normalized = normalizeStoredData(remote);
      if (!normalized) throw new Error('The server returned invalid workspace data.');

      const remoteHasData = normalized.clients.length ||
        normalized.appointments.length ||
        normalized.alerts.length;

      if (!remoteHasData && raw && persistenceMarker() !== 'database') {
        let localNormalized = null;
        try {
          localNormalized = normalizeStoredData(JSON.parse(raw));
        } catch (error) {
          localNormalized = null;
        }
        if (localNormalized && (localNormalized.clients.length || localNormalized.appointments.length)) {
          data = localNormalized;
          cacheDataLocally();
          try {
            await TempoAPI.saveNow(buildSyncPayload());
            return { seeded: false, migrated: true, mode: 'database' };
          } catch (error) {
            TempoAPI.markLocal(error);
            apiUnavailable = true;
          }
        }
      }

      if (!apiUnavailable) {
        data = normalized;
        TempoAPI.setMode('database');
        cacheDataLocally();
        return { seeded: false, mode: 'database' };
      }
    } catch (error) {
      TempoAPI.markLocal(error);
      apiUnavailable = true;
    }
  }

  if (typeof TempoAPI !== 'undefined') TempoAPI.setMode('local');

  if (raw) {
    try {
      const normalized = normalizeStoredData(JSON.parse(raw));
      if (!normalized) throw new Error('Invalid data');
      data = normalized;
      return { seeded: false, mode: 'local', apiUnavailable };
    } catch (error) {
      data = seedData();
      saveData();
      return { seeded: true, storageError: true, mode: 'local', apiUnavailable };
    }
  }

  data = seedData();
  if (!storageUnavailable) saveData();
  return { seeded: true, storageError: storageUnavailable, mode: 'local', apiUnavailable };
}

function saveData() {
  if (!data) return;
  try {
    localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(data));
  } catch (error) {
    toast('Could not save changes', 'error', 'Your browser storage may be full or blocked.');
  }
  if (typeof TempoAPI !== 'undefined' && TempoAPI.isDatabase()) {
    TempoAPI.queueSave(buildSyncPayload());
  }
}

function loadReminderState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.reminders);
    const parsed = raw ? JSON.parse(raw) : {};
    reminderState = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    reminderState = {};
  }
}

function saveReminderState() {
  try {
    localStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(reminderState));
  } catch (error) {
    /* Non-critical */
  }
}

function reminderKey(appt) {
  return `${appt.id}:${appt.date}T${appt.start}`;
}

function resetReminderStateFor(appointmentId) {
  let changed = false;
  Object.keys(reminderState).forEach((key) => {
    if (key.startsWith(`${appointmentId}:`)) {
      delete reminderState[key];
      changed = true;
    }
  });
  if (changed) saveReminderState();
}

/* ---------------- Selectors ---------------- */

function getClient(id) {
  if (!id) return null;
  return data.clients.find((c) => c.id === id) || null;
}

function clientName(id) {
  return getClient(id)?.name || '';
}

function compareByStart(a, b) {
  return apptStart(a).getTime() - apptStart(b).getTime();
}

function appointmentsForDate(iso) {
  return data.appointments.filter((a) => a.date === iso).sort(compareByStart);
}

function upcomingAppointments() {
  const now = Date.now();
  return data.appointments
    .filter((a) => a.status !== 'cancelled' && apptEnd(a).getTime() >= now)
    .sort(compareByStart);
}

function nextAppointment() {
  const now = Date.now();
  return data.appointments
    .filter((a) => ['scheduled', 'confirmed'].includes(a.status) && apptEnd(a).getTime() >= now)
    .sort(compareByStart)[0] || null;
}

function upcomingCountForClient(clientId) {
  const now = Date.now();
  return data.appointments.filter((a) =>
    a.clientId === clientId &&
    ['scheduled', 'confirmed'].includes(a.status) &&
    apptEnd(a).getTime() >= now
  ).length;
}

function clientAppointments(clientId) {
  return data.appointments.filter((a) => a.clientId === clientId).sort(compareByStart);
}

function nextForClient(clientId) {
  const now = Date.now();
  return data.appointments
    .filter((a) => a.clientId === clientId && ['scheduled', 'confirmed'].includes(a.status) && apptEnd(a).getTime() >= now)
    .sort(compareByStart)[0] || null;
}

function matchesSearch(appt, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const client = getClient(appt.clientId);
  const haystack = [
    appt.title,
    appt.location,
    appt.notes,
    appt.start,
    appt.date,
    client?.name,
    client?.company,
    client?.email
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

function matchesRange(appt, range) {
  const now = Date.now();
  const today = todayISO();
  if (range === 'today') return appt.date === today;
  if (range === 'week') {
    const start = toISO(startOfWeekDate(new Date()));
    const end = addDaysISO(start, 6);
    return appt.date >= start && appt.date <= end;
  }
  if (range === 'past') return apptEnd(appt).getTime() < now;
  if (range === 'upcoming') return apptEnd(appt).getTime() >= now;
  return true;
}

function filteredAppointments(filters = ui.filters, options = {}) {
  const { ignoreStatus = false } = options;
  const query = String(filters.search || '').trim();
  const clientFilter = filters.client || 'all';

  const results = data.appointments.filter((appt) => {
    if ((!ignoreStatus && filters.status && filters.status !== 'all') && appt.status !== filters.status) return false;
    if (clientFilter !== 'all' && appt.clientId !== clientFilter) return false;
    if (!matchesSearch(appt, query)) return false;
    if (!matchesRange(appt, filters.range || 'all')) return false;
    return true;
  });

  results.sort(compareByStart);
  if (filters.range === 'past') results.reverse();
  return results;
}

function filterStatusCounts(filters = ui.filters) {
  const list = filteredAppointments({ ...filters, status: 'all' }, { ignoreStatus: true });
  const counts = { all: list.length };
  STATUS_ORDER.forEach((status) => {
    counts[status] = list.filter((a) => a.status === status).length;
  });
  return counts;
}

function hasActiveFilters() {
  const f = ui.filters;
  return !!(f.search || (f.status && f.status !== 'all') || (f.range && f.range !== 'upcoming') || (f.client && f.client !== 'all'));
}

function weekDates(date) {
  const start = startOfWeekDate(date);
  return Array.from({ length: 7 }, (_, i) => addDaysDate(start, i));
}

/* ---------------- Import ---------------- */

function prepareImport(raw) {
  let rawAppointments = [];
  let rawClients = [];
  let rawSettings = null;

  if (Array.isArray(raw)) {
    rawAppointments = raw;
  } else if (raw && typeof raw === 'object') {
    rawAppointments = Array.isArray(raw.appointments) ? raw.appointments : [];
    rawClients = Array.isArray(raw.clients) ? raw.clients : [];
    rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : null;
  } else {
    return null;
  }

  const clients = [];
  const clientIdMap = new Map();
  for (const rawClient of rawClients) {
    const originalId = rawClient && rawClient.id != null ? String(rawClient.id) : null;
    const client = normalizeClientRecord(rawClient, true);
    if (!client) continue;
    if (originalId) clientIdMap.set(originalId, client.id);
    clients.push(client);
  }

  const appointments = [];
  for (const rawAppointment of rawAppointments) {
    const appointment = normalizeAppointmentRecord(rawAppointment, true);
    if (!appointment) continue;
    appointment.clientId = appointment.clientId && clientIdMap.has(appointment.clientId)
      ? clientIdMap.get(appointment.clientId)
      : null;
    appointments.push(appointment);
  }

  if (!clients.length && !appointments.length) return null;

  return {
    clients,
    appointments,
    settings: rawSettings ? sanitizeSettings(rawSettings) : null,
    skipped: Math.max(0, rawClients.length - clients.length) + Math.max(0, rawAppointments.length - appointments.length)
  };
}

function applyImport(prepared, mode) {
  if (!prepared) return;
  if (mode === 'replace') {
    data.clients = prepared.clients;
    data.appointments = prepared.appointments;
    data.alerts = [];
    data.settings = prepared.settings
      ? sanitizeSettings(prepared.settings)
      : { ...DEFAULT_SETTINGS, ...data.settings };
    reminderState = {};
    saveReminderState();
    ui.filters = defaultFilters();
  } else {
    data.clients.push(...prepared.clients);
    data.appointments.push(...prepared.appointments);
  }
  saveData();
}

/* ---------------- Notifications ---------------- */

function notificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function notificationPermission() {
  if (!notificationSupported()) return 'unsupported';
  try {
    return Notification.permission;
  } catch (error) {
    return 'unsupported';
  }
}

function canShowBrowserNotifications() {
  return notificationSupported() &&
    notificationPermission() === 'granted' &&
    data.settings.notifications !== false;
}

function pruneAlerts() {
  if (!data) return false;
  const ids = new Set(data.appointments.map((a) => a.id));
  const cutoff = Date.now() - 7 * 86400000;
  const previous = data.alerts || [];
  const next = previous
    .filter((alert) => (!alert.appointmentId || ids.has(alert.appointmentId)) && alert.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);
  data.alerts = next;
  return next.length !== previous.length;
}
