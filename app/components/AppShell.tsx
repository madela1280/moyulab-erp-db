// app/components/AppShell.tsx

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

  // ✅ 권한 호환(기존 데이터 보호):
  // - 과거에 permissions.menu_key = "대여관리" 로 저장된 권한이 있을 수 있음
  // - 이제 대카테고리는 "회수완료" 이므로, 회수완료 권한이 없으면 대여관리 권한을 폴백으로 사용
  const getPermCompat = (menu: TopMenu) => {
    if (menu !== "회수완료") return perms[menu];
    return perms["회수완료"] ?? perms["대여관리"];
  };

  // 특정 대카테고리에 대해 읽기 권한 있는지
  const canRead = (menu: TopMenu): boolean => {
    if (isAdmin) return true;
    if (!me) return false;

    if (menu === "사용자관리") {
      // 사용자관리는 항상 관리자 전용
      return false;
    }

    const p = getPermCompat(menu);
    return !!p && !!p.can_read;
  };

  // 특정 대카테고리에 대해 쓰기 권한 있는지
  const canWrite = (menu: TopMenu): boolean => {
    if (isAdmin) return true;
    if (!me) return false;

    if (menu === "사용자관리") {
      return false;
    }

    const p = getPermCompat(menu);
    return !!p && !!p.can_write;
  };

   // 권한 정보가 준비된 후, 기본 메뉴 접근 불가면 자물쇠로 처리
  useEffect(() => {
    if (authLoading) return;

    // ✅ 관리자(admin)는 항상 전체 허용.
    // 인증 로딩 중 클릭 등으로 noAccessMenu가 남아도 관리자 확인 후 즉시 해제한다.
    if (isAdmin) {
      setNoAccessMenu(null);

      if (!top) {
        setTop(DEFAULT_TOP);
      }

      if (!sub) {
        const safeTop = top ?? DEFAULT_TOP;
        setSub(SUB_MENUS[safeTop][0]);
      }

      return;
    }

    if (!permsLoading) {
      if (!canRead(DEFAULT_TOP)) {
        setNoAccessMenu(DEFAULT_TOP);
        setTop(DEFAULT_TOP);
        setSub(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, permsLoading, me, perms, isAdmin, top, sub]); 

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

  // "카카오톡"은 일반 카테고리 탭 줄이 아니라 로그아웃 오른쪽에 아이콘 버튼으로 따로 그린다.
  const visibleTopMenus: TopMenu[] = TOP_MENUS.filter((m) => m !== "카카오톡");
  const loading = authLoading || (!isAdmin && permsLoading);

  const currentCanRead = top ? canRead(top) : false;
  const currentCanWrite = top ? canWrite(top) : false;

   const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
      });
    } catch (e) {
      console.error("logout error:", e);
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    // 화면 전체를 쓰되, 내부에서만 스크롤 나도록
    <div className="w-full h-screen bg-gray-50 flex flex-col overflow-hidden">
      <header className="w-full bg-gray-100 border-b px-8 py-3 relative">
        <div className="flex items-center">
          <div className="flex items-center gap-3 mr-12">
            <Image src="/logo.png" alt="logo" width={36} height={36} />
            <h1 className="text-[1.45rem] font-bold text-gray-800">Moulab</h1>
          </div>

          <nav className="flex-grow flex text-[0.99rem] font-[660] text-gray-700 ml-40">
            <div className="flex items-center gap-12 relative">
              {visibleTopMenus.map((m) => (
              <button
                  key={m}
                  onClick={(e) => {
                    // ✅ 인증/권한 로딩 중에는 canRead가 false로 계산될 수 있으므로
                    // 임시로 "권한없음" 상태를 만들지 않는다.
                    if (loading) return;

                    if (!canRead(m)) {
                      setNoAccessMenu(m);
                      setTop(m);
                      setSub(null);
                      setShowSub(false);
                      stopTimer();
                      return;
                    }

                    // ✅ 접근 가능한 메뉴를 클릭하면 이전 권한없음 상태는 반드시 해제
                    setNoAccessMenu(null);

                    // ✅ 다른 대카테고리로 이동하면 첫 소카테고리로 진입
                    if (top !== m) {
                      setTop(m);
                      setSub(SUB_MENUS[m][0]);
                    } else if (!sub) {
                      // ✅ 같은 대카테고리인데 이전 권한없음 처리로 sub가 null인 경우 복구
                      // 예: 사용자관리 클릭 → 권한없음 상태 → 관리자 확인 후 다시 사용자관리 클릭
                      setSub(SUB_MENUS[m][0]);
                    }

                    setShowSub(true);
                    startTimer();
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

              <button
                type="button"
                onClick={() => {
                  setShowSub(false);
                  stopTimer();
                  void handleLogout();
                }}
                className="ml-12 px-3 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-200 hover:text-black text-[0.92rem] font-[660]"
                title="로그아웃"
              >
                로그아웃
              </button>

              <button
                type="button"
                onClick={() => {
                  if (loading) return;

                  if (!canRead("카카오톡")) {
                    setNoAccessMenu("카카오톡");
                    setTop("카카오톡");
                    setSub(null);
                    setShowSub(false);
                    stopTimer();
                    return;
                  }

                  setNoAccessMenu(null);
                  setTop("카카오톡");
                  setSub(SUB_MENUS["카카오톡"][0]);
                  setShowSub(false);
                  stopTimer();
                }}
                className={`ml-12 flex flex-col items-center gap-0.5 ${
                  top === "카카오톡" ? "text-black" : "text-gray-700 hover:text-black"
                }`}
                title="카카오톡 대화조회"
              >
                <Image src="/kakao-icon.jpg" alt="카카오톡" width={26} height={26} className="rounded-full" />
                <span className="text-[0.78rem] font-[660]">카카오톡</span>
              </button>

              {top && showSub && canRead(top) && (
                <div
                  className="flex gap-2 absolute w-max"
                  style={{ top: "40px", left: `${dropdownLeft}px` }}
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
            </div>
          </nav>
        </div>
      </header>

      <main className="px-6 py-4 w-full flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : noAccessMenu ? (
          <NoAccess menuLabel={noAccessMenu} />
        ) : (
          <div
            className="relative w-full h-full"
            onClickCapture={(e) => {
              // 읽기 전용일 때(읽기 O, 쓰기 X, 관리자 아님) 수정 시도 막기
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