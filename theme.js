(function () {
  const body = document.body;
  const toggle = document.getElementById('theme-toggle');
  if (!body || !toggle) return;

  const storageKey = 'tibbers-theme';
  let savedTheme = null;
  try {
    savedTheme = window.localStorage.getItem(storageKey);
  } catch (error) {
    savedTheme = null;
  }

  function setTheme(theme) {
    const isLight = theme === 'light';
    body.dataset.theme = isLight ? 'light' : 'dark';
    toggle.innerHTML = `<span aria-hidden="true">${isLight ? '☾' : '☼'}</span>`;
    toggle.setAttribute('aria-label', isLight ? '切换为夜间模式' : '切换为白天模式');
    toggle.setAttribute('aria-pressed', String(isLight));
  }

  setTheme(savedTheme === 'light' ? 'light' : 'dark');
  toggle.addEventListener('click', () => {
    const nextTheme = body.dataset.theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(storageKey, nextTheme);
    } catch (error) {
      // Theme switching still works when browser storage is unavailable.
    }
  });
}());
