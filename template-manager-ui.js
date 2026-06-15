// Template Manager UI Script

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[TemplateUI] 页面加载完成");

  // DOM元素
  const backBtn = document.getElementById("backBtn");
  const builtInList = document.getElementById("builtInList");

  // 初始化模板管理器
  await window.templateManager.init();

  // 加载模板列表
  await loadTemplates();

  // 事件监听
  backBtn.addEventListener("click", () => {
    window.location.href = "popup.html";
  });

  // 加载模板列表
  async function loadTemplates() {
    try {
      const templates = await window.templateManager.getAllTemplates();

      // 只渲染内置模板
      const builtIn = templates.builtIn || [];
      renderTemplateList(builtInList, builtIn);
    } catch (error) {
      console.error("[TemplateUI] 加载模板失败:", error);
      showError("加载模板失败: " + error.message);
    }
  }

  // 渲染模板列表
  function renderTemplateList(container, templates) {
    container.innerHTML = "";

    if (templates.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p>暂无模板</p>
        </div>
      `;
      return;
    }

    templates.forEach((template) => {
      const card = createTemplateCard(template);
      container.appendChild(card);
    });
  }

  // 创建模板卡片
  // 注意：模板字段（siteName/description/urlPatterns 等）可能来自导入的不可信
  // 模板，必须用 textContent 写入，避免在特权扩展页面中触发 DOM XSS。
  function createTemplateCard(template) {
    const card = document.createElement("div");
    card.className = "template-card";

    const header = document.createElement("div");
    header.className = "template-header";
    const info = document.createElement("div");
    info.className = "template-info";

    const name = document.createElement("h3");
    name.className = "template-name";
    name.textContent = (template.siteName || "") + " ";
    const badge = document.createElement("span");
    badge.className = "template-badge";
    badge.textContent = "内置";
    name.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "template-meta";
    const versionEl = document.createElement("span");
    versionEl.textContent = `版本: ${template.version || ""}`;
    const updatedEl = document.createElement("span");
    updatedEl.textContent = `更新: ${template.lastUpdated || ""}`;
    meta.append(versionEl, updatedEl);

    info.append(name, meta);
    header.appendChild(info);
    card.appendChild(header);

    if (template.description) {
      const desc = document.createElement("p");
      desc.className = "template-description";
      desc.textContent = template.description;
      card.appendChild(desc);
    }

    const urls = document.createElement("div");
    urls.className = "template-urls";
    if (Array.isArray(template.urlPatterns)) {
      template.urlPatterns.forEach((url) => {
        const tag = document.createElement("span");
        tag.className = "url-tag";
        tag.textContent = url;
        urls.appendChild(tag);
      });
    }
    card.appendChild(urls);

    return card;
  }

  // 工具函数
  function showLoading(message) {
    // 可以使用 layer.load() 或自定义loading
    console.log("[Loading]", message);
  }

  function hideLoading() {
    console.log("[Loading] Hide");
  }

  function showSuccess(message) {
    alert("✓ " + message);
  }

  function showError(message) {
    alert("✗ " + message);
  }
});
