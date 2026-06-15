// Scanner Enhanced Module - 增强扫描器
// 使用站点模板进行题目扫描

(function () {
  "use strict";

  class EnhancedScanner {
    constructor() {
      this.questions = [];
    }

    /**
     * 使用模板扫描题目
     * @param {Object} template 站点模板
     * @returns {Object} 扫描结果 { success: boolean, questions: Array, count: number }
     */
    scanWithTemplate(template) {
      console.log("[EnhancedScanner] 开始使用模板扫描:", template.siteName);

      this.questions = [];
      const selectors = template.selectors;

      try {
        // 获取所有题目容器
        const questionElements = document.querySelectorAll(
          selectors.questionContainer
        );

        if (questionElements.length === 0) {
          console.warn("[EnhancedScanner] 未找到题目容器");
          return { success: false, questions: [], count: 0 };
        }

        console.log(
          `[EnhancedScanner] 找到 ${questionElements.length} 个题目容器`
        );

        // 遍历每个题目
        questionElements.forEach((element, index) => {
          const question = this._parseQuestionWithTemplate(
            element,
            index,
            template
          );
          if (question) {
            this.questions.push(question);
          }
        });

        console.log(
          `[EnhancedScanner] 扫描完成，解析成功 ${this.questions.length} 道题`
        );

        return {
          success: this.questions.length > 0,
          questions: this.questions,
          count: this.questions.length,
        };
      } catch (error) {
        console.error("[EnhancedScanner] 扫描失败:", error);
        return {
          success: false,
          questions: [],
          count: 0,
          error: error.message,
        };
      }
    }

    /**
     * 使用模板解析单个题目
     * @private
     */
    _parseQuestionWithTemplate(element, index, template) {
      const selectors = template.selectors;
      const questionTypes = selectors.questionTypes;

      // 确定题目类型
      let questionType = null;
      let typeSelectors = null;

      if (questionTypes.detectByInput) {
        // 按题块内的 input 判断题型（自动生成的模板使用此模式）
        questionType = this._detectTypeByInput(element);
        if (questionType) typeSelectors = questionTypes[questionType] || {};
      } else if (questionTypes.detectByAttribute) {
        // 通过属性判断类型
        const attrName = questionTypes.detectByAttribute;
        const typeValue = element.getAttribute(attrName);
        for (const [type, config] of Object.entries(questionTypes)) {
          if (type === "detectByAttribute" || type === "detectByInput") continue;
          if (config.typeValue === typeValue) {
            questionType = type;
            typeSelectors = config;
            break;
          }
        }
      } else {
        // 通过选择器判断类型
        for (const [type, config] of Object.entries(questionTypes)) {
          if (type === "detectByAttribute" || type === "detectByInput") continue;
          if (config.container && element.matches(config.container)) {
            questionType = type;
            typeSelectors = config;
            break;
          }
        }
      }

      if (!questionType) {
        console.warn("[EnhancedScanner] 无法确定题目类型:", element);
        return null;
      }
      typeSelectors = typeSelectors || {};

      // 构建题目对象
      const question = {
        index: index,
        type: questionType,
        text: "",
        options: [],
        inputs: [],
        answered: false,
        element: element,
      };

      // 提取题目文本（学到的 title 选择器失配时兜底用容器文本）
      let titleElement = null;
      if (typeSelectors.title) {
        try {
          titleElement = element.querySelector(typeSelectors.title);
        } catch (e) {}
      }
      const titleText = titleElement
        ? this._cleanText(titleElement.textContent)
        : "";
      question.text = titleText || this._extractTitleFallback(element);

      // 根据类型提取选项或输入框
      if (questionType === "single" || questionType === "multiple") {
        question.options = this._parseOptions(element, typeSelectors, template);
      } else if (questionType === "fill") {
        question.inputs = this._parseInputs(element, typeSelectors);
      }

      console.log(
        `[EnhancedScanner] 题目${index + 1} [${questionType}]:`,
        question.text.substring(0, 30) + "..."
      );

      return question;
    }

    /**
     * 按题块内的 input 判断题型（detectByInput 模式）
     * @private
     */
    _detectTypeByInput(element) {
      if (element.querySelector('input[type="radio"]')) return "single";
      if (element.querySelector('input[type="checkbox"]')) return "multiple";
      if (
        element.querySelector(
          'input[type="text"], input:not([type]), textarea'
        )
      ) {
        return "fill";
      }
      return null;
    }

    /**
     * 题干文本兜底：模板未提供 title 或失配时，从容器里挑一段合理文本
     * @private
     */
    _extractTitleFallback(element) {
      const cand = element.querySelectorAll(
        "p, span, div, h1, h2, h3, h4, h5, label"
      );
      for (const el of cand) {
        if (el.querySelector("input, textarea")) continue;
        const t = this._cleanText(el.textContent);
        if (t.length > 6 && !/^[A-Da-d][\.\、\s]/.test(t)) return t;
      }
      return this._cleanText(element.textContent);
    }

    /**
     * 解析选项（学到的 optionItem/optionLabel 失配时回退到通用解析）
     * @private
     */
    _parseOptions(container, typeSelectors, template) {
      const inputSel =
        typeSelectors.optionInput ||
        'input[type="radio"], input[type="checkbox"]';

      // 先按 optionItem 行解析
      let optionElements = [];
      if (typeSelectors.optionItem) {
        try {
          optionElements = Array.from(
            container.querySelectorAll(typeSelectors.optionItem)
          ).filter((el) => {
            try {
              return el.querySelector(inputSel);
            } catch (e) {
              return false;
            }
          });
        } catch (e) {
          optionElements = [];
        }
      }

      // 兜底：拿不到选项行 → 直接用容器内的 input
      if (optionElements.length === 0) {
        let inputs = [];
        try {
          inputs = Array.from(container.querySelectorAll(inputSel));
        } catch (e) {}
        return this._parseOptionsFromInputs(container, inputs, template);
      }

      const options = [];
      optionElements.forEach((optionEl, idx) => {
        let input = null;
        try {
          input = optionEl.querySelector(inputSel);
        } catch (e) {}
        if (!input) return;

        // 选项文本：优先 optionLabel，失配则用整行文本
        let optionText = "";
        if (typeSelectors.optionLabel) {
          const labelEl = optionEl.querySelector(typeSelectors.optionLabel);
          if (labelEl) optionText = labelEl.textContent.trim();
        }
        if (!optionText) optionText = optionEl.textContent.trim();

        let optionLabel = String.fromCharCode(65 + idx); // 默认A, B, C...
        if (typeSelectors.optionLabelPattern && optionText) {
          try {
            const match = optionText.match(
              new RegExp(typeSelectors.optionLabelPattern)
            );
            if (match && match[1]) {
              optionLabel = match[1];
              optionText = optionText.substring(match[0].length).trim();
            }
          } catch (e) {}
        } else if (typeSelectors.optionLabelPattern === undefined && optionText) {
          // 模板显式设为 null 表示不要剥前缀（如腾讯问卷）；仅在未设置时做通用剥离
          const match = optionText.match(/^([A-Z])[\.\、\s]/);
          if (match) {
            optionLabel = match[1];
            optionText = optionText.substring(match[0].length).trim();
          }
        }

        options.push({
          label: optionLabel,
          text: optionText,
          selector: this._generateSelector(input, template),
          element: input,
        });
      });

      return options;
    }

    /**
     * 直接从 input 列表解析选项（通用兜底）
     * @private
     */
    _parseOptionsFromInputs(container, inputs, template) {
      const options = [];
      inputs.forEach((input, idx) => {
        const label =
          input.closest("label") ||
          (input.id && container.querySelector(`label[for="${input.id}"]`)) ||
          input.parentElement;
        let optionText = label ? label.textContent.trim() : "";
        let optionLabel = String.fromCharCode(65 + idx);
        const match = optionText.match(/^([A-Z])[\.\、\s]/);
        if (match) {
          optionLabel = match[1];
          optionText = optionText.substring(match[0].length).trim();
        }
        options.push({
          label: optionLabel,
          text: optionText,
          selector: this._generateSelector(input, template),
          element: input,
        });
      });
      return options;
    }

    /**
     * 解析输入框
     * @private
     */
    _parseInputs(container, typeSelectors) {
      const sel =
        (typeSelectors && typeSelectors.inputs) ||
        'input[type="text"], input:not([type]), textarea';
      let inputElements = [];
      try {
        inputElements = Array.from(container.querySelectorAll(sel));
      } catch (e) {
        inputElements = [];
      }

      return inputElements.map((input) => ({
        selector: this._generateSelector(input),
        element: input,
      }));
    }

    /**
     * 生成元素的精确CSS选择器
     * @private
     */
    _generateSelector(element, template) {
      // 优先级1: ID选择器
      if (element.id) {
        return `#${element.id}`;
      }

      // 优先级2: name属性选择器
      if (element.name) {
        const tagName = element.tagName.toLowerCase();
        if (element.type) {
          return `${tagName}[name="${element.name}"][type="${element.type}"]`;
        }
        return `${tagName}[name="${element.name}"]`;
      }

      // 优先级3: 唯一属性选择器
      const uniqueAttrs = ["data-id", "data-index", "data-value"];
      for (const attr of uniqueAttrs) {
        if (element.hasAttribute(attr)) {
          const value = element.getAttribute(attr);
          return `${element.tagName.toLowerCase()}[${attr}="${value}"]`;
        }
      }

      // 优先级4: class + nth-child
      if (element.className) {
        const parent = element.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          const index = siblings.indexOf(element) + 1;
          const className = element.className.split(" ")[0];
          return `.${className}:nth-child(${index})`;
        }
      }

      // 后备: 生成完整路径
      return this._getFullPath(element);
    }

    /**
     * 获取元素的完整路径
     * @private
     */
    _getFullPath(element) {
      const path = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
          selector = `#${current.id}`;
          path.unshift(selector);
          break;
        }

        if (current.className) {
          const classList = current.className.trim().split(/\s+/);
          if (classList.length > 0 && classList[0]) {
            selector += `.${classList[0]}`;
          }
        }

        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (e) => e.tagName === current.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${index})`;
          }
        }

        path.unshift(selector);
        current = parent;

        // 限制路径深度
        if (path.length > 5) break;
      }

      return path.join(" > ");
    }

    /**
     * 清理文本
     * @private
     */
    _cleanText(text) {
      return text
        .replace(/\s+/g, " ")
        .replace(/[\r\n]+/g, " ")
        .trim()
        .substring(0, 1000);
    }

    /**
     * 获取扫描结果
     */
    getQuestions() {
      return this.questions;
    }
  }

  // 导出到全局
  window.EnhancedScanner = EnhancedScanner;

  console.log("[EnhancedScanner] 模块已加载");
})();
