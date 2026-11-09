const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const h = require('../lib/helpers');

// simple in-memory brute-force guard: 8 failed attempts per IP per 15 minutes
const attempts = new Map();
const tooMany = ip => {
  const a = attempts.get(ip);
  return a && a.count >= 8 && Date.now() - a.first < 15 * 60 * 1000;
};
const fail = ip => {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > 15 * 60 * 1000) attempts.set(ip, { count: 1, first: Date.now() });
  else a.count++;
};

const safeNext = n => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');

// The same sign-in is served by several designs: /login shows the astronaut design (login-new) on
// computers and the original page on phones and tablets; the designs can also be opened directly at
// /login-new (aurora and astronaut), /login-vortex (vortex of screens) and /login-moon (moonrise over mist).
// Each form posts back to the address it was opened at, so a wrong password keeps you on the same page.
const isMobile = req => req.get('sec-ch-ua-mobile') === '?1' || /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(req.get('user-agent') || '');
const byDevice = (req, res) => { res.vary('User-Agent').vary('Sec-CH-UA-Mobile'); return isMobile(req) ? 'pages/login' : 'pages/login-new'; };

const showLogin = view => (req, res) => {
  if (req.session.admin) return res.redirect('/');
  const page = typeof view === 'function' ? view(req, res) : view;
  res.render(page, { title: 'Sign in', error: null, email: '', next: safeNext(req.query.next), formAction: req.path });
};

const signIn = view => (req, res) => {
  const email = h.str(req.body.email).toLowerCase();
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);
  const page = typeof view === 'function' ? view(req, res) : view;
  const render = error => res.status(401).render(page, { title: 'Sign in', error, email, next, formAction: req.path });

  if (tooMany(req.ip)) return render('Too many attempts. Please wait 15 minutes and try again.');
  const admin = db.settings().admin;
  if (!email || !password || email !== admin.email || !bcrypt.compareSync(password, admin.passwordHash)) {
    fail(req.ip);
    return render('That email and password combination is not correct.');
  }
  attempts.delete(req.ip);
  const remember = req.body.remember === 'on';
  req.session.regenerate(err => {
    if (err) return render('Could not start a session. Please try again.');
    req.session.admin = true;
    if (remember) req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
    res.redirect(next);
  });
};

router.get('/login', showLogin(byDevice));
router.post('/login', signIn(byDevice));
router.get('/login-new', showLogin('pages/login-new'));
router.post('/login-new', signIn('pages/login-new'));
router.get('/login-vortex', showLogin('pages/login-vortex'));
router.post('/login-vortex', signIn('pages/login-vortex'));
router.get('/login-moon', showLogin('pages/login-moon'));
router.post('/login-moon', signIn('pages/login-moon'));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('nexora.sid');
    res.redirect('/login');
  });
});

router.get('/forgot-password', (req, res) => {
  res.render('pages/forgot', { title: 'Reset password', sent: false, email: '' });
});
router.post('/forgot-password', (req, res) => {
  // No mail server is configured, so this only confirms the request. The password
  // can be reset by an admin from Settings → Security, or with ADMIN_PASSWORD + `npm run seed`.
  res.render('pages/forgot', { title: 'Reset password', sent: true, email: h.str(req.body.email) });
});

module.exports = router;
