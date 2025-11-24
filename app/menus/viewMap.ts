import dynamic from "next/dynamic";

export const VIEW_MAP: Record<string, any> = {
  // 사용자관리
  "사용자관리>사용자추가": dynamic(() => import("@/views/users/UserAddView")),
  "사용자관리>권한설정": dynamic(() => import("@/views/users/PermissionSettingView")),
  "사용자관리>관리자설정": dynamic(() => import("@/views/users/AdminSettingView")),

  // 통합관리
  "통합관리>통합관리": dynamic(() => import("@/views/unified/UnifiedMainView")),
  "통합관리>온라인": dynamic(() => import("@/views/unified/OnlineView")),
  "통합관리>보건소": dynamic(() => import("@/views/unified/HealthCenterView")),
  "통합관리>조리원": dynamic(() => import("@/views/unified/PostpartumCareView")),

  // 기기관리
  "기기관리>심포니": dynamic(() => import("@/views/devices/SymphonyView")),
  "기기관리>락티나": dynamic(() => import("@/views/devices/LactinaView")),
  "기기관리>스윙": dynamic(() => import("@/views/devices/SwingView")),
  "기기관리>스윙맥시": dynamic(() => import("@/views/devices/SwingMaxiView")),
  "기기관리>프리스타일": dynamic(() => import("@/views/devices/FreestyleView")),
  "기기관리>시밀래": dynamic(() => import("@/views/devices/SimileView")),
  "기기관리>각시밀": dynamic(() => import("@/views/devices/GaksiMilView")),

  // 데이터업로드
  "데이터업로드>신규가입": dynamic(() => import("@/views/dataUpload/SignupView")),

  // 대여관리 (수정됨)
  "대여관리>대여관리": dynamic(() => import("@/views/rentals/RentalsView")),

  // 유축기현황
  "유축기현황>유축기현황": dynamic(() => import("@/views/pumpStatus/PumpStatusView")),

  // 문자 (수정됨)
  "문자>문자": dynamic(() => import("@/views/sms/SmsView")),

  // 합포장
  "합포장>합포장": dynamic(() => import("@/views/packaging/PackagingView")),

  // 집계
  "집계>집계": dynamic(() => import("@/views/statistics/StatisticsView")),
};







