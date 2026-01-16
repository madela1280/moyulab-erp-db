import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const TARGET_DIRS = ["app"];

const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
]);

const DENY_PATTERNS = [
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\blocalforage\b/i,
  /\bnavigator\.storage\b/,
  /\bnavigator\.serviceWorker\b/,
  /\bCacheStorage\b/,
  /\bcaches\b/,
  /\bidb\b/,
];

const TEXT_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      walk(p, out);
    } else {
      if (!TEXT_EXT_RE.test(ent.name)) continue;
      out.push(p);
    }
  }
  return out;
}

// 주석/문자열을 공백으로 마스킹(길이/줄 유지) → 실제 코드 사용만 탐지
function maskCommentsAndStrings(src) {
  const out = src.split("");
  const len = out.length;

  const mask = (i) => {
    if (out[i] !== "\n") out[i] = " ";
  };

  let i = 0;
  let state = "code"; // code | lineComment | blockComment | sQuote | dQuote | template
  let templateExprDepth = 0; // template 안에서 ${ ... } 파싱

  while (i < len) {
    const c = src[i];
    const n = i + 1 < len ? src[i + 1] : "";

    if (state === "code") {
      // comments
      if (c === "/" && n === "/") {
        mask(i); mask(i + 1);
        i += 2;
        state = "lineComment";
        continue;
      }
      if (c === "/" && n === "*") {
        mask(i); mask(i + 1);
        i += 2;
        state = "blockComment";
        continue;
      }

      // strings
      if (c === "'") { mask(i); i++; state = "sQuote"; continue; }
      if (c === '"') { mask(i); i++; state = "dQuote"; continue; }

      // template literal
      if (c === "`") { mask(i); i++; state = "template"; continue; }

      i++;
      continue;
    }

    if (state === "lineComment") {
      mask(i);
      if (c === "\n") state = "code";
      i++;
      continue;
    }

    if (state === "blockComment") {
      mask(i);
      if (c === "*" && n === "/") {
        mask(i + 1);
        i += 2;
        state = "code";
        continue;
      }
      i++;
      continue;
    }

    if (state === "sQuote") {
      mask(i);
      if (c === "\\" && n) { mask(i + 1); i += 2; continue; }
      if (c === "'") { i++; state = "code"; continue; }
      i++;
      continue;
    }

    if (state === "dQuote") {
      mask(i);
      if (c === "\\" && n) { mask(i + 1); i += 2; continue; }
      if (c === '"') { i++; state = "code"; continue; }
      i++;
      continue;
    }

    if (state === "template") {
      // template 밖 텍스트는 마스킹
      mask(i);

      // escape
      if (c === "\\" && n) { mask(i + 1); i += 2; continue; }

      // ${ 시작 → 이후는 "코드"로 보고 중괄호 depth 추적(표현식 내부의 localStorage 사용도 잡기 위함)
      if (c === "$" && n === "{") {
        mask(i + 1);
        i += 2;
        templateExprDepth = 1;

        // template expression은 code처럼 스캔하되, depth가 0이면 template로 복귀
        while (i < len && templateExprDepth > 0) {
          const cc = src[i];
          const nn = i + 1 < len ? src[i + 1] : "";

          // comments in expr
          if (cc === "/" && nn === "/") {
            mask(i); mask(i + 1);
            i += 2;
            while (i < len && src[i] !== "\n") { mask(i); i++; }
            continue;
          }
          if (cc === "/" && nn === "*") {
            mask(i); mask(i + 1);
            i += 2;
            while (i < len) {
              const bc = src[i], bn = i + 1 < len ? src[i + 1] : "";
              mask(i);
              if (bc === "*" && bn === "/") { mask(i + 1); i += 2; break; }
              i++;
            }
            continue;
          }

          // strings in expr
          if (cc === "'") {
            mask(i); i++;
            while (i < len) {
              const sc = src[i], sn = i + 1 < len ? src[i + 1] : "";
              mask(i);
              if (sc === "\\" && sn) { mask(i + 1); i += 2; continue; }
              if (sc === "'") { i++; break; }
              i++;
            }
            continue;
          }
          if (cc === '"') {
            mask(i); i++;
            while (i < len) {
              const dc = src[i], dn = i + 1 < len ? src[i + 1] : "";
              mask(i);
              if (dc === "\\" && dn) { mask(i + 1); i += 2; continue; }
              if (dc === '"') { i++; break; }
              i++;
            }
            continue;
          }

          // nested template in expr: treat as template, but mask until matching backtick (safe)
          if (cc === "`") {
            mask(i); i++;
            while (i < len) {
              const tc = src[i], tn = i + 1 < len ? src[i + 1] : "";
              mask(i);
              if (tc === "\\" && tn) { mask(i + 1); i += 2; continue; }
              if (tc === "`") { i++; break; }
              i++;
            }
            continue;
          }

          // braces depth
          if (cc === "{") templateExprDepth++;
          if (cc === "}") templateExprDepth--;

          i++;
        }

        // expr 끝났으면 template 상태로 복귀
        continue;
      }

      // template 종료
      if (c === "`") { i++; state = "code"; continue; }

      i++;
      continue;
    }

    i++;
  }

  return out.join("");
}

function indexToLineCol(text, idx) {
  let line = 1, col = 1;
  for (let i = 0; i < idx; i++) {
    if (text[i] === "\n") { line++; col = 1; } else { col++; }
  }
  return { line, col };
}

function getLinePreview(text, lineNumber) {
  const lines = text.split("\n");
  const line = lines[lineNumber - 1] ?? "";
  return line.length > 240 ? line.slice(0, 240) + " …" : line;
}

let violations = [];

for (const relDir of TARGET_DIRS) {
  const absDir = path.join(ROOT, relDir);
  if (!fs.existsSync(absDir)) continue;

  const files = walk(absDir);
  for (const file of files) {
    let txt = "";
    try { txt = fs.readFileSync(file, "utf8"); } catch { continue; }

    const masked = maskCommentsAndStrings(txt);

    for (const re of DENY_PATTERNS) {
      const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      let m;
      while ((m = globalRe.exec(masked)) !== null) {
        const idx = m.index;
        const { line, col } = indexToLineCol(txt, idx);
        violations.push({
          file,
          match: m[0],
          line,
          col,
          preview: getLinePreview(txt, line),
        });
        if (violations.length > 50) break;
      }
      if (violations.length > 50) break;
    }
    if (violations.length > 50) break;
  }
  if (violations.length > 50) break;
}

if (violations.length) {
  console.error("\n[DENY] Forbidden browser storage usage detected (comments/strings ignored).");
  for (const v of violations.slice(0, 30)) {
    const rel = path.relative(ROOT, v.file);
    console.error(`- ${rel}:${v.line}:${v.col}  \"${v.match}\"`);
    console.error(`  ${v.preview}`);
  }
  if (violations.length > 30) console.error(`... and ${violations.length - 30} more`);
  console.error("\nBlocked: remove usage before commit/build.\n");
  process.exit(1);
} else {
  console.log("[OK] No forbidden browser storage usage found.");
}