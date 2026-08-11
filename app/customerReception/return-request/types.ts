export type ReturnRequestProcessStatus = "접수중" | "전송" | "삭제";

export type ReturnRequestColumn = {
  key: string;
  label: string;
  width: number;
  source?: "check" | "erp" | "web" | "system";
  editable?: boolean;
};

export type ReturnRequestRow = {
  id: string;
  checked: boolean;
  processStatus: ReturnRequestProcessStatus;
  receivedAt: string;
  data: Record<string, string>;
};

export type ReturnRequestViewMode = "current" | "list";