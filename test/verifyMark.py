#!/usr/bin/env python3
"""核对看过角标核心逻辑与封面打点规则（与 markCore.js / content.js 一致）。"""

from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
NODE = ROOT / "markCore.js"
CONTENT = ROOT / "content.js"
CSS = ROOT / "content.css"
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

    check("watched collect", node_eval("m.isWatchedStatus('collect')"), True)
    check("watched P", node_eval("m.isWatchedStatus('P')"), True)
    check("watched 看过", node_eval("m.isWatchedStatus('看过')"), True)
    check("watched wish", node_eval("m.isWatchedStatus('wish')"), False)
    check("watched F", node_eval("m.isWatchedStatus('F')"), False)
    check("watched do", node_eval("m.isWatchedStatus('do')"), False)
    check("watched empty", node_eval("m.isWatchedStatus('')"), False)

    check("status none empty", node_eval("m.normalizeStatus('')"), "none")
    check("status none null", node_eval("m.normalizeStatus(null)"), "none")
    check("status wish", node_eval("m.normalizeStatus('wish')"), "wish")
    check("status F", node_eval("m.normalizeStatus('F')"), "wish")
    check("status 想看", node_eval("m.normalizeStatus('想看')"), "wish")
    check("status do", node_eval("m.normalizeStatus('do')"), "do")
    check("status 在看", node_eval("m.normalizeStatus('在看')"), "do")
    check("status collect", node_eval("m.normalizeStatus('collect')"), "collect")
    check("status P", node_eval("m.normalizeStatus('P')"), "collect")
    check("status 看过", node_eval("m.normalizeStatus('看过')"), "collect")
    check("status unknown", node_eval("m.normalizeStatus('N')"), "none")
    check("class none", node_eval("m.statusClass('')"), "isUnwatched")
    check("class wish", node_eval("m.statusClass('F')"), "isWish")
    check("class do", node_eval("m.statusClass('在看')"), "isDoing")
    check("class collect", node_eval("m.statusClass('P')"), "isWatched")

    check(
        "abstract url",
        node_eval("m.abstractUrl('1292052')"),
        "https://movie.douban.com/j/subject_abstract?subject_id=1292052",
    )

    parsed = node_eval("m.parseAbstractStatus({r:0,subject:{collection_status:'collect',subtype:'Movie',is_tv:false}})")
    check("abstract collect ok", parsed.get("ok"), True)
    check("abstract collect status", parsed.get("status"), "collect")
    check("abstract collect type", parsed.get("type"), "movie")
    parsed = node_eval("m.parseAbstractStatus({r:0,subject:{collection_status:'P',subtype:'Movie',is_tv:false}})")
    check("abstract P status", parsed.get("status"), "P")
    check("abstract P type", parsed.get("type"), "movie")
    parsed = node_eval("m.parseAbstractStatus({r:0,subject:{collection_status:'F',is_tv:true,subtype:'TV'}})")
    check("abstract F status", parsed.get("status"), "F")
    check("abstract F type", parsed.get("type"), "tv")
    parsed = node_eval("m.parseAbstractStatus({r:0,subject:{collection_status:'do',subtype:'TV'}})")
    check("abstract do status", parsed.get("status"), "do")
    parsed = node_eval("m.parseAbstractStatus({r:0,subject:{collection_status:'',is_tv:true,subtype:'TV'}})")
    check("abstract tv type", parsed.get("type"), "tv")
    parsed = node_eval("m.parseAbstractStatus({r:0,subject:{collection_status:''}})")
    check("abstract empty status", parsed.get("status"), "")
    check("abstract empty type", parsed.get("type"), "")
    parsed = node_eval("m.parseAbstractStatus({r:1})")
    check("abstract r1", parsed.get("ok"), False)

    check(
        "type from is_tv true",
        node_eval("m.parseSubjectType({subject:{is_tv:true,subtype:'Movie'}})"),
        "tv",
    )
    check(
        "type from subtype Movie",
        node_eval("m.parseSubjectType({subject:{subtype:'Movie'}})"),
        "movie",
    )
    check(
        "type from type_name",
        node_eval("m.parseSubjectType({subject:{type_name:'电视剧'}})"),
        "tv",
    )
    check(
        "type from media_type",
        node_eval("m.parseSubjectType({subject:{media_type:'film'}})"),
        "movie",
    )
    check("type unknown", node_eval("m.parseSubjectType({subject:{collection_status:''}})"), "")

    check("badge 👀🎬", node_eval("m.formatBadgeText('','movie')"), "👀🎬")
    check("badge ❤️📺", node_eval("m.formatBadgeText('wish','tv')"), "❤️📺")
    check("badge 🟠🎬", node_eval("m.formatBadgeText('do','movie')"), "🟠🎬")
    check("badge ✅📺", node_eval("m.formatBadgeText('collect','tv')"), "✅📺")
    check("badge F movie", node_eval("m.formatBadgeText('F','movie')"), "❤️🎬")
    check("badge P omit type", node_eval("m.formatBadgeText('P','')"), "✅")
    check("badge 未看未知", node_eval("m.formatBadgeText('','')"), "👀")
    check("title wish tv", node_eval("m.formatBadgeTitle('wish','tv')"), "想看 · 剧集")
    check("title none movie", node_eval("m.formatBadgeTitle('','movie')"), "未看 · 电影")
    check("title collect no type", node_eval("m.formatBadgeTitle('collect','')"), "看过")

    check(
        "dom og tv",
        node_eval("m.parseTypeFromDomHints({ogType:'video.tv_show'})"),
        "tv",
    )
    check(
        "dom og movie",
        node_eval("m.parseTypeFromDomHints({ogType:'video.movie'})"),
        "movie",
    )
    check(
        "dom 集数",
        node_eval("m.parseTypeFromDomHints({infoText:'导演: x\\n集数: 10\\n单集片长: 60分钟'})"),
        "tv",
    )
    check(
        "dom 片长",
        node_eval("m.parseTypeFromDomHints({infoText:'导演: x\\n片长: 142分钟'})"),
        "movie",
    )
    check("dom empty", node_eval("m.parseTypeFromDomHints({})"), "")

    check("skip tiny 40", node_eval("m.shouldSkipTinyImage('40', null, '')"), True)
    check("keep 75", node_eval("m.shouldSkipTinyImage('75', null, '')"), False)
    check("keep movie-img", node_eval("m.shouldSkipTinyImage('40', null, 'movie-img')"), False)

    html = FIXTURE.read_text(encoding="utf-8")
    parser = CoverParser()
    parser.feed(html)
    covers = parser.covers
    if parser.mainpic_id:
        covers = [parser.mainpic_id] + covers
    unique = []
    for sid in covers:
        if sid not in unique:
            unique.append(sid)

    expected = ["1292052", "1291546", "37068446", "36439868", "35278770", "1292722"]
    check("fixture covers", unique, expected)

    if "subtype: 'Movie'" not in html or "subtype: 'TV'" not in html:
        failures.append("fixture must include Movie and TV subtype samples")
    if "pageBridge" in html or "collectTarget" in html:
        failures.append("fixture must not load pageBridge / collectTarget")
    if "添加收藏：修改" in html and "不应出现" not in html:
        failures.append("fixture still describes native dialog as success")

    content = CONTENT.read_text(encoding="utf-8")
    if "postCollect" in content or "/interest" in content or "buildCollectBody" in content:
        failures.append("content.js must not POST collect / interest")
    if "addEventListener('click'" in content or 'addEventListener("click"' in content:
        failures.append("content.js badge must not handle click")

    css = CSS.read_text(encoding="utf-8")
    if "pointer-events: none" not in css and "pointer-events:none" not in css:
        failures.append("content.css badge must use pointer-events: none")
    if "cursor: pointer" in css:
        failures.append("content.css badge must not look clickable")
    if ".doubanMarkBadge.isWish" not in css or ".doubanMarkBadge.isDoing" not in css:
        failures.append("content.css missing wish/doing background classes")
    if "#3b82c4" not in css or "#e67e22" not in css or "#2aad27" not in css or "#6b6b6b" not in css:
        failures.append("content.css must keep green/blue/orange/gray state colors")
    if "padding-bottom" not in css:
        failures.append("content.css host must reserve padding-bottom below the cover")
    if re.search(r"\.doubanMarkBadge\s*\{[^}]*\btop:\s*4px\b", css, re.S):
        failures.append("content.css badge must not overlay the poster at top: 4px")
    if not re.search(r"\.doubanMarkBadge\s*\{[^}]*\bbottom:\s*\d+px\b", css, re.S):
        failures.append("content.css badge must sit at the host bottom below the cover")

    core = NODE.read_text(encoding="utf-8")
    if "interest=collect" in core or "interestUrl" in core:
        failures.append("markCore.js must not keep one-click POST helpers")

    if failures:
        print("FAILED")
        for item in failures:
            print(" -", item)
        return 1

    print("ok: four-state emoji badge + readonly + cover selectors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
