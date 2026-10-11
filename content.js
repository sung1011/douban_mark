(function () {
  var HOST_CLASS = 'doubanMarkHost';
  var LINK_CLASS = 'doubanMarkHostLink';
  var BADGE_CLASS = 'doubanMarkBadge';
  var BOUND_ATTR = 'data-douban-mark-bound';
  var SCAN_MS = 160;
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

  function asRecord(value) {
    if (value && typeof value === 'object') {
      return {
        status: value.status == null ? '' : String(value.status),
        type: value.type == null ? '' : String(value.type)
      };
    }
    return { status: value == null ? '' : String(value), type: '' };
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

    var badge = document.createElement('span');
    badge.className = BADGE_CLASS + ' isLoading';
    badge.setAttribute('data-subject-id', subjectId);
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '…';
    badge.title = '读取标记状态';

    host.insertBefore(badge, host.firstChild);
    loadStatus(subjectId, function (record) {
      paintBadge(badge, record);
    });
  }

  function paintBadge(badge, record) {
    if (!badge || !badge.parentNode) return;
    var parsed = asRecord(record);
    badge.classList.remove('isLoading', 'isUnwatched', 'isWish', 'isDoing', 'isWatched', 'isBusy', 'isError', 'isHint');
    badge.classList.add(DoubanMark.statusClass(parsed.status));
    badge.setAttribute('data-status', DoubanMark.normalizeStatus(parsed.status));

    if (parsed.type) {
      badge.setAttribute('data-subject-type', parsed.type);
    } else {
      badge.removeAttribute('data-subject-type');
    }

    badge.textContent = DoubanMark.formatBadgeText(parsed.status);
    badge.title = DoubanMark.formatBadgeTitle(parsed.status);
  }

  function rememberStatus(subjectId, record) {
    statusCache[subjectId] = asRecord(record);
    var badges = document.querySelectorAll('.' + BADGE_CLASS + '[data-subject-id="' + subjectId + '"]');
    for (var i = 0; i < badges.length; i++) {
      paintBadge(badges[i], statusCache[subjectId]);
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
      fetchAbstract(subjectId).then(function (record) {
        rememberStatus(subjectId, record);
        flushWaiters(subjectId, statusCache[subjectId]);
        release();
      }, function () {
        rememberStatus(subjectId, fallbackRecord(subjectId));
        flushWaiters(subjectId, statusCache[subjectId]);
        release();
      });
    });
  }

  function flushWaiters(subjectId, record) {
    var list = waiters[subjectId] || [];
    waiters[subjectId] = [];
    for (var i = 0; i < list.length; i++) list[i](record);
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

  function fallbackRecord(subjectId) {
    return {
      status: '',
      type: DoubanMark.parseTypeFromDocument(document, location.href, subjectId) || ''
    };
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
      var fallback = fallbackRecord(subjectId);
      if (!text) return fallback;
      var json;
      try {
        json = JSON.parse(text);
      } catch (err) {
        return fallback;
      }
      var parsed = DoubanMark.parseAbstractStatus(json);
      if (!parsed.ok) return fallback;
      return {
        status: parsed.status,
        type: parsed.type || fallback.type || ''
      };
    });
  }
})();
