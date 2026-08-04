// app/menus/viewMap.ts

import dynamic from "next/dynamic";
import { createElement } from "react";
import type { SmsSubCategory } from "@/sms/types/sms.types";

// ✅ 문자 View는 1개(SmsView)만 두고, 소카테고리별로 props만 다르게 주는 wrapper로 분기
const SmsViewDynamic = dynamic(() => import("@/views/sms/SmsView"));

function makeSmsWrapper(initialSubCategory: SmsSubCategory) {
  const Wrapped = function SmsWrappedView() {
    return createElement(SmsViewDynamic as any, { initialSubCategory });
  };
  return Wrapped;
}

export const VIEW_MAP: Record<string, any> = {
  // 사용자관리
  "사용자관리>사용자추가": dynamic(() => import("@/views/users/UserAddView")),
  "사용자관리>권한설정": dynamic(() => import("@/views/users/PermissionSettingView")),
  "사용자관리>관리자설정": dynamic(() => import("@/views/users/AdminSettingView")),

  // 통합관리
  "통합관리>통합관리": dynamic(() => import("@/views/unified/UnifiedMainView")),

  // 기기관리
  "기기관리>심포니": dynamic(() => import("@/views/devices/SymphonyView")),
  "기기관리>락티나": dynamic(() => import("@/views/devices/LactinaView")),
  "기기관리>스윙": dynamic(() => import("@/views/devices/SwingView")),
  "기기관리>스윙맥시/프리스타일": dynamic(() => import("@/views/devices/SwingMaxiView")),
  "기기관리>시밀래": dynamic(() => import("@/views/devices/SimileView")),
  "기기관리>각시밀": dynamic(() => import("@/views/devices/GaksiMilView")),

  // 데이터업로드
  "데이터업로드>신규가입": dynamic(() => import("@/views/dataUpload/SignupView")),
  "데이터업로드>반납회수": dynamic(() => import("@/views/dataUpload/ReturnRecoveryView")),

  // ✅ 회수완료
  "회수완료>회수1": dynamic(() => import("@/views/recoveryComplete/Recovery1View")),
  "회수완료>회수2": dynamic(() => import("@/views/recoveryComplete/Recovery2View")),

  // 오류검사
  "오류검사>미회수": dynamic(() => import("@/views/errorCheck/UnreturnedView")),
  "오류검사>중복출고": dynamic(() => import("@/views/errorCheck/DuplicateShipmentView")),

  // 문자
  "문자>대여첫안내": makeSmsWrapper("대여첫안내"),
  "문자>만기3일전": makeSmsWrapper("만기3일전"),
  "문자>만기지남": makeSmsWrapper("만기지남"),

  // 백업복원
  "백업복원>정기백업": dynamic(() => import("@/views/backupRestore/RegularBackupView")),
  "백업복원>변경이력복원": dynamic(() => import("@/views/backupRestore/HistoryRestoreView")),
  "백업복원>엑셀백업": dynamic(() => import("@/views/backupRestore/ExcelBackupView")),

  // 집계
  "집계>설정": dynamic(() => import("@/views/aggregate/AggregateSettingView")),
  "집계>집계": dynamic(() => import("@/views/aggregate/AggregateView")),
};