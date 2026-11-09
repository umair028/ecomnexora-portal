const path = require('path');
const crypto = require('crypto');
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch {}
// Vercel's filesystem is read-only except /tmp: keep a demo copy of the data there (lost on restart)
if (process.env.VERCEL && !process.env.DB_FILE) process.env.DB_FILE = '/tmp/nexora-db.json';

const express = require('express');
const session = require('express-session');
const db = require('./lib/db');
const h = require('./lib/helpers');
const { icon } = require('./lib/icons');
const { SITE } = require('./lib/catalog');

const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';
// Where the portal lives on the website, e.g. "/portal" for ecomnexora.com/portal ("" = domain root)
const BASE = ('/' + (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '');
// Background video on the sign-in pages. Set LOGIN_VIDEO_URL to your own file (or to empty to turn it off).
const LOGIN_VIDEO = process.env.LOGIN_VIDEO_URL ?? 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_204221_5339e40b-e73d-4ab0-9c65-79c18c66fd50.mp4';

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // behind Apache / Passenger / nginx on the live server
app.disable('x-powered-by');

// assets are cache-busted with ?v=<boot time>; in production they can be cached for long,
// in development the browser re-checks them so CSS/JS edits show up on refresh
const ASSET_VERSION = Date.now().toString(36);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '7d' : 0 }));
// Three.js (pinned in package.json) for the 3D parcel on the new sign-in page; only that page imports it
app.use('/vendor/three/addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm'), { maxAge: PROD ? '30d' : 0 }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build'), { maxAge: PROD ? '30d' : 0 }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(session({
  name: 'nexora.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD ? 'auto' : false, path: BASE || '/', maxAge: 1000 * 60 * 60 * 8 },
}));

// Helpers + flash toast available in every view; redirects stay inside BASE_PATH
app.use((req, res, next) => {
  res.locals.h = h;
  res.locals.icon = icon;
  res.locals.v = ASSET_VERSION;
  res.locals.base = BASE;
  res.locals.site = SITE;
  res.locals.loginVideo = LOGIN_VIDEO;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  req.flash = (msg, type = 'success') => { req.session.flash = { msg, type }; };
  const redirect = res.redirect.bind(res);
  res.redirect = (a, b) => {
    const [status, url] = typeof a === 'number' ? [a, b] : [302, a];
    redirect(status, typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? BASE + url : url);
  };
  next();
});

app.use(require('./routes/auth'));

// Everything below needs a signed-in admin
app.use((req, res, next) => {
  if (!req.session.admin) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not signed in' });
    return res.redirect('/login?next=' + encodeURIComponent(req.url));
  }
  res.locals.admin = db.settings().admin;
  res.locals.unread = db.all('messages').filter(m => m.from === 'user' && !m.read).length;
  next();
});

app.use(require('./routes/dashboard'));
app.use(require('./routes/users'));
app.use(require('./routes/services'));
app.use(require('./routes/orders'));
app.use(require('./routes/payments'));
app.use(require('./routes/reports'));
app.use(require('./routes/messages'));
app.use(require('./routes/settings'));
app.use(require('./routes/help'));

app.use((req, res) => res.status(404).render('pages/not-found', { title: 'Page not found', active: '' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('pages/not-found', { title: 'Something went wrong', active: '', error: true });
});

// Mount under BASE_PATH. Some hosts (cPanel / Passenger) pass the full URL and some strip
// the folder, so requests arriving without the prefix are accepted too.
const server = express();
server.disable('x-powered-by');
if (BASE) {
  server.use((req, res, next) => {
    if (req.url !== BASE && !req.url.startsWith(BASE + '/') && !req.url.startsWith(BASE + '?')) req.url = BASE + req.url;
    next();
  });
}
server.use(BASE || '/', app);

db.all('users'); // load data now: runs catalog updates and any data/pending-import.json at start-up
// On Vercel the platform runs the exported app; everywhere else start a normal server
if (!process.env.VERCEL) server.listen(PORT, () => console.log(`Ecom Nexora portal running at http://localhost:${PORT}${BASE}/`));
module.exports = server;
