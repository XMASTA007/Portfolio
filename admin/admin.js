'use strict';

// ─── State ─────────────────────────────────────────────────
const state = {
  token:   localStorage.getItem('adminToken'),
  content: null,
  tab:     'about',
};

// ─── DOM helpers ────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = sel => document.querySelector(sel);

// ─── Boot ───────────────────────────────────────────────────
(async () => {
  // Apply saved theme
  const theme = localStorage.getItem('adminTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  $('theme-dark')?.classList.toggle('active', theme === 'dark');
  $('theme-light')?.classList.toggle('active', theme === 'light');

  if (state.token) {
    try {
      const data = await apiGet('/api/content');
      state.content = data;
      showDashboard();
    } catch {
      clearToken();
      showLogin();
    }
  } else {
    showLogin();
  }
})();

// ─── Login / Logout ─────────────────────────────────────────
$('login-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('login-btn');
  const err = $('login-error');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.querySelector('.btn-label').textContent = 'Signing in…';

  try {
    const { token } = await apiPost('/api/admin/login', { password: $('pw-input').value });
    localStorage.setItem('adminToken', token);
    state.token = token;
    const data = await apiGet('/api/content');
    state.content = data;
    showDashboard();
  } catch (ex) {
    err.textContent = ex.message || 'Login failed';
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.querySelector('.btn-label').textContent = 'Sign In';
    $('pw-input').focus();
  }
});

$('pw-toggle')?.addEventListener('click', () => togglePw('pw-input', $('pw-toggle')));

$('logout-btn')?.addEventListener('click', () => {
  clearToken();
  location.reload();
});

function clearToken() {
  localStorage.removeItem('adminToken');
  state.token = null;
}

// ─── Navigation ─────────────────────────────────────────────
document.querySelectorAll('.sb-item').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
    // Close sidebar on mobile after click
    el('.sidebar')?.classList.remove('open');
  });
});

$('sidebar-toggle')?.addEventListener('click', () => {
  el('.sidebar')?.classList.toggle('open');
});

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.sb-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${tab}`));
  const titles = { about:'About Me', skills:'Skills', experience:'Experience & Education', projects:'Projects', contact:'Contact', settings:'Settings' };
  $('tab-title').textContent = titles[tab] || tab;
}

// ─── Save ────────────────────────────────────────────────────
$('save-btn')?.addEventListener('click', save);

async function save() {
  collectFormData();
  const btn = $('save-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

  try {
    await apiPut('/api/admin/content', state.content);
    showStatus('ok', 'Saved!');
    showToast('Changes saved successfully', 'success');
  } catch (ex) {
    showStatus('err', 'Save failed');
    showToast(ex.message || 'Failed to save', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save Changes';
  }
}

function collectFormData() {
  const c = state.content;
  // About
  c.about.name       = $('about-name').value.trim()    || c.about.name;
  c.about.location   = $('about-location').value.trim()|| c.about.location;
  c.about.role       = $('about-role').value.trim()    || c.about.role;
  c.about.openToWork = $('about-open').checked;
  c.about.bio = [
    $('about-bio0').value.trim(),
    $('about-bio1').value.trim(),
    $('about-bio2').value.trim(),
  ].filter(Boolean);
  // Contact
  const fields = ['email','github','linkedin','instagram','twitter','facebook'];
  fields.forEach(f => {
    const v = $(`ct-${f}`)?.value.trim();
    if (v !== undefined) c.contact[f] = v;
  });
  // Skills / Experience / Projects are updated in real time via their editors
}

// ─── Populate forms ──────────────────────────────────────────
function populateForms() {
  const c = state.content;
  $('about-name').value     = c.about.name      || '';
  $('about-location').value = c.about.location  || '';
  $('about-role').value     = c.about.role      || '';
  $('about-open').checked   = !!c.about.openToWork;
  updateOpenText();
  c.about.bio?.forEach((b, i) => {
    const ta = $(`about-bio${i}`);
    if (ta) ta.value = b;
  });

  const ct = c.contact || {};
  $('ct-email').value     = ct.email     || '';
  $('ct-github').value    = ct.github    || '';
  $('ct-linkedin').value  = ct.linkedin  || '';
  $('ct-instagram').value = ct.instagram || '';
  $('ct-twitter').value   = ct.twitter   || '';
  $('ct-facebook').value  = ct.facebook  || '';

  renderSkillsEditor();
  renderExperienceEditor();
  renderProjectsEditor();
}

$('about-open')?.addEventListener('change', updateOpenText);
function updateOpenText() {
  $('open-text').textContent = $('about-open').checked ? 'Yes' : 'No';
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
        <span class="ec-title">Category</span>
        <div class="ec-actions">
          <button class="btn-icon danger" onclick="removeSkill(${si})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
        <div class="field-group">
          <label class="field-label">Category Name</label>
          <input class="field-input" value="${esc(sk.category)}" onchange="state.content.skills[${si}].category=this.value">
        </div>
        <div class="field-group">
          <label class="field-label">Font Awesome Icon (e.g. fa-globe)</label>
          <input class="field-input" value="${esc(sk.icon)}" onchange="state.content.skills[${si}].icon=this.value">
        </div>
      </div>
      <label class="field-label" style="margin-bottom:8px;display:block;">Skills</label>
      <div class="tag-list" id="sk-tags-${si}">
        ${(sk.items||[]).map((item,ii) => `
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

window.removeSkill = si => {
  state.content.skills.splice(si, 1);
  renderSkillsEditor();
};
window.addSkillItem = si => {
  const inp = $(`sk-new-${si}`);
  const v = inp.value.trim();
  if (!v) return;
  state.content.skills[si].items = state.content.skills[si].items || [];
  state.content.skills[si].items.push(v);
  inp.value = '';
  renderSkillsEditor();
};
window.removeSkillItem = (si, ii) => {
  state.content.skills[si].items.splice(ii, 1);
  renderSkillsEditor();
};

$('add-skill')?.addEventListener('click', () => {
  const maxId = Math.max(0, ...state.content.skills.map(s => s.id));
  state.content.skills.push({ id: maxId + 1, category: 'New Category', icon: 'fa-star', items: [] });
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
        <span class="ec-title">${esc(ex.title) || 'Entry'}</span>
        <div class="ec-actions">
          <button class="btn-icon danger" onclick="removeExp(${ei})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="form-grid" style="gap:14px;">
        <div class="field-group">
          <label class="field-label">Type</label>
          <select class="type-select" onchange="state.content.experience[${ei}].type=this.value">
            <option value="work"  ${ex.type==='work' ?'selected':''}>Work</option>
            <option value="edu"   ${ex.type==='edu'  ?'selected':''}>Education</option>
            <option value="cert"  ${ex.type==='cert' ?'selected':''}>Certificate</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Period</label>
          <input class="field-input" value="${esc(ex.period)}" onchange="state.content.experience[${ei}].period=this.value">
        </div>
        <div class="field-group">
          <label class="field-label">Title / Role</label>
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

window.removeExp = ei => {
  state.content.experience.splice(ei, 1);
  renderExperienceEditor();
};

$('add-exp')?.addEventListener('click', () => {
  const maxId = Math.max(0, ...state.content.experience.map(e => e.id));
  state.content.experience.push({ id: maxId + 1, type: 'work', title: 'New Entry', company: '', period: '', description: '' });
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
        <span class="ec-title">${esc(pr.title) || 'Project'}</span>
        <div class="ec-actions">
          <button class="btn-icon danger" onclick="removeProj(${pi})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="form-grid" style="gap:14px;">
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
          <input class="field-input" value="${esc(pr.github)}" onchange="state.content.projects[${pi}].github=this.value">
        </div>
        <div class="field-group">
          <label class="field-label">Live Demo URL</label>
          <input class="field-input" value="${esc(pr.demo||'')}" onchange="state.content.projects[${pi}].demo=this.value">
        </div>
      </div>
      <div style="margin-top:14px;">
        <label class="field-label" style="margin-bottom:8px;display:block;">Tags</label>
        <div class="tag-list" id="pr-tags-${pi}">
          ${(pr.tags||[]).map((t,ti) => `
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

window.removeProj = pi => {
  state.content.projects.splice(pi, 1);
  renderProjectsEditor();
};
window.addProjTag = pi => {
  const inp = $(`pr-new-${pi}`);
  const v = inp.value.trim();
  if (!v) return;
  state.content.projects[pi].tags = state.content.projects[pi].tags || [];
  state.content.projects[pi].tags.push(v);
  inp.value = '';
  renderProjectsEditor();
};
window.removeProjTag = (pi, ti) => {
  state.content.projects[pi].tags.splice(ti, 1);
  renderProjectsEditor();
};

$('add-proj')?.addEventListener('click', () => {
  const maxId = Math.max(0, ...state.content.projects.map(p => p.id));
  state.content.projects.push({ id: maxId + 1, title: 'New Project', description: '', tags: [], github: '', demo: '' });
  renderProjectsEditor();
});

// ─── Change password ─────────────────────────────────────────
$('change-pw-btn')?.addEventListener('click', async () => {
  const np = $('new-pw').value;
  const cp = $('confirm-pw').value;
  const err = $('pw-error');
  err.classList.add('hidden');

  if (!np) return;
  if (np.length < 8) { err.textContent = 'Password must be at least 8 characters.'; err.classList.remove('hidden'); return; }
  if (np !== cp)     { err.textContent = 'Passwords do not match.'; err.classList.remove('hidden'); return; }

  try {
    await apiPost('/api/admin/password', { newPassword: np }, true);
    $('new-pw').value = ''; $('confirm-pw').value = '';
    showToast('Password updated successfully', 'success');
  } catch (ex) {
    err.textContent = ex.message || 'Failed to update password';
    err.classList.remove('hidden');
  }
});

// ─── Theme ───────────────────────────────────────────────────
window.setAdminTheme = theme => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('adminTheme', theme);
  $('theme-dark')?.classList.toggle('active', theme === 'dark');
  $('theme-light')?.classList.toggle('active', theme === 'light');
};

// ─── UI helpers ──────────────────────────────────────────────
function showLogin() {
  $('login-screen').classList.remove('hidden');
  $('dashboard').classList.add('hidden');
  setTimeout(() => $('pw-input')?.focus(), 100);
}

function showDashboard() {
  $('login-screen').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  populateForms();
}

function showStatus(type, msg) {
  const el = $('save-status');
  el.textContent = msg;
  el.className = `save-status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

let toastTimer;
function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

window.togglePw = (inputId, btn) => {
  const inp = $(inputId);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.querySelector('i').className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
};

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── API calls ───────────────────────────────────────────────
async function apiGet(url) {
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}

async function apiPost(url, body, auth = false) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? authHeaders() : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}

async function apiPut(url, body) {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}
