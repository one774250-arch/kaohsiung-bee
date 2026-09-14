import os
import json
import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL")

ALLOWED_CATEGORY = {"report", "report_comment", "share", "share_comment", "friend_add"}
ALLOWED_PLATFORM = {"ig", "fb", "youtube", "threads", "news", "other"}


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
    """回傳這張卡片底下所有組別，附上總範例數與尚未使用的範例數"""
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT g.id, g.link_id, g.name, g.created_at,
               COUNT(t.id) AS total_count,
               COUNT(t.id) FILTER (WHERE t.is_used = FALSE) AS unused_count
        FROM comment_groups g
        LEFT JOIN comment_templates t ON t.group_id = g.id
        WHERE g.link_id = %s
        GROUP BY g.id
        ORDER BY g.created_at ASC
    """, (link_id,))
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


def 取得並鎖定隨機範例(group_id):
    """原子性地搶佔一則還沒使用的範例：選取的同時立刻標記為已使用，
    搭配 FOR UPDATE SKIP LOCKED，確保多人同時呼叫時，每個人一定拿到不同的範例
    （後面的人會自動跳過正被搶佔中的那一列，去搶別的），不會有兩人拿到同一句的狀況。
    """
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        UPDATE comment_templates
        SET is_used = TRUE
        WHERE id = (
            SELECT id FROM comment_templates
            WHERE group_id = %s AND is_used = FALSE
            ORDER BY RANDOM()
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, group_id, content
    """, (group_id,))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return dict(row) if row else None


def 釋放範例(template_id):
    """把範例重新標記為未使用，用在使用者重選／換組別／關閉視窗卻沒有真的複製的情況，
    讓這句話回到資源池，不會被白白浪費掉"""
    conn = 取得連線()
    cur = conn.cursor()
    cur.execute("UPDATE comment_templates SET is_used = FALSE WHERE id = %s", (template_id,))
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
