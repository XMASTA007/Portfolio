'use strict';

// ─── Config ────────────────────────────────────────────────
const CONFIG_KEY  = 'jb_admin_config';
const CONTENT_PATH = 'data/content.json';

function getConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null; }
  catch { return null; }
}
function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}
function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

// ─── State ─────────────────────────────────────────────────
const state = { content: null, sha: null };

// ─── DOM helpers ────────────────────────────────────────────
const $  = id  => document.getElementById(id);
const el = sel => document.querySelector(sel);

// ─── Boot ───────────────────────────────────────────────────
(async () => {
  const theme = localStorage.getItem('adminTheme') || 'dark';
  applyAdminTheme(theme);

  const cfg = getConfig();
  if (cfg?.token && cfg?.owner && cfg?.repo) {
    try {
      await loadContent(cfg);
      showDashboard(cfg);
    } catch (err) {
      showConnect(`Previous session expired: ${err.message}`);
    }
  } else {
    showConnect();
  }
})();

// ─── GitHub API ─────────────────────────────────────────────
const GH = 'https://api.github.com';

function ghHeaders(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function ghGet(token, owner, repo, path, branch) {
  const url = `${GH}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error ${res.status}`);
  }
  return res.json();
}

async function ghPut(token, owner, repo, path, branch, content, sha, message) {
  const url = `${GH}/repos/${owner}/${repo}/contents/${path}`;
  const body = JSON.stringify({ message, content: b64encode(content), sha, branch });
  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(token), body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error ${res.status}`);
  }
  return res.json();
}

function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function loadContent(cfg) {
  const { token, owner, repo, branch } = cfg;
  const file = await ghGet(token, owner, repo, CONTENT_PATH, branch);
  state.sha     = file.sha;
  state.content = JSON.parse(atob(file.content.replace(/\n/g, '')));
}

// ─── Connect flow ────────────────────────────────────────────
$('connect-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const err  = $('connect-error');
  const btn  = $('connect-btn');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.querySelector('.btn-label').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting…';

  const cfg = {
    token:  $('gh-token').value.trim(),
    owner:  $('gh-owner').value.trim(),
    repo:   $('gh-repo').value.trim(),
    branch: $('gh-branch').value.trim() || 'main',
  };

  if (!cfg.token || !cfg.owner || !cfg.repo) {
    err.textContent = 'All fields are required.';
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.querySelector('.btn-label').innerHTML = '<i class="fab fa-github me-1"></i> Connect';
    return;
  }

  try {
    await loadContent(cfg);
    saveConfig(cfg);
    showDashboard(cfg);
  } catch (ex) {
    err.textContent = ex.message || 'Connection failed. Check your token and repo details.';
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.querySelector('.btn-label').innerHTML = '<i class="fab fa-github me-1"></i> Connect';
  }
});

$('tok-toggle')?.addEventListener('click', () => togglePw('gh-token', $('tok-toggle')));

$('disconnect-btn')?.addEventListener('click', () => {
  clearConfig();
  location.reload();
});

// ─── Dashboard ───────────────────────────────────────────────
function showConnect(errorMsg) {
  $('connect-screen').classList.remove('hidden');
  $('dashboard').classList.add('hidden');
  if (errorMsg) {
    $('connect-error').textContent = errorMsg;
    $('connect-error').classList.remove('hidden');
  }
}

function showDashboard(cfg) {
  $('connect-screen').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  populateForms();
  fillSettingsConfig(cfg);
  updatePagesUrl(cfg);
}

// ─── Navigation ──────────────────────────────────────────────
document.querySelectorAll('.sb-item').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
    el('.sidebar')?.classList.remove('open');
  });
});

$('sidebar-toggle')?.addEventListener('click', () =>
  el('.sidebar')?.classList.toggle('open')
);

function switchTab(tab) {
  document.querySelectorAll('.sb-item').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-pane').forEach(p =>
    p.classList.toggle('hidden', p.id !== `tab-${tab}`)
  );
  const titles = {
    about: 'About Me', skills: 'Skills', experience: 'Experience & Education',
    projects: 'Projects', contact: 'Contact', settings: 'Settings',
  };
  $('tab-title').textContent = titles[tab] || tab;
}

// ─── Save & Deploy ────────────────────────────────────────────
$('save-btn')?.addEventListener('click', deploy);

async function deploy() {
  collectFormData();
  const cfg = getConfig();
  if (!cfg) { showToast('Not connected to GitHub', 'error'); return; }

  const btn = $('save-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deploying…';

  try {
    const json   = JSON.stringify(state.content, null, 2);
    const result = await ghPut(
      cfg.token, cfg.owner, cfg.repo, CONTENT_PATH, cfg.branch,
      json, state.sha, 'Update portfolio content via admin panel'
    );
    state.sha = result.content.sha; // update sha for next save
    showStatus('ok', 'Deployed ✓');
    showToast('Saved! GitHub Pages will update in ~1 min.', 'success');
    setBadge('Deploying…');
    setTimeout(() => setBadge(''), 90_000);
  } catch (ex) {
    showStatus('err', 'Failed');
    showToast(ex.message || 'Deployment failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save &amp; Deploy';
  }
}

function collectFormData() {
  const c = state.content;
  c.about.name       = $('about-name').value.trim()     || c.about.name;
  c.about.location   = $('about-location').value.trim() || c.about.location;
  c.about.role       = $('about-role').value.trim()     || c.about.role;
  c.about.openToWork = $('about-open').checked;
  c.about.bio = [
    $('about-bio0').value.trim(),
    $('about-bio1').value.trim(),
    $('about-bio2').value.trim(),
  ].filter(Boolean);

  const fields = ['email','github','linkedin','instagram','twitter','facebook'];
  fields.forEach(f => {
    const v = $(`ct-${f}`)?.value.trim();
    if (v !== undefined) c.contact[f] = v;
  });
}

// ─── Populate forms ──────────────────────────────────────────
function populateForms() {
  const c = state.content;
  $('about-name').value     = c.about.name      || '';
  $('about-location').value = c.about.location  || '';
  $('about-role').value     = c.about.role      || '';
  $('about-open').checked   = !!c.about.openToWork;
  updateOpenText();
  (c.about.bio || []).forEach((b, i) => {
    const ta = $(`about-bio${i}`);
    if (ta) ta.value = b.replace(/<[^>]+>/g, ''); // strip HTML tags for editing
  });

  const ct = c.contact || {};
  ['email','github','linkedin','instagram','twitter','facebook'].forEach(f => {
    const inp = $(`ct-${f}`);
    if (inp) inp.value = ct[f] || '';
  });

  renderSkillsEditor();
  renderExperienceEditor();
  renderProjectsEditor();
}

$('about-open')?.addEventListener('change', updateOpenText);
function updateOpenText() {
  $('open-text').textContent = $('about-open').checked ? 'Yes' : 'No';
}

// ─── Settings: GitHub config ─────────────────────────────────
function fillSettingsConfig(cfg) {
  $('s-token').value  = cfg?.token  || '';
  $('s-owner').value  = cfg?.owner  || '';
  $('s-repo').value   = cfg?.repo   || '';
  $('s-branch').value = cfg?.branch || 'main';
}

$('save-gh-config')?.addEventListener('click', async () => {
  const err = $('s-gh-error');
  err.classList.add('hidden');
  const cfg = {
    token:  $('s-token').value.trim(),
    owner:  $('s-owner').value.trim(),
    repo:   $('s-repo').value.trim(),
    branch: $('s-branch').value.trim() || 'main',
  };
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    err.textContent = 'All fields are required.'; err.classList.remove('hidden'); return;
  }
  try {
    await loadContent(cfg);
    saveConfig(cfg);
    populateForms();
    updatePagesUrl(cfg);
    showToast('GitHub config saved', 'success');
  } catch (ex) {
    err.textContent = ex.message; err.classList.remove('hidden');
  }
});

function updatePagesUrl(cfg) {
  const wrap = $('pages-url-wrap');
  if (!wrap || !cfg) return;
  const url = `https://${cfg.owner}.github.io/${cfg.repo}/`;
  wrap.innerHTML = `<a href="${url}" target="_blank" class="pages-link"><i class="fas fa-arrow-up-right-from-square"></i> ${url}</a>`;
}

// ─── Skills Editor ───────────────────────────────────────────
function renderSkillsEditor() {
  const wrap = $('skills-editor');
  wrap.innerHTML = '';
  state.content.skills.forEach((sk, si) => {
    const card = document.createElement('div');
    card.className = 'editor-card';
    card.innerHTML = `
      <div class="ec-header">
        <span class="ec-title">${esc(sk.category)}</span>
        <div class="ec-actions">
          <button class="btn-icon danger" onclick="removeSkill(${si})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="two-col mb-3">
        <div class="field-group">
          <label class="field-label">Category Name</label>
          <input class="field-input" value="${esc(sk.category)}" onchange="state.content.skills[${si}].category=this.value">
        </div>
        <div class="field-group">
          <label class="field-label">Icon (fa-globe, fa-code…)</label>
          <input class="field-input" value="${esc(sk.icon)}" onchange="state.content.skills[${si}].icon=this.value">
        </div>
      </div>
      <label class="field-label mb-2">Skills</label>
      <div class="tag-list" id="sk-tags-${si}">
        ${(sk.items||[]).map((item,ii)=>`
          <span class="admin-tag">${esc(item)}<button class="tag-rm" onclick="removeSkillItem(${si},${ii})"><i class="fas fa-xmark"></i></button></span>
        `).join('')}
      </div>
      <div class="add-tag-row">
        <input class="field-input" id="sk-new-${si}" placeholder="New skill" onkeydown="if(event.key==='Enter'){addSkillItem(${si});event.preventDefault()}">
        <button class="btn-primary-sm" onclick="addSkillItem(${si})"><i class="fas fa-plus"></i></button>
      </div>`;
    wrap.appendChild(card);
  });
}

window.removeSkill    = si    => { state.content.skills.splice(si,1);          renderSkillsEditor(); };
window.addSkillItem   = si    => { const i=$(`sk-new-${si}`); if(!i.value.trim())return; state.content.skills[si].items.push(i.value.trim()); i.value=''; renderSkillsEditor(); };
window.removeSkillItem= (si,ii)=> { state.content.skills[si].items.splice(ii,1); renderSkillsEditor(); };

$('add-skill')?.addEventListener('click', () => {
  state.content.skills.push({ id: Date.now(), category: 'New Category', icon: 'fa-star', items: [] });
  renderSkillsEditor();
});

// ─── Experience Editor ───────────────────────────────────────
function renderExperienceEditor() {
  const wrap = $('experience-editor');
  wrap.innerHTML = '';
  state.content.experience.forEach((ex, ei) => {
    const card = document.createElement('div');
    card.className = 'editor-card';
    card.innerHTML = `
      <div class="ec-header">
        <span class="ec-title">${esc(ex.title)}</span>
        <div class="ec-actions">
          <button class="btn-icon danger" onclick="removeExp(${ei})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="form-grid mb-0">
        <div class="field-group">
          <label class="field-label">Type</label>
          <select class="type-select" onchange="state.content.experience[${ei}].type=this.value">
            <option value="work" ${ex.type==='work'?'selected':''}>Work</option>
            <option value="edu"  ${ex.type==='edu' ?'selected':''}>Education</option>
            <option value="cert" ${ex.type==='cert'?'selected':''}>Certificate</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Period</label>
          <input class="field-input" value="${esc(ex.period)}" onchange="state.content.experience[${ei}].period=this.value">
        </div>
        <div class="field-group">
          <label class="field-label">Title</label>
          <input class="field-input" value="${esc(ex.title)}" onchange="state.content.experience[${ei}].title=this.value">
        </div>
        <div class="field-group">
          <label class="field-label">Company / Institution</label>
          <input class="field-input" value="${esc(ex.company)}" onchange="state.content.experience[${ei}].company=this.value">
        </div>
        <div class="field-group span-2">
          <label class="field-label">Description</label>
          <textarea class="field-input field-ta" rows="3" onchange="state.content.experience[${ei}].description=this.value">${esc(ex.description)}</textarea>
        </div>
      </div>`;
    wrap.appendChild(card);
  });
}

window.removeExp = ei => { state.content.experience.splice(ei,1); renderExperienceEditor(); };
$('add-exp')?.addEventListener('click', () => {
  state.content.experience.push({ id: Date.now(), type:'work', title:'New Entry', company:'', period:'', description:'' });
  renderExperienceEditor();
});

// ─── Projects Editor ─────────────────────────────────────────
function renderProjectsEditor() {
  const wrap = $('projects-editor');
  wrap.innerHTML = '';
  state.content.projects.forEach((pr, pi) => {
    const card = document.createElement('div');
    card.className = 'editor-card';
    card.innerHTML = `
      <div class="ec-header">
        <span class="ec-title">${esc(pr.title)}</span>
        <div class="ec-actions">
          <button class="btn-icon danger" onclick="removeProj(${pi})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="form-grid mb-0">
        <div class="field-group span-2">
          <label class="field-label">Project Title</label>
          <input class="field-input" value="${esc(pr.title)}" onchange="state.content.projects[${pi}].title=this.value">
        </div>
        <div class="field-group span-2">
          <label class="field-label">Description</label>
          <textarea class="field-input field-ta" rows="3" onchange="state.content.projects[${pi}].description=this.value">${esc(pr.description)}</textarea>
        </div>
        <div class="field-group">
          <label class="field-label">GitHub URL</label>
          <input class="field-input" value="${esc(pr.github||'')}" onchange="state.content.projects[${pi}].github=this.value">
        </div>
        <div class="field-group">
          <label class="field-label">Live Demo URL</label>
          <input class="field-input" value="${esc(pr.demo||'')}" onchange="state.content.projects[${pi}].demo=this.value">
        </div>
      </div>
      <div class="mt-3">
        <label class="field-label mb-2">Tags</label>
        <div class="tag-list" id="pr-tags-${pi}">
          ${(pr.tags||[]).map((t,ti)=>`
            <span class="admin-tag">${esc(t)}<button class="tag-rm" onclick="removeProjTag(${pi},${ti})"><i class="fas fa-xmark"></i></button></span>
          `).join('')}
        </div>
        <div class="add-tag-row">
          <input class="field-input" id="pr-new-${pi}" placeholder="Add tag" onkeydown="if(event.key==='Enter'){addProjTag(${pi});event.preventDefault()}">
          <button class="btn-primary-sm" onclick="addProjTag(${pi})"><i class="fas fa-plus"></i></button>
        </div>
      </div>`;
    wrap.appendChild(card);
  });
}

window.removeProj    = pi    => { state.content.projects.splice(pi,1);              renderProjectsEditor(); };
window.addProjTag    = pi    => { const i=$(`pr-new-${pi}`); if(!i.value.trim())return; state.content.projects[pi].tags.push(i.value.trim()); i.value=''; renderProjectsEditor(); };
window.removeProjTag = (pi,ti)=> { state.content.projects[pi].tags.splice(ti,1);      renderProjectsEditor(); };

$('add-proj')?.addEventListener('click', () => {
  state.content.projects.push({ id: Date.now(), title:'New Project', description:'', tags:[], github:'', demo:'' });
  renderProjectsEditor();
});

// ─── Theme ───────────────────────────────────────────────────
window.setAdminTheme = theme => { applyAdminTheme(theme); localStorage.setItem('adminTheme', theme); };

function applyAdminTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('theme-dark')?.classList.toggle('active', theme === 'dark');
  $('theme-light')?.classList.toggle('active', theme === 'light');
}

// ─── UI helpers ──────────────────────────────────────────────
function showStatus(type, msg) {
  const e = $('save-status');
  e.textContent = msg; e.className = `save-status ${type}`; e.classList.remove('hidden');
  setTimeout(() => e.classList.add('hidden'), 3000);
}

function setBadge(msg) {
  const b = $('deploy-badge');
  if (!b) return;
  b.textContent = msg;
  b.classList.toggle('hidden', !msg);
}

let toastTimer;
function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg; t.className = `toast ${type}`; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

window.togglePw = (id, btn) => {
  const inp = $(id); if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.querySelector('i').className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
};

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
