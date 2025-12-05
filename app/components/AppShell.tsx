"use client";

import "@/global-socket/socket-client.js";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { TOP_MENUS, TopMenu } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";
import NoAccess from "@/components/NoAccess";

type MeUser = {
  username: string;
  role: string;
  name: string;
  phone: string;
};

type PermissionMap = Record<string, { can_read: boolean; can_write: boolean }>;

// 기본 대카테고리/소카테고리: 통합관리
const DEFAULT_TOP: TopMenu = "통합관리";
const DEFAULT_SUB: string = SUB_MENUS[DEFAULT_TOP][0];

export default function AppShell() {
  const [top, setTop] = useState<TopMenu | null>(DEFAULT_TOP);
  const [sub, setSub] = useState<string | null>(DEFAULT_SUB);
  const [showSub, setShowSub] = useState(false);
  const [dropdownLeft, setDropdownLeft] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 인증/권한 관련 상태
  const [me, setMe] = useState<MeUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [perms, setPerms] = useState<PermissionMap>({});
  const [permsLoading, setPermsLoading] = useState(false);

  // 권한 없음으로 진입한 대카테고리 이름
  const [noAccessMenu, setNoAccessMenu] = useState<string | null>(null);

  const isAdmin = me?.role === "admin";

  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  /* ---------------- 인증/권한 로딩 ---------------- */

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // 1) 현재 로그인 사용자 정보
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as any;

        if (!res.ok || !data?.ok) {
          if (!cancelled) {
            setMe(null);
          }
          return;
        }

        const user = data.user as MeUser;
        if (cancelled) return;

        setMe(user);

        // 2) 일반 사용자면 권한 로딩
        if (user.role !== "admin") {
          setPermsLoading(true);
          try {
            const pres = await fetch(
              `/api/permissions?username=${encodeURIComponent(user.username)}`,
              { cache: "no-store" }
            );
            const pdata = (await pres.json()) as any;
            if (pres.ok && pdata?.ok) {
              setPerms(pdata.permissions as PermissionMap);
            } else {
              setPerms({});
            }
          } catch (e) {
            console.error("load permissions error:", e);
            setPerms({});
          } finally {
            if (!cancelled) setPermsLoading(false);
          }
        } else {
          // admin 은 모든 메뉴 허용
          setPerms({});
        }
      } catch (e) {
        console.error("auth load error:", e);
        if (!cancelled) {
          setMe(null);
          setPerms({});
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 특정 대카테고리에 대해 읽기 권한 있는지
  const canRead = (menu: TopMenu): boolean => {
    if (isAdmin) return true;
    if (!me) return false;

    if (menu === "사용자관리") {
      // 사용자관리는 항상 관리자 전용
      return false;
    }

    const p = perms[menu];
    return !!p && !!p.can_read;
  };

  // 특정 대카테고리에 대해 쓰기 권한 있는지
  const canWrite = (menu: TopMenu): boolean => {
    if (isAdmin) return true;
    if (!me) return false;

    if (menu === "사용자관리") {
      return false;
    }

    const p = perms[menu];
    return !!p && !!p.can_write;
  };

  // 권한 정보가 준비된 후, 기본 메뉴 접근 불가면 자물쇠로 처리
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin && !permsLoading) {
      if (!canRead(DEFAULT_TOP)) {
        setNoAccessMenu(DEFAULT_TOP);
        setTop(DEFAULT_TOP);
        setSub(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, permsLoading, me, perms]);

  /* ---------------- 서브메뉴 타이머 ---------------- */

  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowSub(false), 5000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /* ---------------- 렌더링 ---------------- */

  const visibleTopMenus: TopMenu[] = [...TOP_MENUS];
  const loading = authLoading || (!isAdmin && permsLoading);

  const currentCanRead = top ? canRead(top) : false;
  const currentCanWrite = top ? canWrite(top) : false;

  return (
    // 한 화면 고정
    <div className="w-full h-screen bg-gray-50 flex flex-col overflow-hidden">
      <header className="w-full bg-gray-100 border-b px-8 py-3">
        <div className="flex items-center">
          <div className="flex items-center gap-3 mr-12">
            <Image src="/logo.png" alt="logo" width={36} height={36} />
            <h1 className="text-[1.45rem] font-bold text-gray-800">Moulab</h1>
          </div>

          {/* nav를 세로(col)로: 위는 대카테고리, 아래는 소카테고리 줄 */}
          <nav className="flex-grow flex flex-col text-[0.90rem] font-semibold text-gray-700 ml-40">
            {/* 대카테고리 줄 */}
            <div className="flex items-center gap-8">
              {visibleTopMenus.map((m) => (
                <button
                  key={m}
                  onClick={(e) => {
                    if (!canRead(m)) {
                      setNoAccessMenu(m);
                      setTop(m);
                      setSub(null);
                      setShowSub(false);
                      stopTimer();
                      return;
                    }

                    setNoAccessMenu(null);
                    setTop(m);
                    setSub(SUB_MENUS[m][0]);
                    setShowSub(true);
                    startTimer();
                    // 클릭한 버튼의 x 위치를 기억 → 아래 소카테고리 줄 margin-left로 사용
                    setDropdownLeft(e.currentTarget.offsetLeft);
                  }}
                  className={
                    top === m
                      ? "pb-1 border-b-2 border-gray-800 text-black"
                      : "hover:text-black"
                  }
                >
                  {m}
                </button>
              ))}
            </div>

            {/* 소카테고리 줄: 헤더 아래에 항상 온전히 보이게 */}
            {top && showSub && canRead(top) && (
              <div
                className="flex gap-2 mt-2"
                style={{ marginLeft: dropdownLeft }}
                onMouseEnter={stopTimer}
                onMouseLeave={startTimer}
              >
                {SUB_MENUS[top].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSub(s);
                      setShowSub(false);
                      stopTimer();
                    }}
                    className="px-3 py-1 text-xs rounded-full border bg-gray-300 border-gray-500 text-gray-800"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* 헤더 아래 전체 영역 */}
      <main className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="text-sm text-gray-500 p-4">Loading...</div>
        ) : noAccessMenu ? (
          <NoAccess menuLabel={noAccessMenu} />
        ) : (
          <div
            className="relative w-full h-full"
            onClickCapture={(e) => {
              if (!currentCanRead || currentCanWrite || isAdmin) return;

              const target = e.target as HTMLElement | null;
              if (!(target instanceof HTMLElement)) return;

              const interactive = target.closest(
                'button, input, select, textarea, a, [role="button"], [contenteditable="true"]'
              );
              if (!interactive) return;

              e.preventDefault();
              e.stopPropagation();
              alert(
                `(${top}) 메뉴는 읽기 전용입니다.\n쓰기 권한이 없습니다.\n서비스를 이용하려면 회사 마스터에게 문의 바랍니다.`
              );
            }}
          >
            <CurrentView key={`${top}-${sub}`} />
          </div>
        )}
      </main>
    </div>
  );
}