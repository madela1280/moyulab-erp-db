// 안전한 클립보드 유틸:
// - writeText: navigator.clipboard 실패 시 execCommand('copy') fallback
// - readText: navigator.clipboard만 시도(실패하면 빈 문자열), Ctrl+V는 onPasteCapture로 처리됨

export async function safeWriteClipboardText(text: string): Promise<boolean> {
  const t = String(text ?? "");

  // 1) 표준 API 시도
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    // ignore
  }

  // 2) fallback (execCommand)
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";

    document.body.appendChild(ta);

    ta.focus();
    ta.select();

    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export async function safeReadClipboardText(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}