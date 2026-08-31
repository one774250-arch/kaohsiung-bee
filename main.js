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

  // ---------- DOM refs ----------
  const reportList = document.getElementById('reportList');
  const shareList = document.getElementById('shareList');
  const reportEmpty = document.getElementById('reportEmpty');
  const shareEmpty = document.getElementById('shareEmpty');

  const normalActions = document.getElementById('normalActions');
  const deleteActions = document.getElementById('deleteActions');
  const selectCountEl = document.getElementById('selectCount');

  const btnAdd = document.getElementById('btnAdd');
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

  const confirmBackdrop = document.getElementById('confirmBackdrop');
  const confirmText = document.getElementById('confirmText');
  const btnCancelConfirm = document.getElementById('btnCancelConfirm');
  const btnDoDelete = document.getElementById('btnDoDelete');

  const toastEl = document.getElementById('toast');

  let deleteMode = false;
  let selectedIds = new Set();
  let currentData = { report: [], share: [] };

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
  }

  function renderColumn(container, emptyEl, items) {
    container.innerHTML = '';
    emptyEl.hidden = items.length > 0;

    for (const item of items) {
      container.appendChild(renderCard(item));
    }
  }

  function renderCard(item) {
    const card = document.createElement('div');
    card.className = 'card' + (selectedIds.has(item.id) ? ' selected' : '');
    card.dataset.id = item.id;

    const creator = item.creator_name ? escapeHtml(item.creator_name) : '匿名';
    const platformLabel = PLATFORM_LABEL[item.platform] || item.platform;
    const titleText = item.title ? escapeHtml(item.title) : '（未取得標題，點擊查看內容）';
    const titleClass = item.title ? '' : ' no-title';

    card.innerHTML = `
      ${deleteMode ? `<input type="checkbox" class="card-check" ${selectedIds.has(item.id) ? 'checked' : ''}>` : ''}
      <div class="card-body">
        <a class="card-title${titleClass}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${titleText}</a>
        <p class="card-meta">
          <span class="platform-tag">${escapeHtml(platformLabel)}</span>
          <span>由 ${creator} 新增</span>
        </p>
      </div>
      ${deleteMode ? '' : `<span class="read-tag ${item.is_read ? 'read' : 'unread'}">${item.is_read ? '已點閱' : '尚未點閱'}</span>`}
    `;

    const link = card.querySelector('.card-title');
    const checkbox = card.querySelector('.card-check');

    if (deleteMode) {
      // 刪除模式下，只有核取方塊本身可以切換勾選，點卡片其他地方不會有反應
      checkbox.addEventListener('change', () => toggleSelect(item.id, card, checkbox));
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
  loadLinks();
})();
