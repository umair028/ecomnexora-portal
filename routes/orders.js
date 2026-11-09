const router = require('express').Router();
const db = require('../lib/db');
const h = require('../lib/helpers');

const STATUSES = ['Pending', 'In transit', 'Delivered', 'Returned'];
const PER_PAGE = 10;
const RANGES = { '7': 7, '30': 30, '90': 90, all: null };

function filtered(q) {
  const days = RANGES[q.range] === undefined ? null : RANGES[q.range];
  const since = days ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) : null;
  const term = h.str(q.q, 80).toLowerCase();
  return db.all('orders')
    .filter(o => (!q.user || o.userId === q.user) && (!since || o.date >= since))
    .filter(o => !term || [o.number, o.product].some(v => v.toLowerCase().includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
}

router.get('/orders', (req, res) => {
  const scope = filtered(req.query);
  const status = STATUSES.includes(req.query.status) ? req.query.status : '';
  const list = status ? scope.filter(o => o.status === status) : scope;
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
  const count = s => scope.filter(o => o.status === s).length;
  const transit = scope.filter(o => o.status === 'In transit');
  const users = db.all('users');
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const pendingOld = scope.filter(o => o.status === 'Pending' && h.daysUntil(o.date) <= -2).length;
  const totalUnits = h.sumBy(scope, 'units');
  const returnedUnits = h.sumBy(scope.filter(o => o.status === 'Returned'), 'units');

  res.render('pages/orders', {
    title: 'Orders', active: 'orders', statuses: STATUSES, users, userMap,
    orders: list.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    page, pages, total: list.length, status, user: req.query.user || '', range: req.query.range || 'all', q: h.str(req.query.q, 80),
    counts: { all: scope.length, ...Object.fromEntries(STATUSES.map(s => [s, count(s)])) },
    kpi: {
      total: scope.length, revenue: h.money(h.sumBy(scope, 'amount')), pending: count('Pending'), pendingOld,
      transit: transit.length, returns: count('Returned'),
      returnRate: totalUnits ? ((returnedUnits / totalUnits) * 100).toFixed(1) + '%' : '0%',
    },
    today: h.todayIso(),
  });
});

router.get('/orders/export.csv', (req, res) => {
  const rows = [['Order', 'User', 'Product', 'Date', 'Status', 'Units', 'Amount']];
  for (const o of filtered(req.query)) rows.push([o.number, db.get('users', o.userId)?.name || 'Deleted user', o.product, o.date, o.status, o.units, o.amount]);
  res.attachment('orders.csv').type('text/csv').send(h.csv(rows));
});

router.post('/orders', (req, res) => {
  const b = req.body;
  const user = db.get('users', b.userId);
  const units = Math.max(1, parseInt(b.units, 10) || 1);
  const amount = h.optNum(b.amount);
  const product = h.str(b.product, 120);
  if (!user || !product || amount === null) { req.flash('User, product and amount are required.', 'error'); return res.redirect('/orders'); }
  const max = db.all('orders').reduce((m, o) => Math.max(m, parseInt(o.number.replace(/\D/g, ''), 10) || 0), 10000);
  db.insert('orders', {
    number: `NX-${max + 1}`, userId: user.id, product, units, amount,
    status: STATUSES.includes(b.status) ? b.status : 'Pending',
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : h.todayIso(),
  });
  req.flash(`Order NX-${max + 1} created.`);
  res.redirect('/orders');
});

router.post('/orders/:id/status', (req, res, next) => {
  const o = db.get('orders', req.params.id);
  if (!o) return next();
  if (STATUSES.includes(req.body.status)) db.update('orders', o.id, { status: req.body.status });
  if (req.get('accept')?.includes('application/json')) return res.json({ ok: true, status: o.status });
  req.flash(`#${o.number} marked as ${o.status}.`);
  res.redirect(req.get('referer') || '/orders');
});

router.post('/orders/:id/delete', (req, res, next) => {
  const o = db.get('orders', req.params.id);
  if (!o) return next();
  db.remove('orders', o.id);
  req.flash(`#${o.number} was deleted.`);
  res.redirect('/orders');
});

module.exports = router;
