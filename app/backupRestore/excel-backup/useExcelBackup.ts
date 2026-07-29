"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createExcelBackup,
  deleteExcelBackup,
  fetchExcelBackups,
  getExcelBackupDownloadUrl,
  type ExcelBackupItem,
} from "./serviceExcelBackup";

export function useExcelBackup() {
  const [backups, setBackups] = useState<ExcelBackupItem[]>([]);
  const [latestBackup, setLatestBackup] = useState<ExcelBackupItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchExcelBackups();
      setBackups(result.backups);
      setLatestBackup(result.latestBackup);
    } catch (e: any) {
      console.error("excel backup reload error:", e);
      setError(e?.message || "excel_backup_list_failed");
      setBackups([]);
      setLatestBackup(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const createBackup = useCallback(async () => {
    setCreating(true);
    setError(null);

    try {
      const backup = await createExcelBackup();
      await reload();
      return backup;
    } catch (e: any) {
      console.error("excel backup create error:", e);
      setError(e?.message || "excel_backup_create_failed");
      throw e;
    } finally {
      setCreating(false);
    }
  }, [reload]);

  const removeBackup = useCallback(
    async (id: number) => {
      setDeletingId(id);
      setError(null);

      try {
        await deleteExcelBackup(id);
        await reload();
      } catch (e: any) {
        console.error("excel backup delete error:", e);
        setError(e?.message || "excel_backup_delete_failed");
        throw e;
      } finally {
        setDeletingId(null);
      }
    },
    [reload]
  );

  const downloadBackup = useCallback((id: number) => {
    window.location.href = getExcelBackupDownloadUrl(id);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    backups,
    latestBackup,
    loading,
    creating,
    deletingId,
    error,
    reload,
    createBackup,
    removeBackup,
    downloadBackup,
  };
}