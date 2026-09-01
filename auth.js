(function () {
  const app = window.TibbersApp;
  const form = document.getElementById('auth-form');
  const message = document.getElementById('auth-message');
  const title = document.getElementById('auth-mode-title');
  const submit = document.getElementById('auth-submit');
  let mode = 'login';

  function setMode(nextMode) {
    mode = nextMode;
    title.textContent = mode === 'login' ? '登录' : '注册';
    submit.innerHTML = mode === 'login' ? '进入工具 <span aria-hidden="true">→</span>' : '创建账号 <span aria-hidden="true">→</span>';
    document.querySelectorAll('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    app.setMessage(message, '');
  }

  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    submit.disabled = true;
    app.setMessage(message, '正在处理…');
    try {
      const result = mode === 'login'
        ? await app.client.auth.signInWithPassword({ email, password })
        : await app.client.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (mode === 'register' && !result.data.session) {
        app.setMessage(message, '注册成功，请完成邮箱验证后登录。', 'success');
        return;
      }
      window.location.href = 'tool/';
    } catch (error) {
      app.setMessage(message, app.friendlyError(error), 'error');
    } finally {
      submit.disabled = false;
    }
  });

  app.client.auth.getSession().then(({ data }) => {
    if (data.session) window.location.href = 'tool/';
  });
})();
