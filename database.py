import os
import json
import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL")

ALLOWED_CATEGORY = {"report", "report_comment", "share", "share_comment"}
ALLOWED_PLATFORM = {"ig", "fb", "youtube", "threads", "news", "other"}


def 分類所屬看板(category):
    """檢舉、檢舉留言 -> 檢舉區；按讚分享、按讚留言 -> 按讚分享區"""
    return "report" if category in ("report", "report_comment") else "share"


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


def 新增連結(category, platform, url, title, creator_name, is_priority=False):
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        INSERT INTO links (category, platform, url, title, creator_name, is_priority)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, category, platform, url, title, creator_name, created_at, is_priority
    """, (category, platform, url, title, creator_name, is_priority))

    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return dict(row)


def 取得所有連結(device_id):
    """回傳依分類分組的連結清單，每筆會附上「這個裝置」是否已讀，
    以及 click_count：不同裝置的累積點擊數（同一裝置重複點擊不重複計算，
    因為 link_reads 對 (link_id, device_id) 有唯一限制，一個裝置最多一筆紀錄）"""
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT l.id, l.category, l.platform, l.url, l.title, l.creator_name, l.created_at,
               l.is_priority,
               CASE WHEN r.id IS NULL THEN FALSE ELSE TRUE END AS is_read,
               COALESCE(rc.click_count, 0) AS click_count
        FROM links l
        LEFT JOIN link_reads r
          ON r.link_id = l.id AND r.device_id = %s
        LEFT JOIN (
            SELECT link_id, COUNT(*) AS click_count
            FROM link_reads
            GROUP BY link_id
        ) rc ON rc.link_id = l.id
        ORDER BY l.created_at DESC
    """, (device_id,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    分組結果 = {"report": [], "share": []}
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
