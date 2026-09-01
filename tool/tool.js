(function () {
  const app = window.TibbersApp;
  const rowsElement = document.getElementById('task-rows');
  const message = document.getElementById('task-message');
  const form = document.getElementById('task-form');
  const submit = document.getElementById('submit-task');
  const fileInput = document.getElementById('report-file');
  const fileName = document.getElementById('file-name');
  const lastRefresh = document.getElementById('last-refresh');
  const taskCount = document.getElementById('task-count');
  const completedCount = document.getElementById('completed-count');
  const processingCount = document.getElementById('processing-count');
  let session;

  function renderTaskSummary(tasks) {
    const processing = tasks.filter((task) => task.status === '待处理' || task.status === '进行中').length;
    const completed = tasks.filter((task) => task.status === '已完成').length;
    taskCount.textContent = String(tasks.length);
    completedCount.textContent = String(completed);
    processingCount.textContent = String(processing);
    lastRefresh.textContent = `最近同步 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  }

  function renderTasks(tasks) {
    if (!tasks.length) {
      rowsElement.innerHTML = '<tr><td colspan="5" class="empty-state">还没有分析任务</td></tr>';
      return;
    }
    rowsElement.innerHTML = '';
    tasks.forEach((task) => {
      const row = document.createElement('tr');
      const reportCell = document.createElement('td');
      const failureCell = document.createElement('td');
      reportCell.className = 'right';
      failureCell.className = 'error-cell';
      if (task.status === '已完成') {
        const link = document.createElement('a');
        link.href = `../report/?task=${encodeURIComponent(task.id)}`;
        link.textContent = '查看报告 →';
        reportCell.append(link);
      } else {
        reportCell.textContent = '-';
      }
      failureCell.textContent = task.failure_reason || '-';
      row.innerHTML = `<td>${app.formatDate(task.created_at)}</td><td>${task.asin}</td><td><span class="inline-status"><span class="status-dot ${app.statusClass(task.status)}"></span>${app.statusLabel(task.status)}</span></td>`;
      row.append(reportCell, failureCell);
      rowsElement.append(row);
    });
  }

  async function loadTasks() {
    const result = await app.client.from('analysis_tasks').select('id,asin,status,report_url,created_at,failure_reason').order('created_at', { ascending: false });
    if (result.error) {
      lastRefresh.textContent = '同步失败';
      rowsElement.innerHTML = `<tr><td colspan="5" class="empty-state">${app.friendlyError(result.error)}</td></tr>`;
      return;
    }
    const tasks = result.data || [];
    renderTaskSummary(tasks);
    renderTasks(tasks);
  }

  document.getElementById('refresh-tasks').addEventListener('click', loadTasks);
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileName.textContent = file ? file.name : '选择报表文件';
  });
  document.getElementById('logout').addEventListener('click', async () => {
    await app.client.auth.signOut();
    window.location.href = '../';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const asin = document.getElementById('asin').value.trim().toUpperCase();
    const file = document.getElementById('report-file').files[0];
    if (!/^B0[A-Z0-9]{8}$/.test(asin)) {
      app.setMessage(message, 'ASIN 需要是 10 位、以 B0 开头的编号。', 'error');
      return;
    }
    if (!file || !/\.(xlsx|csv)$/i.test(file.name)) {
      app.setMessage(message, '请选择 .xlsx 或 .csv 报表。', 'error');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      app.setMessage(message, '文件不能超过 50 MB。', 'error');
      return;
    }
    submit.disabled = true;
    app.setMessage(message, '正在上传报表…');
    const taskId = crypto.randomUUID();
    const path = `${session.user.id}/${taskId}.xlsx`;
    let uploadCompleted = false;
    let taskCreated = false;
    try {
      const upload = await app.client.storage.from('amazon-report-inbox').upload(path, file, { upsert: false, contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (upload.error) throw upload.error;
      uploadCompleted = true;
      const insert = await app.client.from('analysis_tasks').insert({ id: taskId, user_id: session.user.id, asin, input_file_path: path, status: '待处理' });
      if (insert.error) throw insert.error;
      taskCreated = true;
      form.reset();
      app.setMessage(message, '任务已提交，后台开始处理。', 'success');
      await loadTasks();
    } catch (error) {
      if (uploadCompleted && !taskCreated) {
        const cleanup = await app.client.storage.from('amazon-report-inbox').remove([path]);
        if (cleanup.error) console.warn('上传文件清理失败', cleanup.error);
      }
      app.setMessage(message, app.friendlyError(error), 'error');
    } finally {
      submit.disabled = false;
    }
  });

  (async () => {
    session = await app.requireSession();
    if (!session) return;
    document.getElementById('account-email').textContent = session.user.email || '已登录';
    await loadTasks();
    window.setInterval(loadTasks, 30000);
  })();
})();
