const router = require('express').Router();
const db = require('../lib/db');
const h = require('../lib/helpers');

const RANGES = { week: 'This week', month: 'Last 30 days', year: '12 months' };

router.get('/reports', (req, res) => {
  const range = RANGES[req.query.range] ? req.query.range : 'year';
  const users = db.all('users');
  const orders = db.all('orders');
  const trend = h.aggregateSeries(range);

  // revenue share per user for the chosen range (falls back to entered totals)
  const share = users.map(u => {
    const series = u.sales?.[range] || [];
    const amount = series.length ? series.reduce((a, p) => a + (Number(p.amount) || 0), 0) : Number(u.totals?.[range]) || 0;
    return { label: h.clientRef(u), amount };
  }).filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const revenue = share.reduce((a, x) => a + x.amount, 0);

  const products = new Map();
  for (const o of orders) {
    if (o.status === 'Returned') continue;
    const k = o.product + '|' + o.userId;
    const p = products.get(k) || { product: o.product, user: h.clientRef(db.get('users', o.userId)), units: 0, revenue: 0 };
    p.units += o.units; p.revenue += o.amount;
    products.set(k, p);
  }
  const top = [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  const sold = orders.filter(o => o.status !== 'Returned');
  const totalOrders = h.sumBy(users, 'orders');
  const totalReturns = h.sumBy(users, 'returns');

  // ---- the panels below the headline boxes ----
  const byId = new Map(users.map(u => [u.id, u]));
  const payments = db.all('payments').map(p => ({ ...p, display: h.paymentStatus(p) }));
  const salesOf = u => { const s = u.sales?.[range] || []; return s.length ? h.sumBy(s, 'amount') : Number(u.totals?.[range]) || 0; };

  // revenue by service category (this range), largest first
  const catRevenue = new Map();
  for (const u of users) { const c = h.serviceCategory(u.serviceId), v = salesOf(u); if (v > 0) catRevenue.set(c, (catRevenue.get(c) || 0) + v); }
  const categories = [...catRevenue].map(([label, amount]) => ({ label, amount, icon: h.categoryIcon(label)[0] })).sort((a, b) => b.amount - a.amount);

  // orders: by status, and by category stacked by status
  const ORDER_STATUSES = ['Delivered', 'In transit', 'Pending', 'Returned'];
  const orderStatus = ORDER_STATUSES.map(s => ({ label: s, amount: orders.filter(o => o.status === s).length }));
  const catOrders = new Map();
  for (const o of orders) {
    const c = h.serviceCategory(byId.get(o.userId)?.serviceId);
    const row = catOrders.get(c) || { label: c.replace(' Automation', '').replace(' Management', '').replace(' Commerce', ''), ...Object.fromEntries(ORDER_STATUSES.map(s => [s, 0])) };
    row[o.status] = (row[o.status] || 0) + 1;
    catOrders.set(c, row);
  }

  // payouts per month (last 12 months): paid vs still to pay (scheduled or overdue)
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: h.MONTHS[d.getMonth()] }; });
  const inMonth = (p, m) => String(p.date).slice(0, 7) === m.key;
  const paidMonthly = months.map(m => h.sumBy(payments.filter(p => p.display === 'Paid' && inMonth(p, m)), 'amount'));
  const dueMonthly = months.map(m => h.sumBy(payments.filter(p => p.display !== 'Paid' && inMonth(p, m)), 'amount'));
  const paid = payments.filter(p => p.display === 'Paid'), scheduled = payments.filter(p => p.display === 'Scheduled'), overdue = payments.filter(p => p.display === 'Overdue');
  const methods = [...new Set(payments.map(p => p.method))].map(m => { const list = payments.filter(p => p.method === m); return { label: m, count: list.length, amount: h.sumBy(list, 'amount') }; }).sort((a, b) => b.count - a.count);

  // health, delivery success, attention
  const delivered = orders.filter(o => o.status === 'Delivered').length, returned = orders.filter(o => o.status === 'Returned').length;
  const pendingOld = orders.filter(o => o.status === 'Pending' && h.daysUntil(o.date) <= -2).length;
  const unread = db.all('messages').filter(m => m.from === 'user' && !m.read).length;
  const active = users.filter(u => u.status === 'Active').length, idle = users.length - active;
  const health = [
    { label: 'Active clients', value: `${active} of ${users.length}`, state: active / users.length >= 0.8 ? 'Healthy' : 'Watch', icon: 'users', href: '/users?status=Active' },
    { label: 'Unread messages', value: unread, state: unread ? 'Reply' : 'Clear', icon: 'message', href: '/messages?filter=unread' },
    { label: 'Paused / inactive', value: idle, state: idle > users.length * 0.2 ? 'Watch' : 'Low', icon: 'userDashed', href: '/users' },
    { label: 'Pending orders', value: orderStatus[2].amount, state: pendingOld ? `${pendingOld} over 48h` : 'On time', icon: 'clock', href: '/orders?status=Pending' },
  ];

  // insights, worked out from the numbers above (HTML for the bold parts: every value in it is escaped)
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const prevMonth = trend.points.length > 1 ? trend.points[trend.points.length - 2].amount : 0, lastMonth = trend.points.length ? trend.points[trend.points.length - 1].amount : 0;
  const insights = [
    share[0] && { icon: 'user', html: `<b>${esc(share[0].label)}</b> is the top client, with ${esc(h.compact(share[0].amount))} (${((share[0].amount / (revenue || 1)) * 100).toFixed(0)}% of revenue).` },
    categories[0] && { icon: categories[0].icon, html: `<b>${esc(categories[0].label)}</b> brings in the most: ${esc(h.compact(categories[0].amount))} this period.` },
    prevMonth && range === 'year' && { icon: lastMonth >= prevMonth ? 'up' : 'down', html: `Revenue ${lastMonth >= prevMonth ? 'grew' : 'fell'} <b>${Math.abs(((lastMonth - prevMonth) / prevMonth) * 100).toFixed(1)}%</b> on the month before.` },
    overdue.length && { icon: 'alert', html: `<b>${overdue.length} payout${overdue.length > 1 ? 's' : ''}</b> overdue, ${esc(h.compact(h.sumBy(overdue, 'amount')))} in total.` },
    { icon: 'return', html: `Return rate is <b>${totalOrders ? ((totalReturns / totalOrders) * 100).toFixed(1) : 0}%</b> across ${esc(h.num(totalOrders, '0'))} reported orders.` },
  ].filter(Boolean);

  // lists
  const recentOrders = [...orders].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)).slice(0, 7)
    .map(o => ({ ...o, client: h.clientRef(byId.get(o.userId)) }));
  const clientStatus = [...users].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 6);
  const upcoming = scheduled.concat(overdue).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5).map(p => ({ ...p, client: h.clientRef(byId.get(p.userId)) }));
  const productTotals = new Map();
  for (const o of sold) productTotals.set(o.product, (productTotals.get(o.product) || 0) + o.amount);
  const topProducts = [...productTotals].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount).slice(0, 7);
  const catBalance = new Map();
  for (const u of users) { const c = h.serviceCategory(u.serviceId); catBalance.set(c, (catBalance.get(c) || 0) + (Number(u.balance) || 0)); }

  res.render('pages/reports', {
    title: 'Reports', active: 'reports', range, ranges: RANGES, trend, share, top,
    categories, orderStatus, catOrders: [...catOrders.values()], ORDER_STATUSES,
    payouts: {
      labels: months.map(m => m.label), paidMonthly, dueMonthly,
      count: payments.length, paidCount: paid.length, dueCount: scheduled.length + overdue.length,
      paidTotal: h.compact(h.sumBy(paid, 'amount')), dueTotal: h.compact(h.sumBy(scheduled.concat(overdue), 'amount')),
    },
    attention: { overdue: overdue.length, overdueTotal: h.money(h.sumBy(overdue, 'amount')), overdueClients: new Set(overdue.map(p => p.userId)).size, pendingOld, pending: orderStatus[2].amount },
    methods, health, insights,
    delivery: delivered + returned ? Math.round((delivered / (delivered + returned)) * 100) : 0, delivered, returned,
    recentOrders, clientStatus, upcoming, topProducts,
    catBalance: [...catBalance].map(([label, amount]) => ({ label: label.replace(' Automation', '').replace(' Management', ''), amount })).sort((a, b) => b.amount - a.amount),
    daily: h.aggregateSeries('month').points.slice(-30),   // clients entered different spans: the latest 30 days
    kpi: {
      revenue: h.compact(revenue),
      contributors: trend.contributors,
      balance: h.compact(h.sumBy(users, 'balance')),
      aov: sold.length ? h.money(h.sumBy(sold, 'amount') / sold.length, { cents: true }) : '—',
      orderCount: sold.length,
      returnRate: totalOrders ? ((totalReturns / totalOrders) * 100).toFixed(1) + '%' : '0%',
      returns: totalReturns,
    },
    totalUsers: users.length,
  });
});

router.get('/reports/sales.csv', (req, res) => {
  const range = RANGES[req.query.range] ? req.query.range : 'year';
  const rows = [['User', 'Label', 'Amount']];
  for (const u of db.all('users')) for (const p of u.sales?.[range] || []) rows.push([u.name, p.label, p.amount]);
  res.attachment(`sales-${range}.csv`).type('text/csv').send(h.csv(rows));
});

module.exports = router;
