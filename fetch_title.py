import re
import requests

_UA_BROWSER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
               "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Facebook 官方爬蟲身分，是業界常見用來取得公開貼文預覽資料（og:title 等）的做法，
# 很多連結預覽工具都會用這個身分字串，用途跟 LINE／Slack 的預覽機器人相同。
_UA_FB_CRAWLER = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"

_OG_TITLE = re.compile(
    r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', re.I
)
_OG_TITLE_REV = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']', re.I
)
_TITLE_TAG = re.compile(r'<title[^>]*>([^<]+)</title>', re.I)

_YOUTUBE_HOSTS = ("youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com")
_META_HOSTS = ("facebook.com", "www.facebook.com", "m.facebook.com",
               "instagram.com", "www.instagram.com",
               "threads.net", "www.threads.net")


def 抓取標題(url, timeout=4):
    """嘗試抓取網頁的 og:title 或 <title>，任何錯誤都安靜地回傳 None，不中斷新增流程。"""
    youtube_title = _嘗試YouTubeOEmbed(url, timeout)
    if youtube_title:
        return youtube_title

    host = _取得主機(url)

    title = _嘗試抓取(url, _UA_BROWSER, timeout)
    if title:
        return title

    # 一般瀏覽器身分抓不到，且是 FB/IG/Threads 的話，改用官方爬蟲身分再試一次
    if host in _META_HOSTS:
        title = _嘗試抓取(url, _UA_FB_CRAWLER, timeout)
        if title:
            return title

    return None


def _嘗試抓取(url, user_agent, timeout):
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": user_agent},
            stream=True,
        )
        content_type = resp.headers.get("Content-Type", "")
        if resp.status_code != 200 or "text/html" not in content_type:
            resp.close()
            return None

        html_片段 = ""
        for chunk in resp.iter_content(chunk_size=4096, decode_unicode=True):
            if chunk is None:
                continue
            html_片段 += chunk if isinstance(chunk, str) else chunk.decode("utf-8", "ignore")
            if len(html_片段) > 200_000 or "</head>" in html_片段.lower():
                break
        resp.close()

        match = _OG_TITLE.search(html_片段) or _OG_TITLE_REV.search(html_片段)
        if match:
            return _清理(match.group(1))

        match = _TITLE_TAG.search(html_片段)
        if match:
            return _清理(match.group(1))

        return None
    except Exception:
        return None


def _取得主機(url):
    return re.sub(r"^https?://", "", url).split("/")[0].lower()


def _嘗試YouTubeOEmbed(url, timeout):
    """YouTube 提供公開的 oEmbed API，不會被反爬蟲擋下，比直接抓網頁穩定很多"""
    try:
        if _取得主機(url) not in _YOUTUBE_HOSTS:
            return None

        resp = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": url, "format": "json"},
            timeout=timeout,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        title = data.get("title")
        return _清理(title) if title else None
    except Exception:
        return None


def _清理(text):
    text = (text.replace("&amp;", "&").replace("&lt;", "<")
                .replace("&gt;", ">").replace("&quot;", '"')
                .replace("&#39;", "'").strip())
    return text[:200] if text else None

