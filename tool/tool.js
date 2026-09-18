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
  const asinEntries = document.getElementById('asin-entries');
  const addAsinEntry = document.getElementById('add-asin-entry');
  const taskSearch = document.getElementById('task-search');
  const taskStatusFilter = document.getElementById('task-status-filter');
  const taskArchiveFilter = document.getElementById('task-archive-filter');
  const taskFilterCount = document.getElementById('task-filter-count');
  let allTasks = [];
  let session;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  function addAsinRow(initial = {}) {
    const row = document.createElement('div');
    row.className = 'asin-entry-row';
    row.innerHTML = '<select class="asin-role" aria-label="ASIN 角色"><option value="self">自己</option><option value="competitor">竞对</option></select><input class="asin-entry" type="text" inputmode="text" autocomplete="off" maxlength="10" placeholder="B09V366BDY" aria-label="ASIN" /><button class="asin-remove" type="button" aria-label="移除此行">×</button>';
    row.querySelector('.asin-role').value = initial.role || 'competitor';
    row.querySelector('.asin-entry').value = initial.asin || '';
    row.querySelector('.asin-remove').addEventListener('click', () => {
      if (asinEntries.children.length > 1) row.remove();
    });
    asinEntries.append(row);
  }

  function readAsinEntries() {
    const entries = [...asinEntries.querySelectorAll('.asin-entry-row')]
      .map((row) => ({
        asin: row.querySelector('.asin-entry').value.trim().toUpperCase(),
        role: row.querySelector('.asin-role').value,
      }))
      .filter((entry) => entry.asin);
    if (entries.some((entry) => !/^B0[A-Z0-9]{8}$/.test(entry.asin))) throw new Error('每个 ASIN 需要是 10 位、以 B0 开头的编号。');
    if (entries.filter((entry) => entry.role === 'self').length !== 1) throw new Error('请标记且只标记 1 个“自己” ASIN。');
    if (new Set(entries.map((entry) => entry.asin)).size !== entries.length) throw new Error('ASIN 列表存在重复项。');
    const competitorCount = entries.filter((entry) => entry.role === 'competitor').length;
    if (competitorCount < 3 || competitorCount > 5) throw new Error('请填写 3 至 5 个竞对 ASIN。');
    return entries;
  }

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

  function getVisibleTasks() {
    const query = taskSearch.value.trim().toLowerCase();
    const status = taskStatusFilter.value;
    const archive = taskArchiveFilter.value;
    return allTasks
      .filter((task) => {
        if (archive === 'active' && task.is_archived) return false;
        if (archive === 'archived' && !task.is_archived) return false;
        if (status !== 'all' && task.status !== status) return false;
        if (!query) return true;
        return `${task.asin || ''} ${task.id || ''}`.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        if (Boolean(left.is_pinned) !== Boolean(right.is_pinned)) return left.is_pinned ? -1 : 1;
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      });
  }

  function renderTasks(tasks) {
    if (!tasks.length) {
      rowsElement.innerHTML = '<tr><td colspan="6" class="empty-state">没有符合当前筛选条件的任务</td></tr>';
      taskFilterCount.textContent = '0 条';
      return;
    }
    taskFilterCount.textContent = `${tasks.length} 条`;
    rowsElement.innerHTML = '';
    tasks.forEach((task) => {
      const row = document.createElement('tr');
      const reportCell = document.createElement('td');
      const failureCell = document.createElement('td');
      const actionCell = document.createElement('td');
      reportCell.className = 'right';
      failureCell.className = 'error-cell';
      actionCell.className = 'task-actions-cell';
      if (task.is_pinned) row.classList.add('is-pinned');
      if (task.is_archived) row.classList.add('is-archived');
      if (task.status === '已完成') {
        const link = document.createElement('a');
        link.href = `../report/?task=${encodeURIComponent(task.id)}`;
        link.textContent = '查看报告 →';
        reportCell.append(link);
      } else {
        reportCell.textContent = '-';
      }
      failureCell.textContent = task.failure_reason || '-';
      const timeCell = document.createElement('td');
      timeCell.textContent = app.formatDate(task.created_at);
      const asinCell = document.createElement('td');
      asinCell.className = 'task-asin-cell';
      asinCell.textContent = task.asin || '-';
      const statusCell = document.createElement('td');
      const status = document.createElement('span');
      status.className = 'inline-status';
      status.innerHTML = `<span class="status-dot ${escapeHtml(app.statusClass(task.status))}"></span>${escapeHtml(app.statusLabel(task.status))}${task.is_pinned ? '<span class="pin-mark" title="已置顶" aria-label="已置顶">★</span>' : ''}`;
      statusCell.append(status);
      const menu = document.createElement('details');
      menu.className = 'task-action-menu';
      menu.innerHTML = `<summary aria-label="打开任务操作菜单">•••</summary><div class="task-action-popover"><button type="button" data-task-action="pin">${task.is_pinned ? '取消置顶' : '置顶任务'}</button><button type="button" data-task-action="archive">${task.is_archived ? '取消归档' : '归档任务'}</button>${task.status === '已完成' ? `<a href="../report/?task=${encodeURIComponent(task.id)}">查看报告</a>` : ''}</div>`;
      menu.querySelector('[data-task-action="pin"]').addEventListener('click', () => updateTaskFlag(task, 'is_pinned'));
      menu.querySelector('[data-task-action="archive"]').addEventListener('click', () => updateTaskFlag(task, 'is_archived'));
      actionCell.append(menu);
      row.append(timeCell, asinCell, statusCell, reportCell, failureCell, actionCell);
      rowsElement.append(row);
    });
  }

  function refreshTaskView() {
    renderTasks(getVisibleTasks());
  }

  async function updateTaskFlag(task, field) {
    const nextValue = !Boolean(task[field]);
    const result = await app.client.from('analysis_tasks').update({ [field]: nextValue }).eq('id', task.id);
    if (result.error) {
      app.setMessage(message, app.friendlyError(result.error), 'error');
      return;
    }
    task[field] = nextValue;
    app.setMessage(message, field === 'is_pinned' ? (nextValue ? '任务已置顶。' : '任务已取消置顶。') : (nextValue ? '任务已归档。' : '任务已取消归档。'), 'success');
    refreshTaskView();
    renderTaskSummary(allTasks);
  }

  async function loadTasks() {
    const result = await app.client.from('analysis_tasks').select('id,asin,status,report_url,created_at,failure_reason,task_type,is_pinned,is_archived').order('created_at', { ascending: false });
    if (result.error) {
      lastRefresh.textContent = '同步失败';
      queueState.textContent = 'OFFLINE';
      taskStreamStatus.textContent = 'SYNC ERROR';
      rowsElement.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(app.friendlyError(result.error))}</td></tr>`;
      return;
    }
    allTasks = result.data || [];
    renderTaskSummary(allTasks);
    refreshTaskView();
  }

  document.getElementById('refresh-tasks').addEventListener('click', loadTasks);
  taskSearch.addEventListener('input', refreshTaskView);
  taskStatusFilter.addEventListener('change', refreshTaskView);
  taskArchiveFilter.addEventListener('change', refreshTaskView);
  fileInput.addEventListener('change', () => setFileState(fileInput.files[0]));
  addAsinEntry.addEventListener('click', () => addAsinRow({ role: 'competitor' }));
  document.getElementById('logout').addEventListener('click', async () => {
    await app.client.auth.signOut();
    window.location.href = '../';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let entries;
    try {
      entries = readAsinEntries();
    } catch (error) {
      app.setMessage(message, error.message, 'error');
      return;
    }
    const asin = entries.find((entry) => entry.role === 'self').asin;
    const coreKeyword = document.getElementById('core-keyword').value.trim();
    const file = document.getElementById('report-file').files[0];
    if (!file || !/\.(xlsx|csv)$/i.test(file.name)) {
      app.setMessage(message, '请选择 .xlsx 或 .csv 报表。', 'error');
      return;
    }
    if (file && file.size > 50 * 1024 * 1024) {
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
    const path = file ? `${session.user.id}/${taskId}.${file.name.split('.').pop().toLowerCase()}` : null;
    let uploadCompleted = false;
    let taskCreated = false;
    try {
      if (file) {
        const upload = await app.client.storage.from('amazon-report-inbox').upload(path, file, { upsert: false, contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        if (upload.error) throw upload.error;
        uploadCompleted = true;
      }
      setPipelineState('enrich');
      fileStatus.textContent = 'UPLOADED';
      const insert = await app.client.from('analysis_tasks').insert({
        id: taskId,
        user_id: session.user.id,
        asin,
        asin_entries: entries,
        core_keyword: coreKeyword || null,
        source_task_id: null,
        task_type: 'full',
        input_file_path: path,
        status: '待处理',
      });
      if (insert.error) throw insert.error;
      taskCreated = true;
      setPipelineState('decide');
      form.reset();
      asinEntries.innerHTML = '';
      addAsinRow({ role: 'self' });
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
    addAsinRow({ role: 'self' });
    document.getElementById('account-email').textContent = session.user.email || '已登录';
    updateSystemTime();
    await loadTasks();
    window.setInterval(updateSystemTime, 1000);
    window.setInterval(loadTasks, 30000);
  })();
})();
