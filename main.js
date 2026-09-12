(() => {
  'use strict';

  // ---------- 裝置識別（免登入） ----------
  // 用瀏覽器 localStorage 儲存一組隨機 ID，代表「這個瀏覽器/裝置」，
  // 用來記錄「本人是否已點閱」，不同瀏覽器、不同裝置會被視為不同的人。
  const DEVICE_KEY = 'bee_device_id';
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }

  const PLATFORM_LABEL = {
    ig: 'IG', fb: 'FB', youtube: 'YouTube',
    threads: 'Threads', news: '新聞網', other: '其他',
  };

  const CATEGORY_LABEL = {
    report: '檢舉貼文', report_comment: '檢舉留言',
    share: '按讚分享貼文', share_comment: '按讚留言',
  };

  // 卡片上的標籤只需要區分是「貼文」還是「留言」，不用顯示完整分類名稱
  const CONTENT_TYPE_LABEL = {
    report: '貼文', share: '貼文',
    report_comment: '留言', share_comment: '留言',
  };

  // ---------- 新增者記憶清單（存在瀏覽器裡，換裝置或清資料會重置） ----------
  const CREATOR_KEY = 'bee_creator_names';

  function 取得常用新增者清單() {
    try {
      return JSON.parse(localStorage.getItem(CREATOR_KEY)) || [];
    } catch (_) {
      return [];
    }
  }

  function 記住新增者(name) {
    if (!name) return;
    const list = 取得常用新增者清單();
    const idx = list.indexOf(name);
    if (idx !== -1) list.splice(idx, 1);
    list.unshift(name);
    localStorage.setItem(CREATOR_KEY, JSON.stringify(list.slice(0, 20)));
    渲染新增者建議清單();
  }

  function 渲染新增者建議清單() {
    const datalist = document.getElementById('creatorSuggestions');
    if (!datalist) return;
    datalist.innerHTML = 取得常用新增者清單()
      .map(name => `<option value="${escapeHtml(name)}"></option>`)
      .join('');
  }

  // ---------- 民國年日期格式 ----------
  function 轉為民國日期(date) {
    const y = date.getFullYear() - 1911;
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  // ---------- DOM refs ----------
  const reportList = document.getElementById('reportList');
  const shareList = document.getElementById('shareList');
  const friendList = document.getElementById('friendList');
  const reportEmpty = document.getElementById('reportEmpty');
  const shareEmpty = document.getElementById('shareEmpty');
  const friendEmpty = document.getElementById('friendEmpty');

  const reportColumn = document.querySelector('.column-report');
  const shareColumn = document.querySelector('.column-share');
  const friendColumn = document.querySelector('.column-friend');
  const COLUMN_MAP = { report: reportColumn, share: shareColumn, friend: friendColumn };

  const mobileBtnReport = document.getElementById('mobileBtnReport');
  const mobileBtnShare = document.getElementById('mobileBtnShare');
  const mobileBtnFriend = document.getElementById('mobileBtnFriend');
  const reportBadge = document.getElementById('reportBadge');
  const shareBadge = document.getElementById('shareBadge');
  const friendBadge = document.getElementById('friendBadge');
  const btnCollapseSection = document.getElementById('btnCollapseSection');

  // ---------- 手機版：三大按鈕下鑽檢視 ----------
  function 開啟手機區塊(key) {
    document.body.classList.add('mobile-drilldown');
    Object.entries(COLUMN_MAP).forEach(([k, el]) => {
      el.classList.toggle('mobile-open', k === key);
    });
    btnCollapseSection.hidden = false;
  }

  function 關閉手機區塊() {
    document.body.classList.remove('mobile-drilldown');
    btnCollapseSection.hidden = true;
  }

  mobileBtnReport.addEventListener('click', () => 開啟手機區塊('report'));
  mobileBtnShare.addEventListener('click', () => 開啟手機區塊('share'));
  mobileBtnFriend.addEventListener('click', () => 開啟手機區塊('friend'));
  btnCollapseSection.addEventListener('click', 關閉手機區塊);

  // ---------- 本日新增未讀數（用來顯示按鈕右上角的徽章） ----------
  function 是否為今天(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate();
  }

  function 計算本日未讀數(items) {
    return items.filter(item => !item.is_read && 是否為今天(item.created_at)).length;
  }

  function 更新徽章(badgeEl, count) {
    badgeEl.hidden = count === 0;
  }

  const normalActions = document.getElementById('normalActions');
  const editModeActions = document.getElementById('editModeActions');
  const deleteActions = document.getElementById('deleteActions');
  const selectCountEl = document.getElementById('selectCount');

  const btnAdd = document.getElementById('btnAdd');
  const btnEnterEdit = document.getElementById('btnEnterEdit');
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  const btnEnterDelete = document.getElementById('btnEnterDelete');
  const btnCancelDelete = document.getElementById('btnCancelDelete');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');

  const addBackdrop = document.getElementById('addBackdrop');
  const addForm = document.getElementById('addForm');
  const addError = document.getElementById('addError');
  const btnCancelAdd = document.getElementById('btnCancelAdd');
  const btnSubmitAdd = document.getElementById('btnSubmitAdd');
  const urlInput = document.getElementById('urlInput');
  const titleInput = document.getElementById('titleInput');
  const titleFetchHint = document.getElementById('titleFetchHint');
  const addDateDisplay = document.getElementById('addDateDisplay');
  const creatorInput = document.getElementById('creatorInput');

  const editBackdrop = document.getElementById('editBackdrop');
  const editForm = document.getElementById('editForm');
  const editError = document.getElementById('editError');
  const btnCancelEditForm = document.getElementById('btnCancelEditForm');
  const btnSubmitEdit = document.getElementById('btnSubmitEdit');
  const editUrlInput = document.getElementById('editUrlInput');
  const editTitleInput = document.getElementById('editTitleInput');
  const editTitleFetchHint = document.getElementById('editTitleFetchHint');
  const editDateDisplay = document.getElementById('editDateDisplay');
  const editPriorityCheckbox = document.getElementById('editPriorityCheckbox');
  const editCreatorInput = document.getElementById('editCreatorInput');

  const confirmBackdrop = document.getElementById('confirmBackdrop');
  const confirmText = document.getElementById('confirmText');
  const btnCancelConfirm = document.getElementById('btnCancelConfirm');
  const btnDoDelete = document.getElementById('btnDoDelete');

  const toastEl = document.getElementById('toast');

  let deleteMode = false;
  let editMode = false;
  let selectedIds = new Set();
  let currentData = { report: [], share: [], friend: [] };

  // ---------- 工具函式 ----------
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.hidden = true; }, 2400);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- 讀取資料 ----------
  async function loadLinks() {
    try {
      const res = await fetch(`${API_URL}/api/links?device_id=${encodeURIComponent(deviceId)}`);
      if (!res.ok) throw new Error('載入失敗');
      currentData = await res.json();
      render();
    } catch (err) {
      toast('連結清單載入失敗，請重新整理頁面');
    }
  }

  function render() {
    renderColumn(reportList, reportEmpty, currentData.report || []);
    renderColumn(shareList, shareEmpty, currentData.share || []);
    renderColumn(friendList, friendEmpty, currentData.friend || []);

    更新徽章(reportBadge, 計算本日未讀數(currentData.report || []));
    更新徽章(shareBadge, 計算本日未讀數(currentData.share || []));
    更新徽章(friendBadge, 計算本日未讀數(currentData.friend || []));
  }

  function renderColumn(container, emptyEl, items) {
    container.innerHTML = '';
    emptyEl.hidden = items.length > 0;

    items.forEach((item, index) => {
      container.appendChild(renderCard(item, index + 1));
    });
  }

  function renderCard(item, seq) {
    const card = document.createElement('div');
    card.className = 'card' + (selectedIds.has(item.id) ? ' selected' : '') + (editMode ? ' editable' : '');
    card.dataset.id = item.id;

    const creator = item.creator_name ? escapeHtml(item.creator_name) : '匿名';
    const platformLabel = PLATFORM_LABEL[item.platform] || item.platform;
    const categoryLabel = CONTENT_TYPE_LABEL[item.category]; // 小帳加好友沒有對應值，不顯示這個標籤
    const titleText = item.title ? escapeHtml(item.title) : '（未取得標題，點擊查看內容）';
    const titleClass = item.title ? '' : ' no-title';
    const clickCount = item.click_count || 0;
    const dateLabel = item.created_at ? 轉為民國日期(new Date(item.created_at)) : '';

    card.innerHTML = `
      <span class="seq-badge">${seq}</span>
      ${deleteMode ? `<input type="checkbox" class="card-check" ${selectedIds.has(item.id) ? 'checked' : ''}>` : ''}
      <div class="card-body">
        <div class="card-title-row">
          ${item.is_priority ? '<span class="priority-badge">優先</span>' : ''}
          <a class="card-title${titleClass}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${titleText}</a>
        </div>
        <p class="card-meta">
          ${categoryLabel ? `<span class="category-tag">${escapeHtml(categoryLabel)}</span>` : ''}
          ${(item.is_batch_imported && item.platform === 'other') ? '' : `<span class="platform-tag">${escapeHtml(platformLabel)}</span>`}
          <span>由 ${creator} 新增</span>
          <span>${dateLabel}</span>
          <span class="click-count">點擊 ${clickCount} 次</span>
        </p>
      </div>
      ${(deleteMode || editMode) ? '' : `<span class="read-tag ${item.is_read ? 'read' : 'unread'}">${item.is_read ? '已點閱' : '尚未點閱'}</span>`}
    `;

    const link = card.querySelector('.card-title');
    const checkbox = card.querySelector('.card-check');

    if (deleteMode) {
      // 刪除模式下，只有核取方塊本身可以切換勾選，點卡片其他地方不會有反應
      checkbox.addEventListener('change', () => toggleSelect(item.id, card, checkbox));
    } else if (editMode) {
      // 修改模式下，點卡片（含標題）直接開啟修改視窗，不會另外開新分頁
      link.addEventListener('click', (e) => {
        e.preventDefault();
        openEditModal(item);
      });
      card.addEventListener('click', (e) => {
        if (e.target === link) return; // 已由上面的 link 監聽器處理，避免重複觸發
        openEditModal(item);
      });
    } else {
      link.addEventListener('click', () => markRead(item));
    }

    return card;
  }

  function toggleSelect(id, card, checkbox) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    card.classList.toggle('selected', selectedIds.has(id));
    checkbox.checked = selectedIds.has(id);
    updateSelectCount();
  }

  function updateSelectCount() {
    selectCountEl.textContent = `已選取 ${selectedIds.size} 筆`;
  }

  // ---------- 標記已點閱 ----------
  async function markRead(item) {
    if (item.is_read) return; // 已經讀過，不用重複打 API
    item.is_read = true; // 樂觀更新畫面
    render();
    try {
      await fetch(`${API_URL}/api/links/${item.id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      });
    } catch (err) {
      // 標記失敗不影響使用者繼續瀏覽，下次重新整理會再次嘗試
    }
  }

  // ---------- 新增連結 ----------
  btnAdd.addEventListener('click', () => {
    addForm.reset();
    addError.hidden = true;
    titleFetchHint.textContent = '貼上後將自動嘗試抓取標題';
    addDateDisplay.value = 轉為民國日期(new Date());
    渲染新增者建議清單();
    addBackdrop.hidden = false;
  });
  btnCancelAdd.addEventListener('click', () => { addBackdrop.hidden = true; });
  addBackdrop.addEventListener('click', (e) => {
    if (e.target === addBackdrop) addBackdrop.hidden = true;
  });

  // ---------- 批次新增 ----------
  const btnOpenBatchAdd = document.getElementById('btnOpenBatchAdd');
  const batchAddBackdrop = document.getElementById('batchAddBackdrop');
  const batchCategorySelect = document.getElementById('batchCategorySelect');
  const batchRawTextInput = document.getElementById('batchRawTextInput');
  const btnAnalyzeBatch = document.getElementById('btnAnalyzeBatch');
  const batchResultSection = document.getElementById('batchResultSection');
  const batchResultList = document.getElementById('batchResultList');
  const batchResultEmpty = document.getElementById('batchResultEmpty');
  const batchAddError = document.getElementById('batchAddError');
  const btnCancelBatchAdd = document.getElementById('btnCancelBatchAdd');
  const btnConfirmBatchAdd = document.getElementById('btnConfirmBatchAdd');

  let batchResults = []; // [{ id, title, platform, url }]
  let batchRowIdCounter = 0;

  const BATCH_PLATFORM_GUESS = [
    { pattern: /facebook\.com|fb\.com/i, platform: 'fb' },
    { pattern: /threads\.net|threads\.com/i, platform: 'threads' },
    { pattern: /youtube\.com|youtu\.be/i, platform: 'youtube' },
    { pattern: /instagram\.com/i, platform: 'ig' },
  ];

  function 猜測平台(url) {
    for (const { pattern, platform } of BATCH_PLATFORM_GUESS) {
      if (pattern.test(url)) return platform;
    }
    return 'other';
  }

  function 分析批次文字(rawText) {
    // 用空白行把整篇文字切成一段一段；每段裡最後一行如果是網址，
    // 就把這段變成一筆連結：除了網址以外的其他行合併當標題，開頭的項目符號會被去掉。
    // 如果某段最後一行不是網址（例如開頭的前言段落），整段直接忽略。
    const paragraphs = rawText.split(/\n\s*\n/);
    const urlOnlyLine = /^(https?:\/\/\S+)$/;
    const results = [];

    for (const para of paragraphs) {
      const lines = para.split('\n').map(l => l.trim()).filter(l => l !== '');
      if (lines.length === 0) continue;

      const lastLine = lines[lines.length - 1];
      if (!urlOnlyLine.test(lastLine)) continue; // 最後一行不是網址，當作前言忽略

      const url = lastLine;
      let title = lines.slice(0, -1).join(' ').trim();
      // 去掉開頭常見的項目符號，例如「(.)」「•」「-」「‧」
      title = title.replace(/^[(（\[]?\s*[•\-*・.·]\s*[)）\]]?\s*/, '').trim();

      results.push({ id: ++batchRowIdCounter, title, url, platform: 猜測平台(url) });
    }
    return results;
  }

  btnOpenBatchAdd.addEventListener('click', () => {
    addBackdrop.hidden = true;
    batchCategorySelect.value = 'report';
    batchRawTextInput.value = '';
    batchResultSection.hidden = true;
    batchResultList.innerHTML = '';
    batchAddError.hidden = true;
    btnConfirmBatchAdd.hidden = true;
    batchResults = [];
    batchAddBackdrop.hidden = false;
  });

  btnCancelBatchAdd.addEventListener('click', () => {
    batchAddBackdrop.hidden = true;
  });

  btnAnalyzeBatch.addEventListener('click', () => {
    batchAddError.hidden = true;
    const raw = batchRawTextInput.value;
    if (!raw.trim()) {
      toast('請先貼上原文');
      return;
    }
    batchResults = 分析批次文字(raw);
    renderBatchResultList();
    batchResultSection.hidden = false;
    btnConfirmBatchAdd.hidden = batchResults.length === 0;
  });

  function renderBatchResultList() {
    batchResultList.innerHTML = '';
    batchResultEmpty.hidden = batchResults.length > 0;

    batchResults.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'batch-result-row';
      row.innerHTML = `
        <textarea class="batch-title-input" rows="2" placeholder="標題（可自行修改）">${escapeHtml(item.title)}</textarea>
        <div class="batch-row-bottom">
          <input type="text" class="batch-url-input" value="${escapeHtml(item.url)}">
          <select class="batch-platform-select">
            <option value="ig">IG</option>
            <option value="fb">FB</option>
            <option value="youtube">YouTube</option>
            <option value="threads">Threads</option>
            <option value="news">新聞網</option>
            <option value="other">其他</option>
          </select>
          <button type="button" class="batch-delete-btn" title="刪除這一筆">🗑</button>
        </div>
      `;
      row.querySelector('.batch-platform-select').value = item.platform;

      row.querySelector('.batch-title-input').addEventListener('input', (e) => { item.title = e.target.value; });
      row.querySelector('.batch-url-input').addEventListener('input', (e) => { item.url = e.target.value; });
      row.querySelector('.batch-platform-select').addEventListener('change', (e) => { item.platform = e.target.value; });
      row.querySelector('.batch-delete-btn').addEventListener('click', () => {
        batchResults = batchResults.filter(r => r.id !== item.id);
        renderBatchResultList();
        btnConfirmBatchAdd.hidden = batchResults.length === 0;
      });

      batchResultList.appendChild(row);
    });
  }

  btnConfirmBatchAdd.addEventListener('click', async () => {
    if (batchResults.length === 0) return;
    btnConfirmBatchAdd.disabled = true;
    btnConfirmBatchAdd.textContent = '新增中…';

    try {
      const res = await fetch(`${API_URL}/api/links/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: batchCategorySelect.value,
          items: batchResults.map(r => ({ title: r.title, platform: r.platform, url: r.url })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        batchAddError.textContent = data.error || '批次新增失敗';
        batchAddError.hidden = false;
        return;
      }

      batchAddBackdrop.hidden = true;
      await loadLinks();
      toast(`已新增 ${data.length} 筆連結`);
    } catch (err) {
      batchAddError.textContent = '網路連線異常，請稍後再試';
      batchAddError.hidden = false;
    } finally {
      btnConfirmBatchAdd.disabled = false;
      btnConfirmBatchAdd.textContent = '確認新增全部';
    }
  });

  // 貼上網址、欄位失焦時，嘗試預覽抓取標題（抓不到就讓使用者自己填）
  urlInput.addEventListener('blur', async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    try {
      new URL(url); // 格式不對就不用打 API 了
    } catch (_) {
      return;
    }

    titleFetchHint.textContent = '正在嘗試抓取標題…';
    try {
      const res = await fetch(`${API_URL}/api/fetch-title?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.title) {
        titleInput.value = data.title;
        titleFetchHint.textContent = '已自動帶入標題，可自行修改';
      } else {
        const platformValue = addForm.elements['platform'].value;
        const platformLabel = PLATFORM_LABEL[platformValue];
        if (platformLabel) {
          titleInput.value = platformLabel;
          titleFetchHint.textContent = '抓不到標題，已自動帶入社群類型文字，可自行修改';
        } else {
          titleFetchHint.textContent = '抓不到標題，請手動輸入（尤其常見於 FB／IG／Threads）';
        }
      }
    } catch (err) {
      titleFetchHint.textContent = '抓取標題失敗，請手動輸入';
    }
  });

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    addError.hidden = true;
    const fd = new FormData(addForm);
    const payload = {
      category: fd.get('category'),
      platform: fd.get('platform'),
      url: fd.get('url'),
      title: fd.get('title'),
      creator_name: fd.get('creator_name'),
      is_priority: fd.get('is_priority') === 'on',
    };

    btnSubmitAdd.disabled = true;
    btnSubmitAdd.textContent = '新增中…';

    try {
      const res = await fetch(`${API_URL}/api/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        addError.textContent = data.error || '新增失敗，請確認欄位內容';
        addError.hidden = false;
        return;
      }

      記住新增者(payload.creator_name.trim());
      addBackdrop.hidden = true;
      await loadLinks();
      toast('已新增連結');
    } catch (err) {
      addError.textContent = '網路連線異常，請稍後再試';
      addError.hidden = false;
    } finally {
      btnSubmitAdd.disabled = false;
      btnSubmitAdd.textContent = '確認新增';
    }
  });

  // ---------- 修改模式 ----------
  btnEnterEdit.addEventListener('click', () => {
    editMode = true;
    normalActions.hidden = true;
    editModeActions.hidden = false;
    render();
  });

  function exitEditMode() {
    editMode = false;
    normalActions.hidden = false;
    editModeActions.hidden = true;
    render();
  }

  btnCancelEdit.addEventListener('click', exitEditMode);

  function openEditModal(item) {
    editForm.reset();
    editError.hidden = true;
    editForm.elements['id'].value = item.id;
    editForm.elements['category'].value = item.category;
    editForm.elements['platform'].value = item.platform;
    editUrlInput.value = item.url;
    editTitleInput.value = item.title || '';
    editCreatorInput.value = item.creator_name || '';
    editPriorityCheckbox.checked = !!item.is_priority;
    editDateDisplay.value = item.created_at ? 轉為民國日期(new Date(item.created_at)) : '';
    editTitleFetchHint.textContent = '可重新貼上網址並自動嘗試抓取標題';
    渲染新增者建議清單();
    editBackdrop.hidden = false;
  }

  btnCancelEditForm.addEventListener('click', () => {
    editBackdrop.hidden = true;
    exitEditMode();
  });
  editBackdrop.addEventListener('click', (e) => {
    if (e.target === editBackdrop) {
      editBackdrop.hidden = true;
      exitEditMode();
    }
  });

  editUrlInput.addEventListener('blur', async () => {
    const url = editUrlInput.value.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch (_) {
      return;
    }

    editTitleFetchHint.textContent = '正在嘗試抓取標題…';
    try {
      const res = await fetch(`${API_URL}/api/fetch-title?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.title) {
        editTitleInput.value = data.title;
        editTitleFetchHint.textContent = '已自動帶入標題，可自行修改';
      } else {
        const platformValue = editForm.elements['platform'].value;
        const platformLabel = PLATFORM_LABEL[platformValue];
        if (platformLabel) {
          editTitleInput.value = platformLabel;
          editTitleFetchHint.textContent = '抓不到標題，已自動帶入社群類型文字，可自行修改';
        } else {
          editTitleFetchHint.textContent = '抓不到標題，請手動輸入（尤其常見於 FB／IG／Threads）';
        }
      }
    } catch (err) {
      editTitleFetchHint.textContent = '抓取標題失敗，請手動輸入';
    }
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    editError.hidden = true;
    const fd = new FormData(editForm);
    const id = fd.get('id');
    const payload = {
      category: fd.get('category'),
      platform: fd.get('platform'),
      url: fd.get('url'),
      title: fd.get('title'),
      creator_name: fd.get('creator_name'),
      is_priority: fd.get('is_priority') === 'on',
    };

    btnSubmitEdit.disabled = true;
    btnSubmitEdit.textContent = '儲存中…';

    try {
      const res = await fetch(`${API_URL}/api/links/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        editError.textContent = data.error || '修改失敗，請確認欄位內容';
        editError.hidden = false;
        return;
      }

      記住新增者(payload.creator_name.trim());
      editBackdrop.hidden = true;
      exitEditMode();
      await loadLinks();
      toast('已儲存修改');
    } catch (err) {
      editError.textContent = '網路連線異常，請稍後再試';
      editError.hidden = false;
    } finally {
      btnSubmitEdit.disabled = false;
      btnSubmitEdit.textContent = '儲存修改';
    }
  });

  // ---------- 刪除模式 ----------
  btnEnterDelete.addEventListener('click', () => {
    deleteMode = true;
    selectedIds.clear();
    updateSelectCount();
    normalActions.hidden = true;
    deleteActions.hidden = false;
    render();
  });

  function exitDeleteMode() {
    deleteMode = false;
    selectedIds.clear();
    normalActions.hidden = false;
    deleteActions.hidden = true;
    render();
  }

  btnCancelDelete.addEventListener('click', exitDeleteMode);

  btnConfirmDelete.addEventListener('click', () => {
    if (selectedIds.size === 0) {
      toast('請先選取要刪除的項目');
      return;
    }
    confirmText.textContent = `確定刪除已選取的 ${selectedIds.size} 筆項目？此動作無法復原。`;
    confirmBackdrop.hidden = false;
  });

  btnCancelConfirm.addEventListener('click', () => { confirmBackdrop.hidden = true; });
  confirmBackdrop.addEventListener('click', (e) => {
    if (e.target === confirmBackdrop) confirmBackdrop.hidden = true;
  });

  btnDoDelete.addEventListener('click', async () => {
    const ids = Array.from(selectedIds);
    btnDoDelete.disabled = true;
    try {
      const res = await fetch(`${API_URL}/api/links/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('刪除失敗');
      confirmBackdrop.hidden = true;
      exitDeleteMode();
      await loadLinks();
      toast(`已刪除 ${ids.length} 筆項目`);
    } catch (err) {
      toast('刪除失敗，請稍後再試');
    } finally {
      btnDoDelete.disabled = false;
    }
  });

  // ---------- 初始化 ----------
  渲染新增者建議清單();
  loadLinks();
})();
