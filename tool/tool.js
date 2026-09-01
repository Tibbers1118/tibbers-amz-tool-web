(function () {
  const app = window.TibbersApp;
  const rowsElement = document.getElementById('task-rows');
  const message = document.getElementById('task-message');
  const form = document.getElementById('task-form');
  const submit = document.getElementById('submit-task');
  const fileInput = document.getElementById('report-file');
  const fileName = document.getElementById('file-name');
  const fileMeta = document.getElementById('file-meta');
  const fileStatus = document.getElementById('file-status');
  const lastRefresh = document.getElementById('last-refresh');
  const queueState = document.getElementById('queue-state');
  const systemTime = document.getElementById('system-time');
  const taskStreamStatus = document.getElementById('task-stream-status');
  const pipelineSteps = [...document.querySelectorAll('[data-pipeline-step]')];
  const taskCount = document.getElementById('task-count');
  const completedCount = document.getElementById('completed-count');
  const processingCount = document.getElementById('processing-count');
  const taskFill = document.getElementById('task-fill');
  const completedFill = document.getElementById('completed-fill');
  const processingFill = document.getElementById('processing-fill');
  let session;

  function formatFileSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function updateSystemTime() {
    systemTime.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  function setPipelineState(state) {
    const order = { input: 0, enrich: 1, decide: 2 };
    const activeIndex = order[state] ?? 0;
    pipelineSteps.forEach((step, index) => {
      step.classList.toggle('is-active', index === activeIndex);
      step.classList.toggle('is-complete', index < activeIndex);
    });
  }

  function setFileState(file) {
    const hasFile = Boolean(file);
    fileName.textContent = hasFile ? file.name : '选择报表文件';
    fileMeta.textContent = hasFile ? `${formatFileSize(file.size)} · ${file.name.split('.').pop().toUpperCase()}` : '.XLSX 或 .CSV · 最大 50 MB';
    fileStatus.textContent = hasFile ? 'READY' : 'WAITING';
    fileStatus.className = `file-status${hasFile ? ' is-ready' : ''}`;
    document.querySelector('.file-drop').classList.toggle('has-file', hasFile);
  }

  function renderTaskSummary(tasks) {
    const processing = tasks.filter((task) => task.status === '待处理' || task.status === '进行中').length;
    const completed = tasks.filter((task) => task.status === '已完成').length;
    taskCount.textContent = String(tasks.length);
    completedCount.textContent = String(completed);
    processingCount.textContent = String(processing);
    taskFill.style.width = tasks.length ? '100%' : '0%';
    completedFill.style.width = tasks.length ? `${Math.round((completed / tasks.length) * 100)}%` : '0%';
    processingFill.style.width = tasks.length ? `${Math.round((processing / tasks.length) * 100)}%` : '0%';
    queueState.textContent = processing ? 'RUNNING' : 'READY';
    taskStreamStatus.textContent = `${tasks.length} TASK${tasks.length === 1 ? '' : 'S'} / ${processing ? 'RUNNING' : 'IDLE'}`;
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
      queueState.textContent = 'OFFLINE';
      taskStreamStatus.textContent = 'SYNC ERROR';
      rowsElement.innerHTML = `<tr><td colspan="5" class="empty-state">${app.friendlyError(result.error)}</td></tr>`;
      return;
    }
    const tasks = result.data || [];
    renderTaskSummary(tasks);
    renderTasks(tasks);
  }

  document.getElementById('refresh-tasks').addEventListener('click', loadTasks);
  fileInput.addEventListener('change', () => setFileState(fileInput.files[0]));
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
    setPipelineState('input');
    queueState.textContent = 'UPLOADING';
    fileStatus.textContent = 'UPLOADING';
    fileStatus.className = 'file-status is-busy';
    app.setMessage(message, '正在上传报表…');
    const taskId = crypto.randomUUID();
    const path = `${session.user.id}/${taskId}.xlsx`;
    let uploadCompleted = false;
    let taskCreated = false;
    try {
      const upload = await app.client.storage.from('amazon-report-inbox').upload(path, file, { upsert: false, contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (upload.error) throw upload.error;
      uploadCompleted = true;
      setPipelineState('enrich');
      fileStatus.textContent = 'UPLOADED';
      const insert = await app.client.from('analysis_tasks').insert({ id: taskId, user_id: session.user.id, asin, input_file_path: path, status: '待处理' });
      if (insert.error) throw insert.error;
      taskCreated = true;
      setPipelineState('decide');
      form.reset();
      setFileState(null);
      app.setMessage(message, '任务已提交，后台开始处理。', 'success');
      await loadTasks();
    } catch (error) {
      if (uploadCompleted && !taskCreated) {
        const cleanup = await app.client.storage.from('amazon-report-inbox').remove([path]);
        if (cleanup.error) console.warn('上传文件清理失败', cleanup.error);
      }
      queueState.textContent = 'READY';
      setFileState(fileInput.files[0]);
      setPipelineState('input');
      app.setMessage(message, app.friendlyError(error), 'error');
    } finally {
      submit.disabled = false;
    }
  });

  (async () => {
    session = await app.requireSession();
    if (!session) return;
    document.getElementById('account-email').textContent = session.user.email || '已登录';
    updateSystemTime();
    await loadTasks();
    window.setInterval(updateSystemTime, 1000);
    window.setInterval(loadTasks, 30000);
  })();
})();
