"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createRegularBackup,
  deleteRegularBackup,
  fetchRegularBackups,
  getRegularBackupDownloadUrl,
  restoreRegularBackup,
  type RegularBackupItem,
} from "./serviceRegularBackup";

export function useRegularBackup() {
  const [backups, setBackups] = useState<RegularBackupItem[]>([]);
  const [latestPreRestore, setLatestPreRestore] =
    useState<RegularBackupItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchRegularBackups();
      setBackups(result.backups);
      setLatestPreRestore(result.latestPreRestore);
    } catch (e: any) {
      console.error("regular backup reload error:", e);
      setError(e?.message || "backup_list_failed");
      setBackups([]);
      setLatestPreRestore(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const createBackup = useCallback(async () => {
    setCreating(true);
    setError(null);

    try {
      await createRegularBackup();
      await reload();
    } catch (e: any) {
      console.error("regular backup create error:", e);
      setError(e?.message || "backup_create_failed");
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
        await deleteRegularBackup(id);
        await reload();
      } catch (e: any) {
        console.error("regular backup delete error:", e);
        setError(e?.message || "backup_delete_failed");
        throw e;
      } finally {
        setDeletingId(null);
      }
    },
    [reload]
  );

    const restoreBackup = useCallback(
    async (params: {
      id: number;
      confirmText?: string;
      businessHourConfirm?: string;
      adminPassword?: string;
      restoreReason?: string;
    }) => {
      setRestoringId(params.id);
      setError(null);

      try {
        await restoreRegularBackup(params);
      } catch (e: any) {
        console.error("regular backup restore error:", e);
        setError(e?.message || "backup_restore_failed");
        throw e;
      } finally {
        setRestoringId(null);
      }
    },
    []
  );

  const downloadBackup = useCallback((id: number) => {
    window.location.href = getRegularBackupDownloadUrl(id);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    backups,
    latestPreRestore,
    loading,
    creating,
    deletingId,
    restoringId,
    error,
    reload,
    createBackup,
    removeBackup,
    restoreBackup,
    downloadBackup,
  };
}