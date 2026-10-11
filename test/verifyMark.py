#!/usr/bin/env python3
"""核对一键看过核心逻辑与封面打点规则（与 markCore.js / content.js 一致）。"""

from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
NODE = ROOT / "markCore.js"
FIXTURE = Path(__file__).with_name("coverFixture.html")
SUBJECT_ID = re.compile(r"/subject/(\d+)")
SKIP_SUBPATH = re.compile(
    r"/subject/\d+/(photos|trailer|comments|reviews|celebrities|questions|discussion|wishes|collections|mupload)"
)


def node_eval(expr: str):
    script = f"const m=require({json.dumps(str(NODE))}); console.log(JSON.stringify({expr}));"
    proc = subprocess.run(
        ["node", "-e", script],
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    return json.loads(proc.stdout)


class CoverParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.covers = []
        self.mainpic_id = None
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        data = {k: v or "" for k, v in attrs}
        self.stack.append((tag, data))
        if tag == "div" and data.get("id") == "mainpic":
            self.mainpic_id = data.get("data-subject-id") or ""
        if tag != "img":
            return
        if self._in_badge():
            return
        width, height, cls = data.get("width"), data.get("height"), data.get("class", "")
        skip_tiny = self._skip_tiny(width, height, cls) and not self._in_mainpic()
        if skip_tiny:
            return
        href = self._closest_href()
        if not href or not is_cover_subject_href(href):
            return
        sid = extract_subject_id(href)
        if sid:
            self.covers.append(sid)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i]
                break

    def _in_badge(self):
        for tag, data in self.stack:
            if "doubanMarkBadge" in data.get("class", ""):
                return True
        return False

    def _in_mainpic(self):
        return any(data.get("id") == "mainpic" for _, data in self.stack)

    def _closest_href(self):
        for tag, data in reversed(self.stack):
            if tag == "a" and data.get("href"):
                return data.get("href")
        return ""

    @staticmethod
    def _skip_tiny(width, height, class_name):
        cls = f" {class_name} "
        if " movie-img " in cls or " cover " in cls or " movie-img-hover " in cls:
            return False
        try:
            if width and int(width) < 50:
                return True
        except ValueError:
            pass
        try:
            if height and int(height) < 50:
                return True
        except ValueError:
            pass
        return False


def extract_subject_id(href: str) -> str:
    m = SUBJECT_ID.search(href or "")
    return m.group(1) if m else ""


def is_cover_subject_href(href: str) -> bool:
    if not href or not SUBJECT_ID.search(href):
        return False
    if SKIP_SUBPATH.search(href):
        return False
    if "/celebrity/" in href:
        return False
    return True


def main() -> int:
    failures = []

    def check(name, got, expected):
        if got != expected:
            failures.append(f"{name}: expected {expected!r}, got {got!r}")

    check("extract 条目", node_eval("m.extractSubjectId('https://movie.douban.com/subject/1292052/')"), "1292052")
    check("extract 查询串", node_eval("m.extractSubjectId('https://movie.douban.com/subject/37068446/?from=showing')"), "37068446")
    check("extract 空", node_eval("m.extractSubjectId('https://movie.douban.com/top250')"), "")
    check(
        "cover href ok",
        node_eval("m.isCoverSubjectHref('https://movie.douban.com/subject/1292052/?from=home')"),
        True,
    )
    check(
        "cover href photos skip",
        node_eval("m.isCoverSubjectHref('https://movie.douban.com/subject/1292052/photos?type=R')"),
        False,
    )
    check(
        "cover href comments skip",
        node_eval("m.isCoverSubjectHref('https://movie.douban.com/subject/1292052/comments')"),
        False,
    )

    check(
        "ck 读取",
        node_eval("m.readCkFromCookie('bid=abc; ck=nOIj; ll=\"108288\"')"),
        "nOIj",
    )
    check("ck 缺失", node_eval("m.readCkFromCookie('bid=abc; ll=1')"), "")
    check("ck 空值不算登录", node_eval("m.isLoggedInCk(m.readCkFromCookie('ck='))"), False)
    check("ck 存在算登录", node_eval("m.isLoggedInCk('nOIj')"), True)

    check("watched collect", node_eval("m.isWatchedStatus('collect')"), True)
    check("watched wish", node_eval("m.isWatchedStatus('wish')"), False)
    check("watched empty", node_eval("m.isWatchedStatus('')"), False)

    body = node_eval("m.buildCollectBody('nOIj')")
    if "ck=nOIj" not in body or "interest=collect" not in body or "foldcollect=F" not in body:
        failures.append(f"POST body missing fields: {body}")
    if "interest=wish" in body:
        failures.append("POST body must not mark wish")

    check(
        "abstract url",
        node_eval("m.abstractUrl('1292052')"),
        "https://movie.douban.com/j/subject_abstract?subject_id=1292052",
    )
    check(
        "interest url",
        node_eval("m.interestUrl('1292052')"),
        "https://movie.douban.com/j/subject/1292052/interest",
    )

    parsed = node_eval("m.parseAbstractStatus({r:0,subject:{collection_status:'collect'}})")
    check("abstract collect ok", parsed.get("ok"), True)
    check("abstract collect status", parsed.get("status"), "collect")
    parsed = node_eval("m.parseAbstractStatus({r:0,subject:{collection_status:''}})")
    check("abstract empty", parsed.get("status"), "")
    parsed = node_eval("m.parseAbstractStatus({r:1})")
    check("abstract r1", parsed.get("ok"), False)

    ok = node_eval("m.parseInterestResponse(200, JSON.stringify({r:0}))")
    check("interest r0", ok.get("ok"), True)
    bad = node_eval("m.parseInterestResponse(200, JSON.stringify({r:1,msg:'fail'}))")
    check("interest r1", bad.get("ok"), False)
    login = node_eval("m.parseInterestResponse(200, '<html>请登录 accounts.douban.com</html>')")
    check("interest login html", login.get("reason"), "nologin")
    forbidden = node_eval("m.parseInterestResponse(403, '{}')")
    check("interest 403", forbidden.get("reason"), "nologin")
    empty = node_eval("m.parseInterestResponse(200, '  ')")
    check("interest empty not success", empty.get("ok"), False)

    check("skip tiny 40", node_eval("m.shouldSkipTinyImage('40', null, '')"), True)
    check("keep 75", node_eval("m.shouldSkipTinyImage('75', null, '')"), False)
    check("keep movie-img", node_eval("m.shouldSkipTinyImage('40', null, 'movie-img')"), False)

    html = FIXTURE.read_text(encoding="utf-8")
    parser = CoverParser()
    parser.feed(html)
    covers = parser.covers
    if parser.mainpic_id:
        covers = [parser.mainpic_id] + covers
    # #mainpic 内 photos 链接上的 img 不算封面链接，但主海报仍按 data-subject-id 打点
    unique = []
    for sid in covers:
        if sid not in unique:
            unique.append(sid)

    expected = ["1292052", "1291546", "37068446", "36439868", "35278770", "1292722"]
    check("fixture covers", unique, expected)

    if "pageBridge" in html or "collectTarget" in html:
        failures.append("fixture must not load pageBridge / collectTarget")
    if "添加收藏：修改" in html and "不应出现" not in html:
        failures.append("fixture still describes native dialog as success")

    if failures:
        print("FAILED")
        for item in failures:
            print(" -", item)
        return 1

    print("ok: ck/POST/status + cover selectors (list/home/search/detail)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
