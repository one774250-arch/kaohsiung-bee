import os
from flask import Flask, request, jsonify, send_from_directory, render_template_string
from flask_cors import CORS

from database import (
    初始化資料庫, 新增連結, 取得所有連結, 刪除連結, 標記已讀, 更新連結, 取得連結網址,
    ALLOWED_CATEGORY, ALLOWED_PLATFORM,
    新增組別, 取得卡片組別, 刪除組別,
    新增留言範例列表, 取得組別範例, 更新留言範例, 刪除留言範例,
    取得並鎖定隨機範例, 釋放範例,
    新增常用文字, 取得常用文字清單, 刪除常用文字,
)
from fetch_title import 抓取標題

app = Flask(__name__)
CORS(app)

初始化資料庫()

# 留言設定面板的密碼。之後如果要換掉，改這裡的值再重新部署即可。
COMMENT_SETTINGS_PASSWORD = "000"


def 網址格式正確(url):
    return isinstance(url, str) and (url.startswith("http://") or url.startswith("https://"))


def 留言設定密碼正確(data):
    return (data.get("password") or "") == COMMENT_SETTINGS_PASSWORD


# 轉址頁面：分享出去的連結指向這裡，載入後先標記「這個裝置已點閱」，再跳轉到真正的外部網址。
# 這個頁面本身沒有原始貼文的預覽資訊，所以分享到 LINE/Messenger 時不會顯示原始貼文的圖片標題，
# 這是為了能追蹤點擊裝置所做的取捨（詳見前面跟使用者的討論）。
GO_PAGE_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>正在前往...</title>
<style>
body{
  font-family:sans-serif; display:flex; align-items:center; justify-content:center;
  height:100vh; margin:0; background:#F5F1E6; color:#262320;
}
</style>
</head>
<body>
<p>正在前往目的地網址…</p>
<script>
(function () {
  var DEVICE_KEY = 'bee_device_id';
  var deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  var target = {{ target_url|tojson }};
  var linkId = {{ link_id|tojson }};

  function goNow() { window.location.replace(target); }

  // 標記已讀最多等 3 秒，不管成功與否都會跳轉，避免使用者被卡在這個過場頁面
  Promise.race([
    fetch('/api/links/' + linkId + '/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId }),
    }).catch(function () {}),
    new Promise(function (resolve) { setTimeout(resolve, 3000); }),
  ]).finally(goNow);
})();
</script>
</body>
</html>
"""


@app.route("/go/<int:link_id>")
def 轉址並標記已讀(link_id):
    url = 取得連結網址(link_id)
    if not url:
        return "找不到這個連結，可能已經被刪除", 404
    return render_template_string(GO_PAGE_TEMPLATE, target_url=url, link_id=link_id)


@app.route("/")
def 首頁():
    return send_from_directory(".", "index.html")


@app.route("/<path:filename>")
def 靜態檔案(filename):
    return send_from_directory(".", filename)


@app.route("/api/links", methods=["GET"])
def 查詢連結API():
    device_id = request.args.get("device_id", "")
    return jsonify(取得所有連結(device_id))


@app.route("/api/fetch-title", methods=["GET"])
def 預覽標題API():
    url = (request.args.get("url") or "").strip()
    if not 網址格式正確(url):
        return jsonify({"title": None})
    return jsonify({"title": 抓取標題(url)})


@app.route("/api/links", methods=["POST"])
def 新增連結API():
    data = request.get_json(force=True, silent=True) or {}

    category = data.get("category")
    platform = data.get("platform")
    url = (data.get("url") or "").strip()
    creator_name = (data.get("creator_name") or "").strip() or None
    手動標題 = (data.get("title") or "").strip() or None
    is_priority = bool(data.get("is_priority"))

    if category not in ALLOWED_CATEGORY:
        return jsonify({"error": "分類不正確"}), 400
    if platform not in ALLOWED_PLATFORM:
        return jsonify({"error": "社群類型不正確"}), 400
    if not 網址格式正確(url):
        return jsonify({"error": "網址格式不正確，請輸入完整的 http(s) 網址"}), 400

    # 前端若已經抓過標題（或使用者手動輸入），優先採用；
    # 沒有的話後端再嘗試自動抓取一次作為保底
    title = 手動標題 or 抓取標題(url)

    新連結 = 新增連結(category, platform, url, title, creator_name, is_priority)
    新連結["created_at"] = 新連結["created_at"].isoformat()
    新連結["is_read"] = False
    新連結["click_count"] = 0
    return jsonify(新連結), 201


@app.route("/api/links/<int:link_id>", methods=["PUT"])
def 修改連結API(link_id):
    data = request.get_json(force=True, silent=True) or {}

    category = data.get("category")
    platform = data.get("platform")
    url = (data.get("url") or "").strip()
    creator_name = (data.get("creator_name") or "").strip() or None
    title = (data.get("title") or "").strip() or None
    is_priority = bool(data.get("is_priority"))

    if category not in ALLOWED_CATEGORY:
        return jsonify({"error": "分類不正確"}), 400
    if platform not in ALLOWED_PLATFORM:
        return jsonify({"error": "社群類型不正確"}), 400
    if not 網址格式正確(url):
        return jsonify({"error": "網址格式不正確，請輸入完整的 http(s) 網址"}), 400

    成功 = 更新連結(link_id, category, platform, url, title, creator_name, is_priority)
    if not 成功:
        return jsonify({"error": "找不到這筆連結，可能已被刪除"}), 404

    return jsonify({"ok": True})


@app.route("/api/links/bulk-delete", methods=["POST"])
def 複選刪除連結API():
    data = request.get_json(force=True, silent=True) or {}
    ids = data.get("ids", [])

    if not isinstance(ids, list) or len(ids) == 0:
        return jsonify({"error": "沒有選取任何項目"}), 400

    刪除筆數 = 刪除連結(ids)
    return jsonify({"deleted": 刪除筆數})


@app.route("/api/links/<int:link_id>/read", methods=["POST"])
def 標記已讀API(link_id):
    data = request.get_json(force=True, silent=True) or {}
    device_id = data.get("device_id")

    if not device_id:
        return jsonify({"error": "缺少裝置識別碼"}), 400

    標記已讀(link_id, device_id)
    return jsonify({"ok": True})


# ==================== 留言範本功能 ====================

@app.route("/api/comment-settings/verify", methods=["POST"])
def 驗證留言設定密碼API():
    data = request.get_json(force=True, silent=True) or {}
    return jsonify({"ok": 留言設定密碼正確(data)})


@app.route("/api/comment-groups", methods=["GET"])
def 查詢組別API():
    link_id = request.args.get("link_id", type=int)
    if not link_id:
        return jsonify({"error": "缺少 link_id"}), 400

    groups = 取得卡片組別(link_id)
    for g in groups:
        g["created_at"] = g["created_at"].isoformat() if g["created_at"] else None
    return jsonify(groups)


@app.route("/api/comment-groups", methods=["POST"])
def 新增組別API():
    data = request.get_json(force=True, silent=True) or {}
    if not 留言設定密碼正確(data):
        return jsonify({"error": "密碼錯誤"}), 403

    link_id = data.get("link_id")
    name = (data.get("name") or "").strip()
    if not link_id or not name:
        return jsonify({"error": "請輸入組別名稱"}), 400

    group = 新增組別(link_id, name)
    group["created_at"] = group["created_at"].isoformat()
    return jsonify(group), 201


@app.route("/api/comment-groups/<int:group_id>", methods=["DELETE"])
def 刪除組別API(group_id):
    data = request.get_json(force=True, silent=True) or {}
    if not 留言設定密碼正確(data):
        return jsonify({"error": "密碼錯誤"}), 403

    成功 = 刪除組別(group_id)
    if not 成功:
        return jsonify({"error": "找不到這個組別，可能已被刪除"}), 404
    return jsonify({"ok": True})


@app.route("/api/comment-templates", methods=["GET"])
def 查詢範例API():
    group_id = request.args.get("group_id", type=int)
    if not group_id:
        return jsonify({"error": "缺少 group_id"}), 400

    templates = 取得組別範例(group_id)
    for t in templates:
        t["created_at"] = t["created_at"].isoformat() if t["created_at"] else None
    return jsonify(templates)


@app.route("/api/comment-templates/bulk", methods=["POST"])
def 批次新增範例API():
    data = request.get_json(force=True, silent=True) or {}
    if not 留言設定密碼正確(data):
        return jsonify({"error": "密碼錯誤"}), 403

    group_id = data.get("group_id")
    contents = data.get("contents")
    if not group_id or not isinstance(contents, list):
        return jsonify({"error": "缺少必要欄位"}), 400

    contents = [c.strip() for c in contents if isinstance(c, str) and c.strip()]
    if not contents:
        return jsonify({"error": "沒有可新增的內容"}), 400

    新增結果 = 新增留言範例列表(group_id, contents)
    for t in 新增結果:
        t["created_at"] = t["created_at"].isoformat()
    return jsonify(新增結果), 201


@app.route("/api/comment-templates/<int:template_id>", methods=["PUT"])
def 修改範例API(template_id):
    data = request.get_json(force=True, silent=True) or {}
    if not 留言設定密碼正確(data):
        return jsonify({"error": "密碼錯誤"}), 403

    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "內容不能空白"}), 400

    成功 = 更新留言範例(template_id, content)
    if not 成功:
        return jsonify({"error": "找不到這則範例，可能已被刪除"}), 404
    return jsonify({"ok": True})


@app.route("/api/comment-templates/<int:template_id>", methods=["DELETE"])
def 刪除範例API(template_id):
    data = request.get_json(force=True, silent=True) or {}
    if not 留言設定密碼正確(data):
        return jsonify({"error": "密碼錯誤"}), 403

    成功 = 刪除留言範例(template_id)
    if not 成功:
        return jsonify({"error": "找不到這則範例，可能已被刪除"}), 404
    return jsonify({"ok": True})


@app.route("/api/comment-templates/random", methods=["GET"])
def 隨機範例API():
    group_id = request.args.get("group_id", type=int)
    if not group_id:
        return jsonify({"error": "缺少 group_id"}), 400

    範例 = 取得並鎖定隨機範例(group_id)  # 選中的同時立刻標記為已使用，避免多人搶到同一句
    return jsonify(範例)  # 沒有可用範例時回傳 null


@app.route("/api/comment-templates/<int:template_id>/release", methods=["POST"])
def 釋放範例API(template_id):
    釋放範例(template_id)  # 找不到也視為成功（可能已經被刪除），不需要特別擋
    return jsonify({"ok": True})


# ==================== 分享功能：常用文字 ====================

@app.route("/api/quick-phrases", methods=["GET"])
def 查詢常用文字API():
    phrases = 取得常用文字清單()
    for p in phrases:
        p["created_at"] = p["created_at"].isoformat() if p["created_at"] else None
    return jsonify(phrases)


@app.route("/api/quick-phrases", methods=["POST"])
def 新增常用文字API():
    data = request.get_json(force=True, silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "內容不能空白"}), 400

    phrase = 新增常用文字(content)
    phrase["created_at"] = phrase["created_at"].isoformat()
    return jsonify(phrase), 201


@app.route("/api/quick-phrases/<int:phrase_id>", methods=["DELETE"])
def 刪除常用文字API(phrase_id):
    成功 = 刪除常用文字(phrase_id)
    if not 成功:
        return jsonify({"error": "找不到這則常用文字，可能已被刪除"}), 404
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
