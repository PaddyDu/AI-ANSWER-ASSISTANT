// API Hook - 运行在页面主世界(MAIN world)、document_start。
// 包裹 fetch / XMLHttpRequest，把页面调用接口返回的 JSON 缓存在页面内存里，
// 仅在内容脚本(隔离世界)主动请求时通过 postMessage 交出。绝不外发。

(function () {
  "use strict";
  if (window.__aiQuizApiHookInstalled) return;
  window.__aiQuizApiHookInstalled = true;

  const MAX_ENTRIES = 40;
  const MAX_LEN = 600000; // 单条响应最大缓存长度
  const buffer = []; // { url, text, ts }

  function looksJsonish(text, contentType) {
    if (contentType && /json/i.test(contentType)) return true;
    if (!text) return false;
    const c = text.trimStart()[0];
    return c === "{" || c === "[";
  }

  function store(url, text, contentType) {
    try {
      if (!text || text.length > MAX_LEN) return;
      if (!looksJsonish(text, contentType)) return;
      buffer.push({ url: String(url || ""), text: text, ts: Date.now() });
      if (buffer.length > MAX_ENTRIES) buffer.shift();
    } catch (e) {}
  }

  // --- hook fetch ---
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      try {
        p.then((resp) => {
          try {
            const ct =
              resp && resp.headers && resp.headers.get
                ? resp.headers.get("content-type")
                : "";
            const url =
              (resp && resp.url) ||
              (args[0] && args[0].url) ||
              args[0] ||
              "";
            resp
              .clone()
              .text()
              .then((t) => store(url, t, ct))
              .catch(() => {});
          } catch (e) {}
        }).catch(() => {});
      } catch (e) {}
      return p;
    };
  }

  // --- hook XMLHttpRequest ---
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__aiQuizUrl = url;
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      this.addEventListener("load", function () {
        try {
          const ct =
            this.getResponseHeader && this.getResponseHeader("content-type");
          let text = "";
          const rt = this.responseType;
          if (rt === "" || rt === "text") {
            text = this.responseText || "";
          } else if (rt === "json" && this.response != null) {
            text = JSON.stringify(this.response);
          }
          store(this.__aiQuizUrl, text, ct);
        } catch (e) {}
      });
      return origSend.apply(this, arguments);
    };
  }

  // --- 响应内容脚本的请求 ---
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.__aiQuiz !== "request" || d.action !== "getApiResponses") return;
    window.postMessage(
      { __aiQuiz: "response", action: "apiResponses", data: buffer.slice() },
      "*"
    );
  });
})();
