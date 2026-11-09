const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const h = require('../lib/helpers');

const TABS = ['profile', 'company', 'notifications', 'security'];
const TIMEZONES = [
  ['America/Los_Angeles', '(GMT-08:00) Pacific Time'], ['America/Denver', '(GMT-07:00) Mountain Time'],
  ['America/Chicago', '(GMT-06:00) Central Time'], ['America/New_York', '(GMT-05:00) Eastern Time'],
  ['Europe/London', '(GMT+00:00) London'], ['Europe/Berlin', '(GMT+01:00) Berlin'], ['Asia/Dubai', '(GMT+04:00) Dubai'],
  ['Asia/Karachi', '(GMT+05:00) Karachi'], ['Asia/Kolkata', '(GMT+05:30) India'], ['Australia/Sydney', '(GMT+10:00) Sydney'],
];
const CURRENCIES = [['USD', 'USD – US Dollar'], ['EUR', 'EUR – Euro'], ['GBP', 'GBP – British Pound'], ['CAD', 'CAD – Canadian Dollar'], ['AUD', 'AUD – Australian Dollar']];
const NOTIFS = [
  ['newUser', 'New user added', 'Email me when a user is added to the portal.'],
  ['paymentDue', 'Payment due reminders', '3 days before a scheduled payment is due.'],
  ['overdue', 'Overdue payments', 'Alert me as soon as a payment becomes overdue.'],
  ['newMessage', 'New messages', 'Email me when a user sends a message.'],
  ['weeklySummary', 'Weekly summary', 'A digest of sales, orders and payouts every Monday.'],
];

const render = (res, tab, extra = {}) => res.render('pages/settings', {
  title: 'Settings', active: 'settings', tab, s: db.settings(), timezones: TIMEZONES, currencies: CURRENCIES, notifs: NOTIFS, errors: {}, ...extra,
});

router.get('/settings', (req, res) => render(res, TABS.includes(req.query.tab) ? req.query.tab : 'profile'));

router.post('/settings/profile', (req, res) => {
  const b = req.body;
  const email = h.str(b.email, 160).toLowerCase();
  const errors = {};
  if (!h.str(b.name)) errors.name = 'Name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (Object.keys(errors).length) return render(res.status(422), 'profile', { errors });
  const admin = db.settings().admin;
  db.setSettings({
    admin: {
      ...admin, name: h.str(b.name, 80), role: h.str(b.role, 80), email, phone: h.str(b.phone, 40),
      timezone: TIMEZONES.some(t => t[0] === b.timezone) ? b.timezone : admin.timezone,
      currency: CURRENCIES.some(c => c[0] === b.currency) ? b.currency : admin.currency,
    },
  });
  req.flash('Profile saved.' + (email !== admin.email ? ' Use your new email next time you sign in.' : ''));
  res.redirect('/settings?tab=profile');
});

router.post('/settings/company', (req, res) => {
  const b = req.body;
  db.setSettings({
    company: { name: h.str(b.name, 120), website: h.str(b.website, 200), supportEmail: h.str(b.supportEmail, 160), supportPhone: h.str(b.supportPhone, 40), address: h.str(b.address, 300) },
  });
  req.flash('Company details saved.');
  res.redirect('/settings?tab=company');
});

router.post('/settings/notifications', (req, res) => {
  db.setSettings({ notifications: Object.fromEntries(NOTIFS.map(([k]) => [k, req.body[k] === 'on'])) });
  if (req.get('accept')?.includes('application/json')) return res.json({ ok: true });
  req.flash('Notification preferences saved.');
  res.redirect('/settings?tab=notifications');
});

router.post('/settings/password', (req, res) => {
  const { current = '', next = '', confirm = '' } = req.body;
  const admin = db.settings().admin;
  const errors = {};
  if (!bcrypt.compareSync(String(current), admin.passwordHash)) errors.current = 'Current password is not correct.';
  if (String(next).length < 8) errors.next = 'Use at least 8 characters.';
  else if (next !== confirm) errors.confirm = 'Passwords do not match.';
  if (Object.keys(errors).length) return render(res.status(422), 'security', { errors });
  db.setSettings({ admin: { ...admin, passwordHash: bcrypt.hashSync(String(next), 10) } });
  req.flash('Password updated.');
  res.redirect('/settings?tab=security');
});

module.exports = router;
