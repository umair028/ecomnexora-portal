const router = require('express').Router();
const db = require('../lib/db');
const h = require('../lib/helpers');
const integrations = require('../lib/integrations');

// Business accounts from the form (acc_platform[] / acc_url[] / acc_token[]). A blank token keeps the saved one.
const list = v => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
function accountsFromBody(b, previous = []) {
  const urls = list(b.acc_url), platforms = list(b.acc_platform), tokens = list(b.acc_token);
  return urls.map((raw, i) => {
    const url = h.str(raw, 300);
    if (!url) return null;
    const platform = integrations.PLATFORMS[platforms[i]] ? platforms[i] : integrations.detect(url);
    const old = previous.find(a => a.url === url) || {};
    const token = h.str(tokens[i], 200) || (old.platform === platform ? old.token : '') || '';
    return { platform, url: /^https?:\/\//i.test(url) ? url : 'https://' + url, token, status: old.status || 'pending', message: old.message || '', lastSync: old.lastSync || null, meta: old.meta || {} };
  }).filter(Boolean).slice(0, 4);
}

// Fetch every connected account and merge the results into the client. Returns a short summary for the toast.
async function syncUser(id) {
  const user = db.get('users', id);
  if (!user || !(user.accounts || []).length) return '';
  const results = await Promise.all(user.accounts.map(a => integrations.sync(a)));
  const accounts = user.accounts.map((a, i) => ({ ...a, status: results[i].status, message: results[i].message || '', meta: results[i].meta || a.meta || {}, lastSync: results[i].status === 'synced' ? new Date().toISOString() : a.lastSync }));
  const patched = integrations.applyPatches({ ...user }, results.filter(r => r.status === 'synced'));
  // fill the store / channel name only if it was left empty
  const named = results.find(r => r.status === 'synced' && r.meta?.title);
  db.update('users', id, { ...patched, accounts, storeName: user.storeName || named?.meta.title || '' });
  const synced = results.filter(r => r.status === 'synced').length;
  return synced ? ` Data synced from ${synced} account${synced > 1 ? 's' : ''}.` : results.some(r => r.status === 'error') ? ' One or more accounts could not be synced — see Business accounts.' : '';
}

const STATUSES = ['Active', 'Paused', 'Inactive'];

const MONETIZATION = ['Monetized', 'Under review', 'Not yet eligible', 'Demonetized'];
const UPLOAD_STATUS = ['Published', 'Scheduled', 'Private'];

// "Title | 2026-10-02 | 48200 | 12:34 | Published" per line → upload rows
function parseUploads(text = '') {
  return String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const [title, date, views, length, status] = line.split('|').map(s => s.trim());
    if (!title) return null;
    return {
      title: title.slice(0, 120), date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : h.todayIso(),
      views: h.optNum((views || '').replace(/,/g, '')), length: /^\d{1,2}:\d{2}(:\d{2})?$/.test(length || '') ? length : '',
      status: UPLOAD_STATUS.find(s => s.toLowerCase() === String(status || '').toLowerCase()) || 'Published',
    };
  }).filter(Boolean).slice(0, 30);
}
const uploadsToText = (list = []) => list.map(u => [u.title, u.date, u.views ?? '', u.length, u.status].join(' | ')).join('\n');

// YouTube channel stats (last 28 days). Blank views fall back to the sum of the daily views.
function channelFromBody(b) {
  const daily = h.parseSeries(b.chDaily);
  const c = {
    views: h.optNum(b.chViews), watchHours: h.optNum(b.chWatch), subscribers: h.optNum(b.chSubs), comments: h.optNum(b.chComments), daily,
    totalSubscribers: h.optNum(b.chTotalSubs), ctr: h.optNum(b.chCtr),
    monetization: MONETIZATION.includes(b.chMonetization) ? b.chMonetization : null,
    uploads: parseUploads(b.chUploads),
  };
  if (c.views === null && daily.length) c.views = h.sumBy(daily, 'amount');
  return daily.length || c.uploads.length || c.monetization || ['views', 'watchHours', 'subscribers', 'comments', 'totalSubscribers', 'ctr'].some(k => c[k] !== null) ? c : null;
}

// Figures for the YouTube channel layout. Everything is worked out from entered data; missing → null ("—").
function channelSummary(user, userOrders) {
  const ch = user.channel || {};
  const views = Number(ch.views) || 0;
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const revenue30 = (user.sales?.month || []).length ? h.sumBy(user.sales.month, 'amount') : (h.isNum(user.totals?.month) ? Number(user.totals.month) : null);
  const since = days => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
  const uploads = (ch.uploads || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const recentDeals = userOrders.filter(o => o.date >= since(30) && o.status !== 'Returned');
  const income = re => { const list = recentDeals.filter(o => re.test(o.product)); return list.length ? h.sumBy(list, 'amount') : 0; };
  const split = { ads: revenue30 || 0, memberships: income(/membership/i), sponsorships: income(/sponsor|brand/i), affiliate: income(/affiliate/i) };
  const splitTotal = split.ads + split.memberships + split.sponsorships + split.affiliate;
  return {
    totalSubscribers: h.isNum(ch.totalSubscribers) ? Number(ch.totalSubscribers) : null,
    avgViewDuration: views && h.isNum(ch.watchHours) ? mmss((ch.watchHours * 3600) / views) : null,
    ctr: h.isNum(ch.ctr) ? Number(ch.ctr) : null,
    rpm: views && revenue30 ? (revenue30 / (views * 30 / 28)) * 1000 : null,
    uploads28: uploads.filter(u => u.status !== 'Scheduled' && u.date >= since(28)).length,
    scheduled: uploads.filter(u => u.status === 'Scheduled').length,
    uploads: uploads.slice(0, 6),
    monetization: ch.monetization || null,
    split: splitTotal > 0 ? split : null, splitTotal,
    deals: userOrders.slice(0, 6),
  };
}

function formFromBody(b, prev = []) {
  const sales = { week: h.parseSeries(b.salesWeek), month: h.parseSeries(b.salesMonth), year: h.parseSeries(b.salesYear) };
  return {
    name: h.str(b.name, 80),
    storeName: h.str(b.storeName, 120),
    storeLink: h.str(b.storeLink, 300),
    email: h.str(b.email, 160),
    phone: h.str(b.phone, 40),
    country: h.str(b.country, 80),
    serviceId: db.get('services', b.serviceId) ? b.serviceId : '',
    status: STATUSES.includes(b.status) ? b.status : 'Active',
    joinDate: /^\d{4}-\d{2}-\d{2}$/.test(b.joinDate || '') ? b.joinDate : '',
    salesToday: h.optNum(b.salesToday),
    unitsToday: h.optNum(b.unitsToday),
    balance: h.optNum(b.balance),
    nextPayment: /^\d{4}-\d{2}-\d{2}$/.test(b.nextPayment || '') ? b.nextPayment : '',
    orders: h.optNum(b.orders),
    returns: h.optNum(b.returns),
    communications: h.optNum(b.communications),
    investment: h.optNum(b.investment),
    sales,
    // blank totals fall back to the sum of the entered bars
    totals: Object.fromEntries(['week', 'month', 'year'].map(k => {
      const given = h.optNum(b['total' + k[0].toUpperCase() + k.slice(1)]);
      return [k, given !== null ? given : sales[k].length ? h.sumBy(sales[k], 'amount') : null];
    })),
    change: { week: h.optNum(b.changeWeek), month: h.optNum(b.changeMonth), year: h.optNum(b.changeYear) },
    channel: channelFromBody(b),
    accounts: accountsFromBody(b, prev),
  };
}

function validate(u) {
  const errors = {};
  if (!u.name) errors.name = 'Name is required.';
  if (u.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) errors.email = 'Enter a valid email address.';
  if (u.storeLink && !/^https?:\/\/\S+$/i.test(u.storeLink)) errors.storeLink = 'Link must start with http:// or https://';
  return errors;
}

const formView = (res, opts) => res.render('pages/user-form', {
  active: opts.user?.id ? 'users' : 'add', services: db.all('services'), statuses: STATUSES, monetizations: MONETIZATION, uploadsToText,
  platforms: integrations.publicInfo(), errors: {}, ...opts,
});

router.get('/users', (req, res) => {
  // privacy: rows carry only the Client ID, category and non-identifying fields (names stay server-side)
  const users = db.all('users').map(u => ({
    id: u.id, clientId: h.clientRef(u), category: h.serviceCategory(u.serviceId), serviceId: u.serviceId || '',
    status: u.status, country: u.country, salesToday: u.salesToday, balance: u.balance, orders: u.orders,
  }));
  const categories = [...new Set(db.all('services').map(s => h.serviceCategory(s.id)))].sort().concat('Unassigned');
  // ?service=<id> (from the Services page) filters one service; ?service=none → Unassigned; ?category=… → a category
  const svc = db.get('services', req.query.service);
  res.render('pages/users', {
    title: 'Users', active: 'users', users, categories, statuses: STATUSES,
    q: h.str(req.query.q, 80), status: req.query.status || '',
    category: req.query.service === 'none' ? 'Unassigned' : (categories.includes(req.query.category) ? req.query.category : ''),
    serviceFilter: svc ? { id: svc.id, label: h.serviceCategory(svc.id) + ' · selected service' } : null,
  });
});

router.get('/users/new', (req, res) => formView(res, { title: 'Add user', user: { status: 'Active', sales: {}, totals: {}, change: {} } }));

router.post('/users', async (req, res) => {
  const data = formFromBody(req.body);
  const errors = validate(data);
  if (Object.keys(errors).length) return formView(res.status(422), { title: 'Add user', user: data, errors });
  const user = db.insert('users', { ...data, clientNo: db.nextClientNo() });
  req.flash(`${h.clientLabel(user)} was added.`  + await syncUser(user.id));
  res.redirect('/users/' + user.id);
});

router.get('/users/export.csv', (req, res) => {
  const rows = [['Name', 'Store', 'Email', 'Phone', 'Country', 'Service', 'Status', 'Joined', 'Sales today', 'Balance', 'Orders', 'Returns', 'Investment']];
  for (const u of db.all('users')) {
    rows.push([u.name, u.storeName, u.email, u.phone, u.country, h.serviceName(u.serviceId), u.status, u.joinDate, u.salesToday, u.balance, u.orders, u.returns, u.investment]);
  }
  res.attachment('users.csv').type('text/csv').send(h.csv(rows));
});

router.get('/users/:id', (req, res, next) => {
  const user = db.get('users', req.params.id);
  if (!user) return next();
  // open on the first period that has actual sales (30 days, then 12 months, then week)
  const hasSales = r => (user.sales?.[r] || []).some(p => Number(p.amount) > 0);
  const range = ['week', 'month', 'year'].includes(req.query.range) ? req.query.range
    : ['month', 'year', 'week'].find(hasSales) || (user.sales?.month?.length ? 'month' : user.sales?.year?.length ? 'year' : 'week');
  const service = h.serviceName(user.serviceId);
  const userOrders = db.all('orders').filter(o => o.userId === user.id).sort((a, b) => b.date.localeCompare(a.date));
  const isChannel = !!user.channel || /youtube/i.test(service);
  res.render('pages/user', {
    title: h.clientLabel(user), active: 'users', user, range, service,
    recentOrders: userOrders.slice(0, 5),
    isChannel, yt: isChannel ? channelSummary(user, userOrders) : null,
  });
});

router.get('/users/:id/edit', (req, res, next) => {
  const user = db.get('users', req.params.id);
  if (!user) return next();
  formView(res, { title: 'Edit ' + h.clientLabel(user), user });
});

router.post('/users/:id', async (req, res, next) => {
  const existing = db.get('users', req.params.id);
  if (!existing) return next();
  const data = formFromBody(req.body, existing.accounts || []);
  const errors = validate(data);
  if (Object.keys(errors).length) return formView(res.status(422), { title: 'Edit ' + h.clientLabel(existing), user: { ...data, id: existing.id }, errors });
  db.update('users', existing.id, data);
  req.flash('Changes saved.' + await syncUser(existing.id));
  res.redirect('/users/' + existing.id);
});

// Sync now (profile button)
router.post('/users/:id/sync', async (req, res, next) => {
  const user = db.get('users', req.params.id);
  if (!user) return next();
  const summary = await syncUser(user.id);
  req.flash(summary.trim() || 'Nothing to sync yet — connected accounts are waiting for API access.', summary.includes('could not') ? 'error' : 'success');
  res.redirect('/users/' + user.id);
});

// Live preview for the form's "Fetch data" button (nothing is saved). Uses the saved token if none is typed.
router.post('/api/integrations/preview', async (req, res) => {
  const url = h.str(req.body.url, 300);
  if (!url) return res.status(400).json({ status: 'error', message: 'Paste a link first.' });
  const platform = integrations.PLATFORMS[req.body.platform] ? req.body.platform : integrations.detect(url);
  let token = h.str(req.body.token, 200);
  if (!token && req.body.userId) token = (db.get('users', req.body.userId)?.accounts || []).find(a => a.url.replace(/^https?:\/\//, '') === url.replace(/^https?:\/\//, ''))?.token || '';
  const r = await integrations.sync({ platform, url, token });
  res.json({ platform, status: r.status, message: r.message, preview: r.preview || null });
});

router.post('/users/:id/delete', (req, res, next) => {
  const user = db.get('users', req.params.id);
  if (!user) return next();
  db.remove('users', user.id);
  db.removeWhere('messages', m => m.userId === user.id);
  req.flash(`${h.clientLabel(user)} was deleted.`);
  res.redirect('/users');
});

module.exports = router;
