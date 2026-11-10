# TKD_2026: Taekwondo team app

One Node.js app, one MongoDB database:

| URL | Who | What |
|---|---|---|
| `/` | Athletes | Public registration form (this is the link you send) |
| `/coach` | Coach only | Dashboard: athletes, evaluations, progress, Excel download. Login with `ADMIN_KEY` |
| `/admin/export.xlsx` | Coach only | Excel file generated live from MongoDB (2 sheets: athletes, evaluations) |

## Run locally
1. Copy `.env.example` to `.env` and fill `MONGODB_URI` and `ADMIN_KEY`.
2. `npm install` then `npm start`
3. Open http://localhost:3000 (form) and http://localhost:3000/coach (dashboard).

## Deploy (Render + MongoDB Atlas)
Build command `npm install`, start command `npm start`, env vars `MONGODB_URI` and `ADMIN_KEY`
(optional `SESSION_SECRET`). Send athletes the root link, e.g. `https://your-app.onrender.com/`.
Install the coach dashboard on your phone from `/coach` ("Add to Home Screen").

## Security notes
- Coach login sets a signed HttpOnly, SameSite=Strict cookie (30 days). The key never sits in the URL.
- Athlete data is read-only to the public: the form can only create records; everything else needs the coach cookie.
- Rate limits on the form and on login, a honeypot field, strict input whitelisting, Helmet headers + CSP.
- Evaluation totals are computed on the server; Excel cells are written as plain text (no formula injection).
