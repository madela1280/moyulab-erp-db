import type { RecoveryScope } from "@/recoveryComplete/components/RecoveryMain";

export type { RecoveryScope };

export type RecoveryRow = {
  id: number;
  data: Record<string, any>;
  sort_key?: number;
};

export type RecoveryGridSettings = {
  columnOrder: string[];
  colWidthUnitByKey: Record<string, number>;
};