(function () {
  var HOST_CLASS = 'doubanMarkHost';
  var BADGE_ID = 'doubanMarkBadge';
  var WAIT_MS = 8000;
  var WAIT_STEP = 250;

  if (!shouldRun()) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  function shouldRun() {
    if (document.documentElement.getAttribute('data-douban-mark-fixture') === '1') {
      return true;
    }
    return window.DoubanMark && DoubanMark.isMovieSubjectDetailPage(location.href);
  }

  function start() {
    waitFor(function () {
      return document.getElementById('mainpic');
    }, mountBadge);
  }

  function waitFor(check, done) {
    var started = Date.now();
    (function tick() {
      var found = check();
      if (found) {
        done(found);
        return;
      }
      if (Date.now() - started >= WAIT_MS) return;
      window.setTimeout(tick, WAIT_STEP);
    })();
  }

  function mountBadge(cover) {
    if (document.getElementById(BADGE_ID)) return;

    cover.classList.add(HOST_CLASS);

    var badge = document.createElement('button');
    badge.type = 'button';
    badge.id = BADGE_ID;
    badge.className = 'doubanMarkBadge';
    refreshBadge(badge);

    badge.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (badge.disabled) return;
      openNativeCollectDialog();
    });

    cover.insertBefore(badge, cover.firstChild);

    var sect = document.getElementById('interest_sect_level');
    if (sect && typeof MutationObserver === 'function') {
      var observer = new MutationObserver(function () {
        refreshBadge(badge);
      });
      observer.observe(sect, { childList: true, subtree: true, characterData: true });
    }
  }

  function refreshBadge(badge) {
    var trigger = DoubanMark.findNativeCollectTrigger(document);
    if (!trigger) {
      badge.disabled = true;
      badge.textContent = '收藏';
      badge.title = '未找到豆瓣原生收藏入口';
      badge.classList.add('isDisabled');
      return;
    }

    badge.disabled = false;
    badge.classList.remove('isDisabled');
    badge.textContent = DoubanMark.badgeLabelForTrigger(trigger);
    badge.title = badge.textContent === '修改'
      ? '打开豆瓣「添加收藏：修改」对话框'
      : '打开豆瓣原生收藏对话框';
  }

  function openNativeCollectDialog() {
    document.dispatchEvent(new CustomEvent(DoubanMark.OPEN_EVENT, { bubbles: true }));

    window.setTimeout(function () {
      if (DoubanMark.isCollectDialogOpen(document)) return;
      var el = DoubanMark.findNativeCollectTrigger(document);
      if (el) el.click();
    }, 80);
  }
})();
