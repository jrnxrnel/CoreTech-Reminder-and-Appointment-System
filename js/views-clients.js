'use strict';

/* ============================================================
   Tempo — clients
   ============================================================ */

function renderClients() {
  const query = ui.clientSearch.trim().toLowerCase();
  const clients = data.clients
    .filter((client) => {
      if (!query) return true;
      return [client.name, client.company, client.email, client.phone, client.notes]
        .filter(Boolean).join(' ').toLowerCase().includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  let content;
  if (!data.clients.length) {
    content = `
      <section class="card">
        <div class="empty-state">
          <div class="empty-icon">${icon('users')}</div>
          <h3>No clients yet</h3>
          <p>Add the people you meet with to keep appointments, contact details, and history together.</p>
          <button class="btn btn-primary btn-sm" data-action="add-client">${icon('plus')}Add your first client</button>
        </div>
      </section>`;
  } else if (!clients.length) {
    content = `
      <section class="card">
        <div class="empty-state">
          <div class="empty-icon">${icon('search')}</div>
          <h3>No clients found</h3>
          <p>No client matches “${esc(ui.clientSearch.trim())}”. Try another name, company, or email.</p>
          <button class="btn btn-secondary btn-sm" data-action="clear-client-search">${icon('x')}Clear search</button>
        </div>
      </section>`;
  } else {
    content = `<div class="client-grid">${clients.map(clientCardHTML).join('')}</div>`;
  }

  return `
    <div class="clients-toolbar">
      <div class="search-field">
        ${icon('search')}
        <input type="search" id="clientSearch" value="${esc(ui.clientSearch)}"
               placeholder="Search clients…" autocomplete="off" aria-label="Search clients">
      </div>
      <div class="filter-spacer"></div>
      <span class="toolbar-note">${plural(clients.length, 'client')}</span>
      <button class="btn btn-primary btn-sm" data-action="add-client" type="button">${icon('plus')}Add client</button>
    </div>
    ${content}`;
}

function clientCardHTML(client) {
  const upcoming = upcomingCountForClient(client.id);
  const total = clientAppointments(client.id).length;
  const next = nextForClient(client.id);
  const nextLabel = next
    ? `Next ${fmtDateShort(next.date, true)}`
    : 'No upcoming';

  return `
    <div class="client-card" data-client-card="${esc(client.id)}" role="button" tabindex="0"
         aria-label="View appointments for ${esc(client.name)}">
      <div class="client-top">
        ${avatarHTML(client, 'lg')}
        <div class="client-identity">
          <div class="client-name">${esc(client.name)}</div>
          <div class="client-company">${esc(client.company || 'No company')}</div>
        </div>
        <div class="client-actions">
          <button class="row-icon-btn" type="button" data-action="edit-client" data-id="${esc(client.id)}" aria-label="Edit ${esc(client.name)}">${icon('pencil')}</button>
          <button class="row-icon-btn danger" type="button" data-action="delete-client" data-id="${esc(client.id)}" aria-label="Delete ${esc(client.name)}">${icon('trash')}</button>
        </div>
      </div>
      <div class="client-contact">
        <span>${icon('mail')}${client.email ? esc(client.email) : '<span class="muted-line">No email added</span>'}</span>
        <span>${icon('phone')}${client.phone ? esc(client.phone) : '<span class="muted-line">No phone added</span>'}</span>
      </div>
      <div class="client-bottom">
        <div class="client-stats">
          <span class="client-stat"><strong>${upcoming}</strong> upcoming</span>
          <span class="client-stat"><strong>${total}</strong> total</span>
        </div>
        <span class="client-next ${next ? '' : 'muted'}" title="${next ? esc(`${fmtTime(next.start)} · ${next.title}`) : ''}">
          ${next ? icon('clock') : ''}${esc(nextLabel)}
        </span>
      </div>
    </div>`;
}
