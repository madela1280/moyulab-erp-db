export function parseTSV(text: string): string[][] {
  const t = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Excel/구글시트는 끝에 개행이 붙는 경우가 많아서 "마지막 1개"만 제거
  // (중간의 빈 줄은 유지해야 엑셀처럼 행 매핑이 안 깨짐)
  const rawLines = t.split("\n");
  const lines =
    rawLines.length > 1 && rawLines[rawLines.length - 1] === ""
      ? rawLines.slice(0, rawLines.length - 1)
      : rawLines;

  if (lines.length === 0) return [[""]];

  // 빈 줄("")도 [""]로 유지(엑셀 동작에 맞춰 행 유지)
  return lines.map((line) => String(line ?? "").split("\t").map((v) => String(v ?? "")));
}

export function toTSV(matrix: string[][]): string {
  return matrix.map((row) => row.map((v) => String(v ?? "")).join("\t")).join("\n");
}