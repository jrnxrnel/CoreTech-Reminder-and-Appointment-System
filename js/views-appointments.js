'use strict';

/* ============================================================
   Tempo — appointments list
   ============================================================ */

function renderAppointments() {
  const filters = ui.filters;
  const filtered = filteredAppointments(filters);
  const counts = filterStatusCounts(filters);
  const active = hasActiveFilters();
  const sortedClients = data.clients.slice().sort((a, b) => a.name.localeCompare(b.name));

  const rangeOptions = RANGE_OPTIONS.map((option) =>
    `<option value="${option.value}" ${filters.range === option.value ? 'selected' : ''}>${option.label}</option>`
  ).join('');

  const clientOptions = [
    `<option value="all" ${filters.client === 'all' ? 'selected' : ''}>All clients</option>`,
    ...sortedClients.map((client) =>
      `<option value="${esc(client.id)}" ${filters.client === client.id ? 'selected' : ''}>${esc(client.name)}</option>`
    )
  ].join('');

  const statusChips = [
    `<button class="chip-btn ${(!filters.status || filters.status === 'all') ? 'active' : ''}" data-action="filter-status" data-status="all" type="button">
      All <span class="count">${counts.all}</span>
    </button>`,
    ...STATUS_ORDER.map((status) => `
      <button class="chip-btn ${filters.status === status ? 'active' : ''}" data-action="filter-status" data-status="${status}" type="button">
        <span class="status-dot ${STATUS_META[status].dot}"></span>${STATUS_META[status].label}
        <span class="count">${counts[status] || 0}</span>
      </button>`)
  ].join('');

  const groups = new Map();
  filtered.forEach((appt) => {
    if (!groups.has(appt.date)) groups.set(appt.date, []);
    groups.get(appt.date).push(appt);
  });

  let content;
  if (!data.appointments.length) {
    content = `
      <section class="card empty-card">
        <div class="empty-state">
          <div class="empty-icon">${icon('calendar-plus')}</div>
          <h3>No appointments yet</h3>
          <p>Create your first appointment and Tempo will keep track of the details.</p>
          <button class="btn btn-primary btn-sm" data-action="new-on" data-date="${todayISO()}">${icon('plus')}New appointment</button>
        </div>
      </section>`;
  } else if (!filtered.length) {
    content = `
      <section class="card empty-card">
        <div class="empty-state">
          <div class="empty-icon">${icon('search')}</div>
          <h3>No appointments match</h3>
          <p>Try a different search or date range. Your other appointments are still safe.</p>
          <button class="btn btn-secondary btn-sm" data-action="clear-filters">${icon('x')}Clear filters</button>
        </div>
      </section>`;
  } else {
    const groupsHTML = Array.from(groups.entries()).map(([iso, list]) => {
      const labels = groupDateLabels(iso);
      const isToday = iso === todayISO();
      return `
        <section class="appt-group">
          <div class="group-head ${isToday ? 'today' : ''}">
            <div class="group-head-left">
              <strong>${esc(labels.relative)}</strong>
              <span>${esc(labels.detail)}</span>
            </div>
            <span class="group-count">${plural(list.length, 'appointment')}</span>
          </div>
          ${list.map(appointmentRowHTML).join('')}
        </section>`;
    }).join('');
    content = `<div class="appt-groups">${groupsHTML}</div>`;
  }

  const queryText = filters.search.trim();
  const summaryParts = [];
  summaryParts.push(`<strong>${plural(filtered.length, 'appointment')}</strong>`);
  if (queryText) summaryParts.push(`matching “${esc(queryText)}”`);
  if (filters.status !== 'all') summaryParts.push(`· ${STATUS_META[filters.status]?.label || ''}`);
  if (filters.client !== 'all') {
    const client = getClient(filters.client);
    if (client) summaryParts.push(`· ${esc(client.name)}`);
  }
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === filters.range)?.label;
  if (rangeLabel && filters.range !== 'upcoming') summaryParts.push(`· ${rangeLabel}`);

  return `
    <div class="filter-bar">
      <div class="search-field">
        ${icon('search')}
        <input type="search" id="apptSearch" value="${esc(filters.search)}"
               placeholder="Search title, client, notes…" autocomplete="off" aria-label="Search appointments">
      </div>
      <select class="filter-select" id="filterRange" aria-label="Filter by date">
        ${rangeOptions}
      </select>
      <select class="filter-select" id="filterClient" aria-label="Filter by client">
        ${clientOptions}
      </select>
      <div class="filter-spacer"></div>
      <button class="btn btn-secondary btn-sm" data-action="new-on" data-date="${todayISO()}" type="button">
        ${icon('plus')}New appointment
      </button>
    </div>
    <div class="status-chips" aria-label="Filter by status">${statusChips}</div>

    <div class="result-summary">
      <span>${summaryParts.join(' ')}${filters.range === 'past' ? ' · newest first' : ''}</span>
      ${active ? `<button class="text-btn clear-filters" data-action="clear-filters" type="button">${icon('x')}Clear filters</button>` : ''}
    </div>

    ${content}`;
}

function appointmentRowHTML(appt) {
  const client = getClient(appt.clientId);
  const meta = STATUS_META[appt.status];
  const labels = groupDateLabels(appt.date);
  return `
    <div class="appt-row" data-appt-id="${esc(appt.id)}" role="button" tabindex="0"
         aria-label="Edit ${esc(appt.title)}, ${esc(labels.detail)} at ${esc(fmtTime(appt.start))}">
      <div class="appt-time-block">
        ${esc(fmtTime(appt.start))}
        <span>${fmtDuration(appt.duration)}</span>
      </div>
      <div class="appt-colorbar ${meta.pill}"></div>
      <div class="appt-main">
        <div class="appt-title">
          <span class="appt-title-text">${esc(appt.title)}</span>
          ${appt.notes ? `<span class="appt-clip" title="Has notes">${icon('list')}</span>` : ''}
        </div>
        <div class="appt-meta">
          ${client
            ? `<span class="appt-client">${avatarHTML(client, 'sm')}${esc(client.name)}</span>`
            : '<span class="appt-client" style="color:var(--muted-2)">No client</span>'}
          ${appt.location ? `<span>${icon('pin')}${esc(appt.location)}</span>` : ''}
          ${appt.reminderMinutes != null ? `<span>${icon('bell')}${esc(reminderLabel(appt.reminderMinutes))}</span>` : ''}
        </div>
      </div>
      <div class="appt-side">
        ${statusPill(appt.status)}
        <div class="appt-actions">
          <button class="row-icon-btn" type="button" data-action="edit-appointment" data-id="${esc(appt.id)}" aria-label="Edit appointment">${icon('pencil')}</button>
          <button class="row-icon-btn danger" type="button" data-action="delete-appointment" data-id="${esc(appt.id)}" aria-label="Delete appointment">${icon('trash')}</button>
        </div>
      </div>
    </div>`;
}
