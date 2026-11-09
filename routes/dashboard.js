const router = require('express').Router();
const db = require('../lib/db');
const h = require('../lib/helpers');

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

// The last 12 calendar months, oldest first: { key: '2026-10', label: 'Oct' }
function lastMonths(n = 12) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: h.MONTHS[d.getMonth()] };
  });
}

// Latest events across the portal, newest first. Clients appear by Client ID only.
// `text` is HTML (bold parts): every value in it is escaped.
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function recentActivity(users, orders, payments, messages) {
  const byId = new Map(users.map(u => [u.id, u]));
  const ref = id => esc(h.clientRef(byId.get(id)));
  const newest = (list, n) => list.filter(x => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, n);
  // the newest few of each kind, so one busy kind (a batch of orders) doesn't push the others out
  const items = [
    ...newest(users.map(u => ({ at: u.createdAt, icon: 'plus', tone: 'red', href: `/users/${u.id}`, text: `New client <b>${esc(h.clientRef(u))}</b> added to ${esc(h.serviceCategory(u.serviceId))}` })), 3),
    ...newest(payments.filter(p => p.display === 'Paid').map(p => ({ at: p.updatedAt || p.date, icon: 'wallet', tone: 'green', href: '/payments?status=Paid', text: `Payout of <b>${esc(h.money(p.amount))}</b> paid to ${ref(p.userId)}` })), 3),
    ...newest(payments.filter(p => p.display === 'Overdue').map(p => ({ at: p.date, icon: 'alert', tone: 'amber', href: '/payments?status=Overdue', text: `Payout of <b>${esc(h.money(p.amount))}</b> to ${ref(p.userId)} is overdue` })), 2),
    ...newest(orders.map(o => ({ at: o.updatedAt || o.createdAt, icon: { Delivered: 'check', 'In transit': 'truck', Returned: 'return' }[o.status] || 'cart', tone: o.status === 'Returned' ? 'amber' : 'dark', href: `/orders?q=${encodeURIComponent(o.number)}`, text: `Order <b>#${esc(o.number)}</b> ${esc(String(o.status).toLowerCase())} for ${ref(o.userId)}` })), 3),
    ...newest(messages.filter(m => m.from === 'user').map(m => ({ at: m.at, icon: 'message', tone: 'blue', href: `/messages?u=${m.userId}`, text: `New message from <b>${ref(m.userId)}</b>` })), 3),
  ];
  return newest(items, 12);
}

router.get('/', (req, res) => {
  const users = db.all('users'), orders = db.all('orders'), messages = db.all('messages');
  const payments = db.all('payments').map(p => ({ ...p, display: h.paymentStatus(p) }));
  const services = db.all('services');
  const trend = h.aggregateSeries('year');
  const byBalance = [...users].sort((a, b) => (b.balance || 0) - (a.balance || 0));

  // Revenue stats: client sales (12-month series entered per client) and payouts paid / overdue, per month
  const months = lastMonths(12);
  const salesByMonth = new Map(trend.points.map(p => [p.label, p.amount]));
  const payoutsIn = status => months.map(m => h.sumBy(payments.filter(p => p.display === status && String(p.date).slice(0, 7) === m.key), 'amount'));
  const stats = {
    type: 'multi', height: 300,
    labels: months.map(m => m.label),
    series: [
      { key: 'sales', label: 'Client sales', color: '#ff3131', on: true, values: months.map(m => salesByMonth.get(m.label) || 0) },
      { key: 'paid', label: 'Payouts paid', color: '#12a35f', on: true, values: payoutsIn('Paid') },
      { key: 'overdue', label: 'Payouts overdue', color: '#f08c1a', on: false, values: payoutsIn('Overdue') },
    ],
    empty: 'No sales or payouts yet.',
  };

  // At a glance: three health rings
  const delivered = orders.filter(o => o.status === 'Delivered').length;
  const paid = payments.filter(p => p.display === 'Paid').length, overdue = payments.filter(p => p.display === 'Overdue').length;
  const active = users.filter(u => u.status === 'Active').length;
  const glance = [
    { label: 'Active clients', value: pct(active, users.length), color: '#ff3131', href: '/users?status=Active' },
    { label: 'Orders delivered', value: pct(delivered, orders.length), color: '#f08c1a', href: '/orders?status=Delivered' },
    { label: 'Payouts on time', value: pct(paid, paid + overdue), color: '#12a35f', href: '/payments' },
  ];

  // Services: each with its platform logo and how many clients use it
  const clientsOf = id => users.filter(u => u.serviceId === id).length;
  const serviceCards = services.map(s => ({ ...s, clients: clientsOf(s.id) })).sort((a, b) => b.clients - a.clients);

  res.render('pages/dashboard', {
    title: 'Dashboard',
    active: 'dashboard',
    kpi: {
      balance: h.compact(h.sumBy(users, 'balance')),
      users: users.length, activeUsers: active,
      sales: h.compact(h.sumBy(users, 'salesToday')),
      orders: h.num(h.sumBy(users, 'orders'), '0'),
      pending: orders.filter(o => o.status === 'Pending').length,
    },
    stats, trend,
    totalUsers: users.length,
    glance,
    activity: recentActivity(users, orders, payments, messages),
    top: byBalance.slice(0, 8),
    serviceCards,
    balanceChart: byBalance.map(u => ({ label: h.clientRef(u), amount: Number(u.balance) || 0 })),
  });
});

// Quick search used by the top search bar dropdown
// Matching runs here (names, stores, emails never reach the browser); results show only Client IDs.
router.get('/api/search', (req, res) => {
  const q = h.str(req.query.q, 80).toLowerCase();
  if (!q) return res.json([]);
  const matches = db.all('users').filter(u =>
    [h.clientId(u), u.name, u.storeName, u.email, h.serviceName(u.serviceId), h.serviceCategory(u.serviceId)].some(v => String(v || '').toLowerCase().includes(q))
  );
  if (req.query.ids) return res.json(matches.map(u => u.id)); // Users page: ids of every match
  res.json(matches.slice(0, 6).map(u => ({
    id: u.id, name: h.clientRef(u), initials: h.categoryInitials(u.serviceId),
    sub: [h.serviceCategory(u.serviceId), h.ANON_SUB].join(' · '), status: u.status,
  })));
});

module.exports = router;
