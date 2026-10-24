# CloudVault ☁️

> **High-throughput document storage, cryptographic file sharing, and fine-grained team access control.**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Database: SQLite WAL](https://img.shields.io/badge/Database-SQLite%20WAL-003B57.svg)](https://www.sqlite.org/)
[![Storage: Multi--Provider](https://img.shields.io/badge/Storage-Local%20%7C%20S3%20%7C%20GCS-orange.svg)](#storage-providers)

CloudVault is an enterprise-grade, privacy-first cloud document storage platform built with modern web standards. It features end-to-end user workspace isolation, nested folder structures, granular link and team member sharing, an audit log, and support for pluggable storage providers (Local disk, AWS S3 / MinIO / R2, and Google Cloud Storage).

---

## ⚡ Key Features

- **📂 Complete Document Management**:
  - Drag-and-drop file uploads with MIME-type detection.
  - Nested folder hierarchy with breadcrumbs and navigation.
  - Document starring, soft-delete trash bin, and instant restore.
  - Search and filter by file type, ownership, or tags.

- **🔗 Granular Access Control & Sharing**:
  - Share files with specific workspace users via email or username.
  - Configurable permissions: `view`, `download`, or `edit`.
  - Cryptographically secure public share links with optional expiration dates.
  - Dedicated public share preview viewer for external collaborators.

- **☁️ Multi-Cloud & Hybrid Storage Engines**:
  - **Local Storage Engine**: Zero external dependencies, fast local disk streaming.
  - **AWS S3 / S3-Compatible**: Works with AWS S3, Cloudflare R2, Wasabi, MinIO, or LocalStack.
  - **Google Cloud Storage (GCS)**: Direct Google Cloud bucket integration.
  - Built-in simulation fallback mode for offline and demo development.

- **🛡️ Security & Performance**:
  - JWT (JSON Web Token) stateless authentication.
  - Passwords salted and hashed with `bcryptjs`.
  - High-concurrency database backed by `better-sqlite3` running in **WAL mode** (Write-Ahead Logging).
  - Comprehensive activity audit trail tracking file creation, sharing, and deletions.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express 5, Better-SQLite3, Multer, JWT, BcryptJS, UUID
- **Frontend**: Vanilla HTML5, Modern CSS (Glassmorphism, CSS Custom Properties, JetBrains Mono & Plus Jakarta Sans typography), Native JavaScript (ES6+)
- **Storage**: Pluggable storage abstraction layer (`services/cloudStorage.js`) supporting Local FS, AWS S3, and Google Cloud Storage.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v18.0.0 or higher
- **npm** v9.0.0 or higher

### 2. Clone the Repository
```bash
git clone https://github.com/dachepallyrohit/algo1.git
cd algo1
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Copy the sample environment file to `.env`:
```bash
cp .env.example .env
```

Default configuration in `.env`:
```ini
PORT=3000
JWT_SECRET=your-secret-key-change-in-production
DB_PATH=./database.sqlite
UPLOAD_DIR=./uploads
STORAGE_PROVIDER=local
```

### 5. Launch the Server
```bash
npm start
```
The application will be live at **[http://localhost:3000](http://localhost:3000)**.

---

## 🧪 Pre-configured Test Accounts

For testing, review, or local evaluation, you can use the built-in test account or click **`DEV: TESTER CREDS`** in the application header:

| Role | Username / Login | Password | Description |
| :--- | :--- | :--- | :--- |
| **Primary Tester** | `tester` *(or `tester@example.com`)* | `123456` | Pre-configured workspace tester |
| **Collaborator 1** | `alice` *(or `alice@example.com`)* | `Password123!` | Team member for sharing tests |
| **Collaborator 2** | `bob` *(or `bob@example.com`)* | `Password123!` | Team member for sharing tests |
| **Media Tester** | `mediauser` *(or `media@example.com`)* | `Password123!` | Pre-loaded user for media uploads |

---

## 📁 Project Directory Structure

```
algo1/
├── middleware/
│   └── auth.js            # JWT validation and user authorization middleware
├── public/
│   ├── index.html         # Single-page application markup & modals
│   ├── styles.css         # Modern dark-mode design system & animations
│   └── app.js             # Client application logic, API client, DOM handlers
├── routes/
│   ├── auth.js            # User signup, login, profile, user search
│   ├── documents.js       # File upload, download, metadata, trash/restore
│   ├── folders.js         # Folder hierarchy, navigation, creation
│   ├── shares.js          # Permission management & public share link routes
│   └── activity.js        # Audit trail & user activity log
├── services/
│   └── cloudStorage.js    # Multi-cloud storage provider (Local, S3, GCS)
├── uploads/               # Local file storage target (ignored in git)
├── .env.example           # Public environment template
├── .gitignore             # Git ignore configuration
├── database.js            # SQLite database schema, indices, & WAL initialization
├── package.json           # Project manifest and dependencies
├── server.js              # Express app bootstrap & route registration
└── README.md              # Project documentation
```

---

## 📡 API Reference Overview

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Create a new user account
- `POST /api/auth/login` — Authenticate and receive JWT token
- `GET /api/auth/me` — Retrieve current authenticated user profile
- `GET /api/auth/search?q=:query` — Search workspace users for sharing

### Documents (`/api/documents`)
- `GET /api/documents` — List user documents (supports folder filter, starring, trash)
- `POST /api/documents/upload` — Upload a new document (multipart/form-data)
- `GET /api/documents/:id/download` — Download document stream
- `PATCH /api/documents/:id/star` — Toggle document starred state
- `DELETE /api/documents/:id` — Move document to trash / delete permanently

### Folders (`/api/folders`)
- `GET /api/folders` — List user folders and nested hierarchy
- `POST /api/folders` — Create a new folder
- `DELETE /api/folders/:id` — Delete folder and cascaded documents

### Sharing (`/api/shares`)
- `POST /api/shares` — Share document/folder with another user or create public link
- `GET /api/shares/document/:docId` — Get all active shares for a document
- `DELETE /api/shares/:id` — Revoke share access
- `GET /api/shares/public/:link` — Access document via public link token

### Audit Trail (`/api/activity`)
- `GET /api/activity` — Get chronological activity log for current user

---

## 🔒 Security Best Practices

1. **Keep `.env` out of version control**: The repository `.gitignore` ensures that `.env` files are never tracked.
2. **Rotate Secrets**: Always set a secure random string for `JWT_SECRET` in production.
3. **Database Security**: SQLite WAL mode provides crash-resilient ACID compliance. Regularly back up `database.sqlite`.
4. **Cloud Credentials**: When using AWS S3 or GCS in production, prefer IAM roles / workload identity instead of long-lived access keys.

---

## 📄 License

This project is licensed under the **ISC License**.
