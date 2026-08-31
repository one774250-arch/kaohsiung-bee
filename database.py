import os
import json
import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL")

ALLOWED_CATEGORY = {"report", "share"}
ALLOWED_PLATFORM = {"ig", "fb", "youtube", "threads", "news", "other"}


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


def 新增連結(category, platform, url, title, creator_name):
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        INSERT INTO links (category, platform, url, title, creator_name)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, category, platform, url, title, creator_name, created_at
    """, (category, platform, url, title, creator_name))

    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return dict(row)


def 取得所有連結(device_id):
    """回傳依分類分組的連結清單，每筆會附上「這個裝置」是否已讀"""
    conn = 取得連線()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT l.id, l.category, l.platform, l.url, l.title, l.creator_name, l.created_at,
               CASE WHEN r.id IS NULL THEN FALSE ELSE TRUE END AS is_read
        FROM links l
        LEFT JOIN link_reads r
          ON r.link_id = l.id AND r.device_id = %s
        ORDER BY l.created_at DESC
    """, (device_id,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    分組結果 = {"report": [], "share": []}
    for row in rows:
        item = dict(row)
        item["created_at"] = item["created_at"].isoformat() if item["created_at"] else None
        分組結果.setdefault(item["category"], []).append(item)

    return 分組結果


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
