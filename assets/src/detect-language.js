/** Lightweight heuristics for WebKlip's supported syntax languages. */

const MIN_LEN = 20;
const SAMPLE_LEN = 8000;

/**
 * @param {string} text
 * @returns {string | null} One of the supported language ids, or null.
 */
export function detectLanguage(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const sample = trimmed.length > SAMPLE_LEN ? trimmed.slice(0, SAMPLE_LEN) : trimmed;

  // JSON is reliable via parse; allow shorter snippets than free-form code.
  if (looksLikeJson(sample)) return "json";
  if (trimmed.length < MIN_LEN) return null;

  const shebang = sample.match(/^#!([^\n]*)/);
  if (shebang) {
    const line = shebang[1].toLowerCase();
    if (/\b(python|python3)\b/.test(line)) return "python";
    if (/\b(bash|sh|zsh|dash|ksh)\b/.test(line) || line.includes("/bin/sh")) return "bash";
    if (/\bnode\b/.test(line)) return "javascript";
  }

  if (looksLikeHtml(sample)) return "html";
  if (looksLikeCss(sample)) return "css";
  if (looksLikeSql(sample)) return "sql";
  if (looksLikeYaml(sample)) return "yaml";
  // Fenced markdown docs often contain code that would match JS/Python first.
  if (looksLikeMarkdown(sample)) return "markdown";
  if (looksLikeTypescript(sample)) return "typescript";
  if (looksLikePython(sample)) return "python";
  if (looksLikeBash(sample)) return "bash";
  if (looksLikeJavascript(sample)) return "javascript";

  return null;
}

function looksLikeJson(sample) {
  const first = sample[0];
  if (first !== "{" && first !== "[") return false;
  // Structured JSON can be short; still require a minimal object/array shape.
  if (sample.length < 8) return false;
  try {
    JSON.parse(sample);
    return true;
  } catch {
    return false;
  }
}

function looksLikeHtml(sample) {
  if (!/<\/?[a-zA-Z][\w:-]*(\s[^>]*)?>/.test(sample)) return false;
  return /<(html|head|body|div|span|p|a|ul|ol|li|table|tr|td|th|section|article|nav|header|footer|main|form|input|button|img|script|style|h[1-6])\b/i.test(
    sample
  );
}

function looksLikeCss(sample) {
  if (!/[{;]/.test(sample)) return false;
  if (!/[.#@]?[\w-]+\s*\{[^}]*\}/.test(sample)) return false;
  // Prefer CSS property declarations over JS object literals.
  const props =
    sample.match(
      /\b(color|background|margin|padding|display|flex|grid|font-size|font-weight|border|width|height|position|top|left|right|bottom|z-index|opacity|transform|transition|animation|justify-content|align-items|gap|overflow|box-sizing)\s*:/gi
    ) || [];
  if (props.length >= 2) return true;
  return (
    props.length >= 1 &&
    /:\s*[^;{}\n]+;/.test(sample) &&
    !/\b(const|let|var|function|=>|import\s+|export\s+)\b/.test(sample)
  );
}

function looksLikeSql(sample) {
  return /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b[\s\S]{0,200}\b(FROM|INTO|TABLE|SET|WHERE|VALUES|JOIN)\b/i.test(
    sample
  );
}

function looksLikeYaml(sample) {
  if (sample.startsWith("{") || sample.startsWith("[")) return false;
  if (/^---\s*$/m.test(sample) && /^\s*[\w.-]+:\s/m.test(sample)) return true;
  const lines = sample.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length < 3) return false;
  const keyLines = lines.filter((l) => /^\s*[\w.-]+:(\s+\S.*)?\s*$/.test(l));
  const listLines = lines.filter((l) => /^\s*-\s+\S/.test(l));
  return keyLines.length >= 3 && keyLines.length + listLines.length >= Math.ceil(lines.length * 0.7);
}

function looksLikeTypescript(sample) {
  const tsSignals =
    /\b(interface|type)\s+[A-Za-z_]\w*\s*[=<{]|:\s*(string|number|boolean|any|unknown|void|never)\b|\bas\s+const\b|\benum\s+[A-Za-z_]|<[A-Za-z_][\w,]*>\s*\(/.test(
      sample
    );
  if (!tsSignals) return false;
  return /\b(import|export|const|let|function|class|return)\b/.test(sample);
}

function looksLikePython(sample) {
  return (
    /\bdef\s+[A-Za-z_]\w*\s*\(|\bclass\s+[A-Za-z_]\w*\s*(\(|:)|^\s*from\s+\w+(\.\w+)*\s+import\b|^\s*import\s+\w+(\.\w+)*(?:\s*,\s*\w+)*\s*$|if\s+__name__\s*==\s*['"]__main__['"]/m.test(
      sample
    ) ||
    (/\bprint\s*\(/.test(sample) && /^\s*(if|for|while|with|try|elif|else)\b.*:\s*$/m.test(sample))
  );
}

function looksLikeBash(sample) {
  if (/^\s*(function\s+[A-Za-z_]\w*\s*(?:\(|\{)|[A-Za-z_]\w*\s*\(\)\s*\{)/m.test(sample)) {
    if (/\b(echo|export|local|source|\[\[|\$\{?\w+)/.test(sample)) return true;
  }
  return (
    /^\s*(#!\/|set\s+-[euxo]|export\s+[A-Za-z_]\w*=)/m.test(sample) ||
    (/(^|\n)\s*(echo|cd|mkdir|rm|cp|mv|chmod|curl|wget|grep|awk|sed)\s+/m.test(sample) &&
      /\$\{?[A-Za-z_]|\bif\s+\[\s+|then\s*$|fi\s*$/m.test(sample))
  );
}

function looksLikeJavascript(sample) {
  return /\b(const|let|var)\s+[A-Za-z_$]|=>\s*[{(]|\bfunction\s+[A-Za-z_$]|\bimport\s+(\{|['"]|\w+\s+from)|\bexport\s+(default|const|function|class|\{)|\bconsole\.(log|error|warn|debug)\s*\(/.test(
    sample
  );
}

function looksLikeMarkdown(sample) {
  const heading = /^#{1,6}\s+\S+/m.test(sample);
  const fence = /^```[\w-]*\s*$/m.test(sample);
  const link = /\[[^\]]+\]\([^)]+\)/.test(sample);
  const list = /^(\s*[-*+]\s+\S|\s*\d+\.\s+\S)/m.test(sample);
  const strong = /(\*\*[^*]+\*\*|__[^_]+__)/.test(sample);
  const signals = [heading, fence, link, list, strong].filter(Boolean).length;
  if (fence && (heading || link || list)) return true;
  if (heading && (link || list || strong || fence)) return true;
  return signals >= 3;
}
