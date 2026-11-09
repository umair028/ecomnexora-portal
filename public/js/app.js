(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = {
    check: '<svg class="i" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  /* ---------- Toasts ---------- */
  function dismiss(t) { t.classList.add('out'); setTimeout(() => t.remove(), 300); }
  function toast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' error' : '');
    t.innerHTML = `<span class="ti">${type === 'error' ? ICON.x : ICON.check}</span><span>${esc(msg)}</span><button type="button" aria-label="Dismiss" data-dismiss>${ICON.x}</button>`;
    $('#toasts').appendChild(t);
    setTimeout(() => t.isConnected && dismiss(t), 4500);
  }
  window.toast = toast;
  $$('[data-toast]').forEach(t => setTimeout(() => t.isConnected && dismiss(t), 4500));
  document.addEventListener('click', e => { const b = e.target.closest('[data-dismiss]'); if (b) dismiss(b.closest('.toast')); });

  /* ---------- Sidebar (mobile) ---------- */
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-nav]')) document.body.classList.add('nav-open');
    if (e.target.closest('[data-close-nav]')) document.body.classList.remove('nav-open');
  });

  /* ---------- Sidebar glow follows the mouse ---------- */
  const side = $('.side');
  if (side && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let frame = 0;
    side.addEventListener('pointermove', e => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        side.classList.add('glow-follow');
        side.style.setProperty('--gx', e.clientX + 'px');
        side.style.setProperty('--gy', e.clientY + 'px');
      });
    });
    side.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame); frame = 0;
      side.classList.remove('glow-follow');
      side.style.removeProperty('--gx');
      side.style.removeProperty('--gy');
    });
  }

  /* ---------- Modals ---------- */
  let lastFocus = null;
  // modals live at the top level of <body> so no animated/transformed parent can pull them off-centre
  $$('.modal').forEach(m => { if (m.parentElement !== document.body) document.body.appendChild(m); });
  function openModal(m) {
    if (typeof m === 'string') m = document.getElementById(m);
    if (!m) return;
    lastFocus = document.activeElement;
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => ($('[autofocus]', m) || $('input:not([type=hidden]),select,textarea,button', m))?.focus(), 30);
  }
  function closeModal(m) {
    m.classList.remove('open');
    if (!$('.modal.open')) document.body.style.overflow = '';
    lastFocus?.focus?.();
  }
  window.openModal = openModal;
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-modal]');
    if (opener) {
      e.preventDefault();
      const m = document.getElementById(opener.dataset.modal);
      // pre-fill modal fields from data-fill='{"name":"value"}'
      if (opener.dataset.fill && m) {
        const data = JSON.parse(opener.dataset.fill);
        for (const [k, v] of Object.entries(data)) {
          if (k === '_action') { $('form', m).action = v; continue; }
          if (k === '_title') { $('[data-title]', m).textContent = v; continue; }
          if (k === '_submit') { $('[data-submit-label]', m).textContent = v; continue; }
          const f = $(`[name="${k}"]`, m);
          if (f) f.value = v ?? '';
        }
      }
      openModal(m);
    }
    if (e.target.closest('[data-close]')) closeModal(e.target.closest('.modal'));
    else if (e.target.classList.contains('modal')) closeModal(e.target);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const m = $$('.modal.open').pop();
    if (m) return closeModal(m);
    $$('.menu.open').forEach(x => x.classList.remove('open'));
    document.body.classList.remove('nav-open');
  });

  /* ---------- Confirm dialogs ---------- */
  const cm = $('#confirm-modal');
  let pending = null;
  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.dataset.confirm && !f.dataset.confirmed) {
      e.preventDefault();
      pending = f;
      $('#confirm-title').textContent = f.dataset.confirmTitle || 'Are you sure?';
      $('#confirm-text').textContent = f.dataset.confirm;
      $('#confirm-ok').textContent = f.dataset.confirmOk || 'Confirm';
      openModal(cm);
      return;
    }
    // loading state on the submit button
    const btn = e.submitter || $('[type=submit]', f);
    if (btn && !f.dataset.noLoading && btn.classList.contains('btn')) setTimeout(() => btn.classList.add('loading'), 0);
  }, true);
  $('#confirm-ok')?.addEventListener('click', () => {
    if (!pending) return;
    pending.dataset.confirmed = '1';
    closeModal(cm);
    pending.requestSubmit ? pending.requestSubmit() : pending.submit();
  });

  /* ---------- Dropdown menus ---------- */
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-menu-toggle]');
    $$('.menu.open').forEach(m => { if (!trigger || m !== trigger.closest('.menu')) m.classList.remove('open'); });
    if (trigger) trigger.closest('.menu').classList.toggle('open');
  });

  /* ---------- Links without the browser's address preview ---------- */
  // Browsers show a link's address in the bottom corner on hover. The HTML keeps real hrefs (works without
  // JS, for tests and crawlers); here they move to data-link and are followed on click / Enter instead.
  const plainLink = a => a.hasAttribute('href') && !/^#/.test(a.getAttribute('href')) && !a.hasAttribute('data-modal') && !a.hasAttribute('download');
  const hideHref = a => {
    if (!plainLink(a)) return;
    a.dataset.link = a.getAttribute('href');
    a.removeAttribute('href');
    if (!a.hasAttribute('role')) a.setAttribute('role', 'link');
    if (!a.hasAttribute('tabindex')) a.tabIndex = 0;
  };
  const scanLinks = root => { if (root.matches?.('a')) hideHref(root); root.querySelectorAll?.('a[href]').forEach(hideHref); };
  scanLinks(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && scanLinks(n))))
    .observe(document.body, { childList: true, subtree: true });
  const follow = (a, newTab) => {
    if (newTab || a.target === '_blank') window.open(a.dataset.link, '_blank', 'noopener');
    else location.href = a.dataset.link;
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.defaultPrevented) return;
    e.preventDefault();
    follow(a, e.ctrlKey || e.metaKey || e.shiftKey);
  });
  document.addEventListener('auxclick', e => {
    const a = e.target.closest('a[data-link]');
    if (a && e.button === 1) { e.preventDefault(); follow(a, true); }
  });
  document.addEventListener('keydown', e => {
    const a = e.target.closest?.('a[data-link]');
    if (a && e.key === 'Enter') { e.preventDefault(); follow(a, e.ctrlKey || e.metaKey); }
  });

  /* ---------- Clickable rows / cards ---------- */
  document.addEventListener('click', e => {
    const row = e.target.closest('[data-href]');
    if (!row || e.target.closest('a,button,select,input,form,label')) return;
    if (e.ctrlKey || e.metaKey) window.open(row.dataset.href, '_blank');
    else location.href = row.dataset.href;
  });
  document.addEventListener('keydown', e => {
    const row = e.target.closest?.('[data-href]');
    if (row && e.key === 'Enter') location.href = row.dataset.href;
  });

  /* ---------- Button ripple ---------- */
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn');
    if (!b) return;
    const r = b.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(span);
    setTimeout(() => span.remove(), 600);
  });

  /* ---------- Global search ---------- */
  const form = $('.top .search');
  if (form) {
    const input = $('[data-search]', form);
    const box = $('.results', form);
    let timer, items = [], sel = -1, ctl;
    const sync = () => form.classList.toggle('has-value', !!input.value);
    sync();
    const close = () => { box.classList.remove('open'); sel = -1; };
    const render = (q, list) => {
      items = list;
      box.innerHTML = list.length
        ? list.map((u, i) => `<a href="${window.BASE || ''}/users/${u.id}" class="${i === sel ? 'sel' : ''}" role="option"><span class="av sm">${esc(u.initials)}</span><span style="flex:1;min-width:0"><b>${esc(u.name)}</b><span class="s2 ellipsis">${esc(u.sub || 'Service not set')}</span></span></a>`).join('')
          + `<a class="all" href="${window.BASE || ''}/users?q=${encodeURIComponent(q)}">See all results for “${esc(q)}”</a>`
        : `<div class="empty">No users match “${esc(q)}”.</div>`;
      box.classList.add('open');
    };
    input.addEventListener('input', () => {
      sync();
      document.dispatchEvent(new CustomEvent('search:input', { detail: input.value }));
      clearTimeout(timer);
      const q = input.value.trim();
      // the Users page filters its own table live, so no dropdown there
      if (!q || $('#users-table')) return close();
      timer = setTimeout(async () => {
        ctl?.abort(); ctl = new AbortController();
        try {
          const r = await fetch((window.BASE || '') + '/api/search?q=' + encodeURIComponent(q), { signal: ctl.signal });
          if (r.ok) { sel = -1; render(q, await r.json()); }
        } catch {}
      }, 150);
    });
    input.addEventListener('keydown', e => {
      if (!box.classList.contains('open')) return;
      const links = $$('a', box);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach((a, i) => a.classList.toggle('sel', i === sel));
        links[sel]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && sel >= 0) {
        e.preventDefault(); location.href = links[sel].dataset.link || links[sel].href;
      } else if (e.key === 'Escape') close();
    });
    input.addEventListener('focus', () => input.value.trim() && items && input.dispatchEvent(new Event('input')));
    document.addEventListener('click', e => { if (!form.contains(e.target)) close(); });
    $('[data-clear]', form).addEventListener('click', () => {
      input.value = ''; sync(); close(); input.focus();
      document.dispatchEvent(new CustomEvent('search:input', { detail: '' }));
    });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
    });
  }

  /* ---------- Password visibility ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-reveal]');
    if (!b) return;
    const inp = b.parentElement.querySelector('input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    b.setAttribute('aria-label', inp.type === 'password' ? 'Show password' : 'Hide password');
  });

  /* ---------- Auto-submit selects ---------- */
  document.addEventListener('change', e => {
    if (e.target.matches('[data-autosubmit]')) e.target.form.requestSubmit ? e.target.form.requestSubmit() : e.target.form.submit();
  });

  /* ---------- Draw charts declared in markup ---------- */
  $$('[data-chart]').forEach(el => {
    const cfg = JSON.parse(el.dataset.chart);
    Charts[cfg.type](el, cfg);
    let w = el.clientWidth;
    // redraw on resize without replaying the intro animation (with the lines / range picked below)
    new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; const c = JSON.parse(el.dataset.chart); Charts[c.type](el, { ...c, animate: false }); } }).observe(el);
  });
  // switches that show / hide one line of a chart, and a period picker (last N points)
  const redraw = (el, change) => {
    const cfg = JSON.parse(el.dataset.chart);
    change(cfg);
    el.dataset.chart = JSON.stringify(cfg);
    Charts[cfg.type](el, cfg);
  };
  $$('[data-chart-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', on);
    redraw($(btn.dataset.chartToggle), cfg => { cfg.series.find(s => s.key === btn.dataset.key).on = on; });
  }));
  $$('[data-chart-range]').forEach(sel => sel.addEventListener('change', () => redraw($(sel.dataset.chartRange), cfg => { cfg.range = Number(sel.value); })));

  /* ---------- Sideways card rows: page dots that follow the scroll and jump to a page ---------- */
  $$('[data-pager]').forEach(row => {
    const dots = $(row.dataset.pager);
    if (!dots) return;
    const pages = () => Math.max(1, Math.ceil(row.scrollWidth / row.clientWidth - 0.05));
    const paint = () => {
      const n = pages(), cur = Math.min(n - 1, Math.round(row.scrollLeft / Math.max(1, row.scrollWidth - row.clientWidth) * (n - 1)) || 0);
      if (dots.children.length !== n) dots.innerHTML = n > 1 ? Array.from({ length: n }, (_, i) => `<button type="button" tabindex="-1" data-i="${i}"></button>`).join('') : '';
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i === cur));
    };
    dots.addEventListener('click', e => { const d = e.target.closest('button'); if (d) row.scrollTo({ left: (row.scrollWidth - row.clientWidth) * (+d.dataset.i / Math.max(1, pages() - 1)) }); });
    row.addEventListener('scroll', paint, { passive: true });
    new ResizeObserver(paint).observe(row);
    paint();
  });
  // the arrow under a scrolling list: down while there is more below, then back up to the top;
  // the list's bottom fade shows only while there is more below
  $$('[data-scroll-more]').forEach(btn => {
    const list = $(btn.dataset.scrollMore);
    if (!list) return;
    const sync = () => {
      const scrolls = list.scrollHeight > list.clientHeight + 4;
      const end = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
      btn.hidden = !scrolls;
      list.classList.toggle('more', scrolls && !end);
      btn.classList.toggle('up', scrolls && end);
      btn.setAttribute('aria-label', end ? 'Back to the top' : 'Show more');
    };
    btn.addEventListener('click', () => (btn.classList.contains('up') ? list.scrollTo({ top: 0 }) : list.scrollBy({ top: list.clientHeight * 0.8 })));
    list.addEventListener('scroll', sync, { passive: true });
    new ResizeObserver(sync).observe(list);
    sync();
  });
})();

// Reports: expand / collapse the rest of the "Revenue by client" list
document.querySelectorAll('.share-toggle').forEach(btn => btn.addEventListener('click', () => {
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  const open = !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open);
  btn.querySelector('span').textContent = open ? btn.dataset.less : btn.dataset.more;
}));
