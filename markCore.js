/* 豆瓣一键看过：纯函数（id / ck / 状态 / POST 体），无 DOM、无 fetch */
(function (root) {
  var api = root.DoubanMark || {};

  var SUBJECT_ID = /\/subject\/(\d+)/;
  var SKIP_SUBPATH = /\/subject\/\d+\/(photos|trailer|comments|reviews|celebrities|questions|discussion|wishes|collections|mupload)/;

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

  api.readCkFromCookie = function (cookieStr) {
    var raw = String(cookieStr || '');
    var parts = raw.split(';');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].replace(/^\s+/, '');
      if (p.indexOf('ck=') !== 0) continue;
      var value = p.slice(3);
      try {
        value = decodeURIComponent(value);
      } catch (err) {
        /* 保持原值 */
      }
      value = value.replace(/^"|"$/g, '').trim();
      return value;
    }
    return '';
  };

  api.isLoggedInCk = function (ck) {
    return !!(ck && String(ck).trim());
  };

  api.isWatchedStatus = function (status) {
    return status === 'collect' || status === '看过';
  };

  api.abstractUrl = function (subjectId) {
    return api.MOVIE_ORIGIN + '/j/subject_abstract?subject_id=' + encodeURIComponent(subjectId);
  };

  api.interestUrl = function (subjectId) {
    return api.MOVIE_ORIGIN + '/j/subject/' + encodeURIComponent(subjectId) + '/interest';
  };

  api.buildCollectBody = function (ck) {
    return [
      'ck=' + encodeURIComponent(ck || ''),
      'interest=collect',
      'rating=',
      'foldcollect=F',
      'tags=',
      'comment='
    ].join('&');
  };

  api.parseAbstractStatus = function (json) {
    if (!json || typeof json !== 'object') {
      return { ok: false, status: '', reason: 'invalid' };
    }
    if (json.r !== 0 && json.r !== '0' && json.r != null) {
      return { ok: false, status: '', reason: 'r' };
    }
    var subject = json.subject;
    if (!subject || typeof subject !== 'object') {
      return { ok: false, status: '', reason: 'nosubject' };
    }
    var status = subject.collection_status == null ? '' : String(subject.collection_status);
    return { ok: true, status: status };
  };

  api.parseInterestResponse = function (httpStatus, text) {
    if (httpStatus === 401 || httpStatus === 403) {
      return { ok: false, reason: 'nologin' };
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      return { ok: false, reason: 'http' };
    }
    var trimmed = String(text || '').trim();
    if (!trimmed) return { ok: false, reason: 'empty' };
    if (trimmed.charAt(0) === '<') {
      if (/登录|login|accounts\.douban|passport/i.test(trimmed)) {
        return { ok: false, reason: 'nologin' };
      }
      return { ok: false, reason: 'html' };
    }
    var json;
    try {
      json = JSON.parse(trimmed);
    } catch (err) {
      return { ok: false, reason: 'parse' };
    }
    if (!json || typeof json !== 'object') return { ok: false, reason: 'invalid' };
    if (json.r === 0 || json.r === '0') {
      return {
        ok: true,
        status: json.interest_status || 'collect'
      };
    }
    return { ok: false, reason: json.msg || json.error || 'fail' };
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

  root.DoubanMark = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
