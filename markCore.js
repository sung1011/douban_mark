/* 豆瓣看过角标：纯函数（id / 状态 / 类型 / 文案），无 DOM、无 fetch */
(function (root) {
  var api = root.DoubanMark || {};

  var SUBJECT_ID = /\/subject\/(\d+)/;
  var SKIP_SUBPATH = /\/subject\/\d+\/(photos|trailer|comments|reviews|celebrities|questions|discussion|wishes|collections|mupload)/;
  var TYPE_FIELDS = [
    'subtype',
    'type_name',
    'typeName',
    'media_type',
    'mediaType',
    'subject_type',
    'subjectType',
    'type'
  ];

  api.MOVIE_ORIGIN = 'https://movie.douban.com';

  api.extractSubjectId = function (href) {
    if (!href) return '';
    var m = String(href).match(SUBJECT_ID);
    return m ? m[1] : '';
  };

  api.isCoverSubjectHref = function (href) {
    if (!href) return false;
    var text = String(href);
    if (!SUBJECT_ID.test(text)) return false;
    if (SKIP_SUBPATH.test(text)) return false;
    if (/\/celebrity\//.test(text)) return false;
    return true;
  };

  api.STATUS_LABEL = {
    none: '未看',
    wish: '想看',
    do: '在看',
    collect: '看过'
  };

  api.STATUS_EMOJI = {
    none: '👀',
    wish: '❤️',
    do: '🟠',
    collect: '✅'
  };

  api.STATUS_CLASS = {
    none: 'isUnwatched',
    wish: 'isWish',
    do: 'isDoing',
    collect: 'isWatched'
  };

  api.TYPE_EMOJI = {
    movie: '🎬',
    tv: '📺'
  };

  api.normalizeStatus = function (status) {
    if (status == null) return 'none';
    var raw = String(status).trim();
    if (!raw) return 'none';
    var key = raw.toLowerCase();
    if (key === 'collect' || key === 'p' || raw === '看过') return 'collect';
    if (key === 'wish' || key === 'f' || raw === '想看') return 'wish';
    if (key === 'do' || raw === '在看') return 'do';
    return 'none';
  };

  api.isWatchedStatus = function (status) {
    return api.normalizeStatus(status) === 'collect';
  };

  api.statusClass = function (status) {
    return api.STATUS_CLASS[api.normalizeStatus(status)] || api.STATUS_CLASS.none;
  };

  api.abstractUrl = function (subjectId) {
    return api.MOVIE_ORIGIN + '/j/subject_abstract?subject_id=' + encodeURIComponent(subjectId);
  };

  api.normalizeSubjectType = function (raw) {
    if (raw === true || raw === 1) return 'tv';
    if (raw === false || raw === 0) return 'movie';
    var t = String(raw == null ? '' : raw).trim().toLowerCase();
    if (!t) return '';
    if (
      t === 'tv' ||
      t === 'tvs' ||
      t === 'tv_show' ||
      t === 'tv-show' ||
      t === 'tvshow' ||
      t === 'video.tv_show' ||
      t === 'drama' ||
      t === 'series' ||
      t === '剧集' ||
      t === '电视剧'
    ) {
      return 'tv';
    }
    if (
      t === 'movie' ||
      t === 'film' ||
      t === 'video.movie' ||
      t === 'video.film' ||
      t === '电影'
    ) {
      return 'movie';
    }
    return '';
  };

  api.parseSubjectType = function (json) {
    if (!json || typeof json !== 'object') return '';
    var subject = json.subject && typeof json.subject === 'object' ? json.subject : json;
    var fromFlag = parseIsTv(subject.is_tv);
    if (fromFlag) return fromFlag;

    var i;
    for (i = 0; i < TYPE_FIELDS.length; i++) {
      var key = TYPE_FIELDS[i];
      if (subject[key] == null || subject[key] === '') continue;
      var normalized = api.normalizeSubjectType(subject[key]);
      if (normalized) return normalized;
    }

    if (json !== subject) {
      for (i = 0; i < TYPE_FIELDS.length; i++) {
        var topKey = TYPE_FIELDS[i];
        if (json[topKey] == null || json[topKey] === '') continue;
        var topNormalized = api.normalizeSubjectType(json[topKey]);
        if (topNormalized) return topNormalized;
      }
    }

    var episodes = subject.episodes_count == null ? '' : String(subject.episodes_count).trim();
    if (episodes && episodes !== '0') return 'tv';
    return '';
  };

  api.parseTypeFromDomHints = function (hints) {
    hints = hints || {};
    var fromOg = api.normalizeSubjectType(hints.ogType);
    if (fromOg) return fromOg;

    var fromAttr = api.normalizeSubjectType(hints.dataSubtype || hints.dataType);
    if (fromAttr) return fromAttr;

    var info = String(hints.infoText || '');
    if (/集数/.test(info) || /单集片长/.test(info)) return 'tv';

    var heading = String(hints.headingText || '');
    if (/电视剧/.test(heading) || /剧集/.test(heading)) return 'tv';
    if (/电影/.test(heading) && !/电视剧/.test(heading)) return 'movie';

    if (/片长/.test(info) && !/集数/.test(info)) return 'movie';
    return '';
  };

  api.parseTypeFromDocument = function (doc, pageHref, subjectId) {
    if (!doc) return '';
    var pageId = api.extractSubjectId(pageHref || '');
    if (!pageId && doc.getElementById) {
      var mainpic = doc.getElementById('mainpic');
      if (mainpic && mainpic.getAttribute) {
        pageId = mainpic.getAttribute('data-subject-id') || '';
      }
    }
    if (!pageId || !subjectId || String(pageId) !== String(subjectId)) return '';

    var ogType = '';
    var og = doc.querySelector && doc.querySelector('meta[property="og:type"]');
    if (og && og.getAttribute) ogType = og.getAttribute('content') || '';

    var infoText = '';
    var info = doc.getElementById && doc.getElementById('info');
    if (info) infoText = info.textContent || '';

    var headingText = '';
    var h1 = doc.querySelector && doc.querySelector('#content h1');
    if (h1) headingText = h1.textContent || '';

    var dataSubtype = '';
    var dataType = '';
    var host = doc.getElementById && doc.getElementById('mainpic');
    if (host && host.getAttribute) {
      dataSubtype = host.getAttribute('data-subtype') || host.getAttribute('data-subject-subtype') || '';
      dataType = host.getAttribute('data-type') || host.getAttribute('data-subject-type') || '';
    }

    return api.parseTypeFromDomHints({
      ogType: ogType,
      infoText: infoText,
      headingText: headingText,
      dataSubtype: dataSubtype,
      dataType: dataType
    });
  };

  api.formatTypeLabel = function (type) {
    if (type === 'movie') return '电影';
    if (type === 'tv') return '剧集';
    return '';
  };

  api.formatBadgeText = function (status, type) {
    var statusKey = api.normalizeStatus(status);
    var typeKey = type === 'movie' || type === 'tv' ? type : api.normalizeSubjectType(type);
    var text = api.STATUS_EMOJI[statusKey] || api.STATUS_EMOJI.none;
    if (typeKey && api.TYPE_EMOJI[typeKey]) text += api.TYPE_EMOJI[typeKey];
    return text;
  };

  api.formatBadgeTitle = function (status, type) {
    var statusKey = api.normalizeStatus(status);
    var statusLabel = api.STATUS_LABEL[statusKey] || api.STATUS_LABEL.none;
    var typeLabel = api.formatTypeLabel(type);
    return typeLabel ? statusLabel + ' · ' + typeLabel : statusLabel;
  };

  api.parseAbstractStatus = function (json) {
    if (!json || typeof json !== 'object') {
      return { ok: false, status: '', type: '', reason: 'invalid' };
    }
    if (json.r !== 0 && json.r !== '0' && json.r != null) {
      return { ok: false, status: '', type: '', reason: 'r' };
    }
    var subject = json.subject;
    if (!subject || typeof subject !== 'object') {
      return { ok: false, status: '', type: '', reason: 'nosubject' };
    }
    var status = subject.collection_status == null ? '' : String(subject.collection_status);
    return { ok: true, status: status, type: api.parseSubjectType(json) };
  };

  api.shouldSkipTinyImage = function (widthAttr, heightAttr, className) {
    var cls = ' ' + String(className || '') + ' ';
    if (/\smovie-img\s|\scover\s|\smovie-img-hover\s/.test(cls)) return false;
    var w = parseInt(widthAttr, 10);
    var h = parseInt(heightAttr, 10);
    if (w && w < 50) return true;
    if (h && h < 50) return true;
    return false;
  };

  function parseIsTv(value) {
    if (typeof value === 'boolean') return value ? 'tv' : 'movie';
    if (value === 1 || value === '1' || value === 'true') return 'tv';
    if (value === 0 || value === '0' || value === 'false') return 'movie';
    return '';
  }

  root.DoubanMark = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
