import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from database import (
    初始化資料庫, 新增連結, 取得所有連結, 刪除連結, 標記已讀,
    ALLOWED_CATEGORY, ALLOWED_PLATFORM,
)
from fetch_title import 抓取標題

app = Flask(__name__)
CORS(app)

初始化資料庫()


def 網址格式正確(url):
    return isinstance(url, str) and (url.startswith("http://") or url.startswith("https://"))


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

    if category not in ALLOWED_CATEGORY:
        return jsonify({"error": "分類不正確，請選擇「檢舉」或「按讚分享」"}), 400
    if platform not in ALLOWED_PLATFORM:
        return jsonify({"error": "社群類型不正確"}), 400
    if not 網址格式正確(url):
        return jsonify({"error": "網址格式不正確，請輸入完整的 http(s) 網址"}), 400

    # 前端若已經抓過標題（或使用者手動輸入），優先採用；
    # 沒有的話後端再嘗試自動抓取一次作為保底
    title = 手動標題 or 抓取標題(url)

    新連結 = 新增連結(category, platform, url, title, creator_name)
    新連結["created_at"] = 新連結["created_at"].isoformat()
    新連結["is_read"] = False
    return jsonify(新連結), 201


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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
