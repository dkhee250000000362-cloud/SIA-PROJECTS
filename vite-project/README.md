# Affinity Boarding House Management

Affinity is a React/Vite boarding-house dashboard backed by an Express API and MySQL/MariaDB. The browser never connects to MySQL directly: API mutations are committed by the server before the React store adopts the returned workspace.

## Requirements

- Node.js 20 or newer
- MySQL 8 or MariaDB with a database user that can create and alter the application tables

## Configure the database

1. Create the database and tables by running `schema.sql` in MySQL/MariaDB. The script creates the `boarding_house` database.
2. Copy `.env.example` to `.env` and set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` to match your database.
3. Install dependencies and start the app:

```sh
npm install
npm run dev
```

The Express server serves the Vite development UI and `/api` from `http://localhost:3000`. It also verifies/creates the application tables on startup, so the database must exist before running the app.

MySQL Workbench is a database client, and is compatible with this application; it does not replace the MySQL server. The project `.env` is configured for the Workbench connection currently available on `127.0.0.1:3306`, database `boarding_house`, user `root`, with a blank password. If your MySQL Workbench connection uses a password or different host/port, update the corresponding values in `.env` to match (do not share or commit your password).

Run `npm run db:check` from the `vite-project` directory to confirm the app can connect and see the saved workspace. Dashboard room/boarder/bill/repair data is currently stored as JSON in the `workspace_state` row, not written into the similarly named normalized tables such as `rooms`, `tenants`, or `invoices`. Use this Workbench query to view the persisted dashboard summary:

```sql
SELECT version, updated_at,
       JSON_LENGTH(workspace_data, '$.rooms') AS rooms,
       JSON_LENGTH(workspace_data, '$.tenants') AS boarders,
       JSON_LENGTH(workspace_data, '$.bills') AS bills,
       JSON_LENGTH(workspace_data, '$.tickets') AS repair_requests
FROM boarding_house.workspace_state
WHERE id = 1;
```

## Production

```sh
npm run build
```

In PowerShell, set production mode and start the server:

```powershell
$env:NODE_ENV = "production"
npm start
```

Configure the same database environment variables in the production environment. In production the API uses secure, HTTP-only session cookies and serves the built `dist` directory.

## Persistence and security

- `workspace_state` stores the boarding-house workspace as JSON and a monotonically increasing version. Mutations are transaction-locked and reject stale versions so concurrent tabs cannot silently overwrite one another.
- `app_users` stores account metadata and bcrypt password hashes; plaintext passwords are never written to the workspace.
- `app_sessions` stores hashes of random session tokens. The raw token is held only in an HTTP-only cookie.
- SQL values use mysql2 placeholders. The server validates actions and limits boarder accounts to their own repair requests and payment receipts.
- Room, tenant, bill, ticket, document, and receipt updates are sent to the API. The client applies workspace state only after a successful API response.
- Signup and login are handled by `POST /api/auth/admin/register`, `POST /api/auth/tenant/register`, and `POST /api/auth/login`. New passwords use bcrypt; existing scrypt hashes are accepted and upgraded to bcrypt after a successful login.
- The separate `profiles` and `tenants` tables do not contain email/password columns, so they are not authentication tables. `app_users` stores login credentials, and tenant profile/contact data stays in the workspace.
- Existing `app_users.password_hash` values are upgraded from the former 160-character column to 255 characters at server startup. The exact 127-hex-character scrypt truncation caused by that old column is recognized for successful-login migration; any other malformed or incomplete password hash cannot be recovered and requires a password reset.

## Project structure

- `src/pages/` — login, landlord dashboard, and boarder portal
- `src/store.jsx` — React workspace state and API-backed actions
- `src/api/harborApi.js` — browser HTTP requests
- `server/index.js` — Express routes, session handling, and MySQL access
- `server/workspace.js` — server-side workspace validation and mutation rules
- `schema.sql` — database and table definitions
