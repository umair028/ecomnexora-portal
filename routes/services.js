const router = require('express').Router();
const db = require('../lib/db');
const h = require('../lib/helpers');
const { CATEGORIES, LOGOS, catalog } = require('../lib/catalog');

// same order as the website's menu; services added in the portal come after
const ORDER = catalog().map(s => s.name);
const rank = s => { const i = ORDER.indexOf(s.name); return i === -1 ? ORDER.length : i; };

const STATUSES = ['Active', 'Beta', 'Paused'];
const ICONS = ['box', 'tag', 'cart', 'store', 'truck', 'users', 'shield', 'send', 'play', 'card'];
const COLORS = ['red', 'dark', 'green', 'blue', 'amber'];

const fromBody = b => ({
  name: h.str(b.name, 80),
  category: CATEGORIES.includes(b.category) ? b.category : CATEGORIES[0],
  description: h.str(b.description, 300),
  status: STATUSES.includes(b.status) ? b.status : 'Active',
  monthlyTarget: h.optNum(b.monthlyTarget),
  roi: h.str(b.roi, 20),
  price: h.str(b.price, 40),
  url: /^https?:\/\/\S+$/i.test(h.str(b.url, 300)) ? h.str(b.url, 300) : '',
  icon: ICONS.includes(b.icon) ? b.icon : 'box',
  color: COLORS.includes(b.color) ? b.color : 'red',
  logo: LOGOS[b.logo] ? b.logo : '',
});

router.get('/services', (req, res) => {
  const users = db.all('users');
  const status = STATUSES.includes(req.query.status) ? req.query.status : '';
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : '';
  const all = db.all('services');
  const services = all
    .filter(s => (!status || s.status === status) && (!category || s.category === category))
    .sort((a, b) => rank(a) - rank(b) || String(a.createdAt).localeCompare(String(b.createdAt)))
    .map(s => {
      const members = users.filter(u => u.serviceId === s.id);
      return { ...s, userCount: members.length, balance: members.length ? h.sumBy(members, 'balance') : null };
    });
  const assigned = users.filter(u => db.get('services', u.serviceId));
  res.render('pages/services', {
    title: 'Services', active: 'services', services, status, category,
    statuses: STATUSES, categories: CATEGORIES, icons: ICONS, colors: COLORS, logos: LOGOS,
    kpi: {
      offered: all.filter(s => s.status !== 'Paused').length,
      total: all.length,
      assigned: assigned.length,
      unassigned: users.length - assigned.length,
      managed: h.compact(h.sumBy(assigned, 'balance')),
    },
    totalUsers: users.length,
  });
});

const back = req => {
  // return to the same filtered list; only ever a local /services path
  let p = (req.get('referer') || '').replace(/^https?:\/\/[^/]+/, '');
  if (req.baseUrl && p.startsWith(req.baseUrl)) p = p.slice(req.baseUrl.length);
  return /^\/services(\?[\w=&%+.-]*)?$/.test(p) ? p : '/services';
};

router.post('/services', (req, res) => {
  const data = fromBody(req.body);
  if (!data.name) { req.flash('Service name is required.', 'error'); return res.redirect(back(req)); }
  db.insert('services', data);
  req.flash(`${data.name} was added.`);
  res.redirect(back(req));
});

router.post('/services/:id', (req, res, next) => {
  const s = db.get('services', req.params.id);
  if (!s) return next();
  // the Pause/Activate menu item only sends a status
  const data = req.body.only === 'status' ? { status: STATUSES.includes(req.body.status) ? req.body.status : s.status } : fromBody(req.body);
  if (data.name === '') { req.flash('Service name is required.', 'error'); return res.redirect(back(req)); }
  db.update('services', s.id, data);
  req.flash(req.body.only === 'status' ? `${s.name} is now ${s.status.toLowerCase()}.` : 'Service updated.');
  res.redirect(back(req));
});

router.post('/services/:id/delete', (req, res, next) => {
  const s = db.get('services', req.params.id);
  if (!s) return next();
  db.remove('services', s.id);
  for (const u of db.all('users')) if (u.serviceId === s.id) u.serviceId = '';
  db.save();
  req.flash(`${s.name} was removed. Its users are now unassigned.`);
  res.redirect(back(req));
});

module.exports = router;
