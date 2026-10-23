'use strict';

/* ============================================================
   Tempo — calendar (month + week)
   ============================================================ */

function renderCalendar() {
  const label = ui.calendarMode === 'week'
    ? fmtWeekRange(startOfWeekDate(ui.calendarCursor))
    : fmtMonthYear(ui.calendarCursor);

  return `
    <div class="calendar-page">
      <section class="card calendar-card">
        ${calendarToolbarHTML(label)}
        ${ui.calendarMode === 'week' ? renderWeekView() : renderMonthView()}
        ${calendarFooterHTML()}
      </section>
    </div>`;
}

function calendarToolbarHTML(label) {
  return `
    <div class="cal-toolbar">
      <div class="cal-toolbar-left">
        <div class="cal-nav">
          <button class="icon-btn" data-action="calendar-prev" aria-label="Previous ${ui.calendarMode}" type="button">
            ${icon('chevron-left')}
          </button>
          <button class="icon-btn" data-action="calendar-next" aria-label="Next ${ui.calendarMode}" type="button">
            ${icon('chevron-right')}
          </button>
        </div>
        <span class="cal-title">${esc(label)}</span>
        <button class="btn btn-secondary btn-sm" data-action="calendar-today" type="button">Today</button>
      </div>
      <div class="cal-toolbar-right">
        <div class="segmented" role="group" aria-label="Calendar view">
          <button type="button" data-action="calendar-mode" data-mode="month" class="${ui.calendarMode === 'month' ? 'active' : ''}" aria-pressed="${ui.calendarMode === 'month'}">Month</button>
          <button type="button" data-action="calendar-mode" data-mode="week" class="${ui.calendarMode === 'week' ? 'active' : ''}" aria-pressed="${ui.calendarMode === 'week'}">Week</button>
        </div>
        <button class="btn btn-primary btn-sm" data-action="new-on" data-date="${todayISO()}" type="button">
          ${icon('plus')}New
        </button>
      </div>
    </div>`;
}

function eventsPerDay() {
  if (window.innerWidth <= 560) return 1;
  if (window.innerWidth <= 760) return 2;
  return 3;
}

function renderMonthView() {
  const cursor = ui.calendarCursor;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = startOfWeekDate(first);
  const offset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.max(4, Math.ceil((offset + daysInMonth) / 7));
  const cellCount = weeks * 7;
  const today = todayISO();
  const limit = eventsPerDay();

  const byDate = new Map();
  data.appointments.forEach((appt) => {
    if (!byDate.has(appt.date)) byDate.set(appt.date, []);
    byDate.get(appt.date).push(appt);
  });
  byDate.forEach((list) => list.sort(compareByStart));

  let cellsHTML = '';
  for (let i = 0; i < cellCount; i++) {
    const date = addDaysDate(gridStart, i);
    const iso = toISO(date);
    const dayAppts = byDate.get(iso) || [];
    const visible = dayAppts.slice(0, limit);
    const hidden = dayAppts.length - visible.length;
    const isOutside = date.getMonth() !== month || date.getFullYear() !== year;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const dayLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    const chips = visible.map((appt) => {
      const meta = STATUS_META[appt.status];
      return `
        <button class="event-chip ${meta.pill}" data-appt-id="${esc(appt.id)}" type="button"
                title="${esc(fmtTimeRange(appt))} · ${esc(appt.title)}">
          <span class="ev-dot"></span>
          <span class="ev-time">${esc(fmtTimeNumeric(appt.start))}</span>
          <span class="ev-title">${esc(appt.title)}</span>
        </button>`;
    }).join('');

    cellsHTML += `
      <div class="cal-cell ${isOutside ? 'outside' : ''} ${isWeekend ? 'weekend' : ''} ${iso === today ? 'today' : ''}"
           data-date-cell="${iso}" role="button" tabindex="0"
           aria-label="${esc(dayLabel)}, ${plural(dayAppts.length, 'appointment')}. Click to add.">
        <div class="cal-cell-head">
          <span>
            ${date.getDate() === 1 ? `<span class="cal-month-tag">${MONTH_SHORT[date.getMonth()]}</span>` : ''}
            <span class="cal-daynum">${date.getDate()}</span>
          </span>
          <button class="cal-add" type="button" data-action="new-on" data-date="${iso}" aria-label="Add appointment on ${esc(dayLabel)}">
            ${icon('plus')}
          </button>
        </div>
        <div class="cal-events">
          ${chips}
          ${hidden > 0 ? `<button class="ev-more" type="button" data-action="day-details" data-date="${iso}">+${hidden} more</button>` : ''}
        </div>
      </div>`;
  }

  return `
    <div class="month-weekdays">
      ${DAY_SHORT.map((d) => `<span>${d}</span>`).join('')}
    </div>
    <div class="month-grid">${cellsHTML}</div>`;
}

function renderWeekView() {
  const weekStart = startOfWeekDate(ui.calendarCursor);
  const days = Array.from({ length: 7 }, (_, i) => addDaysDate(weekStart, i));
  const startISO = toISO(days[0]);
  const endISO = toISO(days[6]);
  const today = todayISO();
  const now = new Date();

  const weekAppts = data.appointments
    .filter((a) => a.date >= startISO && a.date <= endISO)
    .sort(compareByStart);

  let earliest = 7 * 60;
  let latest = 21 * 60;
  weekAppts.forEach((appt) => {
    const start = timeToMinutes(appt.start);
    const end = Math.min(1440, start + Math.max(5, Number(appt.duration) || 60));
    earliest = Math.min(earliest, start);
    latest = Math.max(latest, end);
  });
  const startHour = clamp(Math.floor(earliest / 60), 0, 23);
  const endHour = clamp(Math.ceil(latest / 60), startHour + 1, 24);
  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

  const byDate = new Map();
  days.forEach((d) => byDate.set(toISO(d), []));
  weekAppts.forEach((appt) => {
    if (byDate.has(appt.date)) byDate.get(appt.date).push(appt);
  });

  const heads = days.map((date) => {
    const iso = toISO(date);
    const isToday = iso === today;
    const dayLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    return `
      <button class="week-day-head ${isToday ? 'today' : ''}" type="button"
              data-action="new-on" data-date="${iso}" aria-label="Add appointment on ${esc(dayLabel)}">
        <span class="week-day-name">${DAY_SHORT[date.getDay()]}</span>
        <span class="week-day-num">${date.getDate()}</span>
      </button>`;
  }).join('');

  const timeLabels = [];
  for (let h = startHour; h < endHour; h++) {
    const label = h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
    const isFirst = h === startHour;
    timeLabels.push(`<span class="week-time-label ${isFirst ? 'first' : ''}" style="top:${(h - startHour) * HOUR_HEIGHT + (isFirst ? 3 : 0)}px">${label}</span>`);
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = days.some((d) => toISO(d) === today) && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  const columns = days.map((date) => {
    const iso = toISO(date);
    const isToday = iso === today;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const dayEvents = layoutWeekEvents(byDate.get(iso) || [], startHour, endHour);
    const nowLine = isToday && showNow
      ? `<div class="week-now-line" style="top:${((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT}px"></div>`
      : '';

    const events = dayEvents.map((entry) => {
      const appt = entry.appt;
      const client = getClient(appt.clientId);
      const meta = STATUS_META[appt.status];
      const compact = entry.height < 44;
      return `
        <button class="week-event ${meta.pill} ${compact ? 'compact' : ''}" type="button"
                data-appt-id="${esc(appt.id)}"
                style="top:${entry.top}px;height:${entry.height}px;left:calc(${entry.left}% + 2px);width:calc(${entry.width}% - 4px)"
                title="${esc(appt.title)} · ${esc(fmtTimeRange(appt))}">
          <span class="we-time">${esc(fmtTimeNumeric(appt.start))}${entry.height >= 30 ? ` – ${esc(fmtTimeNumeric(apptEndTimeStr(appt)))}` : ''}</span>
          <span class="we-title">${esc(appt.title)}</span>
          ${client ? `<span class="we-client">${esc(client.name)}</span>` : ''}
        </button>`;
    }).join('');

    return `
      <div class="week-col ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}"
           data-week-col="${iso}" style="height:${totalHeight}px"
           aria-label="Add appointment on ${esc(date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}">
        ${nowLine}
        ${events}
      </div>`;
  }).join('');

  return `
    <div class="week-view">
      <div class="week-scroll" id="weekScroll" data-start-hour="${startHour}">
        <div class="week-inner">
          <div class="week-head">
            <div class="week-head-gutter"></div>
            ${heads}
          </div>
          <div class="week-body" id="weekBody" data-start-hour="${startHour}" style="height:${totalHeight}px">
            <div class="week-times" style="height:${totalHeight}px">${timeLabels.join('')}</div>
            <div class="week-cols">${columns}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function layoutWeekEvents(appts, startHour, endHour) {
  const viewStart = startHour * 60;
  const viewEnd = endHour * 60;

  const items = appts.map((appt) => {
    const start = timeToMinutes(appt.start);
    const end = Math.min(1440, start + Math.max(5, Number(appt.duration) || 60));
    return { appt, start, end };
  }).filter((item) => item.end > viewStart && item.start < viewEnd)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const clusters = [];
  let current = [];
  let clusterEnd = -1;
  items.forEach((item) => {
    if (current.length && item.start >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = -1;
    }
    current.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  });
  if (current.length) clusters.push(current);

  const result = [];
  clusters.forEach((cluster) => {
    const columns = [];
    cluster.forEach((item) => {
      let column = columns.findIndex((end) => end <= item.start);
      if (column === -1) {
        column = columns.length;
        columns.push(item.end);
      } else {
        columns[column] = item.end;
      }
      item.column = column;
    });
    const columnCount = Math.max(1, columns.length);
    cluster.forEach((item) => {
      const topStart = Math.max(item.start, viewStart);
      const topEnd = Math.min(item.end, viewEnd);
      result.push({
        appt: item.appt,
        top: Math.round(((topStart - viewStart) / 60) * HOUR_HEIGHT),
        height: Math.max(18, Math.round(((topEnd - topStart) / 60) * HOUR_HEIGHT) - 2),
        left: (item.column / columnCount) * 100,
        width: 100 / columnCount
      });
    });
  });

  return result;
}

function calendarFooterHTML() {
  const cursor = ui.calendarCursor;
  let count = 0;
  let periodLabel = '';
  if (ui.calendarMode === 'week') {
    const start = toISO(startOfWeekDate(cursor));
    const end = addISO(start, 6);
    count = data.appointments.filter((a) => a.date >= start && a.date <= end).length;
    periodLabel = 'this week';
  } else {
    count = data.appointments.filter((a) => {
      const d = parseISODate(a.date);
      return d && d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear();
    }).length;
    periodLabel = cursor.toLocaleDateString(undefined, { month: 'long' });
  }

  const hint = ui.calendarMode === 'week'
    ? (window.innerWidth <= 760 ? 'Swipe for the full week' : 'Click a time slot to book')
    : (window.innerWidth <= 760 ? 'Tap a day to book' : 'Click a day to book');

  return `
    <div class="cal-foot">
      <div class="cal-legend">
        ${STATUS_ORDER.map((status) => `
          <span><span class="status-dot ${STATUS_META[status].dot}"></span>${STATUS_META[status].label}</span>
        `).join('')}
      </div>
      <span><strong>${plural(count, 'appointment')}</strong> in ${esc(periodLabel)} · ${hint}</span>
    </div>`;
}

function addISO(iso, days) {
  const d = parseISODate(iso);
  return d ? toISO(addDaysDate(d, days)) : iso;
}
