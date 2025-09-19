# Finance Platform - Local + Server Sync (Optional)

This app works fully offline using browser storage. You can optionally add a lightweight Node.js + SQLite backend for auth and syncing.

## Server setup

1) Navigate to server folder and install deps
```
cd server
npm i
# copy environment file and adjust values
# create .env with:
# PORT=4000
# DB_PATH=./finance.db
# JWT_SECRET=please_change_me_for_production
npm run dev
```
The API will run on http://localhost:4000.

Endpoints (minimal):
- POST /api/register { name, surname, description?, username, password }
- POST /api/login { username, password }
- GET /api/sell-entries (Auth: Bearer token)
- POST /api/sell-entries (Auth: Bearer token)

You can extend similar endpoints for sellers, invoices, items, and other expenses.

## Frontend
The frontend continues to function offline. To integrate with the server, add fetch calls in scripts/app.js where data is created/loaded, using the JWT saved after login.


