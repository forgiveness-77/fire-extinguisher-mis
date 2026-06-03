# FEMS — Fire Extinguisher Management System

A full-stack web application for tracking fire extinguishers, managing customer accounts, monitoring expiry dates, and handling compliance notifications and escalations.

Built with **React**, **Express**, and **PostgreSQL**, with role-based authentication for admin, manager, and viewer users.

---

## Features

- **Dashboard** — Overview of extinguisher stats, expiring units, and recent alerts
- **Customer management** — CRUD for business clients and their contact details
- **Extinguisher registry** — Track serial numbers, types, locations, purchase/expiry dates, and status
- **Automated notifications** — Daily scheduler checks for 30-day, 7-day, and expired extinguishers
- **Escalations** — Auto-escalate cases when customers ignore repeated expiry alerts
- **Role-based access control** — Three roles with distinct permissions (see below)
- **User management** — Admins can create, edit, and deactivate system users

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React 18, Vite, React Router, Axios, Tailwind CSS |
| Backend | Node.js, Express 4, JWT, bcryptjs |
| Database | PostgreSQL |
| Scheduling | node-cron (daily expiry checks at 08:00) |

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)
- [PostgreSQL](https://www.postgresql.org/) 14+ running locally

---

## Quick Start

### 1. Clone and install dependencies

```bash
git clone <repository-url>
cd restful

cd fems/backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

The backend reads configuration from `fems/backend/.env`. A file is already included with local development values:

```env
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=12345678
DB_NAME=fems

JWT_SECRET=fems-jwt-secret-k8m2p9x4v7n1q6w3r5t0y8u
JWT_EXPIRES=24h
```

For a fresh clone, copy the example file and adjust if needed:

```bash
cd fems/backend
cp .env.example .env
```

> **Note:** `.env` is gitignored. Never commit real credentials to version control.

### 3. Set up the database

Ensure PostgreSQL is running, then initialize the schema and seed data:

```bash
cd fems/backend
npm run db:setup
```

This creates the `fems` database (if missing), applies table schemas, migrates legacy sample data from `data.json` when present, and seeds default users.

### 4. Start the application

**Terminal 1 — Backend** (http://localhost:5000)

```bash
cd fems/backend
npm run dev
```

**Terminal 2 — Frontend** (http://localhost:5173)

```bash
cd fems/frontend
npm run dev
```

Open **http://localhost:5173** in your browser and sign in with one of the demo accounts below, or [register a new account](#registration).

---

## Registration

New users can self-register at **http://localhost:5173/register**. Accounts are created with the **viewer** role (read-only). An admin can promote users to manager or admin from the Users page.

Required fields: full name, username, password (min. 6 characters). Email is optional.

---

## Demo Accounts

| Username | Password | Role | Permissions |
|----------|----------|------|-------------|
| `admin` | `admin123` | Admin | Full access including user management |
| `manager` | `manager123` | Manager | Read and write on all operational data |
| `viewer` | `viewer123` | Viewer | Read-only access to dashboard and records |

---

## Roles & Permissions

| Action | Admin | Manager | Viewer |
|--------|:-----:|:-------:|:------:|
| View dashboard & records | ✓ | ✓ | ✓ |
| Create / edit / delete customers | ✓ | ✓ | |
| Create / edit / delete extinguishers | ✓ | ✓ | |
| Mark notifications as seen | ✓ | ✓ | |
| Trigger expiry check | ✓ | ✓ | |
| Update / delete escalations | ✓ | ✓ | |
| Manage users | ✓ | | |

---

## Project Structure

```
restful/
├── .gitignore
├── README.md
└── fems/
    ├── backend/
    │   ├── .env                 # Local secrets (not committed)
    │   ├── .env.example         # Environment template
    │   ├── package.json
    │   └── src/
    │       ├── server.js        # Express entry point
    │       ├── db.js            # PostgreSQL connection & schema
    │       ├── store.js         # Data access layer
    │       ├── seed.js          # Default user seeding
    │       ├── migrate.js       # Legacy JSON migration
    │       ├── scheduler.js     # Expiry notification cron job
    │       ├── middleware/      # JWT auth middleware
    │       ├── routes/          # API route handlers
    │       └── scripts/
    │           └── setup-db.js  # Database initialization script
    └── frontend/
        ├── package.json
        ├── vite.config.js
        └── src/
            ├── App.jsx          # Router & layout
            ├── api/             # Axios API client
            ├── context/         # Auth context provider
            ├── components/      # Shared UI components
            └── pages/           # Route pages
```

---

## API Overview

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | Public | Sign in, returns JWT |
| POST | `/auth/register` | Public | Create account (viewer role), returns JWT |
| GET | `/auth/me` | JWT | Current user profile |
| GET/POST/PUT/DELETE | `/customers` | JWT | Customer CRUD |
| GET/POST/PUT/DELETE | `/extinguishers` | JWT | Extinguisher CRUD |
| GET | `/extinguishers/stats` | JWT | Dashboard statistics |
| GET/PATCH | `/notifications` | JWT | List & mark notifications |
| POST | `/notifications/trigger-check` | JWT + write | Manual expiry check |
| GET/PATCH/DELETE | `/escalations` | JWT | Escalation management |
| GET/POST/PUT/DELETE | `/users` | JWT + admin | User management |
| GET | `/health` | Public | Health check |

Write operations (POST, PUT, PATCH, DELETE on operational data) require **admin** or **manager** role.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `5000` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | *(required)* |
| `DB_NAME` | Database name | `fems` |
| `JWT_SECRET` | Secret key for signing tokens | *(required)* |
| `JWT_EXPIRES` | Token lifetime | `24h` |

---

## NPM Scripts

### Backend (`fems/backend`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Start production server |
| `npm run db:setup` | Initialize DB schema, migrate, and seed |

### Frontend (`fems/frontend`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server on port 5173 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

---

## Scheduler

The backend runs an expiration check on startup and then **daily at 08:00**:

- Marks active extinguishers as **expired** when past their expiry date
- Creates **30-day** and **7-day** warning notifications
- Creates **escalations** when a customer has 3+ unseen notifications for an expired unit

Admins and managers can also trigger a manual check from the Notifications page.

---

## License

This project is provided as-is for educational and internal use.
