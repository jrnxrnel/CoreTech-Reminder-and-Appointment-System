# Tempo

A calm appointment and reminder workspace. Tempo keeps your calendar, clients, notes, and reminders together in a single browser app, backed by MySQL through a small Node.js/Express API.

> **Tempo** · Appointments, in rhythm

The existing interface, layout, colors, and features are preserved. When the Node server and MySQL are running, appointments, clients, reminders, notifications, and settings are stored in `appointment_reminder_system`. If the API is unavailable, the app falls back to the original browser storage so it still opens.

## Features

- **Overview** — today's numbers, your next appointment with a live countdown, today's schedule, and upcoming reminders.
- **Calendar** — month and week views, status colors, overlap-aware week layout, a current-time line, and click-anywhere-to-book.
- **Appointments** — create, view, edit, and delete; search, status/date/client filters, grouped date list, duration, location, reminder offsets, notes, and double-booking warnings.
- **Clients** — create, edit, and delete contact cards with company, email, phone, notes, appointment counts, and next visit.
- **Reminders** — per-appointment offsets stored in MySQL, in-app bell, snooze 10 minutes, mark read, and optional desktop notifications.
- **Search** — press `/` to search appointments and clients.
- **Backups** — export/import JSON and CSV; imports are written back to MySQL.

## Requirements

- [XAMPP](https://www.apachefriends.org/) with MySQL
- [Node.js](https://nodejs.org/) 18 or newer
- VS Code (recommended) or any code editor

## 1. Start MySQL in XAMPP

1. Open **XAMPP Control Panel**.
2. Click **Start** next to **MySQL**. Apache is not required.
3. Open **phpMyAdmin**: <http://localhost/phpmyadmin>.

## 2. Import the database

1. In phpMyAdmin, click the **Import** tab.
2. Choose **`database.sql`** from this project folder.
3. Click **Import**.
4. Confirm that the `appointment_reminder_system` database now contains:
   `users`, `user_settings`, `clients`, `appointments`, `reminders`, and `notifications`.

The SQL file creates the database and relationships, and seeds a default workspace user (`usr_default`) plus default settings. It does not contain private user data.

## 3. Configure the database credentials

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Edit `.env` if your XAMPP MySQL login is different:

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=appointment_reminder_system
```

XAMPP's default MySQL user is `root` with an empty password. If you set a MySQL password, put it in `.env` only. **Never commit `.env`** — it is already listed in `.gitignore`.

## 4. Install and run in VS Code

1. Open the project folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Install dependencies once:

   ```powershell
   npm install
   ```

4. Start the app:

   ```powershell
   npm start
   ```

5. Open <http://localhost:4173/>. The server also opens it automatically.

On Windows you can double-click **`Start Tempo.bat`** instead. It installs dependencies on first run, copies `.env.example` to `.env` if needed, and starts the server. Make sure MySQL is running in XAMPP first.

Check the database connection at <http://localhost:4173/api/health>.

## API overview

All routes are under `/api` and use parameterized SQL queries.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Database connection check |
| `GET` / `PUT` | `/state` | Read or transactionally sync the full workspace |
| `GET` / `PUT` | `/user` | Read or update the workspace owner |
| `GET` / `PUT` | `/settings` | Read or update reminder defaults |
| `GET` / `POST` | `/clients` | List or create clients |
| `GET` / `PUT` / `DELETE` | `/clients/:id` | Read, update, or delete a client |
| `GET` / `POST` | `/appointments` | List or create appointments |
| `GET` / `PUT` / `DELETE` | `/appointments/:id` | Read, update, or delete an appointment |
| `GET` / `POST` | `/reminders` | List or create an appointment reminder |
| `GET` / `PUT` / `DELETE` | `/reminders/:id` | Read, update, or delete a reminder |
| `GET` / `POST` | `/notifications` | List or create bell notifications |
| `PATCH` | `/notifications/:id/read` | Mark a notification read |
| `DELETE` | `/notifications/:id` | Delete a notification |

The frontend uses `GET/PUT /api/state` so imports, bulk edits, deletes, and offline-origin data all remain consistent in one database transaction. The entity routes are available for direct API use.

## Notifications

- In-app reminders (bell + toast) work while Tempo is open.
- Browser desktop notifications require permission and a `localhost`/HTTPS origin; use `npm start`, not `file://`.
- Reminders are checked while the tab is open. If the browser is closed or the computer sleeps, reminders cannot fire. This project does **not** include a background push service.

## Security notes

- All database reads/writes use parameterized queries.
- Inputs are validated and length-limited on both the browser and server.
- `.env`, `node_modules/`, logs, and local database dumps are ignored by Git.
- No plain-text passwords are stored. The default workspace has no authentication/password; it is intended for local single-user use. Add an authentication layer before exposing it publicly.
- The static server only serves `index.html`, `styles.css`, and `js/`; `.env`, `database.sql`, and server source are not exposed over HTTP.

## Data and backups

- With the server running, data is saved to MySQL and cached in the browser as a fallback.
- Opening `index.html` directly (without the server) uses the original local-browser mode.
- If the database is empty on first server run, existing local browser data is migrated into MySQL automatically.
- **Settings → Your data** exports a JSON backup or appointments CSV, imports either format, clears all data, or loads the sample schedule.
- Clearing all data removes the records from the database for the workspace user.

## Files

```text
index.html              App shell and icon sprite
styles.css              Existing design system and responsive layout
js/api-client.js        Fetch wrapper, database state loading, debounced saves
js/store.js             State, selectors, MySQL sync, local fallback
js/shell.js             Navigation, sidebar, notification bell, storage status
js/views-*.js           Dashboard, calendar, appointments, clients, settings
js/modals.js            Appointment, client, day, and confirmation dialogs
js/data-actions.js      Reminder engine, notifications, import/export
js/search.js            Global search
js/main.js              Routing, events, keyboard, startup
serve.js                Express entry point, static files, API routes
server/db.js            MySQL pool, mapping, transactions, CRUD helpers
server/validate.js      Server-side validation and sanitization
database.sql            MySQL schema, relationships, default user/settings
package.json            Dependencies and scripts
.env.example            Database configuration template
.gitignore              Excludes secrets, dependencies, and local dumps
Start Tempo.bat         Windows launcher
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus global search |
| `↑` / `↓` | Move through search results |
| `Enter` | Open the selected result (or view all matches) |
| `N` | New appointment (when not typing) |
| `Esc` | Close a dialog, search dropdown, bell, or mobile menu |

## Troubleshooting

**The app says "Using local browser storage"**  
Start MySQL in XAMPP, import `database.sql`, check `.env`, then restart `npm start`.

**`/api/health` returns 503**  
MySQL is not reachable, the database has not been imported, or the credentials are wrong. Check the XAMPP MySQL log and `.env`.

**Port 4173 is already in use**  
Run with another port: `$env:PORT=4174; npm start` (PowerShell).

**Notifications do not appear**  
Use `http://localhost:4173`, allow notifications in the browser prompt, and enable them in Settings. Keep the tab open.
