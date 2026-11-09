// End-to-end smoke test: starts the app on a throwaway database, signs in,
// opens every page and exercises every form action. Run with `npm test`.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3999;
const ORIGIN = `http://localhost:${PORT}`;
let SUB = ''; // BASE_PATH under test, e.g. '/portal'
let DB;
const EMAIL = 'admin@ecomnexora.com';
const PASSWORD = 'smoke-test-pass';

let cookie = '';
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}`); if (!cond) failures++; };

async function req(method, url, body, { json = false } = {}) {
  const headers = { cookie };
  let payload;
  if (body && json) { headers['content-type'] = 'application/json'; headers.accept = 'application/json'; payload = JSON.stringify(body); }
  else if (body) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
  const r = await fetch(ORIGIN + SUB + url, { method, headers, body: payload, redirect: 'manual' });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await r.text();
  let location = r.headers.get('location');
  if (location && SUB && location.startsWith(SUB)) location = location.slice(SUB.length) || '/';
  return { status: r.status, location, text };
}
const get = url => req('GET', url);
const post = (url, body, o) => req('POST', url, body, o);
const page = async (url, mustContain) => {
  const r = await get(url);
  ok(r.status === 200 && (!mustContain || r.text.includes(mustContain)), `GET ${url} → ${r.status}${mustContain ? ` (has “${mustContain}”)` : ''}`);
  return r.text;
};
const firstId = (html, re) => (html.match(re) || [])[1];

async function main(sub) {
  SUB = sub; cookie = '';
  DB = path.join(os.tmpdir(), `nexora-test-${Date.now()}.json`);
  console.log(`\n=== Portal at "${sub || '/'}" ===`);
  const env = { ...process.env, PORT: String(PORT), DB_FILE: DB, BASE_PATH: sub, ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: 'test' };
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let errLog = '';
  srv.stderr.on('data', d => (errLog += d));
  await new Promise((res, rej) => {
    srv.stdout.on('data', d => d.toString().includes('running') && res());
    setTimeout(() => rej(new Error('server did not start\n' + errLog)), 8000);
  });

  try {
    console.log('Auth');
    ok((await get('/')).location?.startsWith('/login'), 'signed-out visitor is sent to /login');
    await page('/login', 'Welcome back');
    ok((await post('/login', { email: EMAIL, password: 'wrong' })).status === 401, 'wrong password is rejected');
    ok((await post('/login', { email: EMAIL, password: PASSWORD, next: '/' })).location === '/', 'correct password signs in');
    await page('/forgot-password', 'Reset password');

    console.log('Pages');
    const dash = await page('/', 'Users overview');
    ok(dash.includes(`href="${SUB}/users"`) && dash.includes(`${SUB}/css/app.css`), `links and assets use "${SUB || '/'}"`);
    ok((await get('/css/app.css')).text.includes('--red:#ff3131'), 'stylesheet is served with brand colours');
    const users = await page('/users', 'Client ID');
    ok(/>(AW|AP|AD|WA|SD|TS|FM|VA|AR|EP|YA|AWJ|APJ|SDJ|SPJ|CL)-1\d{3}</.test(users), 'users list shows client IDs like WA-1002');
    ok(JSON.parse((await get('/api/search?q=aw-1001')).text).length === 1, 'search finds a client by ID');
    await page('/users/new', 'Add user');
    await page('/services', 'Amazon Wholesale FBA');
    await page('/orders', 'Orders');
    await page('/orders?status=Pending', 'Pending');
    await page('/orders?page=2', 'Showing 11');
    await page('/payments', 'Upcoming payments');
    await page('/payments?status=Overdue', 'Overdue');
    for (const r of ['week', 'month', 'year']) await page('/reports?range=' + r, 'Reports');
    await page('/messages', 'Messages');
    await page('/messages?filter=unread', 'Messages');
    for (const t of ['profile', 'company', 'notifications', 'security']) await page('/settings?tab=' + t, 'Settings');
    await page('/help', 'How can we help?');
    ok((await get('/nope')).status === 404, 'unknown page returns 404');
    const search = JSON.parse((await get('/api/search?q=client')).text);
    ok(search.length === 6, `search API finds 6 clients (got ${search.length})`);

    console.log('Users');
    const id1 = firstId(users, /data-href="(?:\/portal)?\/users\/([a-f0-9]+)"/);
    await page('/users/' + id1, 'Revenue trend');
    await page(`/users/${id1}/edit`, 'Edit user');
    ok((await post('/users', { name: '' })).status === 422, 'add user without a name shows an error');
    const created = await post('/users', { name: 'Smoke Test User', storeName: 'Secret Store Co', storeLink: 'https://secretstoreco.example', email: 'smoke@example.com', balance: '1234', status: 'Active', salesMonth: 'Day 1, 100\nDay 2, 250' });
    ok(created.status === 302 && /\/users\/[a-f0-9]+$/.test(created.location), 'add user saves and redirects to profile');
    const newId = created.location.split('/').pop();
    const prof = await page(created.location, 'Client ');
    ok(/<h1>[A-Z]{2,3}-1\d{3} /.test(prof) && !/<h1>Client /.test(prof), 'profile heading is just the Client ID');
    const cid = prof.match(/<h1>([A-Z]{2,3}-1\d{3}) /)[1];
    ok(!/Smoke Test User|Secret Store Co|secretstoreco|smoke@example\.com/.test(prof), 'profile hides name, store, link and email');
    ok((await get(created.location + '/edit')).text.includes('Smoke Test User'), 'name is still stored (shown in the Edit form)');
    ok(prof.includes('$1.23K'), 'profile shows the saved balance');
    ok((await post('/users/' + newId, { name: 'Smoke Renamed', status: 'Paused' })).location === '/users/' + newId, 'edit user saves');
    ok(!(await get('/users/' + newId)).text.includes('Smoke Renamed'), 'renamed client is still hidden on the profile');
    await page('/users/' + newId + '/edit', 'Smoke Renamed');
    ok((await post(`/users/${newId}`, { name: 'x', email: 'not-an-email' })).status === 422, 'invalid email is rejected');

    // YouTube Automation client: channel layout instead of store layout
    const ytSvc = firstId((await get('/users/new')).text, /<option value="([a-f0-9]+)"[^>]*>YouTube Automation</);
    const yt = await post('/users', { name: 'Smoke Channel', serviceId: ytSvc, chViews: '50000', chWatch: '4000', chSubs: '300', chTotalSubs: '12000', chCtr: '6.4', chMonetization: 'Monetized', chUploads: 'Test video one | 2026-10-01 | 12000 | 9:30 | Published', chDaily: 'Oct 1, 1800\nOct 2, 2100' });
    const ytPage = await page(yt.location, 'Recent uploads');
    ok(ytPage.includes('Channel overview') && ytPage.includes('Test video one') && !ytPage.includes('Recent orders') && !ytPage.includes('Units today'), 'YouTube client gets the channel layout');
    ok((await get(yt.location + '/edit')).text.includes('Test video one | 2026-10-01 | 12000 | 9:30 | Published'), 'uploads round-trip through the Edit form');
    await post(yt.location + '/delete', {});

    console.log('Services');
    ok((await post('/services', { name: 'Smoke Service', category: 'Just In Time', status: 'Beta', monthlyTarget: '5000', roi: '10%', price: '$99', url: 'https://ecomnexora.com/x', icon: 'play', color: 'dark' })).location === '/services', 'create service');
    ok((await get('/services?category=Just%20In%20Time')).text.includes('Smoke Service'), 'service shows under its category');
    ok((await get('/services')).text.includes('Account Reinstatement'), 'website services are listed');
    let svc = await page('/services', 'Smoke Service');
    const svcId = firstId(svc, /action="(?:\/portal)?\/services\/([a-f0-9]+)\/delete"[^>]*Smoke Service/) || firstId(svc.slice(svc.indexOf('Smoke Service') - 3000), /action="(?:\/portal)?\/services\/([a-f0-9]+)\/delete"/);
    ok(!!svcId, 'found new service id');
    ok((await post('/services/' + svcId, { name: 'Smoke Service 2', status: 'Paused' })).location === '/services', 'edit service');
    await page('/services', 'Smoke Service 2');
    ok((await post(`/services/${svcId}/delete`, {})).location === '/services', 'delete service');
    await get('/services'); // first load shows the "was removed" toast
    ok(!(await get('/services')).text.includes('Smoke Service 2'), 'service is gone');

    console.log('Orders');
    ok((await post('/orders', { userId: newId, product: 'Smoke Widget', units: '2', amount: '19.99', status: 'Pending' })).location === '/orders', 'create order');
    const orders = await page('/orders?q=Smoke', 'Smoke Widget');
    const orderId = firstId(orders, /action="(?:\/portal)?\/orders\/([a-f0-9]+)\/status"/);
    ok((await post(`/orders/${orderId}/status`, { status: 'Delivered' })).status === 302, 'change order status');
    ok((await get('/orders?q=Smoke&status=Delivered')).text.includes('Smoke Widget'), 'order now shows as delivered');
    ok((await get('/orders/export.csv')).text.startsWith('Order,User'), 'orders CSV export');
    ok((await post(`/orders/${orderId}/delete`, {})).location === '/orders', 'delete order');

    console.log('Payments');
    ok((await post('/payments', { userId: newId, amount: '500', status: 'Scheduled', method: 'Wise', date: '2099-01-01' })).location === '/payments', 'record scheduled payment');
    const pays = await page('/payments?status=Scheduled', cid);
    ok(!pays.includes('Smoke Renamed'), 'payments list shows the Client ID, not the name');
    const payId = firstId(pays.slice(pays.indexOf('Payment history')), /action="(?:\/portal)?\/payments\/([a-f0-9]+)\/paid"/);
    ok((await post(`/payments/${payId}/paid`, {})).status === 302, 'mark payment paid');
    ok((await get('/payments/export.csv')).text.startsWith('Reference'), 'payments CSV export');
    ok((await post(`/payments/${payId}/delete`, {})).location === '/payments', 'delete payment');

    console.log('Reports & exports');
    ok((await get('/reports/sales.csv?range=year')).text.startsWith('User,Label'), 'sales CSV export');
    ok((await get('/users/export.csv')).text.includes('Smoke Renamed'), 'users CSV export');

    console.log('Messages');
    const sent = await post('/messages', { userId: newId, body: 'Hello from the smoke test' }, { json: true });
    ok(sent.status === 200 && JSON.parse(sent.text).body === 'Hello from the smoke test', 'send message (AJAX)');
    await page('/messages?u=' + newId, 'Hello from the smoke test');
    ok((await post(`/messages/${newId}/archive`, {})).status === 302, 'archive conversation');
    const arch = (await get('/messages?filter=archived')).text;
    ok(arch.includes(cid) && !arch.includes('Smoke Renamed'), 'conversation is in Archived, labelled by Client ID');
    for (const pg of ['/', '/users', '/orders', '/payments', '/reports?range=year', '/messages?u=' + newId]) ok(!(await get(pg)).text.includes('Smoke Renamed'), `${pg} never shows the client's name`);
    ok(JSON.parse((await get('/api/search?ids=1&q=smoke renamed')).text).includes(newId), 'Users search still finds the client by name (server-side)');

    console.log('Settings');
    ok((await post('/settings/profile', { name: 'Test Admin', email: EMAIL, role: 'Owner', timezone: 'Europe/London', currency: 'GBP' })).location === '/settings?tab=profile', 'save profile');
    ok((await post('/settings/company', { name: 'Nexora Test Co', supportEmail: 'help@example.com' })).status === 302, 'save company');
    ok((await post('/settings/notifications', { newUser: 'on' }, { json: false })).status === 302, 'save notifications');
    ok((await post('/settings/password', { current: 'wrong', next: 'abcdefgh', confirm: 'abcdefgh' })).status === 422, 'wrong current password rejected');
    ok((await post('/settings/password', { current: PASSWORD, next: 'new-pass-123', confirm: 'new-pass-123' })).status === 302, 'change password');
    await page('/help', 'help@example.com');

    console.log('Cleanup & logout');
    ok((await post(`/users/${newId}/delete`, {})).location === '/users', 'delete user');
    ok((await get('/users/' + newId)).status === 404, 'deleted user is gone');
    ok((await post('/logout', {})).location === '/login', 'log out');
    ok((await get('/users')).location?.startsWith('/login'), 'pages are protected after logout');
    ok((await post('/login', { email: EMAIL, password: 'new-pass-123' })).status === 302, 'sign in with the new password');

    if (errLog.trim()) { console.log('\nServer errors:\n' + errLog); failures++; }
  } finally {
    srv.kill();
    try { fs.unlinkSync(DB); } catch {}
  }
}

(async () => {
  for (const sub of ['', '/portal']) await main(sub);
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

