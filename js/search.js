'use strict';

/* ============================================================
   Tempo — global search
   ============================================================ */

function sortSearchAppointments(list) {
  const now = Date.now();
  return list.slice().sort((a, b) => {
    const aUpcoming = apptEnd(a).getTime() >= now;
    const bUpcoming = apptEnd(b).getTime() >= now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? compareByStart(a, b) : compareByStart(b, a);
  });
}

function renderGlobalSearch(value) {
  const query = String(value || '').trim();
  const root = $('#globalSearchResults');
  if (!query) {
    closeSearchResults();
    return;
  }
  if (!root) return;

  const q = query.toLowerCase();
  const appointments = sortSearchAppointments(
    data.appointments.filter((a) => matchesSearch(a, query))
  ).slice(0, 5);

  const clients = data.clients
    .filter((client) => [client.name, client.company, client.email, client.phone]
      .filter(Boolean).join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 3);

  let html = '';

  if (appointments.length) {
    html += `<div class="search-group-label">Appointments</div>`;
    html += appointments.map((appt) => {
      const client = getClient(appt.clientId);
      const meta = STATUS_META[appt.status];
      return `
        <button class="search-result" type="button" data-action="search-appointment"
                data-id="${esc(appt.id)}" data-search-result>
          <span class="search-icon-box">${icon('calendar')}</span>
          <span class="search-result-main">
            <strong>${esc(appt.title)}</strong>
            <span>${esc(fmtDateShort(appt.date, true))} · ${esc(fmtTime(appt.start))}${client ? ` · ${esc(client.name)}` : ''}</span>
          </span>
          <span class="search-result-side">${meta.label}</span>
        </button>`;
    }).join('');
  }

  if (clients.length) {
    html += `<div class="search-group-label">Clients</div>`;
    html += clients.map((client) => `
      <button class="search-result" type="button" data-action="search-client"
              data-id="${esc(client.id)}" data-search-result>
        <span class="search-icon-box">${icon('users')}</span>
        <span class="search-result-main">
          <strong>${esc(client.name)}</strong>
          <span>${esc(client.company || client.email || 'Client')}</span>
        </span>
        <span class="search-result-side">Client</span>
      </button>`).join('');
  }

  if (!html) {
    html = `<div class="search-empty">No appointments or clients match “${esc(query)}”.</div>`;
  } else {
    html += `<div class="search-hint"><span>Arrow keys to navigate</span><span>Enter to open</span></div>`;
  }

  root.innerHTML = html;
  root.hidden = false;
  ui.searchActiveIndex = -1;
}

function closeSearchResults() {
  const root = $('#globalSearchResults');
  if (root) {
    root.hidden = true;
    root.innerHTML = '';
  }
  ui.searchActiveIndex = -1;
}

function moveSearchSelection(direction) {
  const items = $$('#globalSearchResults [data-search-result]');
  if (!items.length) return;
  if (ui.searchActiveIndex < 0) {
    ui.searchActiveIndex = direction > 0 ? 0 : items.length - 1;
  } else {
    ui.searchActiveIndex = (ui.searchActiveIndex + direction + items.length) % items.length;
  }
  items.forEach((item, index) => {
    item.classList.toggle('active', index === ui.searchActiveIndex);
  });
  items[ui.searchActiveIndex].scrollIntoView({ block: 'nearest' });
}

function activateSearchSelection() {
  const items = $$('#globalSearchResults [data-search-result]');
  const active = ui.searchActiveIndex >= 0 ? items[ui.searchActiveIndex] : null;
  if (active) {
    active.click();
  } else {
    submitGlobalSearch();
  }
}

function submitGlobalSearch() {
  const input = $('#globalSearch');
  const query = input ? input.value.trim() : '';
  if (!query) return;
  ui.filters = { search: query, status: 'all', range: 'upcoming', client: 'all' };
  if (input) {
    input.value = '';
    input.blur();
  }
  closeSearchResults();
  navigate('appointments');
}
