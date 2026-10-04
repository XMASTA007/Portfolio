'use strict';

(async () => {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let data;
  try {
    const res = await fetch('../data/wedding.json', { cache: 'no-cache' });
    data = await res.json();
  } catch {
    $('#seatHint').textContent = 'Could not load wedding details. Please refresh.';
    return;
  }

  // ─── Hero ────────────────────────────────────────────────
  const { partner1, partner2 } = data.couple;
  $('#p1').textContent = partner1;
  $('#p2').textContent = partner2;
  $('#footNames').textContent = `${partner1} & ${partner2}`;
  document.title = `${partner1} & ${partner2}`;
  $('#dateLabel').textContent = data.dateLabel;
  $('#timeLabel').textContent = data.timeLabel;
  $('#venueLink').textContent = data.venue.name;
  $('#venueLink').href = data.venue.mapUrl;
  $('#venueAddress').textContent = data.venue.address;

  const target = new Date(data.date).getTime();
  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      $('#countdown').innerHTML = '<p class="eyebrow">The big day is here!</p>';
      return clearInterval(timer);
    }
    const parts = [
      ['Days',  Math.floor(diff / 864e5)],
      ['Hours', Math.floor(diff / 36e5) % 24],
      ['Mins',  Math.floor(diff / 6e4) % 60],
    ];
    $('#countdown').innerHTML = parts.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  }
  const timer = setInterval(tick, 30_000);
  tick();

  // ─── Tabs (hash-addressable, e.g. #photos) ───────────────
  const tabs = [...document.querySelectorAll('.tab')];
  function showTab(name, pushHash = true) {
    if (!tabs.some((t) => t.dataset.tab === name)) name = 'seat';
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $(`#panel-${t.dataset.tab}`).hidden = !on;
    });
    if (pushHash) history.replaceState(null, '', `#${name}`);
  }
  tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  showTab(location.hash.slice(1), false);

  // ─── Seat search ─────────────────────────────────────────
  const guests = data.guests.slice().sort((a, b) => a.name.localeCompare(b.name));
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  $('#seatSearch').addEventListener('input', (e) => {
    const q = norm(e.target.value.trim());
    const list = $('#seatResults');
    if (!q) {
      list.innerHTML = '';
      $('#seatHint').textContent = 'Start typing your name to find your table.';
      $('#seatHint').hidden = false;
      return;
    }
    const matches = guests.filter((g) => norm(g.name).includes(q)).slice(0, 20);
    $('#seatHint').hidden = matches.length > 0;
    $('#seatHint').textContent = "We couldn't find that name — try your surname, or ask an usher.";
    list.innerHTML = matches.map((g) => {
      const i = norm(g.name).indexOf(q);
      const name = esc(g.name.slice(0, i)) + '<mark>' + esc(g.name.slice(i, i + q.length)) + '</mark>' + esc(g.name.slice(i + q.length));
      return `<li><span>${name}</span>
        <button class="table-btn" data-table="${g.table}" data-name="${esc(g.name)}" title="Show on floor plan">Table ${g.table}</button></li>`;
    }).join('');
  });

  $('#seatResults').addEventListener('click', (e) => {
    const btn = e.target.closest('.table-btn');
    if (!btn) return;
    selectTable(Number(btn.dataset.table), btn.dataset.name);
    showTab('floor');
    window.scrollTo({ top: $('.tabs').offsetTop - 10, behavior: 'smooth' });
  });

  // ─── Floor plan ──────────────────────────────────────────
  const floor = $('#floor');
  data.floorPlan.features.forEach((f) => {
    const el = document.createElement('div');
    el.className = `feature ${f.kind}`;
    Object.assign(el.style, { left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` });
    el.textContent = f.label;
    if (f.kind === 'head') el.addEventListener('click', showHeadTable);
    floor.appendChild(el);
  });
  data.floorPlan.tables.forEach((t) => {
    const el = document.createElement('button');
    el.className = 'rtable';
    el.dataset.table = t.id;
    el.style.left = `${t.x}%`;
    el.style.top = `${t.y}%`;
    el.textContent = t.label;
    el.addEventListener('click', () => selectTable(t.id));
    floor.appendChild(el);
  });

  function selectTable(id, highlightName) {
    floor.querySelectorAll('.rtable').forEach((el) =>
      el.classList.toggle('active', Number(el.dataset.table) === id));
    const seated = guests.filter((g) => g.table === id);
    $('#tableInfo').innerHTML = `<h3>Table ${id}</h3><ul>${seated.map((g) =>
      `<li class="${g.name === highlightName ? 'you' : ''}">${esc(g.name)}</li>`).join('')}</ul>`;
  }

  function showHeadTable() {
    floor.querySelectorAll('.rtable').forEach((el) => el.classList.remove('active'));
    $('#tableInfo').innerHTML = `<h3>Head Table</h3><ul>${data.headTable.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  }

  // ─── Menu ────────────────────────────────────────────────
  $('#menu').innerHTML = data.menu.map((c) => `
    <div class="course">
      <h2>${esc(c.course)}</h2>
      ${c.items.map((i) => `<div class="dish"><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p></div>`).join('')}
    </div>`).join('') +
    (data.dressCode ? `<p class="hint">Dress code: ${esc(data.dressCode)}</p>` : '');

  // ─── Photos ──────────────────────────────────────────────
  // Uses the Node server's /api/wedding/photos when available. On static hosting
  // (e.g. GitHub Pages) it falls back to IndexedDB so the demo still works.
  const API = '/api/wedding/photos';
  async function pickStore() {
    try {
      const res = await fetch(API, { cache: 'no-cache' });
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) return serverStore;
    } catch { /* no server */ }
    return localStore;
  }

  const serverStore = {
    shared: true,
    async list() {
      const res = await fetch(API, { cache: 'no-cache' });
      return (await res.json()).photos;
    },
    async add(image, name) {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
    },
  };

  const localStore = {
    shared: false,
    db: null,
    open() {
      return this.db ??= new Promise((resolve, reject) => {
        const req = indexedDB.open('wedding-photos', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async list() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const req = db.transaction('photos').objectStore('photos').getAll();
        req.onsuccess = () => resolve(req.result.reverse().map((p) => ({ url: p.image, name: p.name })));
        req.onerror = () => reject(req.error);
      });
    },
    async add(image, name) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite');
        tx.objectStore('photos').add({ image, name, uploadedAt: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    },
  };

  const store = await pickStore();
  $('#demoNote').hidden = store.shared;

  let photos = [];
  async function renderGallery() {
    try { photos = await store.list(); } catch { photos = []; }
    $('#galleryEmpty').hidden = photos.length > 0;
    $('#gallery').innerHTML = photos.map((p, i) =>
      `<button data-i="${i}" aria-label="Open photo${p.name ? ' from ' + esc(p.name) : ''}">
         <img src="${esc(p.url)}" alt="" loading="lazy"></button>`).join('');
  }

  // Downscale and re-encode on the device: keeps uploads small on mobile data
  // and strips EXIF (including GPS location) from guests' photos.
  function compress(file, maxSide = 1920) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} isn't a supported image`)); };
      img.src = url;
    });
  }

  $('#photoInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;

    const btn = $('label[for="photoInput"]');
    const status = $('#uploadStatus');
    const name = $('#uploaderName').value.trim();
    btn.classList.add('busy');
    let done = 0, failed = 0, lastError = '';

    for (const file of files) {
      status.textContent = `Uploading ${done + failed + 1} of ${files.length}…`;
      try {
        await store.add(await compress(file), name);
        done++;
      } catch (err) {
        failed++;
        lastError = err.message;
      }
    }

    btn.classList.remove('busy');
    status.textContent = failed
      ? `${done} uploaded, ${failed} failed (${lastError}).`
      : `Thank you! ${done} photo${done === 1 ? '' : 's'} shared.`;
    renderGallery();
  });

  $('#gallery').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-i]');
    if (!btn) return;
    const p = photos[Number(btn.dataset.i)];
    $('#lbImg').src = p.url;
    $('#lbCaption').textContent = p.name ? `Shared by ${p.name}` : '';
    $('#lightbox').hidden = false;
  });
  const closeLightbox = () => { $('#lightbox').hidden = true; $('#lbImg').src = ''; };
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  renderGallery();
})();
