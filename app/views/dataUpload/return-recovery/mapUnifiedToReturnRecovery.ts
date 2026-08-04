import {
  RETURN_RECOVERY_COLUMNS,
  type ReturnRecoveryRow,
} from "@/views/dataUpload/return-recovery/columns";
import type { ReturnRecoveryUnifiedSourceRow } from "@/views/dataUpload/return-recovery/serviceReturnRecovery";

export const RETURN_RECOVERY_DEFAULT_MEMO = "연락 후 방문부탁드립니다. 한국모유수유정보센터 반품";

function text(v: unknown) {
  return String(v ?? "").trim();
}

function makeEmptyData() {
  return RETURN_RECOVERY_COLUMNS.reduce<Record<string, string>>((acc, col) => {
    acc[col.key] = "";
    return acc;
  }, {});
}

function buildItemName(data: Record<string, any>) {
  const parts = [
    text(data["기기번호"]),
    text(data["제품"]),
    text(data["거래처분류"]),
    text(data["특이사항2"]),
  ].filter(Boolean);

  parts.push("반납");

  return parts.join("/");
}

export function mapUnifiedToReturnRecoveryRows(sourceRows: ReturnRecoveryUnifiedSourceRow[]): ReturnRecoveryRow[] {
  return (Array.isArray(sourceRows) ? sourceRows : []).map((source) => {
    const data = source?.data && typeof source.data === "object" ? source.data : {};
    const mapped = makeEmptyData();

    mapped.senderName = text(data["수취인"]);
    mapped.senderPhone1 = text(data["연락처1"]);
    mapped.senderPhone2 = text(data["연락처2"]);
    mapped.senderAddress = text(data["계약자주소"]);
    mapped.itemName = buildItemName(data);
    mapped.pickupDate = "";
    mapped.boxCount = "1";
    mapped.zipCode = "";
    mapped.blankX1 = "";
    mapped.blankX2 = "";
    mapped.blankX3 = "";
    mapped.memo = RETURN_RECOVERY_DEFAULT_MEMO;
    mapped.originalInvoiceNo = "";

    return {
      id: `unified-${source.id}`,
      data: mapped,
    };
  });
}