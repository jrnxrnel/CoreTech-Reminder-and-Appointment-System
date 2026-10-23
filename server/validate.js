'use strict';

const crypto = require('crypto');

const STATUS_VALUES = ['scheduled', 'confirmed', 'completed', 'cancelled'];
const REMINDER_STATUS_VALUES = ['pending', 'sent', 'snoozed', 'dismissed'];
const MAX_CLIENTS = 5000;
const MAX_APPOINTMENTS = 20000;
const MAX_ALERTS = 100;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

function makeId(prefix, maxLength = 40) {
  const value = `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  return value.slice(0, maxLength);
}

function normalizeId(value, prefix, maxLength = 40) {
  if (value === undefined || value === null || value === '') return makeId(prefix, maxLength);
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ValidationError('Invalid identifier.');
  }
  const id = String(value).trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || id.length > maxLength) {
    throw new ValidationError('Invalid identifier.');
  }
  return id;
}

function requireId(value, maxLength = 64) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ValidationError('Invalid identifier.');
  }
  const id = String(value).trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || id.length > maxLength) {
    throw new ValidationError('Invalid identifier.');
  }
  return id;
}

function normalizeText(value, maxLength, { required = false, multiline = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError('A required text field is missing.');
    return '';
  }
  if (typeof value === 'object') {
    throw new ValidationError('Text fields must be plain text.');
  }
  let text = String(value).replace(/\u0000/g, '');
  text = multiline ? text.trim() : text.replace(/\s+/g, ' ').trim();
  if (required && !text) throw new ValidationError('A required text field is missing.');
  return text.slice(0, maxLength);
}

function normalizeEmail(value, { required = false } = {}) {
  const email = normalizeText(value, 160, { required });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('Enter a valid email address.');
  }
  return email;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function normalizeInteger(value, { min, max, fallback = null, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError('A required number is missing.');
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    throw new ValidationError('A number must be a whole number.');
  }
  if (number < min || number > max) {
    throw new ValidationError(`Number must be between ${min} and ${max}.`);
  }
  return number;
}

function normalizeTimestamp(value) {
  const date = value === undefined || value === null || value === '' ? new Date() : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeClient(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Each client must be an object.');
  }
  return {
    id: normalizeId(raw.id, 'cli', 40),
    name: normalizeText(raw.name, 120, { required: true }),
    company: normalizeText(raw.company, 120),
    email: normalizeEmail(raw.email),
    phone: normalizeText(raw.phone, 60),
    notes: normalizeText(raw.notes, 2000, { multiline: true }),
    createdAt: normalizeTimestamp(raw.createdAt)
  };
}

function normalizeAppointment(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Each appointment must be an object.');
  }

  const date = normalizeText(raw.date, 10, { required: true });
  if (!isValidDate(date)) throw new ValidationError('Appointment date is not valid.');

  const start = normalizeText(raw.start, 5, { required: true });
  if (!isValidTime(start)) throw new ValidationError('Appointment start time is not valid.');

  const status = raw.status === undefined || raw.status === null || raw.status === ''
    ? 'scheduled'
    : String(raw.status);
  if (!STATUS_VALUES.includes(status)) throw new ValidationError('Appointment status is not valid.');

  return {
    id: normalizeId(raw.id, 'apt', 40),
    title: normalizeText(raw.title, 160, { required: true }),
    clientId: raw.clientId === undefined || raw.clientId === null || raw.clientId === ''
      ? null
      : normalizeId(raw.clientId, 'cli', 40),
    date,
    start,
    duration: normalizeInteger(raw.duration, { min: 5, max: 720, fallback: 60 }),
    status,
    reminderMinutes: normalizeInteger(raw.reminderMinutes, { min: 0, max: 10080, fallback: null }),
    location: normalizeText(raw.location, 240),
    notes: normalizeText(raw.notes, 5000, { multiline: true }),
    createdAt: normalizeTimestamp(raw.createdAt),
    updatedAt: normalizeTimestamp(raw.updatedAt)
  };
}

function normalizeSettings(raw, base = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const reminderInput = source.defaultReminder !== undefined
    ? source.defaultReminder
    : base.defaultReminder;
  const durationInput = source.defaultDuration !== undefined
    ? source.defaultDuration
    : base.defaultDuration;
  const notificationsInput = source.notifications !== undefined
    ? source.notifications
    : base.notifications;

  return {
    defaultReminder: reminderInput === null || reminderInput === ''
      ? null
      : normalizeInteger(reminderInput, { min: 0, max: 10080, fallback: 30 }),
    defaultDuration: normalizeInteger(durationInput, { min: 5, max: 720, fallback: 45 }),
    notifications: notificationsInput === undefined || notificationsInput === null
      ? true
      : Boolean(notificationsInput)
  };
}

function normalizeAlert(raw, validAppointmentIds = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Each notification must be an object.');
  }
  let appointmentId = raw.appointmentId === undefined || raw.appointmentId === null || raw.appointmentId === ''
    ? null
    : normalizeId(raw.appointmentId, 'apt', 40);
  if (appointmentId && validAppointmentIds && !validAppointmentIds.has(appointmentId)) {
    appointmentId = null;
  }
  return {
    id: normalizeId(raw.id, 'alt', 64),
    appointmentId,
    title: normalizeText(raw.title, 180, { required: true }),
    body: normalizeText(raw.body, 500, { multiline: true }),
    createdAt: normalizeInteger(raw.createdAt, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      fallback: Date.now()
    }),
    read: Boolean(raw.read)
  };
}

function ensureUnique(ids, label) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) throw new ValidationError(`Duplicate ${label} identifier.`);
    seen.add(id);
  }
}

function normalizeStatePayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Workspace data must be an object.');
  }

  const rawClients = raw.clients === undefined ? [] : raw.clients;
  const rawAppointments = raw.appointments === undefined ? [] : raw.appointments;
  const rawAlerts = raw.alerts === undefined ? [] : raw.alerts;

  if (!Array.isArray(rawClients) || !Array.isArray(rawAppointments) || !Array.isArray(rawAlerts)) {
    throw new ValidationError('Clients, appointments, and alerts must be arrays.');
  }
  if (rawClients.length > MAX_CLIENTS) throw new ValidationError('Too many clients in one request.');
  if (rawAppointments.length > MAX_APPOINTMENTS) throw new ValidationError('Too many appointments in one request.');
  if (rawAlerts.length > MAX_ALERTS) throw new ValidationError('Too many notifications in one request.');

  const clients = rawClients.map(normalizeClient);
  const appointments = rawAppointments.map(normalizeAppointment);
  ensureUnique(clients.map((client) => client.id), 'client');
  ensureUnique(appointments.map((appointment) => appointment.id), 'appointment');

  const clientIds = new Set(clients.map((client) => client.id));
  appointments.forEach((appointment) => {
    if (appointment.clientId && !clientIds.has(appointment.clientId)) {
      appointment.clientId = null;
    }
  });

  const appointmentIds = new Set(appointments.map((appointment) => appointment.id));
  const alerts = rawAlerts.map((alert) => normalizeAlert(alert, appointmentIds));
  ensureUnique(alerts.map((alert) => alert.id), 'notification');

  return {
    clients,
    appointments,
    alerts,
    settings: normalizeSettings(raw.settings)
  };
}

function normalizeReminderStatus(value) {
  if (value === undefined || value === null || value === '') return 'pending';
  const status = String(value);
  if (!REMINDER_STATUS_VALUES.includes(status)) {
    throw new ValidationError('Reminder status is not valid.');
  }
  return status;
}

module.exports = {
  STATUS_VALUES,
  REMINDER_STATUS_VALUES,
  ValidationError,
  makeId,
  normalizeId,
  requireId,
  normalizeText,
  normalizeEmail,
  isValidDate,
  isValidTime,
  normalizeInteger,
  normalizeTimestamp,
  normalizeClient,
  normalizeAppointment,
  normalizeSettings,
  normalizeAlert,
  normalizeStatePayload,
  normalizeReminderStatus
};
