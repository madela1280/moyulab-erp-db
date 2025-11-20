import dynamic from "next/dynamic";

export const VIEW_MAP: Record<string, any> = {
  // 사용자관리
  "사용자관리>사용자추가": dynamic(() => import("@/views/사용자관리/사용자추가View")),
  "사용자관리>권한설정": dynamic(() => import("@/views/사용자관리/권한설정View")),
  "사용자관리>관리자설정": dynamic(() => import("@/views/사용자관리/관리자설정View")),

  // 통합관리
  "통합관리>통합관리": dynamic(() => import("@/views/통합관리/통합관리View")),
  "통합관리>온라인": dynamic(() => import("@/views/통합관리/온라인View")),
  "통합관리>보건소": dynamic(() => import("@/views/통합관리/보건소View")),
  "통합관리>조리원": dynamic(() => import("@/views/통합관리/조리원View")),

  // 기기관리
  "기기관리>심포니": dynamic(() => import("@/views/기기관리/심포니View")),
  "기기관리>락티나": dynamic(() => import("@/views/기기관리/락티나View")),
  "기기관리>스윙": dynamic(() => import("@/views/기기관리/스윙View")),
  "기기관리>스윙맥시": dynamic(() => import("@/views/기기관리/스윙맥시View")),
  "기기관리>프리스타일": dynamic(() => import("@/views/기기관리/프리스타일View")),
  "기기관리>시밀래": dynamic(() => import("@/views/기기관리/시밀래View")),
  "기기관리>각시밀": dynamic(() => import("@/views/기기관리/각시밀View")),

  // 데이터업로드
  "데이터업로드>신규가입": dynamic(() => import("@/views/데이터업로드/신규가입View")),

  // 대여관리
  "대여관리>대여관리": dynamic(() => import("@/views/대여관리/대여관리View")),

  // 유축기현황
  "유축기현황>유축기현황": dynamic(() => import("@/views/유축기현황/유축기현황View")),

  // 문자
  "문자>문자": dynamic(() => import("@/views/문자/문자View")),

  // 합포장
  "합포장>합포장": dynamic(() => import("@/views/합포장/합포장View")),

  // 집계
  "집계>집계": dynamic(() => import("@/views/집계/집계View")),
};



