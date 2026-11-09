const router = require('express').Router();
const db = require('../lib/db');
const h = require('../lib/helpers');

function conversations(filter) {
  const byUser = new Map();
  for (const m of db.all('messages')) {
    if (!byUser.has(m.userId)) byUser.set(m.userId, []);
    byUser.get(m.userId).push(m);
  }
  const list = [];
  for (const [userId, msgs] of byUser) {
    const user = db.get('users', userId);
    if (!user) continue;
    msgs.sort((a, b) => a.at.localeCompare(b.at));
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter(m => m.from === 'user' && !m.read).length;
    const archived = msgs.some(m => m.archived);
    list.push({ user, last, unread, archived });
  }
  list.sort((a, b) => b.last.at.localeCompare(a.last.at));
  if (filter === 'unread') return list.filter(c => c.unread && !c.archived);
  if (filter === 'archived') return list.filter(c => c.archived);
  return list.filter(c => !c.archived);
}

router.get('/messages', (req, res) => {
  const filter = ['unread', 'archived'].includes(req.query.filter) ? req.query.filter : 'all';
  const convs = conversations(filter);
  let user = req.query.u ? db.get('users', req.query.u) : null;
  if (!user && convs.length) user = convs[0].user;

  let thread = [];
  if (user) {
    thread = db.all('messages').filter(m => m.userId === user.id).sort((a, b) => a.at.localeCompare(b.at));
    let changed = false;
    for (const m of thread) if (m.from === 'user' && !m.read) { m.read = true; changed = true; }
    if (changed) db.save();
    const c = convs.find(c => c.user.id === user.id);
    if (c) c.unread = 0;
  }
  const unreadTotal = db.all('messages').filter(m => m.from === 'user' && !m.read).length;
  res.locals.unread = unreadTotal;

  res.render('pages/messages', {
    title: 'Messages', active: 'messages', convs, user, thread, filter, unreadTotal,
    archived: user ? thread.some(m => m.archived) : false,
    service: user ? h.serviceName(user.serviceId) : '',
    users: db.all('users'),
  });
});

router.post('/messages', (req, res) => {
  const user = db.get('users', req.body.userId);
  const body = h.str(req.body.body, 2000);
  const wantsJson = req.get('accept')?.includes('application/json');
  if (!user || !body) {
    if (wantsJson) return res.status(422).json({ error: 'Write a message first.' });
    req.flash('Choose a user and write a message.', 'error');
    return res.redirect('/messages');
  }
  const m = db.insert('messages', { userId: user.id, from: 'admin', body, at: new Date().toISOString(), read: true });
  for (const x of db.all('messages')) if (x.userId === user.id && x.archived) x.archived = false;
  db.update('users', user.id, { communications: (Number(user.communications) || 0) + 1 });
  if (wantsJson) return res.json({ id: m.id, body: m.body, time: h.timeOf(m.at) });
  res.redirect('/messages?u=' + user.id);
});

router.post('/messages/:userId/archive', (req, res, next) => {
  const user = db.get('users', req.params.userId);
  if (!user) return next();
  const thread = db.all('messages').filter(m => m.userId === user.id);
  const archive = !thread.some(m => m.archived);
  for (const m of thread) m.archived = archive;
  db.save();
  req.flash(archive ? 'Conversation archived.' : 'Conversation moved back to inbox.');
  res.redirect('/messages' + (archive ? '' : '?u=' + user.id));
});

router.post('/messages/:userId/unread', (req, res, next) => {
  const thread = db.all('messages').filter(m => m.userId === req.params.userId && m.from === 'user');
  if (!thread.length) return next();
  thread[thread.length - 1].read = false;
  db.save();
  req.flash('Marked as unread.');
  res.redirect('/messages?filter=unread');
});

module.exports = router;
