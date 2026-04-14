function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function makeDedupKey(input: {
  deviceNo: string;
  receiverName: string;
  start: Date;
  end: Date;
}) {
  const deviceNo = String(input.deviceNo ?? "").trim() || "-";
  const receiverName = String(input.receiverName ?? "").trim() || "-";
  return `${deviceNo}||${receiverName}||${ymd(input.start)}~${ymd(input.end)}`;
}