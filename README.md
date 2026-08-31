# 高雄小蜜蜂｜共用連結看板（Flask + PostgreSQL 版）

架構比照你之前「社團接引路線追蹤」網頁：Flask 後端 + PostgreSQL 資料庫，
用 `DATABASE_URL` 環境變數連線、`config.js` 讓前端自動判斷 API 網址、`Procfile` 部署。

## 專案結構

```
kaohsiung-bee-flask/
├── app.py             Flask 路由（新增／查詢／刪除／標記已讀）
├── database.py        資料庫存取（psycopg2，建表、CRUD）
├── fetch_title.py      網址標題自動抓取，失敗安靜回傳 None
├── requirements.txt
├── Procfile           部署啟動指令
├── config.js          前端自動判斷 API_URL
├── index.html         主頁看板
├── style.css
└── main.js            前端互動邏輯
```

---

## 第一步：本機安裝環境

1. 確認電腦已安裝 **Python 3.9 以上版本**：
   ```bash
   python3 --version
   ```

2. 進入專案資料夾，建立虛擬環境（跟原本專案習慣一樣，避免套件裝到全域環境）：
   ```bash
   cd kaohsiung-bee-flask
   python3 -m venv venv
   source venv/bin/activate        # Windows 用 venv\Scripts\activate
   ```

3. 安裝套件：
   ```bash
   pip install -r requirements.txt
   ```

---

## 第二步：準備一個 PostgreSQL 資料庫

你需要一組 `DATABASE_URL` 連線字串，格式長這樣：
```
postgresql://使用者名稱:密碼@主機:5432/資料庫名稱
```

**如果你延用之前「社團接引路線追蹤」的 Render 帳號**，最簡單的做法：直接在 Render 後台
新增**另一個** PostgreSQL 資料庫（不要跟原本軌跡追蹤的資料庫共用，兩個專案的資料表不同，
混在一起容易搞混），複製它的 **External Database URL** 來用。

**如果想先在自己電腦上測試**，兩個選擇：

- **選擇 A：本機安裝 PostgreSQL**
  - Mac：`brew install postgresql@16 && brew services start postgresql@16`
  - Windows：到 [postgresql.org](https://www.postgresql.org/download/windows/) 下載安裝精靈
  - 安裝完成後建立資料庫：
    ```bash
    createdb kaohsiung_bee
    ```
  - 本機連線字串通常是：
    ```
    postgresql://你的電腦帳號@localhost:5432/kaohsiung_bee
    ```

- **選擇 B：先申請一個免費雲端資料庫來測試**（不用自己裝 PostgreSQL）
  - [Neon](https://neon.tech)、[Supabase](https://supabase.com)、或 Render 的免費 PostgreSQL 都可以
  - 註冊後建立一個新專案，複製它給的連線字串（通常也是 `postgresql://...` 格式）

---

## 第三步：設定環境變數，啟動本機測試

在專案資料夾下設定 `DATABASE_URL`（換成你自己的連線字串）：

```bash
export DATABASE_URL="postgresql://使用者名稱:密碼@主機:5432/資料庫名稱"
python app.py
```

看到以下訊息代表成功：
```
資料庫初始化完成！
 * Running on http://0.0.0.0:5000
```

打開瀏覽器前往 `http://localhost:5000`，就會看到「高雄小蜜蜂」主頁。

> 第一次啟動時，程式會自動建立 `links` 和 `link_reads` 兩張資料表，不需要手動跑 SQL。

---

## 第四步：部署到正式環境（以 Render 為例，比照你之前的做法）

1. 把整個 `kaohsiung-bee-flask` 資料夾推上 GitHub（開一個新的 repository，
   跟軌跡追蹤那個專案分開，避免兩邊程式碼互相覆蓋）。

2. 到 [Render](https://render.com) 後台：
   - 點選 **New → Web Service**，選擇你剛剛推上去的 GitHub repository
   - Build Command 留空或填 `pip install -r requirements.txt`
   - Start Command 會自動抓 `Procfile` 裡的 `gunicorn app:app`，不用另外填

3. 到 Render 後台新增一個 **New → PostgreSQL**（免費方案即可），
   建立完成後複製它的 **Internal Database URL**。

4. 回到剛剛建立的 Web Service，進到 **Environment** 分頁，新增環境變數：
   ```
   DATABASE_URL = 剛剛複製的連線字串
   ```

5. 儲存後 Render 會自動重新部署，等它跑完，網址就能直接開啟使用了。

---

## API 一覽

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET  | `/api/links?device_id=xxx` | 取得所有連結，依分類分組，附上該裝置的已讀狀態 |
| POST | `/api/links` | 新增連結，body：`{ category, platform, url, creator_name }` |
| POST | `/api/links/bulk-delete` | 複選刪除，body：`{ ids: [1, 2, 3] }` |
| POST | `/api/links/<id>/read` | 標記該裝置已點閱，body：`{ device_id }` |

## 尚未處理、可再討論的事項

- **刪除權限**：目前任何人都能刪除任一筆連結，尚未區分「新增者本人／管理員」才能刪除。
- **身分識別**：用瀏覽器 `localStorage` 存一組隨機 ID 代表「這個裝置」，換瀏覽器或清除
  瀏覽器資料會被視為不同的人；如果之後想比照軌跡追蹤那個專案做「帳號登入＋主管審核」，
  `database.py` 裡的 bcrypt 密碼雜湊、`users` 資料表都可以直接搬過來用同一套邏輯。
- **標題抓取限制**：IG、Threads 等平台常見反爬蟲機制擋下請求，抓取失敗屬於預期行為，
  卡片會直接顯示網址本身，不會出現錯誤訊息。

## 跟原本軌跡追蹤專案的差異

- 原本專案有 Flask-SocketIO 做即時定位廣播；這個看板不需要即時性，所以沒有加 SocketIO，
  純粹用一般的 API 請求／回應。如果之後想要「有人新增連結時，其他人畫面自動跳出新項目」，
  可以直接參考 `app.py` 裡 SocketIO 的寫法加回來。
- 原本專案用 `bcrypt` 做登入密碼加密；這個看板目前免登入，所以沒有用到。
