import os
import json
import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL")

ALLOWED_CATEGORY = {"report", "report_comment", "share", "share_comment", "friend_add"}
ALLOWED_PLATFORM = {"ig", "fb", "youtube", "threads", "news", "other"}

# 留言範例搶佔後，如果超過這麼多秒都沒有被真正確認使用，視為逾時、可以被重新抽選。
# 這個數字要跟「抽選」跟「統計未使用則數」兩處保持一致，所以抽出來共用。
範例逾時秒數 = 50


def 分類所屬看板(category):
    """檢舉、檢舉留言 -> 檢舉區；按讚分享、按讚留言 -> 按讚分享區；小帳加好友 -> 小帳加好友區"""
    if category in ("report", "report_comment"):
        return "report"
    if category in ("share", "share_comment"):
        return "share"
    return "friend"


def 取得連線():
    return psycopg2.connect(DATABASE_URL)


def 初始化資料庫():
    conn = 取得連線()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS links (
            id SERIAL PRIMARY KEY,
            category TEXT NOT NULL,
            platform TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            creator_name TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # 遷移：舊版資料表把分類限制在 report/share 兩種，現在要開放 report_comment/share_comment，
    # 用 IF EXISTS 讓這段在全新資料庫、或已經跑過一次的資料庫上都能安全重複執行
    cur.execute("ALTER TABLE links DROP CONSTRAINT IF EXISTS links_category_check")
    cur.execute("ALTER TABLE links ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT FALSE")
    cur.execute("ALTER TABLE links ADD COLUMN IF NOT EXISTS is_batch_imported BOOLEAN NOT NULL DEFAULT FALSE")

    # 留言範本功能：組別、留言範例兩張表
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comment_groups (
            id SERIAL PRIMARY KEY,
            link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comment_templates (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL REFERENCES comment_groups(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            is_used BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    # 搶佔時間戳記＋是否已「真正確認使用」：用來實作自動逾時回收機制，
    # 就算前端因為分頁被強制關閉、當機等極端情況沒能成功送出釋放請求，
    # 逾時之後這句範例還是會自動被視為可用，不會永久卡住
    cur.execute("ALTER TABLE comment_templates ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP")
    cur.execute("ALTER TABLE comment_templates ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT FALSE")
    # 記錄「確認使用」當下是哪個裝置，才能統計出「不重複裝置數」給後台的使用統計參考
    cur.execute("ALTER TABLE comment_templates ADD COLUMN IF NOT EXISTS confirmed_by_device TEXT")

    # 分享功能：常用文字（單純一張清單，不分組、不跟卡片綁定）
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quick_phrases (
            id SERIAL PRIMARY KEY,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS link_reads (
            id SERIAL PRIMARY KEY,
            link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
            device_id TEXT NOT NULL,
            read_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(link_id, device_id)
        )
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("資料庫初始化完成！")


def 新增連結(category, platform, url, title, creator_name, is_priority=False, is_batch_imported=False):
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        INSERT INTO links (category, platform, url, title, creator_name, is_priority, is_batch_imported)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, category, platform, url, title, creator_name, created_at, is_priority, is_batch_imported
    """, (category, platform, url, title, creator_name, is_priority, is_batch_imported))

    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return dict(row)


def 批次新增連結(category, items):
    """items: [{title, platform, url}, ...]，全部標記為批次匯入建立"""
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    新增結果 = []
    for item in items:
        cur.execute("""
            INSERT INTO links (category, platform, url, title, creator_name, is_priority, is_batch_imported)
            VALUES (%s, %s, %s, %s, NULL, FALSE, TRUE)
            RETURNING id, category, platform, url, title, creator_name, created_at, is_priority, is_batch_imported
        """, (category, item["platform"], item["url"], item["title"]))
        新增結果.append(dict(cur.fetchone()))
    conn.commit()
    cur.close()
    conn.close()
    return 新增結果


def 取得所有連結(device_id):
    """回傳依分類分組的連結清單，每筆會附上「這個裝置」是否已讀，
    以及 click_count：不同裝置的累積點擊數（同一裝置重複點擊不重複計算，
    因為 link_reads 對 (link_id, device_id) 有唯一限制，一個裝置最多一筆紀錄）"""
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT l.id, l.category, l.platform, l.url, l.title, l.creator_name, l.created_at,
               l.is_priority, l.is_batch_imported,
               CASE WHEN r.id IS NULL THEN FALSE ELSE TRUE END AS is_read,
               COALESCE(rc.click_count, 0) AS click_count,
               CASE WHEN cg.link_id IS NULL THEN FALSE ELSE TRUE END AS has_comment_templates
        FROM links l
        LEFT JOIN link_reads r
          ON r.link_id = l.id AND r.device_id = %s
        LEFT JOIN (
            SELECT link_id, COUNT(*) AS click_count
            FROM link_reads
            GROUP BY link_id
        ) rc ON rc.link_id = l.id
        LEFT JOIN (
            SELECT DISTINCT link_id FROM comment_groups
        ) cg ON cg.link_id = l.id
        ORDER BY l.created_at DESC
    """, (device_id,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    分組結果 = {"report": [], "share": [], "friend": []}
    for row in rows:
        item = dict(row)
        item["created_at"] = item["created_at"].isoformat() if item["created_at"] else None
        分組結果[分類所屬看板(item["category"])].append(item)

    return 分組結果


def 更新連結(link_id, category, platform, url, title, creator_name, is_priority=False):
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("""
        UPDATE links
        SET category = %s, platform = %s, url = %s, title = %s, creator_name = %s, is_priority = %s
        WHERE id = %s
    """, (category, platform, url, title, creator_name, is_priority, link_id))
    影響筆數 = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return 影響筆數 > 0


def 刪除連結(ids):
    if not ids:
        return 0
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("DELETE FROM links WHERE id = ANY(%s)", (ids,))
    影響筆數 = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return 影響筆數


def 標記已讀(link_id, device_id):
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO link_reads (link_id, device_id)
        VALUES (%s, %s)
        ON CONFLICT (link_id, device_id) DO NOTHING
    """, (link_id, device_id))
    conn.commit()
    cur.close()
    conn.close()


def 取得連結網址(link_id):
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("SELECT url FROM links WHERE id = %s", (link_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else None


def 取得單筆連結(link_id, device_id=None):
    """device_id 有給的話，會一併查詢這個裝置對這筆連結的已讀狀態（is_read）；
    沒給（例如 /go、/card 頁面伺服器端渲染時使用）就只回傳連結本身的資料，不含 is_read。"""
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if device_id:
        cur.execute("""
            SELECT l.id, l.category, l.platform, l.url, l.title, l.creator_name, l.created_at, l.is_priority,
                   CASE WHEN r.id IS NULL THEN FALSE ELSE TRUE END AS is_read
            FROM links l
            LEFT JOIN link_reads r ON r.link_id = l.id AND r.device_id = %s
            WHERE l.id = %s
        """, (device_id, link_id))
    else:
        cur.execute("""
            SELECT id, category, platform, url, title, creator_name, created_at, is_priority
            FROM links WHERE id = %s
        """, (link_id,))

    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else None


# ==================== 留言範本功能 ====================

def 新增組別(link_id, name):
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        INSERT INTO comment_groups (link_id, name)
        VALUES (%s, %s)
        RETURNING id, link_id, name, created_at
    """, (link_id, name))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return dict(row)


def 取得卡片組別(link_id):
    """回傳這張卡片底下所有組別，附上總範例數與尚未使用的範例數。

    「尚未使用」的判斷跟抽選時（取得並鎖定隨機範例）用同一套邏輯：
    包含從來沒被搶佔過的，也包含「搶佔後逾時卻沒被真正確認使用」的——
    這種逾時的範例雖然目前資料庫欄位還寫著已使用，但下次有人抽選時
    本來就會被自動收回、重新變成可抽，所以這裡的「未使用則數」統計，
    也要把它們算進去，才不會跟實際能抽到的數量對不起來。"""
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT g.id, g.link_id, g.name, g.created_at,
               COUNT(t.id) AS total_count,
               COUNT(t.id) FILTER (
                   WHERE t.is_used = FALSE
                      OR (t.confirmed = FALSE AND t.claimed_at < NOW() - (%s * INTERVAL '1 second'))
               ) AS unused_count
        FROM comment_groups g
        LEFT JOIN comment_templates t ON t.group_id = g.id
        WHERE g.link_id = %s
        GROUP BY g.id
        ORDER BY g.created_at ASC
    """, (範例逾時秒數, link_id))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def 刪除組別(group_id):
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("DELETE FROM comment_groups WHERE id = %s", (group_id,))
    影響筆數 = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return 影響筆數 > 0


def 新增留言範例列表(group_id, contents):
    """批次新增多則留言範例（文字分割匯入用）"""
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    新增結果 = []
    for text in contents:
        cur.execute("""
            INSERT INTO comment_templates (group_id, content)
            VALUES (%s, %s)
            RETURNING id, group_id, content, is_used, created_at
        """, (group_id, text))
        新增結果.append(dict(cur.fetchone()))
    conn.commit()
    cur.close()
    conn.close()
    return 新增結果


def 取得組別範例(group_id):
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, group_id, content, is_used, created_at
        FROM comment_templates
        WHERE group_id = %s
        ORDER BY created_at ASC
    """, (group_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def 更新留言範例(template_id, content):
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("UPDATE comment_templates SET content = %s WHERE id = %s", (content, template_id))
    影響筆數 = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return 影響筆數 > 0


def 刪除留言範例(template_id):
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("DELETE FROM comment_templates WHERE id = %s", (template_id,))
    影響筆數 = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return 影響筆數 > 0


def 取得並鎖定隨機範例(group_id, 逾時秒數=範例逾時秒數):
    """原子性地搶佔一則範例：選取的同時立刻標記為已使用，搭配 FOR UPDATE SKIP LOCKED，
    確保多人同時呼叫時，每個人一定拿到不同的範例。

    候選範圍包含兩種：
    1. 從來沒被用過的（is_used = FALSE）
    2. 曾經被搶佔、但超過「逾時秒數」都沒有被真正確認使用（confirmed = FALSE）的——
       這種情況代表當初搶佔的那個人，很可能是重選、換組別、或直接關掉分頁卻沒有
       成功送出釋放請求（例如分頁被強制關閉、瀏覽器當機），逾時後自動把它收回來，
       不會因為一次失敗的釋放請求就讓這句範例永久卡住、沒有人能再抽到。
    """
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        UPDATE comment_templates
        SET is_used = TRUE, claimed_at = NOW(), confirmed = FALSE
        WHERE id = (
            SELECT id FROM comment_templates
            WHERE group_id = %s
              AND (
                is_used = FALSE
                OR (confirmed = FALSE AND claimed_at < NOW() - (%s * INTERVAL '1 second'))
              )
            ORDER BY RANDOM()
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, group_id, content
    """, (group_id, 逾時秒數))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return dict(row) if row else None


def 確認範例已使用(template_id, device_id=None):
    """按下「前往網址」（且已經先複製過）時呼叫：把這句範例標記為「真正確認使用」，
    之後就算逾時，也不會被自動逾時回收機制收回去，永久維持已使用狀態。
    一併記錄是哪個裝置確認的，供後台統計「這張卡片被幾個不同裝置使用過」參考。"""
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute(
        "UPDATE comment_templates SET confirmed = TRUE, confirmed_by_device = %s WHERE id = %s",
        (device_id, template_id)
    )
    影響筆數 = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return 影響筆數 > 0


def 取得卡片留言使用統計(link_id):
    """統計這張卡片底下所有組別、所有已確認使用的範例：
    total_confirmed = 總共被確認使用過幾句
    distinct_devices = 不重複裝置數（同一裝置用過幾句都只算一個裝置）"""
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT
            COUNT(*) AS total_confirmed,
            COUNT(DISTINCT t.confirmed_by_device) AS distinct_devices
        FROM comment_templates t
        JOIN comment_groups g ON g.id = t.group_id
        WHERE g.link_id = %s AND t.confirmed = TRUE
    """, (link_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else {"total_confirmed": 0, "distinct_devices": 0}


def 釋放範例(template_id):
    """把範例重新標記為未使用，用在使用者重選／換組別／關閉視窗卻沒有真的使用的情況，
    讓這句話回到資源池，不會被白白浪費掉。多一層 confirmed = FALSE 的條件保護：
    萬一已經被確認使用過，就算不小心呼叫到這支，也不會被誤釋放。"""
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("""
        UPDATE comment_templates
        SET is_used = FALSE, claimed_at = NULL
        WHERE id = %s AND confirmed = FALSE
    """, (template_id,))
    影響筆數 = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return 影響筆數 > 0


# ==================== 分享功能：常用文字 ====================

def 新增常用文字(content):
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        INSERT INTO quick_phrases (content) VALUES (%s)
        RETURNING id, content, created_at
    """, (content,))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return dict(row)


def 取得常用文字清單():
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, content, created_at FROM quick_phrases ORDER BY created_at ASC")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def 刪除常用文字(phrase_id):
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("DELETE FROM quick_phrases WHERE id = %s", (phrase_id,))
    影響筆數 = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return 影響筆數 > 0
