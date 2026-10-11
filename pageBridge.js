/* 页面主世界：用豆瓣自己的 jQuery / collect_btn 打开原生对话框 */
(function () {
  if (!window.DoubanMark) return;

  document.addEventListener(DoubanMark.OPEN_EVENT, function () {
    DoubanMark.clickNativeCollectTrigger(document);
  });
})();
