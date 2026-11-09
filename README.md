# Ecom Nexora — Admin Portal

Node.js (Express + EJS) admin portal for managing Ecom Nexora users, services, orders, payments, reports and messages.

## Run it

```bash
npm install
npm start
```

Open http://localhost:3000. Use `npm run dev` to auto-restart when files change.

## Sign in

The first start creates `data/db.json` with sample data and an admin account:

- Email: `admin@ecomnexora.com`
- Password: `nexora-admin`

Change both in **Settings** after signing in. To choose different starting values, copy `.env.example` to `.env`
and edit `ADMIN_EMAIL` / `ADMIN_PASSWORD` before the first start (or run `npm run seed` afterwards).

## Pages

| Page | What works |
|---|---|
| Login / Forgot password | Session sign-in, "keep me signed in", show/hide password, brute-force lockout |
| Dashboard | Live KPIs, 12-month sales trend, balance by user, recently added, top users |
| Users | Live search, service + status filters, CSV export, click a row to open the profile |
| Add / Edit user | All fields from the design, validation, sales-chart input (`label, amount` per line) |
| User profile | KPIs, revenue trend + product sales charts (week / 30 days / 12 months), activity, contact, recent orders, print, delete |
| Services | Create, edit, pause/activate, delete; user counts and balances per service |
| Orders | Status tabs, user + date filters, search, pagination, create, change status, delete, CSV export |
| Payments | KPIs, payouts chart, upcoming list, record payment, mark paid, auto "Overdue", history filters, CSV export |
| Reports | Week / 30 days / 12 months, revenue chart, revenue share by user, top products, CSV exports, print to PDF |
| Messages | Inbox with All / Unread / Archived, send replies (Enter to send), new message, mark unread, archive |
| Settings | Profile, company, notifications (auto-save), change password, log out |
| Help | Searchable FAQ, topic filters, support contacts |

The top search bar works on every page (press `/` to focus it) and shows matching users as you type.

## Branding

Matches ecomnexora.com: brand red `#ff3131` and near-black `#231f20`, Poppins for text and Montserrat for
buttons/menus (same Google Fonts as the site), the site's black-to-red hero on the login and help pages, the
site logo, and the red arrow favicon. Services are the site's "Done For You" and "Just In Time" menus with the
monthly sales targets / ROI / prices from each service page (`lib/catalog.js`). Support contacts default to
hello@ecomnexora.com and +1 (424) 394-0041 (editable in Settings → Company).

Platform logos (Amazon, Shopify, Facebook, Walmart, TikTok, YouTube) in `public/img/brands` are the official
marks from [Simple Icons](https://simpleicons.org) (CC0) in each brand's colours; the Walmart spark is drawn
from its shape. They're trademarks of their owners, used only to show which platform a service is for.
Choose a service's logo under Services → ⋯ → Edit → Platform logo.

## Put it live on ecomnexora.com

The website in `public_html` is static HTML on Apache (cPanel-style hosting). The portal is a Node.js app, so it
runs alongside it using cPanel's **Setup Node.js App** (or any Node host).

1. Upload this folder **outside** `public_html`, e.g. `/home/<user>/ecom-nexora-portal` (skip `node_modules`).
2. cPanel → **Setup Node.js App** → **Create Application**
   - Node.js version: 18 or newer · Application mode: Production
   - Application root: `ecom-nexora-portal`
   - Application URL: `ecomnexora.com` / `portal`
   - Application startup file: `server.js`
3. Add environment variables: `NODE_ENV=production`, `BASE_PATH=/portal`, a long random `SESSION_SECRET`,
   and your own `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
4. Click **Run NPM Install**, then **Restart**. Open https://ecomnexora.com/portal.
5. Optional: link to it from the site menu, e.g. `<a href="/portal/">Client Portal</a>`.

For a subdomain instead (portal.ecomnexora.com), create the subdomain, use it as the Application URL and leave
`BASE_PATH` empty. The site's `.htaccess` only rewrites URLs that have a matching `.html` file, so it doesn't
interfere with `/portal`.

## Business accounts (automatic data)

On the Add / Edit user form, paste the client's store or channel links under **Business accounts**. The
platform is detected from the link, **Fetch data** previews what the API returns, and saving (or **Sync now**
on the profile) writes the numbers into the client. Code lives in `lib/integrations/` (one file per platform).

| Platform | Status | Setup |
|---|---|---|
| YouTube | Works | Set `YOUTUBE_API_KEY` in `.env`. Public data: subscribers, total views, video count, recent uploads. Daily views, watch time and revenue need YouTube Analytics (channel owner sign-in) — enter those manually for now. |
| Shopify | Works | Per store: `.myshopify.com` link + Admin API access token with `read_orders`. Fills sales charts, orders, returns, today's sales/units. |
| Amazon, Walmart, TikTok Shop | Link saved, "Waiting for API access" | Needs an approved developer/partner app and seller authorization (Amazon SP-API, Walmart Marketplace API, TikTok Shop Partner). |
| Facebook Marketplace | Link saved | No seller data API exists — enter numbers manually. |

Shopify tokens are stored in `data/db.json` and never shown again in the portal — protect that file (it already
sits outside `public_html` when deployed as described above).

## Data

All data is stored in `data/db.json`. Back it up by copying that file. `npm run seed` resets everything to the sample data.

## Project layout

```
server.js          app setup, sessions, auth guard
routes/            one file per section
lib/db.js          JSON file store
lib/seed.js        sample data
lib/helpers.js     formatting and calculations
views/             EJS templates (partials/ = layout, pages/ = screens)
public/            CSS, JS (charts + interactions), images
```
