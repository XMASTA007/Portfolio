(() => {
  const root  = document.documentElement;
  const btn   = document.getElementById('themeToggle');
  const icon  = document.getElementById('themeIcon');

  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);

  btn?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
  });

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    if (!icon) return;
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
})();
