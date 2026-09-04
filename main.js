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
          <span class="platform-tag">${escapeHtml(platformLabel)}</span>
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
        titleFetchHint.textContent = '抓不到標題，請手動輸入（尤其常見於 FB／IG／Threads）';
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
        editTitleFetchHint.textContent = '抓不到標題，請手動輸入（尤其常見於 FB／IG／Threads）';
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
