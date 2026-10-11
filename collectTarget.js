/* 豆瓣电影条目页：定位原生收藏入口（不发起 /j/subject/{id}/interest POST） */
(function (root) {
  var api = root.DoubanMark || {};

  api.OPEN_EVENT = 'douban-mark-open-collect';

  api.isMovieSubjectDetailPage = function (href) {
    try {
      var url = new URL(href, 'https://movie.douban.com');
      if (url.hostname !== 'movie.douban.com') return false;
      return /^\/subject\/\d+\/?$/.test(url.pathname);
    } catch (err) {
      return false;
    }
  };

  api.visibleText = function (el) {
    return ((el && el.textContent) || '').replace(/\s+/g, '');
  };

  function isStarOrDelete(el) {
    var name = el.getAttribute('name') || '';
    var text = api.visibleText(el);
    if (/-delete$/.test(name) || text === '删除') return true;
    if (/^pbtn-\d+-[1-5]$/.test(name)) return true;
    return false;
  }

  api.findNativeCollectTrigger = function (doc) {
    var root = doc.getElementById('interest_sect_level');
    if (!root) return null;

    var links = Array.prototype.slice.call(root.querySelectorAll('a'));
    if (!links.length) return null;

    var edit = links.filter(function (a) {
      return api.visibleText(a) === '修改' && !isStarOrDelete(a);
    })[0];
    if (edit) return edit;

    var collectByName = links.filter(function (a) {
      var name = a.getAttribute('name') || '';
      return /-collect$/.test(name) && !isStarOrDelete(a);
    })[0];
    if (collectByName) return collectByName;

    var collectBtn = links.filter(function (a) {
      if (isStarOrDelete(a)) return false;
      var name = a.getAttribute('name') || '';
      if (/-wish$/.test(name)) return false;
      return a.classList.contains('collect_btn') || a.classList.contains('a_collect_btn');
    })[0];
    if (collectBtn) return collectBtn;

    var watched = links.filter(function (a) {
      return api.visibleText(a) === '看过' && !isStarOrDelete(a);
    })[0];
    if (watched) return watched;

    return null;
  };

  api.badgeLabelForTrigger = function (el) {
    if (el && api.visibleText(el) === '修改') return '修改';
    return '收藏';
  };

  api.isCollectDialogOpen = function (doc) {
    var dialog = doc.getElementById('dialog');
    if (dialog && dialog.offsetWidth > 0 && dialog.innerHTML.replace(/\s+/g, '')) {
      return true;
    }
    var overlay = doc.getElementById('overlay');
    if (overlay && overlay.offsetWidth > 0 && overlay.style.display !== 'none') {
      return true;
    }
    return false;
  };

  api.clickNativeCollectTrigger = function (doc) {
    var el = api.findNativeCollectTrigger(doc);
    if (!el) return false;

    var jq = root.jQuery || root.$;
    if (jq && typeof jq === 'function') {
      try {
        jq(el).trigger('click');
        return true;
      } catch (err) {
        /* 继续走原生 click */
      }
    }

    el.click();
    return true;
  };

  root.DoubanMark = api;
})(typeof window !== 'undefined' ? window : this);
