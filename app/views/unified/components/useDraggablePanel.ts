// app/views/unified/components/useDraggablePanel.ts
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 드래그 가능한 패널 위치 관리 훅 (로컬 UI 상태 전용)
 * - localStorage 사용 금지 규칙 준수: 위치 저장은 하지 않음(세션 유지X)
 */
export function useDraggablePanel(defaultPos = { x: 120, y: 120 }, panelSize = { w: 560, h: 520 }) {
  const [pos, setPos] = useState(defaultPos);

  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  function clampToViewport(x: number, y: number) {
    const margin = 12;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;

    const maxX = Math.max(margin, vw - panelSize.w - margin);
    const maxY = Math.max(margin, vh - panelSize.h - margin);

    return {
      x: Math.min(maxX, Math.max(margin, x)),
      y: Math.min(maxY, Math.max(margin, y)),
    };
  }

  function onMouseDownDragHandle(e: React.MouseEvent) {
    if (e.button !== 0) return;

    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: pos.x,
      baseY: pos.y,
    };

    e.preventDefault();
    e.stopPropagation();
  }

  useEffect(() => {
    function onMove(ev: MouseEvent) {
      const st = dragRef.current;
      if (!st?.dragging) return;
      const dx = ev.clientX - st.startX;
      const dy = ev.clientY - st.startY;
      setPos(clampToViewport(st.baseX + dx, st.baseY + dy));
    }

    function onUp() {
      const st = dragRef.current;
      if (st) st.dragging = false;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y, panelSize.w, panelSize.h]);

  return { pos, setPos, onMouseDownDragHandle };
}