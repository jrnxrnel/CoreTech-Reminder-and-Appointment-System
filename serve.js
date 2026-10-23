'use strict';

/* ============================================================
   Tempo — Express server, static frontend and MySQL API
   Run with: npm start   (or: node serve.js)
   ============================================================ */

const path = require('path');
const { exec } = require('child_process');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config({ path: path.join(__dirname, '.env') });

const db = require('./server/db');
const {
  ValidationError,
  STATUS_VALUES,
  requireId,
  normalizeInteger,
  normalizeClient,
  normalizeAppointment,
  normalizeAlert,
  normalizeSettings,
  normalizeStatePayload,
  normalizeReminderStatus,
  normalizeText,
  normalizeEmail,
  isValidDate
} = require('./server/validate');

const app = express();
const PORT = Number(process.env.PORT) || 4173;
const USER_ID = db.DEFAULT_USER.id;
const ROOT = __dirname;
const JS_DIR = path.join(ROOT, 'js');
const api = express.Router();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});

app.use('/api', express.json({ limit: '2mb' }));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

async function clientIfOwned(clientId) {
  if (!clientId) return null;
  return db.getClientById(USER_ID, clientId);
}

function applyAppointmentFilters(appointments, query) {
  const status = query.status;
  const from = query.from;
  const to = query.to;
  const search = String(query.search || '').trim().toLowerCase();

  return appointments.filter((appointment) => {
    if (status && status !== 'all' && appointment.status !== status) return false;
    if (from && isValidDate(from) && appointment.date < from) return false;
    if (to && isValidDate(to) && appointment.date > to) return false;
    if (search) {
      const haystack = [
        appointment.title,
        appointment.location,
        appointment.notes,
        appointment.start,
        appointment.date
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/* ---------------- Health ---------------- */

app.get('/api/health', asyncRoute(async (req, res) => {
  try {
    await db.checkConnection();
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error.code || error.message);
    res.status(503).json({
      ok: false,
      database: 'unavailable',
      error: 'MySQL is not reachable. Start MySQL in XAMPP and import database.sql.'
    });
  }
}));

/* ---------------- Workspace state (used by the frontend) ---------------- */

api.get('/state', asyncRoute(async (req, res) => {
  await db.ensureDefaults();
  res.json(await db.readState(USER_ID));
}));

api.put('/state', asyncRoute(async (req, res) => {
  const state = normalizeStatePayload(req.body);
  await db.ensureDefaults();
  await db.replaceState(USER_ID, state);
  res.json(await db.readState(USER_ID));
}));

/* ---------------- Users and settings ---------------- */

api.get('/user', asyncRoute(async (req, res) => {
  const state = await db.readState(USER_ID);
  res.json({ user: state.user, settings: state.settings });
}));

api.put('/user', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const name = normalizeText(body.name, 120, { required: true });
  const email = normalizeEmail(body.email, { required: true });
  const user = await db.updateUser(USER_ID, { name, email });
  res.json({ user });
}));

api.put('/settings', asyncRoute(async (req, res) => {
  const settings = normalizeSettings(req.body);
  res.json({ settings: await db.updateSettings(USER_ID, settings) });
}));

/* ---------------- Clients ---------------- */

api.get('/clients', asyncRoute(async (req, res) => {
  const [rows] = await db.pool.query(
    'SELECT * FROM clients WHERE user_id = ? ORDER BY name ASC',
    [USER_ID]
  );
  res.json({ clients: rows.map(db.mapClient) });
}));

api.get('/clients/:id', asyncRoute(async (req, res) => {
  const client = await db.getClientById(USER_ID, requireId(req.params.id, 40));
  if (!client) throw notFound('Client not found.');
  res.json({ client });
}));

api.post('/clients', asyncRoute(async (req, res) => {
  const client = normalizeClient(req.body);
  const saved = await db.saveClient(USER_ID, client);
  res.status(201).json({ client: saved });
}));

api.put('/clients/:id', asyncRoute(async (req, res) => {
  const id = requireId(req.params.id, 40);
  const existing = await db.getClientById(USER_ID, id);
  if (!existing) throw notFound('Client not found.');
  const client = normalizeClient({ ...existing, ...(req.body || {}), id });
  res.json({ client: await db.saveClient(USER_ID, client) });
}));

api.delete('/clients/:id', asyncRoute(async (req, res) => {
  const deleted = await db.deleteClient(USER_ID, requireId(req.params.id, 40));
  if (!deleted) throw notFound('Client not found.');
  res.json({ ok: true });
}));

/* ---------------- Appointments ---------------- */

api.get('/appointments', asyncRoute(async (req, res) => {
  const status = req.query.status;
  if (status && status !== 'all' && !STATUS_VALUES.includes(status)) {
    throw new ValidationError('Appointment status filter is not valid.');
  }
  const state = await db.readState(USER_ID);
  res.json({ appointments: applyAppointmentFilters(state.appointments, req.query) });
}));

api.get('/appointments/:id', asyncRoute(async (req, res) => {
  const appointment = await db.getAppointmentById(USER_ID, requireId(req.params.id, 40));
  if (!appointment) throw notFound('Appointment not found.');
  res.json({ appointment });
}));

api.post('/appointments', asyncRoute(async (req, res) => {
  const appointment = normalizeAppointment(req.body);
  if (appointment.clientId) {
    const client = await clientIfOwned(appointment.clientId);
    if (!client) appointment.clientId = null;
  }
  const saved = await db.saveAppointment(USER_ID, appointment);
  res.status(201).json({ appointment: saved });
}));

api.put('/appointments/:id', asyncRoute(async (req, res) => {
  const id = requireId(req.params.id, 40);
  const existing = await db.getAppointmentById(USER_ID, id);
  if (!existing) throw notFound('Appointment not found.');
  const appointment = normalizeAppointment({ ...existing, ...(req.body || {}), id });
  if (appointment.clientId) {
    const client = await clientIfOwned(appointment.clientId);
    if (!client) appointment.clientId = null;
  }
  res.json({ appointment: await db.saveAppointment(USER_ID, appointment) });
}));

api.delete('/appointments/:id', asyncRoute(async (req, res) => {
  const deleted = await db.deleteAppointment(USER_ID, requireId(req.params.id, 40));
  if (!deleted) throw notFound('Appointment not found.');
  res.json({ ok: true });
}));

/* ---------------- Reminders ---------------- */

api.get('/reminders', asyncRoute(async (req, res) => {
  res.json({ reminders: await db.listReminders(USER_ID) });
}));

api.get('/reminders/:id', asyncRoute(async (req, res) => {
  const reminder = await db.getReminderById(USER_ID, requireId(req.params.id, 64));
  if (!reminder) throw notFound('Reminder not found.');
  res.json({ reminder });
}));

api.post('/reminders', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const appointmentId = requireId(body.appointmentId, 40);
  const appointment = await db.getAppointmentById(USER_ID, appointmentId);
  if (!appointment) throw notFound('Appointment not found.');

  const minutesBefore = normalizeInteger(body.minutesBefore, {
    min: 0,
    max: 10080,
    required: true
  });
  const status = normalizeReminderStatus(body.status);
  const reminder = await db.saveReminder(USER_ID, appointment, {
    id: db.reminderIdFor(appointment.id),
    minutesBefore,
    status
  });
  res.status(201).json({ reminder });
}));

api.put('/reminders/:id', asyncRoute(async (req, res) => {
  const id = requireId(req.params.id, 64);
  const existing = await db.getReminderById(USER_ID, id);
  if (!existing) throw notFound('Reminder not found.');

  const appointment = await db.getAppointmentById(USER_ID, existing.appointmentId);
  if (!appointment) throw notFound('Appointment not found.');

  const body = req.body || {};
  const minutesBefore = normalizeInteger(
    body.minutesBefore === undefined ? existing.minutesBefore : body.minutesBefore,
    { min: 0, max: 10080, required: true }
  );
  const status = normalizeReminderStatus(
    body.status === undefined ? existing.status : body.status
  );

  const reminder = await db.saveReminder(USER_ID, appointment, {
    id,
    minutesBefore,
    status
  });
  res.json({ reminder });
}));

api.delete('/reminders/:id', asyncRoute(async (req, res) => {
  const deleted = await db.deleteReminder(USER_ID, requireId(req.params.id, 64));
  if (!deleted) throw notFound('Reminder not found.');
  res.json({ ok: true });
}));

/* ---------------- Notifications ---------------- */

api.get('/notifications', asyncRoute(async (req, res) => {
  res.json({ notifications: await db.listNotifications(USER_ID) });
}));

api.post('/notifications', asyncRoute(async (req, res) => {
  const alert = normalizeAlert(req.body);
  if (alert.appointmentId) {
    const appointment = await db.getAppointmentById(USER_ID, alert.appointmentId);
    if (!appointment) alert.appointmentId = null;
  }
  await db.pool.query(
    `INSERT INTO notifications (id, user_id, appointment_id, title, body, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body), is_read = VALUES(is_read)`,
    [alert.id, USER_ID, alert.appointmentId, alert.title, alert.body, alert.read ? 1 : 0]
  );
  res.status(201).json({ notification: alert });
}));

api.patch('/notifications/:id/read', asyncRoute(async (req, res) => {
  const read = req.body && req.body.read !== undefined ? Boolean(req.body.read) : true;
  const updated = await db.markNotificationRead(USER_ID, requireId(req.params.id, 64), read);
  if (!updated) throw notFound('Notification not found.');
  res.json({ ok: true, read });
}));

api.delete('/notifications/:id', asyncRoute(async (req, res) => {
  const deleted = await db.deleteNotification(USER_ID, requireId(req.params.id, 64));
  if (!deleted) throw notFound('Notification not found.');
  res.json({ ok: true });
}));

app.use('/api', api);

/* ---------------- Static frontend ---------------- */

app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.get('/styles.css', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(ROOT, 'styles.css'));
});

app.use('/js', express.static(JS_DIR, {
  dotfiles: 'deny',
  etag: false,
  index: false,
  maxAge: 0,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
}));

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

/* ---------------- Errors ---------------- */

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  if (error instanceof ValidationError || error.status === 400) {
    return res.status(400).json({ error: error.message || 'Invalid request.' });
  }
  if (error.status === 404) {
    return res.status(404).json({ error: error.message || 'Not found.' });
  }

  const code = error.code || '';
  if (code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That record already exists.' });
  }
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_DB_ERROR') {
    console.error('Database schema is missing:', code);
    return res.status(503).json({
      error: 'Database tables are missing. Import database.sql in phpMyAdmin and try again.'
    });
  }
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('Database access denied. Check .env credentials.');
    return res.status(503).json({
      error: 'MySQL rejected the credentials. Check DB_USER and DB_PASSWORD in .env.'
    });
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT'].includes(code)) {
    return res.status(503).json({
      error: 'MySQL is not reachable. Start MySQL in XAMPP and try again.'
    });
  }

  console.error(error);
  return res.status(500).json({ error: 'Unexpected server error.' });
});

/* ---------------- Startup ---------------- */

const server = app.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log('');
  console.log(`  Tempo is running at ${url}`);
  console.log('  API: /api/health');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('');

  db.checkConnection()
    .then(() => db.ensureDefaults())
    .then(() => console.log('  MySQL connected. Workspace data will be saved to the database.'))
    .catch((error) => {
      console.warn(`  MySQL is not ready: ${error.code || error.message}`);
      console.warn('  Start MySQL in XAMPP and import database.sql before using the app.');
      console.warn('');
    });

  if (!process.argv.includes('--no-open')) {
    const command = process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
    exec(command, () => {});
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Try a different one:  set PORT=4174 && node serve.js');
  } else {
    console.error(error.message);
  }
  process.exit(1);
});
