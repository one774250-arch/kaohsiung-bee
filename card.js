(() => {
  'use strict';

  const PLATFORM_LABEL = {
    ig: 'IG', fb: 'FB', youtube: 'YouTube',
    threads: 'Threads', news: '新聞網', other: '其他',
  };

  // ---------- 裝置識別（跟主看板共用同一組，才能算進同一份已點閱紀錄） ----------
  const DEVICE_KEY = 'bee_device_id';
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }

  // 從網址路徑（/card/123）自己解析出卡片編號，不需要伺服器額外注入
  const match = window.location.pathname.match(/\/card\/(\d+)/);
  const LINK_ID = match ? parseInt(match[1], 10) : null;

  const cardPageLoading = document.getElementById('cardPageLoading');
  const cardPageError = document.getElementById('cardPageError');
  const cardPageBox = document.getElementById('cardPageBox');
  const cardPageTitle = document.getElementById('cardPageTitle');
  const cardPageMeta = document.getElementById('cardPageMeta');

  const exampleGroupSelect = document.getElementById('exampleGroupSelect');
  const exampleText = document.getElementById('exampleText');
  const btnRerollExample = document.getElementById('btnRerollExample');
  const btnGotoUrl = document.getElementById('btnGotoUrl');
  const btnGotoUrlNoComment = document.getElementById('btnGotoUrlNoComment');
  const btnCopyExample = document.getElementById('btnCopyExample');

  const copyConfirmBackdrop = document.getElementById('copyConfirmBackdrop');
  const copyConfirmText = document.getElementById('copyConfirmText');
  const btnCancelCopy = document.getElementById('btnCancelCopy');
  const btnConfirmCopy = document.getElementById('btnConfirmCopy');

  const toastEl = document.getElementById('toast');

  let linkData = null;
  let currentExample = null;
  let currentExampleConfirmed = false; // 是否已經按過「前往網址」，鎖定為真正已使用，不會再被釋放

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

  let 範例載入中 = false; // 進行中鎖：避免快速連續點擊重選時，釋放跟抽新句子的空窗期重疊，導致有句子洩漏卡在已使用狀態

  async function loadRandomExample(groupId) {
    if (範例載入中) return; // 上一次還沒處理完，這次點擊直接忽略
    範例載入中 = true;
    btnRerollExample.disabled = true;

    try {
      await 釋放目前範例();
      exampleText.textContent = '載入中…';
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
    } finally {
      範例載入中 = false;
      btnRerollExample.disabled = false;
    }
  }

  exampleGroupSelect.addEventListener('change', () => {
    if (exampleGroupSelect.value) loadRandomExample(exampleGroupSelect.value);
  });

  btnRerollExample.addEventListener('click', () => {
    if (exampleGroupSelect.value) loadRandomExample(exampleGroupSelect.value);
  });

  btnGotoUrl.addEventListener('click', async () => {
    if (!linkData) return;
    if (currentExample) currentExampleConfirmed = true; // 按下前往網址，這句話真正確定被使用掉
    window.open(linkData.url, '_blank', 'noopener');
    try {
      await fetch(`${API_URL}/api/links/${linkData.id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      });
    } catch (err) {
      // 標記失敗不影響使用者繼續操作
    }
  });

  btnGotoUrlNoComment.addEventListener('click', async () => {
    if (!linkData) return;
    // 不打算使用這句範例，明確標記為「未鎖定」，讓 釋放目前範例() 把它還給資源池
    currentExampleConfirmed = false;
    await 釋放目前範例();
    exampleText.textContent = '（已跳過，未使用這句範例）';

    window.open(linkData.url, '_blank', 'noopener');
    try {
      await fetch(`${API_URL}/api/links/${linkData.id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      });
    } catch (err) {
      // 標記失敗不影響使用者繼續操作
    }
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

    copyConfirmBackdrop.hidden = true;
    toast('已複製留言');
    // 複製後維持顯示原本這句，不自動重選；要換下一句需要使用者自己按「重選」
  });

  // 離開頁面時盡量把目前搶佔的範例釋放掉（最佳努力，不保證一定成功）；
  // 如果已經按過「前往網址」鎖定了，就不釋放，維持已使用狀態
  window.addEventListener('pagehide', () => {
    if (currentExample && !currentExampleConfirmed) {
      try {
        navigator.sendBeacon(
          `${API_URL}/api/comment-templates/${currentExample.id}/release`,
          new Blob([], { type: 'application/json' })
        );
      } catch (err) {
        // sendBeacon 不支援也沒關係，只是那句話暫時無法被別人抽到
      }
    }
  });

  async function init() {
    if (!LINK_ID) {
      cardPageLoading.hidden = true;
      cardPageError.hidden = false;
      return;
    }

    try {
      const linkRes = await fetch(`${API_URL}/api/links/${LINK_ID}`);
      if (!linkRes.ok) throw new Error('not found');
      linkData = await linkRes.json();

      cardPageTitle.textContent = linkData.title || '（未取得標題）';
      const platformLabel = PLATFORM_LABEL[linkData.platform] || linkData.platform;
      cardPageMeta.textContent = `${platformLabel}　由 ${linkData.creator_name || '匿名'} 新增`;

      const groupRes = await fetch(`${API_URL}/api/comment-groups?link_id=${LINK_ID}`);
      const groups = await groupRes.json();
      exampleGroupSelect.innerHTML = groups
        .map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`)
        .join('');

      cardPageLoading.hidden = true;
      cardPageBox.hidden = false;

      if (groups.length > 0) {
        await loadRandomExample(groups[0].id);
      } else {
        exampleText.textContent = '無可用的範例';
      }
    } catch (err) {
      cardPageLoading.hidden = true;
      cardPageError.hidden = false;
    }
  }

  init();
})();
