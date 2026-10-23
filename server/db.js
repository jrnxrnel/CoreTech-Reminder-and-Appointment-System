'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_USER = {
  id: process.env.DEFAULT_USER_ID || 'usr_default',
  name: process.env.DEFAULT_USER_NAME || 'Tempo User',
  email: process.env.DEFAULT_USER_EMAIL || 'owner@tempo.local'
};

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'appointment_reminder_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
  decimalNumbers: true
});

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatSqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safe.getFullYear()}-${pad2(safe.getMonth() + 1)}-${pad2(safe.getDate())} ` +
    `${pad2(safe.getHours())}:${pad2(safe.getMinutes())}:${pad2(safe.getSeconds())}`;
}

function isoFromSql(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function msFromSql(value) {
  if (!value) return Date.now();
  if (value instanceof Date) return value.getTime();
  const text = String(value);
  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

function timeOnly(value) {
  return String(value || '').slice(0, 5);
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: isoFromSql(row.created_at),
    updatedAt: isoFromSql(row.updated_at)
  };
}

function mapSettings(row) {
  return {
    defaultReminder: row && row.default_reminder !== null ? Number(row.default_reminder) : null,
    defaultDuration: row && row.default_duration !== null ? Number(row.default_duration) : 45,
    notifications: row ? Boolean(row.notifications_enabled) : true
  };
}

function mapClient(row) {
  return {
    id: row.id,
    name: row.name,
    company: row.company || '',
    email: row.email || '',
    phone: row.phone || '',
    notes: row.notes || '',
    createdAt: isoFromSql(row.created_at),
    updatedAt: isoFromSql(row.updated_at)
  };
}

function mapAppointment(row) {
  return {
    id: row.id,
    title: row.title,
    clientId: row.client_id || null,
    date: dateOnly(row.appointment_date),
    start: timeOnly(row.start_time),
    duration: Number(row.duration_minutes),
    status: row.status,
    reminderMinutes: row.reminder_minutes === null ? null : Number(row.reminder_minutes),
    location: row.location || '',
    notes: row.notes || '',
    createdAt: isoFromSql(row.created_at),
    updatedAt: isoFromSql(row.updated_at)
  };
}

function mapReminder(row) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    minutesBefore: Number(row.minutes_before),
    remindAt: isoFromSql(row.remind_at),
    status: row.status,
    sentAt: isoFromSql(row.sent_at),
    createdAt: isoFromSql(row.created_at),
    updatedAt: isoFromSql(row.updated_at)
  };
}

function mapNotification(row) {
  return {
    id: row.id,
    appointmentId: row.appointment_id || null,
    title: row.title,
    body: row.body || '',
    createdAt: msFromSql(row.created_at),
    read: Boolean(row.is_read)
  };
}

function computeRemindAt(date, start, minutesBefore) {
  const [year, month, day] = String(date).split('-').map(Number);
  const [hours, minutes] = String(start).split(':').map(Number);
  const remindAt = new Date(year, month - 1, day, hours, minutes, 0, 0);
  remindAt.setMinutes(remindAt.getMinutes() - Number(minutesBefore || 0));
  return formatSqlDateTime(remindAt);
}

function reminderIdFor(appointmentId) {
  return `rem_${appointmentId}`.slice(0, 64);
}

async function checkConnection() {
  await pool.query('SELECT 1');
  return true;
}

async function ensureDefaults() {
  await pool.query(
    `INSERT INTO users (id, name, email)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [DEFAULT_USER.id, DEFAULT_USER.name, DEFAULT_USER.email]
  );
  await pool.query(
    `INSERT INTO user_settings (user_id, default_reminder, default_duration, notifications_enabled)
     VALUES (?, 30, 45, 1)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [DEFAULT_USER.id]
  );
}

async function readUser(userId) {
  const [userRows] = await pool.query(
    'SELECT id, name, email, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (!userRows.length) {
    await ensureDefaults();
    const [retryRows] = await pool.query(
      'SELECT id, name, email, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!retryRows.length) throw new Error('Default user could not be created.');
    return mapUser(retryRows[0]);
  }
  return mapUser(userRows[0]);
}

async function readState(userId = DEFAULT_USER.id) {
  const user = await readUser(userId);
  const [settingsRows, clientRows, appointmentRows, reminderRows, notificationRows] = await Promise.all([
    pool.query('SELECT * FROM user_settings WHERE user_id = ? LIMIT 1', [userId]),
    pool.query('SELECT * FROM clients WHERE user_id = ? ORDER BY name ASC', [userId]),
    pool.query(
      'SELECT * FROM appointments WHERE user_id = ? ORDER BY appointment_date ASC, start_time ASC',
      [userId]
    ),
    pool.query('SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_at ASC', [userId]),
    pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [userId])
  ]);

  return {
    user,
    settings: mapSettings(settingsRows[0][0]),
    clients: clientRows[0].map(mapClient),
    appointments: appointmentRows[0].map(mapAppointment),
    reminders: reminderRows[0].map(mapReminder),
    alerts: notificationRows[0].map(mapNotification)
  };
}

async function upsertClientRow(connection, userId, client) {
  await connection.query(
    `INSERT INTO clients
       (id, user_id, name, company, email, phone, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       name = VALUES(name),
       company = VALUES(company),
       email = VALUES(email),
       phone = VALUES(phone),
       notes = VALUES(notes),
       updated_at = NOW()`,
    [
      client.id,
      userId,
      client.name,
      client.company || '',
      client.email || '',
      client.phone || '',
      client.notes || '',
      formatSqlDateTime(client.createdAt)
    ]
  );
}

async function upsertAppointmentRow(connection, userId, appointment) {
  await connection.query(
    `INSERT INTO appointments
       (id, user_id, client_id, title, appointment_date, start_time, duration_minutes,
        status, reminder_minutes, location, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       client_id = VALUES(client_id),
       title = VALUES(title),
       appointment_date = VALUES(appointment_date),
       start_time = VALUES(start_time),
       duration_minutes = VALUES(duration_minutes),
       status = VALUES(status),
       reminder_minutes = VALUES(reminder_minutes),
       location = VALUES(location),
       notes = VALUES(notes),
       updated_at = VALUES(updated_at)`,
    [
      appointment.id,
      userId,
      appointment.clientId || null,
      appointment.title,
      appointment.date,
      appointment.start,
      appointment.duration,
      appointment.status,
      appointment.reminderMinutes,
      appointment.location || '',
      appointment.notes || '',
      formatSqlDateTime(appointment.createdAt),
      formatSqlDateTime(appointment.updatedAt)
    ]
  );
}

async function upsertReminderRow(connection, userId, appointment) {
  if (appointment.reminderMinutes === null || appointment.reminderMinutes === undefined) return;
  const remindAt = computeRemindAt(appointment.date, appointment.start, appointment.reminderMinutes);
  await connection.query(
    `INSERT INTO reminders
       (id, user_id, appointment_id, minutes_before, remind_at, status)
     VALUES (?, ?, ?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       minutes_before = VALUES(minutes_before),
       status = IF(reminders.remind_at <> VALUES(remind_at), 'pending', reminders.status),
       remind_at = VALUES(remind_at)`,
    [
      reminderIdFor(appointment.id),
      userId,
      appointment.id,
      appointment.reminderMinutes,
      remindAt
    ]
  );
}

async function upsertNotificationRow(connection, userId, alert) {
  await connection.query(
    `INSERT INTO notifications
       (id, user_id, appointment_id, title, body, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       appointment_id = VALUES(appointment_id),
       title = VALUES(title),
       body = VALUES(body),
       is_read = VALUES(is_read)`,
    [
      alert.id,
      userId,
      alert.appointmentId || null,
      alert.title,
      alert.body || '',
      alert.read ? 1 : 0,
      formatSqlDateTime(alert.createdAt)
    ]
  );
}

async function deleteMissing(connection, table, userId, ids) {
  if (!ids.length) {
    await connection.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  await connection.query(
    `DELETE FROM ${table} WHERE user_id = ? AND id NOT IN (${placeholders})`,
    [userId, ...ids]
  );
}

async function replaceState(userId, state) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      'UPDATE user_settings SET default_reminder = ?, default_duration = ?, notifications_enabled = ? WHERE user_id = ?',
      [
        state.settings.defaultReminder,
        state.settings.defaultDuration,
        state.settings.notifications ? 1 : 0,
        userId
      ]
    );

    for (const client of state.clients) {
      await upsertClientRow(connection, userId, client);
    }
    for (const appointment of state.appointments) {
      await upsertAppointmentRow(connection, userId, appointment);
    }

    const reminderIds = [];
    for (const appointment of state.appointments) {
      if (appointment.reminderMinutes !== null && appointment.reminderMinutes !== undefined) {
        await upsertReminderRow(connection, userId, appointment);
        reminderIds.push(reminderIdFor(appointment.id));
      }
    }

    const alertIds = [];
    for (const alert of state.alerts) {
      await upsertNotificationRow(connection, userId, alert);
      alertIds.push(alert.id);
    }

    await deleteMissing(connection, 'notifications', userId, alertIds);
    await deleteMissing(connection, 'reminders', userId, reminderIds);
    await deleteMissing(connection, 'appointments', userId, state.appointments.map((item) => item.id));
    await deleteMissing(connection, 'clients', userId, state.clients.map((item) => item.id));

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getClientById(userId, id) {
  const [rows] = await pool.query(
    'SELECT * FROM clients WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, id]
  );
  return rows[0] ? mapClient(rows[0]) : null;
}

async function saveClient(userId, client) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await upsertClientRow(connection, userId, client);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getClientById(userId, client.id);
}

async function deleteClient(userId, id) {
  const [result] = await pool.query(
    'DELETE FROM clients WHERE user_id = ? AND id = ?',
    [userId, id]
  );
  return result.affectedRows > 0;
}

async function getAppointmentById(userId, id) {
  const [rows] = await pool.query(
    'SELECT * FROM appointments WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, id]
  );
  return rows[0] ? mapAppointment(rows[0]) : null;
}

async function saveAppointment(userId, appointment) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await upsertAppointmentRow(connection, userId, appointment);
    if (appointment.reminderMinutes === null || appointment.reminderMinutes === undefined) {
      await connection.query(
        'DELETE FROM reminders WHERE user_id = ? AND appointment_id = ?',
        [userId, appointment.id]
      );
    } else {
      await upsertReminderRow(connection, userId, appointment);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getAppointmentById(userId, appointment.id);
}

async function deleteAppointment(userId, id) {
  const [result] = await pool.query(
    'DELETE FROM appointments WHERE user_id = ? AND id = ?',
    [userId, id]
  );
  return result.affectedRows > 0;
}

async function listReminders(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_at ASC',
    [userId]
  );
  return rows.map(mapReminder);
}

async function getReminderById(userId, id) {
  const [rows] = await pool.query(
    'SELECT * FROM reminders WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, id]
  );
  return rows[0] ? mapReminder(rows[0]) : null;
}

async function saveReminder(userId, appointment, reminder) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'UPDATE appointments SET reminder_minutes = ?, updated_at = NOW() WHERE user_id = ? AND id = ?',
      [reminder.minutesBefore, userId, appointment.id]
    );
    await connection.query(
      `INSERT INTO reminders
         (id, user_id, appointment_id, minutes_before, remind_at, status, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         minutes_before = VALUES(minutes_before),
         remind_at = VALUES(remind_at),
         status = VALUES(status),
         sent_at = VALUES(sent_at)`,
      [
        reminder.id,
        userId,
        appointment.id,
        reminder.minutesBefore,
        computeRemindAt(appointment.date, appointment.start, reminder.minutesBefore),
        reminder.status,
        reminder.status === 'sent' ? formatSqlDateTime(new Date()) : null
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getReminderById(userId, reminder.id);
}

async function deleteReminder(userId, id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT appointment_id FROM reminders WHERE user_id = ? AND id = ? LIMIT 1',
      [userId, id]
    );
    if (!rows.length) {
      await connection.rollback();
      return false;
    }
    await connection.query(
      'UPDATE appointments SET reminder_minutes = NULL, updated_at = NOW() WHERE user_id = ? AND id = ?',
      [userId, rows[0].appointment_id]
    );
    await connection.query('DELETE FROM reminders WHERE user_id = ? AND id = ?', [userId, id]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listNotifications(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
    [userId]
  );
  return rows.map(mapNotification);
}

async function markNotificationRead(userId, id, read) {
  const [result] = await pool.query(
    'UPDATE notifications SET is_read = ? WHERE user_id = ? AND id = ?',
    [read ? 1 : 0, userId, id]
  );
  return result.affectedRows > 0;
}

async function deleteNotification(userId, id) {
  const [result] = await pool.query(
    'DELETE FROM notifications WHERE user_id = ? AND id = ?',
    [userId, id]
  );
  return result.affectedRows > 0;
}

async function updateUser(userId, values) {
  await pool.query(
    'UPDATE users SET name = ?, email = ? WHERE id = ?',
    [values.name, values.email, userId]
  );
  return readUser(userId);
}

async function updateSettings(userId, settings) {
  await ensureDefaults();
  await pool.query(
    'UPDATE user_settings SET default_reminder = ?, default_duration = ?, notifications_enabled = ? WHERE user_id = ?',
    [
      settings.defaultReminder,
      settings.defaultDuration,
      settings.notifications ? 1 : 0,
      userId
    ]
  );
  const [rows] = await pool.query(
    'SELECT * FROM user_settings WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return mapSettings(rows[0]);
}

module.exports = {
  DEFAULT_USER,
  pool,
  checkConnection,
  ensureDefaults,
  readState,
  replaceState,
  getClientById,
  saveClient,
  deleteClient,
  getAppointmentById,
  saveAppointment,
  deleteAppointment,
  listReminders,
  getReminderById,
  saveReminder,
  deleteReminder,
  listNotifications,
  markNotificationRead,
  deleteNotification,
  updateUser,
  updateSettings,
  reminderIdFor,
  mapClient,
  mapAppointment,
  mapReminder,
  mapNotification,
  mapSettings
};
