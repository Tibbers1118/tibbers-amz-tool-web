(function () {
  const config = window.TIBBERS_SUPABASE;
  if (!config || !window.supabase) {
    throw new Error('Supabase 前台配置未加载');
  }

  const client = window.supabase.createClient(config.url, config.anonKey);

  function friendlyError(error) {
    const message = String(error?.message || error || '操作失败');
    if (/invalid login credentials/i.test(message)) return '邮箱或密码不正确';
    if (/email not confirmed/i.test(message)) return '邮箱还没有完成验证';
    if (/email rate limit exceeded|rate limit/i.test(message)) {
      return '注册邮件发送次数已达上限。请稍后再试；课程测试可在 Supabase 的 Email 设置中关闭邮箱确认。';
    }
    if (/user already registered/i.test(message)) return '这个邮箱已经注册，请直接登录';
    if (/password should be at least/i.test(message)) return '密码至少需要 6 位';
    if (/duplicate|already exists/i.test(message)) return '记录已经存在，请刷新后重试';
    return message.replace(/^AuthApiError:\s*/i, '');
  }

  function setMessage(element, message, kind) {
    element.textContent = message || '';
    element.className = `form-message${kind ? ` is-${kind}` : ''}`;
  }

  async function requireSession() {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) {
      window.location.href = '../';
      return null;
    }
    return data.session;
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function statusLabel(status) {
    const labels = { 待处理: '待处理', 进行中: '分析中', 已完成: '已完成', 失败: '失败' };
    return labels[status] || status || '-';
  }

  function statusClass(status) {
    return { 待处理: 'status-pending', 进行中: 'status-pending', 已完成: 'status-done', 失败: 'status-failed' }[status] || 'status-pending';
  }

  window.TibbersApp = { client, friendlyError, setMessage, requireSession, formatDate, statusLabel, statusClass };
})();
