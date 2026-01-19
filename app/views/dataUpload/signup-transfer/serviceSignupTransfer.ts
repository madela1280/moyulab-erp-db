type RowValues = Record<string, string>;

export type SignupTransferResult =
  | { rowIndex: number; ok: true; unifiedId: number }
  | { rowIndex: number; ok: false; code: string; reason: string };

export type SignupTransferResponse = {
  ok: boolean;
  anyFailed: boolean;
  anyConfirmNeeded: boolean;
  insertedCount?: number;
  confirmNeededRows?: number[];
  results: SignupTransferResult[];
};

async function post(body: any): Promise<SignupTransferResponse> {
  const r = await fetch("/api/unified/signup-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await r.text().catch(() => "");
  if (!r.ok) {
    throw new Error(text || `FAILED(${r.status})`);
  }

  return (text ? (JSON.parse(text) as SignupTransferResponse) : ({} as SignupTransferResponse));
}

export async function apiSignupTransfer(params: {
  rows: RowValues[];
  selectedKeys: string[];
  force?: boolean;
  confirmDuplicates?: boolean;
}): Promise<SignupTransferResponse> {
  return await post({
    rows: params.rows,
    selectedKeys: params.selectedKeys,
    force: !!params.force,
    confirmDuplicates: !!params.confirmDuplicates,
  });
}