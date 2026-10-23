'use strict';

/* ============================================================
   Tempo — utilities, constants and formatting
   ============================================================ */

const STATUS_META = {
  scheduled: { label: 'Scheduled', pill: 's-scheduled', dot: 'sd-scheduled' },
  confirmed: { label: 'Confirmed', pill: 's-confirmed', dot: 'sd-confirmed' },
  completed: { label: 'Completed', pill: 's-completed', dot: 'sd-completed' },
  cancelled: { label: 'Cancelled', pill: 's-cancelled', dot: 'sd-cancelled' }
};
const STATUS_ORDER = ['scheduled', 'confirmed', 'completed', 'cancelled'];

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: 0, label: 'At start time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' }
];

const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 120, 180, 240];
const HOUR_HEIGHT = 56;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CLIENT_COLORS = 6;

const RANGE_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All dates' }
];

/* ---------------- Tiny DOM helpers ---------------- */

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function icon(name, extraClass = '') {
  return `<svg class="icon ${extraClass}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

/* ---------------- Basic helpers ---------------- */

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : (pluralForm || singular + 's')}`;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/* ---------------- Dates ---------------- */

function toISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseISODate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayISO() {
  return toISO(new Date());
}

function addDaysDate(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addDaysISO(iso, days) {
  const d = parseISODate(iso);
  return d ? toISO(addDaysDate(d, days)) : iso;
}

function addMonthsDate(date, months) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + months);
  const daysInTarget = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(day, daysInTarget));
  return copy;
}

function startOfWeekDate(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function isValidDateStr(value) {
  const d = parseISODate(value);
  return !!d && toISO(d) === value;
}

function isValidTimeStr(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function timeToMinutes(time) {
  if (!isValidTimeStr(time)) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function apptStart(appt) {
  const d = parseISODate(appt?.date) || new Date();
  const mins = timeToMinutes(appt?.start || '09:00');
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(mins / 60), mins % 60, 0, 0);
}

function apptEnd(appt) {
  return new Date(apptStart(appt).getTime() + Math.max(5, Number(appt?.duration) || 60) * 60000);
}

function apptEndTimeStr(appt) {
  const d = apptEnd(appt);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtTime(time) {
  if (!isValidTimeStr(time)) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad2(m)} ${suffix}`;
}

function fmtTimeNumeric(time) {
  if (!isValidTimeStr(time)) return '';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${pad2(m)}`;
}

function fmtTimeRange(appt) {
  return `${fmtTime(appt.start)} – ${fmtTime(apptEndTimeStr(appt))}`;
}

function fmtDuration(minutes) {
  const m = Number(minutes) || 0;
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return `${hours} hr${rest ? ` ${rest} min` : ''}`;
}

function fmtDate(iso, options = { weekday: 'long', month: 'long', day: 'numeric' }, yearMode = 'auto') {
  const d = parseISODate(iso);
  if (!d) return '';
  const opts = { ...options };
  if (yearMode === true || (yearMode === 'auto' && d.getFullYear() !== new Date().getFullYear())) {
    opts.year = 'numeric';
  }
  return d.toLocaleDateString(undefined, opts);
}

function fmtDateShort(iso, includeWeekday = false) {
  const options = { month: 'short', day: 'numeric' };
  if (includeWeekday) options.weekday = 'short';
  return fmtDate(iso, options);
}

function fmtMonthYear(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function fmtWeekRange(weekStart) {
  const end = addDaysDate(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth() && weekStart.getFullYear() === end.getFullYear();
  const sameYear = weekStart.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${weekStart.toLocaleDateString(undefined, { month: 'long' })} ${weekStart.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  if (sameYear) {
    return `${MONTH_SHORT[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${MONTH_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}, ${weekStart.getFullYear()} – ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

function groupDateLabels(iso) {
  const today = todayISO();
  let relative;
  if (iso === today) relative = 'Today';
  else if (iso === addDaysISO(today, 1)) relative = 'Tomorrow';
  else if (iso === addDaysISO(today, -1)) relative = 'Yesterday';
  else relative = fmtDate(iso, { weekday: 'long' });
  const detail = fmtDate(iso, { month: 'long', day: 'numeric' });
  return { relative, detail };
}

function relativeLabel(targetMs) {
  const diff = targetMs - Date.now();
  const abs = Math.abs(diff);
  if (abs < 45000) return diff >= 0 ? 'in a moment' : 'just now';
  const mins = Math.floor(abs / 60000);
  if (mins < 60) return diff > 0 ? `in ${mins} min` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  const restMins = mins % 60;
  if (hours < 24) {
    const tail = restMins ? ` ${restMins}m` : '';
    return diff > 0 ? `in ${hours}h${tail}` : `${hours}h${tail} ago`;
  }
  const days = Math.floor(hours / 24);
  return diff > 0 ? `in ${plural(days, 'day')}` : `${plural(days, 'day')} ago`;
}

function countdownLabel(targetMs) {
  const diff = targetMs - Date.now();
  if (diff <= 60000) return 'Now';
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return `${hours}h${rem ? ` ${rem}m` : ''}`;
  return plural(Math.round(hours / 24), 'day');
}

function reminderLabel(minutes) {
  if (minutes == null || minutes === '') return 'No reminder';
  const m = Number(minutes);
  if (m === 0) return 'At start time';
  if (m < 60) return `${m} min before`;
  if (m === 60) return '1 hour before';
  if (m < 1440) return `${Math.round((m / 60) * 10) / 10} hours before`;
  if (m === 1440) return '1 day before';
  return `${Math.round((m / 1440) * 10) / 10} days before`;
}

function reminderLeadShort(minutes) {
  const m = Number(minutes);
  if (m === 0) return 'at start';
  if (m < 60) return `${m} min`;
  if (m === 60) return '1 hr';
  if (m < 1440) return `${m / 60} hr`;
  return `${m / 1440} day`;
}

/* ---------------- People ---------------- */

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(client) {
  const seed = String(client?.id || client?.name || 'client');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return `c${Math.abs(hash) % CLIENT_COLORS}`;
}

function avatarHTML(client, size = '') {
  if (!client) {
    return `<span class="avatar ${size}">?</span>`;
  }
  return `<span class="avatar ${avatarColor(client)} ${size}" aria-hidden="true">${esc(initials(client.name))}</span>`;
}

/* ---------------- Toasts & downloads ---------------- */

function toast(title, type = 'success', message = '') {
  const root = $('#toastRoot');
  if (!root) return;

  while (root.children.length >= 4) root.firstElementChild.remove();

  const icons = { success: 'check', error: 'alert', info: 'bell', warn: 'alert' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <div class="toast-icon">${icon(icons[type] || 'bell')}</div>
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${message ? `<div class="toast-msg">${esc(message)}</div>` : ''}
    </div>
    <button class="toast-close" data-action="dismiss-toast" aria-label="Dismiss">${icon('x')}</button>`;
  root.appendChild(el);

  const timer = setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  }, 4600);

  el.addEventListener('click', (event) => {
    if (event.target.closest('.toast-close')) {
      clearTimeout(timer);
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    }
  });
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function statusPill(status) {
  const meta = STATUS_META[status] || STATUS_META.scheduled;
  return `<span class="status-pill ${meta.pill}">${meta.label}</span>`;
}

function emptyStateHTML({ iconName = 'calendar', title, text, actionLabel = '', action = '', actionAttrs = '' }) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName)}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${actionLabel ? `<button class="btn btn-primary btn-sm" data-action="${action}" ${actionAttrs}>${icon('plus')}${esc(actionLabel)}</button>` : ''}
    </div>`;
}
