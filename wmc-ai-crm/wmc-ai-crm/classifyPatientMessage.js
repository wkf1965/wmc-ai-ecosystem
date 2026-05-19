/**
 * Keyword-based inquiry classification (Chinese-first keywords).
 * First matching rule wins (order matters).
 */

const RULES = [
  {
    category: "Stroke Rehab",
    keywords: ["中风", "半身不遂", "不能走路", "手脚无力"],
  },
  {
    category: "Lumbar / Back Pain",
    keywords: ["腰痛", "腰椎", "腰椎间盘突出", "坐骨神经痛"],
  },
  {
    category: "Frozen Shoulder",
    keywords: ["肩周炎", "肩膀痛", "手举不高"],
  },
  {
    category: "Tinnitus",
    keywords: ["耳鸣", "听不到", "耳朵嗡嗡声"],
  },
  {
    category: "Mental Health",
    keywords: ["失眠", "焦虑", "抑郁", "情绪低落"],
  },
  {
    category: "Nursing Home",
    keywords: ["老人照顾", "疗养院", "养老院", "住院照顾"],
  },
  {
    category: "Knee Pain",
    keywords: ["膝盖痛", "退化性膝关节炎", "走路痛"],
  },
  {
    category: "Gout",
    keywords: ["痛风", "gout", "脚趾痛"],
  },
];

const DEFAULT_CATEGORY = "General Inquiry";

function keywordMatches(message, keyword) {
  if (/[^\u0000-\u007f]/.test(keyword)) {
    return message.includes(keyword);
  }
  return message.toLowerCase().includes(keyword.toLowerCase());
}

/**
 * @param {string} message
 * @returns {string}
 */
function classifyPatientMessage(message) {
  const raw = typeof message === "string" ? message : "";
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (keywordMatches(raw, kw)) {
        return rule.category;
      }
    }
  }
  return DEFAULT_CATEGORY;
}

module.exports = { classifyPatientMessage, DEFAULT_CATEGORY };
