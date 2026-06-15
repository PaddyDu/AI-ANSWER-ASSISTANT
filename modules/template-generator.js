// Template Generator Module - 模板生成器
// 从 AI 识别结果（单题选择器 + 已解析的 DOM 元素）反推出可复用的站点通用模板。
// 生成的模板使用 detectByInput 模式：题型由题块内的 input 决定，
// 学到的 class 仅用于更干净地提取文本，扫描器对缺失/失配的 class 有兜底。

(function () {
  "use strict";

  // 与状态相关、不稳定的 class，不应作为结构选择器
  const VOLATILE = [
    "active", "selected", "checked", "hover", "focus", "current",
    "answered", "disabled", "error", "ai-answer", "highlight",
    "show", "hide", "open", "completed",
  ];

  function isVolatileClass(c) {
    const l = c.toLowerCase();
    return VOLATILE.some((v) => l.includes(v));
  }

  // 形如 CSS Modules 哈希 / 随机串的 class，跨页面会变，跳过。
  // 要求 6+ 位十六进制串里至少含一个数字，避免误杀 feedback/decade 等正常语义 class。
  function looksHashed(c) {
    return (
      (/[a-f0-9]{6,}/i.test(c) && /[0-9]/.test(c)) ||
      /__[A-Za-z0-9]{5,}/.test(c)
    );
  }

  function cssEsc(s) {
    return window.CSS && CSS.escape
      ? CSS.escape(s)
      : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function stableClasses(el) {
    return Array.from(el.classList || []).filter(
      (c) => c && !isVolatileClass(c) && !looksHashed(c)
    );
  }

  function norm(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function safeQS(sel) {
    if (!sel) return null;
    try {
      return document.querySelector(sel);
    } catch (e) {
      return null;
    }
  }

  function safeQSA(sel) {
    if (!sel) return [];
    try {
      return Array.from(document.querySelectorAll(sel));
    } catch (e) {
      return [];
    }
  }

  // 从选项/输入元素向上找到“只包住这一道题”的容器
  function findQuestionContainer(element) {
    if (!element) return null;

    // 腾讯问卷的精确容器
    const tencent = element.closest("section.question[data-question-id]");
    if (tencent) return tencent;

    let current = element.parentElement;
    let best = null;
    let depth = 0;
    const maxDepth = 5;

    while (current && current !== document.body && depth < maxDepth) {
      const allInputs = current.querySelectorAll(
        'input[type="radio"], input[type="checkbox"]'
      );
      const names = new Set();
      allInputs.forEach((inp) => inp.name && names.add(inp.name));

      if (names.size === 1 && allInputs.length >= 2) {
        best = current; // 只含一组选项 = 一道题
      } else if (names.size > 1) {
        break; // 含多道题，停在上一个
      }

      if (allInputs.length === 0) {
        const opts = current.querySelectorAll(
          '.option, [class*="option"], [class*="choice"]'
        );
        if (opts.length >= 2 && opts.length <= 8) best = current;
      }

      current = current.parentElement;
      depth++;
    }

    return (
      best ||
      element.parentElement?.parentElement ||
      element.parentElement ||
      element
    );
  }

  // 一道题对应的全部可用元素（选项/输入框）
  function questionElements(q) {
    const els = [];
    (q.options || []).forEach((o) => {
      const e =
        o.element && document.contains(o.element)
          ? o.element
          : safeQS(o.selector);
      if (e) els.push(e);
    });
    (q.inputs || []).forEach((i) => {
      const e =
        i.element && document.contains(i.element)
          ? i.element
          : safeQS(i.selector);
      if (e) els.push(e);
    });
    return els;
  }

  // 隔离式容器定位：从目标元素向上走，直到再往上会包含“别的题”的元素为止。
  // 对单选/多选/填空都适用（不依赖 input 分组）。
  function findIsolatedContainer(target, otherEls) {
    let container = target;
    let cur = target;
    while (cur.parentElement && cur.parentElement !== document.body) {
      const parent = cur.parentElement;
      if (otherEls.some((o) => parent.contains(o))) break;
      container = parent;
      cur = parent;
    }
    return container;
  }

  // 取所有容器的公共 stable class
  function commonClasses(elements) {
    const sets = elements.map((el) => new Set(stableClasses(el)));
    if (sets.length === 0) return [];
    let common = [...sets[0]];
    for (const s of sets.slice(1)) common = common.filter((c) => s.has(c));
    return common;
  }

  // 推断 questionContainer：选一个命中数最接近题块数、且包含全部题块的选择器
  function inferContainerSelector(containers) {
    const common = commonClasses(containers);
    const candidates = [];
    for (const c of common) candidates.push("." + cssEsc(c));

    const tags = new Set(containers.map((c) => c.tagName.toLowerCase()));
    if (tags.size === 1) {
      const tag = [...tags][0];
      for (const c of common) candidates.push(tag + "." + cssEsc(c));
    }

    const target = containers.length;
    let best = null;
    let bestScore = Infinity;

    for (const sel of candidates) {
      const matched = safeQSA(sel);
      if (matched.length === 0) continue;
      const containsAll = containers.every((c) => matched.includes(c));
      if (!containsAll) continue;
      // 越接近题块数越好；超出比缺失更可接受一点
      const diff = matched.length - target;
      const score = Math.abs(diff) + (diff > 0 ? diff * 0.1 : 1000);
      if (score < bestScore) {
        bestScore = score;
        best = sel;
      }
    }
    return best;
  }

  // 找到容器内承载题干文本的元素，返回公共 class 选择器
  function inferTitleSelector(entries) {
    const sets = [];
    for (const e of entries) {
      const wanted = norm(e.q.text).slice(0, 20);
      if (!wanted) continue;
      let found = null;
      for (const el of e.container.querySelectorAll("*")) {
        if (el.querySelector("input, textarea")) continue; // 题干里通常没有输入框
        const t = norm(el.textContent);
        if (t && t.length < 500 && t.indexOf(wanted) !== -1) {
          found = el;
          break;
        }
      }
      if (found) {
        const cls = stableClasses(found);
        if (cls.length) sets.push(new Set(cls));
      }
    }
    if (sets.length === 0) return null;
    let common = [...sets[0]];
    for (const s of sets.slice(1)) common = common.filter((c) => s.has(c));
    return common.length ? "." + cssEsc(common[0]) : null;
  }

  // 选项行：容器下包住该 input 的最外层直接子元素
  function optionRow(container, input) {
    let cur = input;
    while (cur.parentElement && cur.parentElement !== container) {
      cur = cur.parentElement;
    }
    if (cur && cur !== input) return cur;
    return input.closest("label") || input.parentElement || input;
  }

  // 推断选项行 / 选项文本的 class
  function inferOptionSelectors(entries, inputType) {
    const rowSets = [];
    const labelSets = [];

    for (const e of entries) {
      const inputs = e.container.querySelectorAll(`input[type='${inputType}']`);
      inputs.forEach((inp) => {
        const row = optionRow(e.container, inp);
        if (row && row !== e.container) {
          const cls = stableClasses(row);
          if (cls.length) rowSets.push(new Set(cls));

          // 行内承载文本、且不含 input 的元素
          for (const el of row.querySelectorAll("*")) {
            if (el.querySelector("input")) continue;
            if (norm(el.textContent)) {
              const lc = stableClasses(el);
              if (lc.length) labelSets.push(new Set(lc));
              break;
            }
          }
        }
      });
    }

    const pickCommon = (sets) => {
      if (sets.length === 0) return null;
      let common = [...sets[0]];
      for (const s of sets.slice(1)) common = common.filter((c) => s.has(c));
      return common.length ? "." + cssEsc(common[0]) : null;
    };

    return {
      optionItem: pickCommon(rowSets),
      optionLabel: pickCommon(labelSets),
    };
  }

  // 为单个题型生成 selectors 配置
  function buildTypeConfig(type, entries, existingTemplate) {
    const cfg = {};
    const title = inferTitleSelector(entries);
    if (title) cfg.title = title;

    if (type === "fill") {
      cfg.inputs = "input[type='text'], input:not([type]), textarea";
    } else {
      const inputType = type === "single" ? "radio" : "checkbox";
      cfg.optionInput = `input[type='${inputType}']`;
      const { optionItem, optionLabel } = inferOptionSelectors(entries, inputType);
      if (optionItem) cfg.optionItem = optionItem;
      if (optionLabel) cfg.optionLabel = optionLabel;
    }

    // 若是在更新一个 detectByAttribute 模板（如问卷星），用真实元素推断该题型的属性值
    const qt = existingTemplate && existingTemplate.selectors
      ? existingTemplate.selectors.questionTypes
      : null;
    if (qt && qt.detectByAttribute) {
      const attr = qt.detectByAttribute;
      const tv = entries[0].container.getAttribute(attr);
      if (tv != null) {
        cfg.typeValue = tv;
        cfg.container = `${entries[0].container.tagName.toLowerCase()}[${attr}='${tv}']`;
      }
    }

    return cfg;
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function slugify(host) {
    return "auto_" + host.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 从 AI 识别出的题目（含已解析 DOM 元素）生成或更新站点模板。
   * @param {Array} questions 经 scanWithAISelectors 解析、带 element 的题目数组
   * @param {Object|null} existingTemplate 当前匹配到的模板（更新场景），否则 null
   * @param {string} url 当前页面 URL
   * @returns {Object|null} 候选模板对象，或 null（无法生成）
   */
  function generateFromAIResult(questions, existingTemplate, url) {
    if (!Array.isArray(questions) || questions.length === 0) return null;

    // 收集每道题的元素
    const perQ = questions
      .map((q) => ({ q, els: questionElements(q) }))
      .filter((x) => x.els.length);
    if (perQ.length === 0) return null;

    // 解析每道题的容器（多题用隔离式定位，单题回退到结构启发式）
    const entries = [];
    for (let i = 0; i < perQ.length; i++) {
      const { q, els } = perQ[i];
      let container;
      if (perQ.length === 1) {
        container = findQuestionContainer(els[0]);
      } else {
        const others = [];
        for (let j = 0; j < perQ.length; j++) {
          if (j !== i) others.push(...perQ[j].els);
        }
        container = findIsolatedContainer(els[0], others);
      }
      if (container) entries.push({ q, el: els[0], container });
    }
    if (entries.length === 0) return null;

    // 按题型分组并生成配置
    const typesPresent = {};
    for (const type of ["single", "multiple", "fill"]) {
      const te = entries.filter((e) => e.q.type === type);
      if (te.length) typesPresent[type] = te;
    }
    if (Object.keys(typesPresent).length === 0) return null;

    let template;
    if (existingTemplate) {
      // 更新：克隆已有模板，仅补充缺失的题型，保留其原有 questionContainer / 检测模式
      template = deepClone(existingTemplate);
      template.selectors = template.selectors || {};
      template.selectors.questionTypes = template.selectors.questionTypes || {};
      let addedType = false;
      for (const [type, te] of Object.entries(typesPresent)) {
        if (!template.selectors.questionTypes[type]) {
          template.selectors.questionTypes[type] = buildTypeConfig(
            type,
            te,
            existingTemplate
          );
          addedType = true;
        }
      }
      // 没有新题型可补充：不要重复保存（否则会用一份相同副本遮蔽内置模板）
      if (!addedType) return null;
    } else {
      // 新建：detectByInput 模式的全新模板
      const containerSelector = inferContainerSelector(
        entries.map((e) => e.container)
      );
      if (!containerSelector) return null;

      const host = (() => {
        try {
          return new URL(url).hostname;
        } catch (e) {
          return "";
        }
      })();
      if (!host) return null;

      const questionTypes = { detectByInput: true };
      for (const [type, te] of Object.entries(typesPresent)) {
        questionTypes[type] = buildTypeConfig(type, te, null);
      }

      template = {
        siteId: slugify(host),
        siteName: host,
        domain: host,
        urlRegex: "^https?://" + escapeRegExp(host) + "/",
        version: "1.0.0",
        selectors: {
          questionContainer: containerSelector,
          questionTypes,
        },
      };
    }

    template.auto = true;
    template.source = "ai-generated";
    template.lastUpdated = ""; // 由 templateManager.saveTemplate 填充日期
    return template;
  }

  window.TemplateGenerator = { generateFromAIResult };

  console.log("[TemplateGenerator] 模块已加载");
})();
