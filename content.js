(function () {
  var HOST_CLASS = 'doubanMarkHost';
  var LINK_CLASS = 'doubanMarkHostLink';
  var BADGE_CLASS = 'doubanMarkBadge';
  var BOUND_ATTR = 'data-douban-mark-bound';
  var SCAN_MS = 160;
  var FEEDBACK_MS = 1200;
  var ERROR_MS = 1400;
  var MAX_FETCH = 4;

  var statusCache = {};
  var waiters = {};
  var fetchActive = 0;
  var fetchQueue = [];
  var scanTimer = 0;
  var observer = null;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  function isFixture() {
    return document.documentElement.getAttribute('data-douban-mark-fixture') === '1';
  }

  function currentCk() {
    var ck = DoubanMark.readCkFromCookie(document.cookie);
    if (ck) return ck;
    if (isFixture()) return 'test';
    return '';
  }

  function start() {
    scan();
    if (typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function onMutations(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      if (!added || !added.length) continue;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType !== 1) continue;
        if (node.classList && node.classList.contains(BADGE_CLASS)) continue;
        scheduleScan();
        return;
      }
    }
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(function () {
      scanTimer = 0;
      scan();
    }, SCAN_MS);
  }

  function scan() {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      maybeMount(imgs[i]);
    }

    var mainpic = document.getElementById('mainpic');
    if (mainpic) {
      var id = subjectIdForMainpic(mainpic);
      if (id) mountOnHost(mainpic, id);
    }
  }

  function maybeMount(img) {
    if (!img || img.closest('.' + BADGE_CLASS)) return;
    if (DoubanMark.shouldSkipTinyImage(img.getAttribute('width'), img.getAttribute('height'), img.className)) {
      if (!img.closest('#mainpic')) return;
    }

    var link = img.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (!DoubanMark.isCoverSubjectHref(href)) return;
    var id = DoubanMark.extractSubjectId(href);
    if (!id) return;

    var host = hostForImage(img, link);
    mountOnHost(host, id);
  }

  function hostForImage(img, link) {
    var mainpic = img.closest('#mainpic');
    if (mainpic) return mainpic;
    return link;
  }

  function subjectIdForMainpic(mainpic) {
    var fromPage = DoubanMark.extractSubjectId(location.href);
    if (fromPage) return fromPage;
    var attr = mainpic.getAttribute('data-subject-id');
    if (attr && /^\d+$/.test(attr)) return attr;
    var link = mainpic.querySelector('a[href*="/subject/"]');
    if (link && DoubanMark.isCoverSubjectHref(link.getAttribute('href'))) {
      return DoubanMark.extractSubjectId(link.getAttribute('href'));
    }
    return '';
  }

  function mountOnHost(host, subjectId) {
    if (!host || !subjectId) return;
    if (host.getAttribute(BOUND_ATTR) === subjectId && host.querySelector('.' + BADGE_CLASS)) {
      return;
    }

    var existing = host.querySelector('.' + BADGE_CLASS);
    if (existing) existing.parentNode.removeChild(existing);

    host.classList.add(HOST_CLASS);
    if (host.tagName === 'A') host.classList.add(LINK_CLASS);
    host.setAttribute(BOUND_ATTR, subjectId);

    var badge = document.createElement('button');
    badge.type = 'button';
    badge.className = BADGE_CLASS + ' isLoading';
    badge.setAttribute('data-subject-id', subjectId);
    badge.textContent = '…';
    badge.title = '读取标记状态';

    badge.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      onBadgeClick(badge, subjectId);
    });

    host.insertBefore(badge, host.firstChild);
    loadStatus(subjectId, function (status) {
      paintBadge(badge, status, '');
    });
  }

  function paintBadge(badge, status, mode) {
    if (!badge || !badge.parentNode) return;
    badge.classList.remove('isLoading', 'isUnwatched', 'isWatched', 'isBusy', 'isError', 'isHint');
    badge.disabled = false;

    if (mode === 'busy') {
      badge.classList.add('isBusy');
      badge.textContent = '…';
      badge.title = '正在标记看过';
      badge.disabled = true;
      return;
    }
    if (mode === 'error') {
      badge.classList.add('isError');
      badge.textContent = '失败';
      badge.title = '未登录或标记失败';
      return;
    }
    if (mode === 'hint') {
      badge.classList.add('isWatched', 'isHint');
      badge.textContent = '已看过';
      badge.title = '已经标记为看过';
      return;
    }

    if (DoubanMark.isWatchedStatus(status)) {
      badge.classList.add('isWatched');
      badge.textContent = '已看';
      badge.title = '已标记看过';
    } else {
      badge.classList.add('isUnwatched');
      badge.textContent = '未看';
      badge.title = '一键标记为看过';
    }
  }

  function onBadgeClick(badge, subjectId) {
    if (badge.disabled) return;
    var cached = statusCache[subjectId];
    if (cached === undefined) return;

    if (DoubanMark.isWatchedStatus(cached)) {
      paintBadge(badge, cached, 'hint');
      window.setTimeout(function () {
        if (statusCache[subjectId] === cached) paintBadge(badge, cached, '');
      }, FEEDBACK_MS);
      return;
    }

    var ck = currentCk();
    if (!DoubanMark.isLoggedInCk(ck)) {
      flashError(badge, cached);
      return;
    }

    paintBadge(badge, cached, 'busy');
    postCollect(subjectId, ck).then(function (result) {
      if (result.ok) {
        rememberStatus(subjectId, 'collect');
        return;
      }
      flashError(badge, statusCache[subjectId]);
    }, function () {
      flashError(badge, statusCache[subjectId]);
    });
  }

  function flashError(badge, status) {
    paintBadge(badge, status, 'error');
    window.setTimeout(function () {
      paintBadge(badge, statusCache[badge.getAttribute('data-subject-id')], '');
    }, ERROR_MS);
  }

  function rememberStatus(subjectId, status) {
    statusCache[subjectId] = status;
    var badges = document.querySelectorAll('.' + BADGE_CLASS + '[data-subject-id="' + subjectId + '"]');
    for (var i = 0; i < badges.length; i++) {
      paintBadge(badges[i], status, '');
    }
  }

  function loadStatus(subjectId, done) {
    if (Object.prototype.hasOwnProperty.call(statusCache, subjectId) && statusCache[subjectId] !== undefined) {
      done(statusCache[subjectId]);
      return;
    }
    if (!waiters[subjectId]) waiters[subjectId] = [];
    waiters[subjectId].push(done);
    if (waiters[subjectId].length > 1) return;
    enqueueFetch(function (release) {
      fetchAbstract(subjectId).then(function (status) {
        statusCache[subjectId] = status;
        flushWaiters(subjectId, status);
        release();
      }, function () {
        statusCache[subjectId] = '';
        flushWaiters(subjectId, '');
        release();
      });
    });
  }

  function flushWaiters(subjectId, status) {
    var list = waiters[subjectId] || [];
    waiters[subjectId] = [];
    for (var i = 0; i < list.length; i++) list[i](status);
  }

  function enqueueFetch(task) {
    fetchQueue.push(task);
    pumpFetch();
  }

  function pumpFetch() {
    while (fetchActive < MAX_FETCH && fetchQueue.length) {
      var task = fetchQueue.shift();
      fetchActive += 1;
      task(function () {
        fetchActive -= 1;
        pumpFetch();
      });
    }
  }

  function fetchAbstract(subjectId) {
    return fetch(DoubanMark.abstractUrl(subjectId), {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }).then(function (res) {
      if (!res.ok) return '';
      return res.text();
    }).then(function (text) {
      if (!text) return '';
      var json;
      try {
        json = JSON.parse(text);
      } catch (err) {
        return '';
      }
      var parsed = DoubanMark.parseAbstractStatus(json);
      return parsed.ok ? parsed.status : '';
    });
  }

  function postCollect(subjectId, ck) {
    return fetch(DoubanMark.interestUrl(subjectId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: DoubanMark.buildCollectBody(ck)
    }).then(function (res) {
      return res.text().then(function (text) {
        return DoubanMark.parseInterestResponse(res.status, text);
      });
    });
  }
})();
