(function () {
  const app = window.TibbersApp;
  const frame = document.getElementById('report-frame');
  const title = document.getElementById('report-title');
  const meta = document.getElementById('report-meta');
  const message = document.getElementById('report-message');
  const download = document.getElementById('download-report');
  const stateLabel = document.getElementById('report-state-label');
  const stateDot = document.getElementById('report-state-dot');
  const taskId = new URLSearchParams(window.location.search).get('task');

  function setReportState(label, stateClass) {
    stateLabel.textContent = label;
    stateDot.className = `status-dot ${stateClass}`;
  }

  (async () => {
    const session = await app.requireSession();
    if (!session) return;
    if (!taskId) {
      setReportState('缺少编号', 'status-failed');
      app.setMessage(message, '缺少报告任务编号。', 'error');
      return;
    }
    const result = await app.client.from('analysis_tasks').select('id,asin,status,report_url,created_at,failure_reason').eq('id', taskId).maybeSingle();
    if (result.error || !result.data) {
      setReportState('读取失败', 'status-failed');
      app.setMessage(message, result.error ? app.friendlyError(result.error) : '找不到这份报告。', 'error');
      return;
    }
    const task = result.data;
    setReportState(app.statusLabel(task.status), task.status === '已完成' ? 'status-done' : task.status === '失败' ? 'status-failed' : 'status-pending');
    title.textContent = `${task.asin} 关键词报告`;
    meta.textContent = `提交时间：${app.formatDate(task.created_at)}　|　状态：${app.statusLabel(task.status)}`;
    if (task.status !== '已完成' || !task.report_url) {
      app.setMessage(message, task.failure_reason || '报告还没有完成。', task.status === '失败' ? 'error' : '');
      return;
    }
    try {
      const response = await fetch(task.report_url);
      if (!response.ok) throw new Error(`报告读取失败（HTTP ${response.status}），请重新生成。`);
      const html = await response.text();
      frame.srcdoc = html;
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      download.href = blobUrl;
      download.download = `${task.asin}-keyword-report.html`;
      download.hidden = false;
      setReportState('已完成', 'status-done');
      app.setMessage(message, '报告已加载。', 'success');
    } catch (error) {
      setReportState('读取失败', 'status-failed');
      app.setMessage(message, app.friendlyError(error), 'error');
    }
  })();
})();
