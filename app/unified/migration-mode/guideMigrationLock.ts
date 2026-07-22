export const UNIFIED_GUIDE_MIGRATION_LOCK_KEY = "__guideMigrationLocked";

export function isGuideMigrationLocked(data: Record<string, any> | null | undefined) {
  return data?.[UNIFIED_GUIDE_MIGRATION_LOCK_KEY] === true;
}

export function withGuideMigrationLock(patch: Record<string, any>) {
  return {
    ...patch,
    [UNIFIED_GUIDE_MIGRATION_LOCK_KEY]: true,
  };
}