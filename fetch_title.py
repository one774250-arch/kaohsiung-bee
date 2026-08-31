import re
import requests

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")

_OG_TITLE = re.compile(
    r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', re.I
)
_OG_TITLE_REV = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']', re.I
)
_TITLE_TAG = re.compile(r'<title[^>]*>([^<]+)</title>', re.I)


def 抓取標題(url, timeout=4):
    """嘗試抓取網頁的 og:title 或 <title>，任何錯誤都安靜地回傳 None，不中斷新增流程。
    IG、Threads 等平台常見反爬蟲機制擋下請求，屬於預期內、允許發生的情況。
    """
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": _UA},
            stream=True,
        )
        content_type = resp.headers.get("Content-Type", "")
        if resp.status_code != 200 or "text/html" not in content_type:
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


def _清理(text):
    text = (text.replace("&amp;", "&").replace("&lt;", "<")
                .replace("&gt;", ">").replace("&quot;", '"')
                .replace("&#39;", "'").strip())
    return text[:200] if text else None
