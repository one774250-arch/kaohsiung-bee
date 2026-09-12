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

  // ---------- 留言範本功能：狀態 ----------
  let commentSettingsPassword = null; // 通過驗證後暫存密碼，關閉留言設定面板後清空
  let commentSelectMode = false;      // 是否處於「留言設定：選取卡片」模式
  let managingLink = null;            // 目前在範本管理畫面裡編輯的卡片
  let managingGroups = [];            // 該卡片的組別清單
  let selectedGroupId = null;         // 範本管理畫面裡目前選中的組別
  let existingTemplates = [];         // 目前選中組別的既有範例（管理畫面用）

  let exampleLink = null;             // 目前開啟「留言範例」彈窗的卡片
  let currentExample = null;          // 目前彈窗顯示的範例 { id, content } 或 null
  let currentExampleConfirmed = false; // 是否已經按過「前往網址」，鎖定為真正已使用，不會再被釋放

  // ---------- 分享功能：狀態 ----------
  let shareMode = false; // 是否處於「分享：選取卡片」模式

  const btnEnterShare = document.getElementById('btnEnterShare');
  const shareActions = document.getElementById('shareActions');
  const shareSelectCount = document.getElementById('shareSelectCount');
  const btnConfirmShare = document.getElementById('btnConfirmShare');
  const btnCancelShare = document.getElementById('btnCancelShare');

  const shareComposeBackdrop = document.getElementById('shareComposeBackdrop');
  const shareRowList = document.getElementById('shareRowList');
  const btnAddTextRow = document.getElementById('btnAddTextRow');
  const btnCopyShareCompose = document.getElementById('btnCopyShareCompose');
  const quickPhraseList = document.getElementById('quickPhraseList');
  const newQuickPhraseInput = document.getElementById('newQuickPhraseInput');
  const btnAddQuickPhrase = document.getElementById('btnAddQuickPhrase');
  const btnCloseShareCompose = document.getElementById('btnCloseShareCompose');

  let shareComposeRows = []; // [{ id, url, title, isPlainText }]
  let shareRowIdCounter = 0;

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
    card.className = 'card'
      + (selectedIds.has(item.id) ? ' selected' : '')
      + (editMode || commentSelectMode ? ' editable' : '');
    card.dataset.id = item.id;

    const creator = item.creator_name ? escapeHtml(item.creator_name) : '匿名';
    const platformLabel = PLATFORM_LABEL[item.platform] || item.platform;
    const categoryLabel = CONTENT_TYPE_LABEL[item.category]; // 小帳加好友沒有對應值，不顯示這個標籤
    const titleText = item.title ? escapeHtml(item.title) : '（未取得標題，點擊查看內容）';
    const titleClass = item.title ? '' : ' no-title';
    const clickCount = item.click_count || 0;
    const dateLabel = item.created_at ? 轉為民國日期(new Date(item.created_at)) : '';
    const 一般瀏覽模式 = !deleteMode && !editMode && !commentSelectMode && !shareMode;
    const 顯示核取方塊 = deleteMode || shareMode;

    card.innerHTML = `
      <span class="seq-badge">${seq}</span>
      ${顯示核取方塊 ? `<input type="checkbox" class="card-check" ${selectedIds.has(item.id) ? 'checked' : ''}>` : ''}
      <div class="card-body">
        <div class="card-title-row">
          ${item.is_priority ? '<span class="priority-badge">優先</span>' : ''}
          ${((commentSelectMode || shareMode) && item.has_comment_templates) ? '<span class="has-template-badge">✓ 已建立留言範例</span>' : ''}
          <a class="card-title${titleClass}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${titleText}</a>
        </div>
        <p class="card-meta">
          ${categoryLabel ? `<span class="category-tag">${escapeHtml(categoryLabel)}</span>` : ''}
          ${(item.is_batch_imported && item.platform === 'other') ? '' : `<span class="platform-tag">${escapeHtml(platformLabel)}</span>`}
          <span>由 ${creator} 新增</span>
          <span>${dateLabel}</span>
          <span class="click-count">點擊 ${clickCount} 次</span>
        </p>
        ${(一般瀏覽模式 && item.has_comment_templates) ? '<button type="button" class="btn-example">💬 留言範例</button>' : ''}
      </div>
      ${一般瀏覽模式 ? `<span class="read-tag ${item.is_read ? 'read' : 'unread'}">${item.is_read ? '已點閱' : '尚未點閱'}</span>` : ''}
    `;

    const link = card.querySelector('.card-title');
    const checkbox = card.querySelector('.card-check');
    const exampleBtn = card.querySelector('.btn-example');

    if (deleteMode || shareMode) {
      // 刪除／分享模式下，只有核取方塊本身可以切換勾選，點卡片其他地方不會有反應
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
    } else if (commentSelectMode) {
      // 留言設定：選取卡片模式，點卡片直接開啟該卡片的範本管理畫面
      link.addEventListener('click', (e) => {
        e.preventDefault();
        selectCardForCommentSettings(item);
      });
      card.addEventListener('click', (e) => {
        if (e.target === link) return;
        selectCardForCommentSettings(item);
      });
    } else {
      link.addEventListener('click', () => markRead(item));
      if (exampleBtn) {
        exampleBtn.addEventListener('click', () => openExampleModal(item));
      }
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
    if (shareSelectCount) shareSelectCount.textContent = `已選取 ${selectedIds.size} 筆`;
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
          <button type="button" class="btn-icon batch-delete-btn" title="刪除這一筆">🗑</button>
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

  // ==================== 分享功能 ====================

  function enterShareMode() {
    shareMode = true;
    selectedIds.clear();
    updateSelectCount();
    normalActions.hidden = true;
    shareActions.hidden = false;
    render();
  }

  function exitShareMode() {
    shareMode = false;
    selectedIds.clear();
    shareActions.hidden = true;
    normalActions.hidden = false;
    render();
  }

  btnEnterShare.addEventListener('click', enterShareMode);
  btnCancelShare.addEventListener('click', exitShareMode);

  function 取得已選取的卡片() {
    const all = [
      ...(currentData.report || []),
      ...(currentData.share || []),
      ...(currentData.friend || []),
    ];
    return all.filter(item => selectedIds.has(item.id));
  }

  btnConfirmShare.addEventListener('click', () => {
    if (selectedIds.size === 0) {
      toast('請先選取要分享的卡片');
      return;
    }
    const items = 取得已選取的卡片();
    exitShareMode();
    openShareCompose(items);
  });

  function 產生隨機快取參數() {
    // 每次分享都用一個全新的參數，讓 LINE 等平台的預覽機器人把它當成新網址重新抓取，
    // 不會沿用之前抓過的舊快取（例如標題還沒修好之前抓到的版本）
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  }

  async function openShareCompose(items) {
    shareComposeRows = items.map(item => ({
      id: ++shareRowIdCounter,
      // 有留言範例的卡片，導向卡片獨立頁面（裡面可以直接使用留言範例功能）；
      // 沒有的話維持原本的轉址頁面（先記錄已點閱，再跳轉外部網址）
      url: item.has_comment_templates
        ? `${API_URL}/card/${item.id}?v=${產生隨機快取參數()}`
        : `${API_URL}/go/${item.id}?v=${產生隨機快取參數()}`,
      title: item.title || null,
      isPlainText: false,
    }));
    renderShareRows();
    shareComposeBackdrop.hidden = false;
    await loadQuickPhrases();
  }

  function renderShareRows() {
    shareRowList.innerHTML = '';
    shareComposeRows.forEach((row, index) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'share-row';
      rowEl.innerHTML = `
        <div class="share-row-move">
          <button type="button" class="btn-icon share-move-up" title="往上移" ${index === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="btn-icon share-move-down" title="往下移" ${index === shareComposeRows.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <textarea rows="1" class="share-row-input">${escapeHtml(row.url)}</textarea>
        <span class="share-row-title">${row.title ? escapeHtml(row.title) : (row.isPlainText ? '' : '（未取得標題）')}</span>
        <button type="button" class="btn-icon share-row-delete" title="刪除這一行">🗑</button>
      `;

      rowEl.querySelector('.share-row-input').addEventListener('input', (e) => {
        row.url = e.target.value; // 只更新資料，不重新渲染，避免打字時游標跳動
      });
      rowEl.querySelector('.share-move-up').addEventListener('click', () => 移動分享行(index, -1));
      rowEl.querySelector('.share-move-down').addEventListener('click', () => 移動分享行(index, 1));
      rowEl.querySelector('.share-row-delete').addEventListener('click', () => {
        shareComposeRows.splice(index, 1);
        renderShareRows();
      });

      shareRowList.appendChild(rowEl);
    });
  }

  function 移動分享行(index, delta) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= shareComposeRows.length) return;
    // 交換兩行的順序；因為標題是跟著該行的資料物件一起移動，不會脫勾
    const temp = shareComposeRows[index];
    shareComposeRows[index] = shareComposeRows[targetIndex];
    shareComposeRows[targetIndex] = temp;
    renderShareRows();
  }

  btnAddTextRow.addEventListener('click', () => {
    shareComposeRows.push({ id: ++shareRowIdCounter, url: '', title: null, isPlainText: true });
    renderShareRows();
    const inputs = shareRowList.querySelectorAll('.share-row-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  async function loadQuickPhrases() {
    quickPhraseList.innerHTML = '載入中…';
    try {
      const res = await fetch(`${API_URL}/api/quick-phrases`);
      const phrases = await res.json();
      renderQuickPhraseList(phrases);
    } catch (err) {
      quickPhraseList.innerHTML = '';
      toast('常用文字載入失敗');
    }
  }

  function renderQuickPhraseList(phrases) {
    quickPhraseList.innerHTML = '';
    if (phrases.length === 0) {
      quickPhraseList.innerHTML = '<p class="empty-hint">還沒有任何常用文字，可以在下方新增。</p>';
      return;
    }
    phrases.forEach((p) => {
      const chip = document.createElement('div');
      chip.className = 'quick-phrase-chip';
      chip.innerHTML = `
        <span class="quick-phrase-text">${escapeHtml(p.content)}</span>
        <button type="button" class="btn-icon quick-phrase-delete" title="刪除">✕</button>
      `;
      chip.querySelector('.quick-phrase-text').addEventListener('click', () => {
        // 常用文字以新增一行文字行的方式加到清單最下方
        shareComposeRows.push({ id: ++shareRowIdCounter, url: p.content, title: null, isPlainText: true });
        renderShareRows();
      });
      chip.querySelector('.quick-phrase-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('確定刪除這則常用文字嗎？')) return;
        try {
          const res = await fetch(`${API_URL}/api/quick-phrases/${p.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error();
          await loadQuickPhrases();
        } catch (err) {
          toast('刪除失敗');
        }
      });
      quickPhraseList.appendChild(chip);
    });
  }

  btnAddQuickPhrase.addEventListener('click', async () => {
    const content = newQuickPhraseInput.value.trim();
    if (!content) {
      toast('請輸入內容');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/quick-phrases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || '新增失敗');
        return;
      }
      newQuickPhraseInput.value = '';
      await loadQuickPhrases();
      toast('已新增常用文字');
    } catch (err) {
      toast('新增失敗，請稍後再試');
    }
  });

  btnCopyShareCompose.addEventListener('click', async () => {
    const combined = shareComposeRows.map(row => row.url).join('\n');
    try {
      await navigator.clipboard.writeText(combined);
      toast('已複製到剪貼簿');
    } catch (err) {
      toast('複製失敗，請手動選取文字複製');
    }
  });

  btnCloseShareCompose.addEventListener('click', () => {
    shareComposeBackdrop.hidden = true;
  });

  // ==================== 留言範本功能 ====================

  // ---------- DOM refs ----------
  const btnCommentSettings = document.getElementById('btnCommentSettings');
  const commentMenuActions = document.getElementById('commentMenuActions');
  const commentSelectActions = document.getElementById('commentSelectActions');
  const btnCommentManage = document.getElementById('btnCommentManage');
  const btnCommentSettingsClose = document.getElementById('btnCommentSettingsClose');
  const btnCancelCommentSelect = document.getElementById('btnCancelCommentSelect');

  const commentPasswordBackdrop = document.getElementById('commentPasswordBackdrop');
  const commentPasswordForm = document.getElementById('commentPasswordForm');
  const commentPasswordInput = document.getElementById('commentPasswordInput');
  const commentPasswordError = document.getElementById('commentPasswordError');
  const btnCancelCommentPassword = document.getElementById('btnCancelCommentPassword');

  const templateManageBackdrop = document.getElementById('templateManageBackdrop');
  const templateManageLinkTitle = document.getElementById('templateManageLinkTitle');
  const templateGroupList = document.getElementById('templateGroupList');
  const newGroupNameInput = document.getElementById('newGroupNameInput');
  const btnAddGroup = document.getElementById('btnAddGroup');
  const templateGroupDetail = document.getElementById('templateGroupDetail');
  const rawTextInput = document.getElementById('rawTextInput');
  const btnSplitText = document.getElementById('btnSplitText');
  const splitResultList = document.getElementById('splitResultList');
  const splitConfirmRow = document.getElementById('splitConfirmRow');
  const btnConfirmAddSplit = document.getElementById('btnConfirmAddSplit');
  const existingTemplateList = document.getElementById('existingTemplateList');
  const existingTemplateEmpty = document.getElementById('existingTemplateEmpty');
  const btnSaveTemplateEdits = document.getElementById('btnSaveTemplateEdits');
  const templateManageError = document.getElementById('templateManageError');
  const btnCloseTemplateManage = document.getElementById('btnCloseTemplateManage');

  const copyConfirmBackdrop = document.getElementById('copyConfirmBackdrop');
  const copyConfirmText = document.getElementById('copyConfirmText');
  const btnCancelCopy = document.getElementById('btnCancelCopy');
  const btnConfirmCopy = document.getElementById('btnConfirmCopy');

  const exampleBackdrop = document.getElementById('exampleBackdrop');
  const exampleGroupSelect = document.getElementById('exampleGroupSelect');
  const exampleText = document.getElementById('exampleText');
  const btnRerollExample = document.getElementById('btnRerollExample');
  const btnGotoUrl = document.getElementById('btnGotoUrl');
  const btnCopyExample = document.getElementById('btnCopyExample');
  const btnCloseExample = document.getElementById('btnCloseExample');

  // ---------- 密碼驗證 ----------
  btnCommentSettings.addEventListener('click', () => {
    commentPasswordInput.value = '';
    commentPasswordError.hidden = true;
    commentPasswordBackdrop.hidden = false;
    commentPasswordInput.focus();
  });

  btnCancelCommentPassword.addEventListener('click', () => {
    commentPasswordBackdrop.hidden = true;
  });

  commentPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    commentPasswordError.hidden = true;
    const password = commentPasswordInput.value;

    try {
      const res = await fetch(`${API_URL}/api/comment-settings/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.ok) {
        commentPasswordError.textContent = '密碼錯誤，請再試一次';
        commentPasswordError.hidden = false;
        return;
      }
      commentSettingsPassword = password;
      commentPasswordBackdrop.hidden = true;
      normalActions.hidden = true;
      commentMenuActions.hidden = false;
    } catch (err) {
      commentPasswordError.textContent = '連線失敗，請稍後再試';
      commentPasswordError.hidden = false;
    }
  });

  btnCommentSettingsClose.addEventListener('click', () => {
    // 關閉整個留言設定面板，密碼驗證失效，下次要重新輸入
    commentSettingsPassword = null;
    commentMenuActions.hidden = true;
    normalActions.hidden = false;
  });

  // ---------- 選取卡片模式 ----------
  function enterCommentSelectMode() {
    commentSelectMode = true;
    commentMenuActions.hidden = true;
    commentSelectActions.hidden = false;
    render();
  }

  function exitCommentSelectMode() {
    commentSelectMode = false;
    commentSelectActions.hidden = true;
    commentMenuActions.hidden = false;
    render();
  }

  btnCommentManage.addEventListener('click', enterCommentSelectMode);
  btnCancelCommentSelect.addEventListener('click', exitCommentSelectMode);

  function selectCardForCommentSettings(item) {
    exitCommentSelectMode();
    openTemplateManage(item);
  }

  // ---------- 範本管理畫面 ----------
  async function openTemplateManage(item) {
    managingLink = item;
    selectedGroupId = null;
    templateManageLinkTitle.textContent = item.title || item.url;
    templateManageError.hidden = true;
    templateGroupDetail.hidden = true;
    rawTextInput.value = '';
    splitResultList.innerHTML = '';
    splitConfirmRow.hidden = true;
    templateManageBackdrop.hidden = false;
    await loadManagingGroups();
  }

  async function loadManagingGroups() {
    try {
      const res = await fetch(`${API_URL}/api/comment-groups?link_id=${managingLink.id}`);
      managingGroups = await res.json();
    } catch (err) {
      managingGroups = [];
    }
    renderGroupList();
  }

  function renderGroupList() {
    templateGroupList.innerHTML = '';
    managingGroups.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'group-row' + (g.id === selectedGroupId ? ' selected' : '');
      row.innerHTML = `
        <span class="group-name">${escapeHtml(g.name)}</span>
        <span class="group-count">共 ${g.total_count} 則・未使用 ${g.unused_count} 則</span>
        <button type="button" class="btn-icon group-delete" title="刪除組別">✕</button>
      `;
      row.querySelector('.group-name').addEventListener('click', () => selectGroup(g.id));
      row.querySelector('.group-count').addEventListener('click', () => selectGroup(g.id));
      row.querySelector('.group-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`確定刪除「${g.name}」這個組別嗎？底下所有範例會一併刪除。`)) return;
        try {
          const res = await fetch(`${API_URL}/api/comment-groups/${g.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: commentSettingsPassword }),
          });
          if (!res.ok) throw new Error();
          if (selectedGroupId === g.id) {
            selectedGroupId = null;
            templateGroupDetail.hidden = true;
          }
          await loadManagingGroups();
          toast('已刪除組別');
        } catch (err) {
          toast('刪除組別失敗');
        }
      });
      templateGroupList.appendChild(row);
    });
  }

  btnAddGroup.addEventListener('click', async () => {
    const name = newGroupNameInput.value.trim();
    if (!name) {
      toast('請輸入組別名稱');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/comment-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: commentSettingsPassword, link_id: managingLink.id, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || '新增組別失敗');
        return;
      }
      newGroupNameInput.value = '';
      await loadManagingGroups();
      selectGroup(data.id);
      toast('已新增組別');
    } catch (err) {
      toast('新增組別失敗，請稍後再試');
    }
  });

  async function selectGroup(groupId) {
    selectedGroupId = groupId;
    renderGroupList();
    templateGroupDetail.hidden = false;
    rawTextInput.value = '';
    splitResultList.innerHTML = '';
    splitConfirmRow.hidden = true;
    await loadExistingTemplates();
  }

  async function loadExistingTemplates() {
    try {
      const res = await fetch(`${API_URL}/api/comment-templates?group_id=${selectedGroupId}`);
      existingTemplates = await res.json();
    } catch (err) {
      existingTemplates = [];
    }
    renderExistingTemplateList();
  }

  function renderExistingTemplateList() {
    existingTemplateList.innerHTML = '';
    existingTemplateEmpty.hidden = existingTemplates.length > 0;

    existingTemplates.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'template-row';
      row.dataset.id = t.id;
      row.innerHTML = `
        <textarea rows="2">${escapeHtml(t.content)}</textarea>
        <button type="button" class="btn-icon template-delete" title="刪除">🗑</button>
      `;
      row.querySelector('.template-delete').addEventListener('click', async () => {
        if (!confirm('確定刪除這則範例嗎？')) return;
        try {
          const res = await fetch(`${API_URL}/api/comment-templates/${t.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: commentSettingsPassword }),
          });
          if (!res.ok) throw new Error();
          await loadExistingTemplates();
          await loadManagingGroups();
          toast('已刪除範例');
        } catch (err) {
          toast('刪除失敗');
        }
      });
      existingTemplateList.appendChild(row);
    });
  }

  btnSplitText.addEventListener('click', () => {
    const raw = rawTextInput.value;
    if (!raw) {
      toast('請先貼上原文');
      return;
    }
    const segments = raw.split('\n');
    splitResultList.innerHTML = '';
    segments.forEach((seg) => {
      const row = document.createElement('div');
      row.className = 'template-row';
      row.innerHTML = `
        <textarea rows="2">${escapeHtml(seg)}</textarea>
        <button type="button" class="btn-icon split-delete" title="刪除這一則">🗑</button>
      `;
      row.querySelector('.split-delete').addEventListener('click', () => row.remove());
      splitResultList.appendChild(row);
    });
    splitConfirmRow.hidden = segments.length === 0;
  });

  btnConfirmAddSplit.addEventListener('click', async () => {
    const contents = Array.from(splitResultList.querySelectorAll('textarea')).map(t => t.value);
    const 有效內容 = contents.filter(c => c.trim() !== '');
    if (有效內容.length === 0) {
      toast('沒有可新增的內容');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/comment-templates/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: commentSettingsPassword, group_id: selectedGroupId, contents: 有效內容 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || '新增失敗');
        return;
      }
      rawTextInput.value = '';
      splitResultList.innerHTML = '';
      splitConfirmRow.hidden = true;
      await loadExistingTemplates();
      await loadManagingGroups();
      toast(`已新增 ${有效內容.length} 則範例`);
    } catch (err) {
      toast('新增失敗，請稍後再試');
    }
  });

  btnSaveTemplateEdits.addEventListener('click', async () => {
    const rows = Array.from(existingTemplateList.querySelectorAll('.template-row'));
    let 成功數 = 0;
    let 失敗數 = 0;

    for (const row of rows) {
      const id = row.dataset.id;
      const original = existingTemplates.find(t => String(t.id) === String(id));
      const newValue = row.querySelector('textarea').value.trim();
      if (!original || newValue === original.content) continue; // 沒改變就跳過
      if (!newValue) { 失敗數++; continue; } // 不允許改成空白

      try {
        const res = await fetch(`${API_URL}/api/comment-templates/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: commentSettingsPassword, content: newValue }),
        });
        if (res.ok) 成功數++; else 失敗數++;
      } catch (err) {
        失敗數++;
      }
    }

    await loadExistingTemplates();
    if (成功數 === 0 && 失敗數 === 0) {
      toast('沒有內容被修改');
    } else {
      toast(`已儲存 ${成功數} 則修改${失敗數 > 0 ? `，${失敗數} 則失敗` : ''}`);
    }
  });

  btnCloseTemplateManage.addEventListener('click', async () => {
    templateManageBackdrop.hidden = true;
    managingLink = null;
    selectedGroupId = null;
    await loadLinks(); // 卡片是否顯示「留言範例」按鈕可能已經改變，重新整理看板
  });

  // ---------- 卡片上的「留言範例」彈窗（公開功能，不需密碼） ----------
  // 範例一旦被抽到顯示出來，後端就會立刻標記為已使用（搶佔），避免多人同時抽到同一句；
  // 如果使用者重選、換組別、或關閉視窗卻沒有按下「前往網址」，就要把它釋放回去，才不會白白浪費掉；
  // 但只要按過一次「前往網址」，就代表這句話真正被拿去用了，之後就永久鎖定為已使用，不會再被釋放
  async function 釋放目前範例() {
    if (!currentExample) return;
    if (currentExampleConfirmed) { // 已鎖定，維持已使用狀態，不釋放
      currentExample = null;
      currentExampleConfirmed = false;
      return;
    }
    const id = currentExample.id;
    currentExample = null;
    try {
      await fetch(`${API_URL}/api/comment-templates/${id}/release`, { method: 'POST' });
    } catch (err) {
      // 釋放失敗只是那句話暫時無法被別人抽到，不影響目前使用者的操作
    }
  }

  async function openExampleModal(item) {
    exampleLink = item;
    currentExample = null;
    currentExampleConfirmed = false;
    exampleText.textContent = '載入中…';
    exampleBackdrop.hidden = false;

    try {
      const res = await fetch(`${API_URL}/api/comment-groups?link_id=${item.id}`);
      const groups = await res.json();
      exampleGroupSelect.innerHTML = groups
        .map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`)
        .join('');
      if (groups.length > 0) {
        await loadRandomExample(groups[0].id);
      } else {
        exampleText.textContent = '無可用的範例';
      }
    } catch (err) {
      exampleText.textContent = '載入失敗，請稍後再試';
    }
  }

  async function loadRandomExample(groupId) {
    await 釋放目前範例(); // 換一句之前，先處理手上這句（鎖定的話維持已使用，否則還給資源池）
    exampleText.textContent = '載入中…';
    try {
      const res = await fetch(`${API_URL}/api/comment-templates/random?group_id=${groupId}`);
      const data = await res.json();
      if (data) {
        currentExample = data;
        currentExampleConfirmed = false;
        exampleText.textContent = data.content;
      } else {
        currentExample = null;
        exampleText.textContent = '無可用的範例';
      }
    } catch (err) {
      currentExample = null;
      exampleText.textContent = '載入失敗，請稍後再試';
    }
  }

  exampleGroupSelect.addEventListener('change', () => {
    if (exampleGroupSelect.value) loadRandomExample(exampleGroupSelect.value);
  });

  btnRerollExample.addEventListener('click', () => {
    if (exampleGroupSelect.value) loadRandomExample(exampleGroupSelect.value);
  });

  btnGotoUrl.addEventListener('click', () => {
    if (!exampleLink) return;
    if (currentExample) currentExampleConfirmed = true; // 按下前往網址，這句話真正確定被使用掉
    window.open(exampleLink.url, '_blank', 'noopener');
    markRead(exampleLink);
  });

  btnCopyExample.addEventListener('click', () => {
    if (!currentExample) {
      toast('無可用的範例可複製');
      return;
    }
    copyConfirmText.textContent = currentExample.content;
    copyConfirmBackdrop.hidden = false;
  });

  btnCancelCopy.addEventListener('click', () => { copyConfirmBackdrop.hidden = true; });

  btnConfirmCopy.addEventListener('click', async () => {
    if (!currentExample) { copyConfirmBackdrop.hidden = true; return; }
    const { content } = currentExample;

    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      // 部分瀏覽器/非 HTTPS 環境可能無法使用剪貼簿 API，不中斷流程
    }
    // 這句在顯示出來的時候就已經標記為已使用了，這裡不用再額外呼叫 API 標記

    copyConfirmBackdrop.hidden = true;
    toast('已複製留言');
    // 複製後維持顯示原本這句，不自動重選；要換下一句需要使用者自己按「重選」
  });

  btnCloseExample.addEventListener('click', async () => {
    await 釋放目前範例(); // 沒按過前往網址就關閉視窗，把這句還給資源池；按過的話會維持已使用
    exampleBackdrop.hidden = true;
    exampleLink = null;
  });

  // ---------- 初始化 ----------
  渲染新增者建議清單();
  loadLinks();
})();
