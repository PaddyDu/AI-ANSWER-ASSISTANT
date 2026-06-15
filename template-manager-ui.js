// Template Manager UI Script

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[TemplateUI] 页面加载完成");

  // DOM元素
  const backBtn = document.getElementById("backBtn");
  const builtInList = document.getElementById("builtInList");

  const KIND_BADGE = {
    builtin: "内置",
    overlay: "内置·已扩展",
    auto: "自动生成",
    custom: "自定义",
  };

  // 初始化模板管理器
  await window.templateManager.init();

  // 加载模板列表
  await loadTemplates();

  // 事件监听
  backBtn.addEventListener("click", () => {
    window.location.href = "popup.html";
  });

  // 加载模板列表（内置 + 自定义/自动生成）
  async function loadTemplates() {
    try {
      const templates = await window.templateManager.getAllTemplates();
      const builtIn = templates.builtIn || [];
      const custom = templates.custom || [];
      const customById = new Map(custom.map((t) => [t.siteId, t]));

      // 合并：自定义若与内置同 siteId，视为对内置的扩展（覆盖层）
      const items = [];
      for (const t of builtIn) {
        const overlay = customById.get(t.siteId);
        if (overlay) {
          items.push({ t: overlay, kind: "overlay" });
          customById.delete(t.siteId);
        } else {
          items.push({ t, kind: "builtin" });
        }
      }
      for (const t of customById.values()) {
        items.push({ t, kind: t.auto ? "auto" : "custom" });
      }

      renderTemplateList(builtInList, items);
    } catch (error) {
      console.error("[TemplateUI] 加载模板失败:", error);
      showError("加载模板失败: " + error.message);
    }
  }

  // 渲染模板列表
  function renderTemplateList(container, items) {
    container.innerHTML = "";

    if (items.length === 0) {
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

    items.forEach(({ t, kind }) => {
      container.appendChild(createTemplateCard(t, kind));
    });
  }

  // 创建模板卡片
  // 注意：模板字段（siteName/description/urlPatterns 等）可能来自导入或自动生成的
  // 模板，必须用 textContent 写入，避免在特权扩展页面中触发 DOM XSS。
  function createTemplateCard(template, kind) {
    const card = document.createElement("div");
    card.className = "template-card";

    const header = document.createElement("div");
    header.className = "template-header";
    const info = document.createElement("div");
    info.className = "template-info";

    const name = document.createElement("h3");
    name.className = "template-name";
    name.textContent = (template.siteName || template.siteId || "") + " ";
    const badge = document.createElement("span");
    badge.className = "template-badge";
    badge.textContent = KIND_BADGE[kind] || "自定义";
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

    // 内置模板不可删；扩展层/自动生成/自定义可删
    if (kind !== "builtin") {
      const delBtn = document.createElement("button");
      delBtn.className = "icon-btn delete-template-btn";
      delBtn.title = kind === "overlay" ? "删除扩展（恢复为内置模板）" : "删除模板";
      delBtn.innerHTML =
        '<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
      delBtn.addEventListener("click", async () => {
        const what =
          kind === "overlay" ? "扩展（将恢复为内置模板）" : "模板";
        if (!confirm(`确定删除该${what}吗？`)) return;
        try {
          await window.templateManager.deleteTemplate(template.siteId);
          await loadTemplates();
        } catch (e) {
          showError("删除失败: " + e.message);
        }
      });
      header.appendChild(delBtn);
    }

    card.appendChild(header);

    if (template.description) {
      const desc = document.createElement("p");
      desc.className = "template-description";
      desc.textContent = template.description;
      card.appendChild(desc);
    }

    const urls = document.createElement("div");
    urls.className = "template-urls";
    // 自动生成的模板没有 urlPatterns，用 domain 展示匹配范围
    const patterns = Array.isArray(template.urlPatterns)
      ? template.urlPatterns
      : template.domain
      ? [template.domain]
      : [];
    patterns.forEach((url) => {
      const tag = document.createElement("span");
      tag.className = "url-tag";
      tag.textContent = url;
      urls.appendChild(tag);
    });
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
