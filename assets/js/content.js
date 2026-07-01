// Fetches /api/content when the portfolio runs with the Node.js server.
// Falls back to static HTML content gracefully if the API is unavailable.
(async () => {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 2500);
    const res  = await fetch('/api/content', { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return;
    const data = await res.json();
    apply(data);
  } catch { /* static HTML content is used */ }

  function apply(d) {
    const { about, projects, contact } = d;

    // --- About code block ---
    if (about) {
      set('[data-field="name"]',       `"${about.name}"`);
      set('[data-field="location"]',   `"${about.location}"`);
      set('[data-field="role"]',       `"${about.role}"`);
      set('[data-field="openToWork"]', String(about.openToWork));
      if (about.bio) {
        about.bio.forEach((txt, i) => {
          const el = document.querySelector(`[data-about="bio${i}"]`);
          if (el) el.innerHTML = txt;
        });
      }
    }

    // --- Projects ---
    const grid = document.getElementById('projects-grid');
    if (grid && projects?.length) {
      grid.innerHTML = projects.map(p => `
        <div class="col-md-6 col-lg-4 reveal-item">
          <div class="proj-card">
            <div class="pc-head">
              <i class="fas fa-folder-open pc-icon"></i>
              <div class="pc-links">
                ${p.github ? `<a href="${esc(p.github)}" target="_blank" class="pc-link" title="GitHub"><i class="fab fa-github"></i></a>` : ''}
                ${p.demo   ? `<a href="${esc(p.demo)}"   target="_blank" class="pc-link" title="Live Demo"><i class="fas fa-arrow-up-right-from-square"></i></a>` : ''}
              </div>
            </div>
            <h5 class="pc-title">${esc(p.title)}</h5>
            <p class="pc-desc">${esc(p.description)}</p>
            <div class="pc-tags">${(p.tags || []).map(t => `<span class="pt">${esc(t)}</span>`).join('')}</div>
          </div>
        </div>`).join('');

      // re-observe new elements
      document.querySelectorAll('#projects-grid .reveal-item').forEach(el => {
        el.classList.remove('visible');
        revealObserver?.observe(el);
      });
    }

    // --- Contact social links ---
    if (contact) {
      const map = {
        '.si[title="GitHub"]':    contact.github,
        '.si[title="Instagram"]': contact.instagram,
        '.si[title="X / Twitter"]': contact.twitter,
        '.si[title="Facebook"]':  contact.facebook,
        '.si[title="LinkedIn"]':  contact.linkedin,
      };
      Object.entries(map).forEach(([sel, href]) => {
        const a = document.querySelector(sel);
        if (a && href) a.href = href;
      });
      const mail = document.querySelector('a[href^="mailto:"]');
      if (mail && contact.email) mail.href = `mailto:${contact.email}`;
    }
  }

  function set(sel, val) {
    const el = document.querySelector(sel);
    if (el) el.textContent = val;
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
