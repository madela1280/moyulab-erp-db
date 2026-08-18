import type {
  SpecificDateShipmentColumn,
  SpecificDateShipmentRow,
} from "@/views/dataUpload/specific-date-shipment/columns";

export type SpecificDateShipmentCellPoint = {
  rowIndex: number;
  colIndex: number;
};

export type SpecificDateShipmentCellRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export function buildSpecificDateShipmentCellRange(
  anchor: SpecificDateShipmentCellPoint,
  current: SpecificDateShipmentCellPoint
): SpecificDateShipmentCellRange {
  return {
    startRow: Math.min(anchor.rowIndex, current.rowIndex),
    endRow: Math.max(anchor.rowIndex, current.rowIndex),
    startCol: Math.min(anchor.colIndex, current.colIndex),
    endCol: Math.max(anchor.colIndex, current.colIndex),
  };
}

export function isSpecificDateShipmentCellInRange(
  rowIndex: number,
  colIndex: number,
  range: SpecificDateShipmentCellRange | null
) {
  if (!range) return false;

  return (
    rowIndex >= range.startRow &&
    rowIndex <= range.endRow &&
    colIndex >= range.startCol &&
    colIndex <= range.endCol
  );
}

export function normalizeSpecificDateShipmentCopyText(value: unknown) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

export function makeSpecificDateShipmentTSV(
  rows: SpecificDateShipmentRow[],
  columns: SpecificDateShipmentColumn[],
  range: SpecificDateShipmentCellRange | null
) {
  if (!range) return "";

  const lines: string[] = [];

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    const cells: string[] = [];

    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const col = columns[colIndex];
      cells.push(normalizeSpecificDateShipmentCopyText(row?.data?.[col.key] ?? ""));
    }

    lines.push(cells.join("\t"));
  }

  return lines.join("\n");
}
