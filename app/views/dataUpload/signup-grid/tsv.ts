export function parseTSV(text: string): string[][] {
  const t = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = t.split("\n");

  // 끝에 공백 라인이 따라오는 경우가 많아서 제거하되, 중간 빈 줄은 유지하지 않음(엑셀 기본 동작에 맞춤)
  const trimmed = lines.filter((l) => l.length > 0);

  if (trimmed.length === 0) return [[""]];

  return trimmed.map((line) => line.split("\t").map((v) => String(v ?? "")));
}

export function toTSV(matrix: string[][]): string {
  return matrix.map((row) => row.map((v) => String(v ?? "")).join("\t")).join("\n");
}