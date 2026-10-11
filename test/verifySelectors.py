#!/usr/bin/env python3
"""对照夹具 HTML 核对收藏入口选择逻辑（与 collectTarget.js 一致）。"""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import re
import sys


def is_movie_subject_detail(href: str) -> bool:
    parsed = urlparse(href)
    if parsed.hostname != "movie.douban.com":
        return False
    return bool(re.fullmatch(r"/subject/\d+/?", parsed.path))


class Anchor:
    def __init__(self, attrs):
        data = {k: v or "" for k, v in attrs}
        self.name = data.get("name", "")
        self.class_list = data.get("class", "").split()
        self.text = ""

    @property
    def visible_text(self):
        return re.sub(r"\s+", "", self.text)


class InterestParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_sect = False
        self.depth = 0
        self.anchors = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        data = {k: v or "" for k, v in attrs}
        if tag == "div" and data.get("id") == "interest_sect_level":
            self.in_sect = True
            self.depth = 1
            return
        if self.in_sect:
            if tag == "div":
                self.depth += 1
            if tag == "a":
                self.current = Anchor(attrs)

    def handle_endtag(self, tag):
        if self.current is not None and tag == "a":
            self.anchors.append(self.current)
            self.current = None
        if self.in_sect and tag == "div":
            self.depth -= 1
            if self.depth <= 0:
                self.in_sect = False

    def handle_data(self, data):
        if self.current is not None:
            self.current.text += data


def is_star_or_delete(anchor: Anchor) -> bool:
    if re.search(r"-delete$", anchor.name) or anchor.visible_text == "删除":
        return True
    if re.fullmatch(r"pbtn-\d+-[1-5]", anchor.name):
        return True
    return False


def find_native_collect_trigger(html: str):
    parser = InterestParser()
    parser.feed(html)
    links = parser.anchors
    for a in links:
        if a.visible_text == "修改" and not is_star_or_delete(a):
            return a
    for a in links:
        if re.search(r"-collect$", a.name) and not is_star_or_delete(a):
            return a
    for a in links:
        if is_star_or_delete(a):
            continue
        if re.search(r"-wish$", a.name):
            continue
        if "collect_btn" in a.class_list or "a_collect_btn" in a.class_list:
            return a
    for a in links:
        if a.visible_text == "看过" and not is_star_or_delete(a):
            return a
    return None


UNCOLLECTED = """
<div id="interest_sect_level" class="clearfix">
  <a href="#" class="j a_show_login colbutt ll" name="pbtn-35929258-wish"><span>想看</span></a>
  <a href="#" class="j a_show_login colbutt ll" name="pbtn-35929258-collect"><span>看过</span></a>
  <a href="#" class="j a_show_login" name="pbtn-35929258-1">1</a>
</div>
"""

COLLECTED = """
<div id="interest_sect_level">
  我看过这部电影
  <a href="#" class="j a_collect_btn collect_btn" name="edit">修改</a>
  <a href="#" class="j a_collect_btn collect_btn" name="pbtn-1292052-delete">删除</a>
</div>
"""

WISH_ONLY = """
<div id="interest_sect_level">
  我想看这部电影
  <a href="#" class="j a_collect_btn" name="pbtn-1-wish">想看</a>
  <a href="#" class="j a_collect_btn">修改</a>
</div>
"""


def main() -> int:
    failures = []

    cases = {
        "https://movie.douban.com/subject/1292052/": True,
        "https://movie.douban.com/subject/1292052": True,
        "https://movie.douban.com/subject/1292052/?from=home": True,
        "https://movie.douban.com/subject/1292052/comments": False,
        "https://movie.douban.com/top250": False,
        "https://search.douban.com/movie/subject_search?search_text=a": False,
        "https://movie.douban.com/subject/1292052/photos?type=R": False,
    }
    for href, expected in cases.items():
        got = is_movie_subject_detail(href)
        if got != expected:
            failures.append(f"url {href}: expected {expected}, got {got}")

    uncollected = find_native_collect_trigger(UNCOLLECTED)
    if not uncollected or uncollected.name != "pbtn-35929258-collect":
        failures.append(f"uncollected trigger: {getattr(uncollected, 'name', None)}")

    collected = find_native_collect_trigger(COLLECTED)
    if not collected or collected.visible_text != "修改":
        failures.append(f"collected trigger: {getattr(collected, 'visible_text', None)}")

    wish = find_native_collect_trigger(WISH_ONLY)
    if not wish or wish.visible_text != "修改":
        failures.append(f"wish trigger: {getattr(wish, 'visible_text', None)}")

    fixture = Path(__file__).with_name("subjectFixture.html").read_text(encoding="utf-8")
    fixture_hit = find_native_collect_trigger(fixture)
    if not fixture_hit or fixture_hit.name != "pbtn-1292052-collect":
        failures.append(f"fixture trigger: {getattr(fixture_hit, 'name', None)}")

    if "interest" in fixture and "/j/subject/" in fixture:
        failures.append("fixture must not include silent interest POST")

    if failures:
        print("FAILED")
        for item in failures:
            print(" -", item)
        return 1

    print("ok: subject URL gate + native collect selectors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
