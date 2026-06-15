// API Capture - 内容脚本(隔离世界)与主世界钩子之间的桥接。
// 通过 postMessage 向 inject/api-hook.js 索取已缓存的接口响应。

(function () {
  "use strict";

  class ApiCapture {
    /**
     * 取回主世界钩子缓存的接口响应
     * @param {number} timeout 超时(ms)，超时返回空数组
     * @returns {Promise<Array<{url:string,text:string,ts:number}>>}
     */
    getResponses(timeout = 800) {
      return new Promise((resolve) => {
        let done = false;

        const onMsg = (event) => {
          if (event.source !== window) return;
          const d = event.data;
          if (!d || d.__aiQuiz !== "response" || d.action !== "apiResponses") {
            return;
          }
          done = true;
          window.removeEventListener("message", onMsg);
          resolve(Array.isArray(d.data) ? d.data : []);
        };

        window.addEventListener("message", onMsg);
        window.postMessage(
          { __aiQuiz: "request", action: "getApiResponses" },
          "*"
        );

        setTimeout(() => {
          if (done) return;
          window.removeEventListener("message", onMsg);
          resolve([]); // 钩子未安装或无响应
        }, timeout);
      });
    }
  }

  window.apiCapture = new ApiCapture();
  console.log("[ApiCapture] 模块已加载");
})();
