// public/mock/lx-script.js — 本地 mock 洛雪音源脚本（仅用于本地验证播放链路）
//
// 标准洛雪音源协议：注册 request 处理器（action 'musicUrl'），
// 然后 send(EVENT_NAMES.inited) 报告就绪。
//
// 这里不连任何真实平台接口，直接返回一个公开的测试音频地址，
// 用来验证「自定义音源脚本 → 沙箱 → getMusicUrl → 播放」整条链路是否通。

(function () {
  'use strict';

  // 公开的测试音频（CORS 友好，200 / audio/mpeg）
  var MOCK_URL = 'https://cdn.jsdelivr.net/gh/mdn/webaudio-examples/audio-basics/outfoxing.mp3';

  globalThis.lx.on(globalThis.lx.EVENT_NAMES.request, function (data) {
    if (!data || data.action !== 'musicUrl') return null;
    return MOCK_URL;
  });

  globalThis.lx.send(globalThis.lx.EVENT_NAMES.inited, { status: true, openDevTools: false });
})();
