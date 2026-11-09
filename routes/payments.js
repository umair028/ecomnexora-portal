const router = require('express').Router();
const db = require('../lib/db');
const h = require('../lib/helpers');

const METHODS = ['Bank transfer', 'Payoneer', 'Wise', 'PayPal', 'Other'];
const VIEWS = ['Paid', 'Scheduled', 'Overdue'];

const withStatus = () => db.all('payments').map(p => ({ ...p, display: h.paymentStatus(p) }));

router.get('/payments', (req, res) => {
  const all = withStatus();
  const users = db.all('users');
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const now = new Date();
  const monthKey = d => d.slice(0, 7);
  const thisMonth = h.todayIso().slice(0, 7);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const paid = all.filter(p => p.display === 'Paid');
  const paidThis = h.sumBy(paid.filter(p => monthKey(p.date) === thisMonth), 'amount');
  const paidLast = h.sumBy(paid.filter(p => monthKey(p.date) === lastMonth), 'amount');
  const upcoming = all.filter(p => p.display === 'Scheduled' && h.daysUntil(p.date) <= 30);
  const overdue = all.filter(p => p.display === 'Overdue');

  // last 9 months of paid + scheduled totals
  const chart = [];
  for (let i = 8; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = all.filter(p => monthKey(p.date) === key);
    chart.push({
      label: h.MONTHS[d.getMonth()],
      paid: h.sumBy(inMonth.filter(p => p.display === 'Paid'), 'amount'),
      scheduled: h.sumBy(inMonth.filter(p => p.display !== 'Paid'), 'amount'),
    });
  }

  const view = VIEWS.includes(req.query.status) ? req.query.status : '';
  const history = all.filter(p => !view || p.display === view).sort((a, b) => b.date.localeCompare(a.date));
  const change = paidLast ? Math.round(((paidThis - paidLast) / paidLast) * 100) : null;

  res.render('pages/payments', {
    title: 'Payments', active: 'payments', users, userMap, methods: METHODS, view,
    history: history.slice(0, req.query.all ? 1000 : 10), historyTotal: history.length, showAll: !!req.query.all, chart,
    upcoming: [...overdue, ...upcoming.sort((a, b) => a.date.localeCompare(b.date))].slice(0, 6),
    kpi: {
      paidThis: h.money(paidThis), change,
      scheduled: h.money(h.sumBy(upcoming, 'amount')), scheduledCount: upcoming.length,
      overdue: h.money(h.sumBy(overdue, 'amount')), overdueCount: overdue.length,
      overdueNames: (ids => ids.length > 3 ? ids.slice(0, 3).join(', ') + ' +' + (ids.length - 3) + ' more' : ids.join(', '))([...new Set(overdue.map(p => userMap[p.userId]).filter(Boolean).map(h.clientRef))]),
      balance: h.compact(h.sumBy(users, 'balance')), userCount: users.length,
    },
    today: h.todayIso(),
  });
});

router.get('/payments/export.csv', (req, res) => {
  const rows = [['Reference', 'User', 'Method', 'Date', 'Status', 'Amount', 'Note']];
  for (const p of withStatus().sort((a, b) => b.date.localeCompare(a.date))) {
    rows.push([p.ref, db.get('users', p.userId)?.name || 'Deleted user', p.method, p.date, p.display, p.amount, p.note]);
  }
  res.attachment('payments.csv').type('text/csv').send(h.csv(rows));
});

router.post('/payments', (req, res) => {
  const b = req.body;
  const user = db.get('users', b.userId);
  const amount = h.optNum(b.amount);
  if (!user || amount === null || amount <= 0) { req.flash('Choose a user and enter an amount.', 'error'); return res.redirect('/payments'); }
  const max = db.all('payments').reduce((m, p) => Math.max(m, parseInt(p.ref.replace(/\D/g, ''), 10) || 0), 2000);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : h.todayIso();
  db.insert('payments', {
    ref: `PAY-${max + 1}`, userId: user.id, amount,
    method: METHODS.includes(b.method) ? b.method : 'Bank transfer',
    status: b.status === 'Scheduled' ? 'Scheduled' : 'Paid', date, note: h.str(b.note, 200),
  });
  if (b.status === 'Scheduled' && (!user.nextPayment || date < user.nextPayment || user.nextPayment < h.todayIso())) {
    db.update('users', user.id, { nextPayment: date });
  }
  req.flash(`Payment PAY-${max + 1} recorded.`);
  res.redirect('/payments');
});

router.post('/payments/:id/paid', (req, res, next) => {
  const p = db.get('payments', req.params.id);
  if (!p) return next();
  db.update('payments', p.id, { status: 'Paid', date: h.todayIso() });
  req.flash(`${p.ref} marked as paid.`);
  res.redirect(req.get('referer') || '/payments');
});

router.post('/payments/:id/delete', (req, res, next) => {
  const p = db.get('payments', req.params.id);
  if (!p) return next();
  db.remove('payments', p.id);
  req.flash(`${p.ref} was deleted.`);
  res.redirect('/payments');
});

module.exports = router;
