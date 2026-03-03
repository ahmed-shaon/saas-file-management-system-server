# SaaS File Management System - Server

This repository contains the backend API for a **multi‑tenant SaaS file management platform**. It is built using
TypeScript, Express, Prisma (PostgreSQL) and follows modern security and architectural best practices.

> The service exposes endpoints for user authentication, subscription management, folder/file operations and
> administrative controls. Business rules are enforced server‑side based on subscription packages.

---

## 🚀 Key Features

- **Authentication & Authorization**
  - Email/password register and login
  - JWT stored in HTTP‑only cookies
  - Forgot / reset password flow (token returned in response for testing)
  - Role‑based access (`USER` vs `ADMIN`)
- **Subscription packages**
  - Configurable plans (`Free`, `Silver`, `Gold`, `Diamond`, ...)
  - Limits on folders, nesting depth, file count/size/type, etc.
  - Upgrade/downgrade and history tracking
- **Folder hierarchy**
  - Unlimited nesting (configurable per plan)
  - Create, rename, delete (recursive with disk cleanup)
  - Ownership checks and duplicate‑name prevention
- **File handling**
  - Two‑stage upload with `multer` (temp & permanent storage)
  - MIME‑to‑type mapping and allowed‑type enforcement
  - Per‑folder and global file limits
  - Download, rename, delete with disk/database consistency
- **Administrator API**
  - Package CRUD (soft delete)
  - Paginated user listing, detail and activation/deactivation
- **Infrastructure & tooling**
  - Prisma ORM with generated client
  - PostgreSQL support
  - Rate limiting (`express-rate-limit`) for auth and uploads
  - Security middlewares (`helmet`, `cors`, `cookie-parser`)
  - Winston logger
  - Environment variable configuration via `dotenv`
  - Automatic creation of `uploads` and `logs` directories on startup

---

## 📁 Repository Structure

```
├── prisma/                  # Prisma schema, migrations, seed script
├── src/
│   ├── app.ts               # Express app configuration
│   ├── server.ts            # Bootstraps server & DB connection
│   ├── config/              # Env and database helpers
│   ├── middlewares/         # Auth, error handler, rate limiters
│   ├── modules/             # Feature areas (auth, file, folder, etc.)
│   ├── services/            # Shared business logic (enforcement, etc.)
│   ├── utils/               # Helper utilities (ApiError, validation)
├── uploads/                 # Dynamically created on startup
│   ├── temp/                # Multer temporary files
│   └── files/               # Permanent storage
└── package.json             # Scripts & dependencies
```

---

## ⚙️ Environment Variables

The following variables are required (see `src/config/env.ts` for defaults & validation):

```dotenv
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
JWT_SECRET=some_long_random_string
COOKIE_SECRET=another_secret_value
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=securepassword
ADMIN_FULL_NAME=Administrator

# optional (defaults shown)
FRONTEND_URL=http://localhost:5173
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=500
JWT_EXPIRES_IN=7d
PORT=5000
```

> ℹ️ `DATABASE_URL` should point to a PostgreSQL database. The `ADMIN_*` values are used by the seeding script
> to create an initial administrator account.

---

## 🛠️ Development

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Migrate the database & generate client**
   ```bash
   npm run db:migrate        # runs `prisma migrate dev`
   npm run db:generate       # runs `prisma generate`
   npm run db:seed           # populates default packages and admin user
   ```
3. **Start the server**
   ```bash
   npm run dev               # ts-node-dev with hot reloading
   ```
4. Navigate to `http://localhost:5000/api/health` to verify the service is running.

### 🏗️ Production build

```bash
npm run build               # compiles TypeScript to `dist/`
npm start                   # runs compiled server
```

> Ensure the `.env` values are set appropriately in your production environment.

---

## 📦 Database Schema

Located in `prisma/schema.prisma`. Models include:

- `User` (with password hashing, reset tokens, role, etc.)
- `SubscriptionPackage` (plan configuration)
- `UserSubscription` (append‑only history)
- `Folder` (self‑referencing for nesting, depth tracking)
- `File` (metadata + stored filename)

Run `npx prisma studio` (`npm run db:studio`) for a visual view.

---

## 📡 API Endpoints

All routes are prefixed with `/api`.

### Auth (`/api/auth`)
| Method | Path               | Description                          | Auth  |
|--------|--------------------|--------------------------------------|-------|
| POST   | /register          | Create new user                      | No    |
| POST   | /login             | Obtain JWT & cookie                  | No    |
| POST   | /forgot-password   | Generate password reset token        | No    |
| POST   | /reset-password    | Reset password using token           | No    |
| POST   | /logout            | Clear auth cookie                    | Yes   |
| GET    | /me                | Get current user & subscription info | Yes   |

### Subscriptions (`/api/subscriptions`)
| GET    | /packages          | List active packages                 | Yes   |
| GET    | /current           | Active package + usage               | Yes   |
| GET    | /history           | Subscription history                 | Yes   |
| POST   | /select            | Choose a different package           | Yes   |

### Folders (`/api/folders`)
| GET    | /                  | Root folders                         | Yes   |
| GET    | /:id/children      | Direct children of a folder          | Yes   |
| POST   | /                  | Create folder (body: name, parentId) | Yes   |
| PUT    | /:id               | Rename folder                        | Yes   |
| DELETE | /:id               | Delete folder & contents             | Yes   |

### Files (`/api/files`)
| GET    | /folder/:folderId  | List files in folder                 | Yes   |
| POST   | /upload            | Upload file (multipart/form-data)    | Yes   |
| GET    | /:id/download      | Download file                        | Yes   |
| PUT    | /:id/rename        | Rename file                          | Yes   |
| DELETE | /:id               | Delete file                          | Yes   |

### Admin (`/api/admin`)
Endpoints require an authenticated **admin** user.

#### Packages
| GET  | /packages               | All packages (including inactive)
| POST | /packages               | Create package
| PUT  | /packages/:id           | Update package
| DELETE| /packages/:id          | Soft delete package

#### Users
| GET  | /users?page=&limit=     | Paginated user list
| GET  | /users/:id              | User detail + subscription history
| PUT  | /users/:id/status       | Activate/deactivate user

> All responses follow `{ success, message, data }` or throw a structured error handled by `errorHandler` middleware.

---

## 🧠 Business Rules & Enforcement

The `EnforcementService` centralises the checks for:

- folder count and nesting depth
- files per folder and total file count
- file size and allowed MIME types

It resolves the user’s active package once per request to minimize DB queries. Most checks throw an `ApiError` with a specific `ERROR_CODES` value that the frontend can consume.

---

## 🛡️ Security & Middleware

- `helmet` for HTTP headers
- `cors` configured with `FRONTEND_URL`
- JWT stored/verified through `authenticate` middleware
- Rate limiters on auth and upload endpoints
- Centralized error handling with `ApiError`

---

## 📂 Uploads & Storage

- Temporary uploads stored under `uploads/temp` by Multer
- After enforcement checks, files are moved to `uploads/files` with a UUID‑based filename
- Disk cleanup occurs when files/folders are deleted
- Directories are auto‑created at server start (see `server.ts`)

---

## 🤝 Contributing

Feel free to open issues or pull requests. The project uses TypeScript strict mode; new code should include types and Zod validation where appropriate.

---

## 📄 License

This project is released under the **ISC License** (see `package.json`).

---

For questions or support, contact the maintainer or refer to internal documentation.

---

*Generated from existing project structure and code base.*
