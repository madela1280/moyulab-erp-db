// app/menus/viewMap.ts

export const VIEW_MAP: Record<string, any> = {
  // 사용자관리
  "사용자관리>사용자추가": () =>
    import("@/views/사용자관리/사용자추가View"),
  "사용자관리>권한설정": () =>
    import("@/views/사용자관리/권한설정View"),
  "사용자관리>관리자설정": () =>
    import("@/views/사용자관리/관리자설정View"),

  // 통합관리
  "통합관리>통합관리": () =>
    import("@/views/통합관리/통합관리View"),
  "통합관리>온라인": () =>
    import("@/views/통합관리/온라인View"),
  "통합관리>보건소": () =>
    import("@/views/통합관리/보건소View"),
  "통합관리>조리원": () =>
    import("@/views/통합관리/조리원View"),

  // 기기관리
  "기기관리>심포니": () =>
    import("@/views/기기관리/심포니View"),
  "기기관리>락티나": () =>
    import("@/views/기기관리/락티나View"),
  "기기관리>스윙": () =>
    import("@/views/기기관리/스윙View"),
  "기기관리>스윙맥시": () =>
    import("@/views/기기관리/스윙맥시View"),
  "기기관리>프리스타일": () =>
    import("@/views/기기관리/프리스타일View"),
  "기기관리>시밀래": () =>
    import("@/views/기기관리/시밀래View"),
  "기기관리>각시밀": () =>
    import("@/views/기기관리/각시밀View"),

  // 데이터업로드
  "데이터업로드>신규가입": () =>
    import("@/views/데이터업로드/신규가입View"),

  // 대여관리 (빈 페이지)
  "대여관리>대여관리": () =>
    import("@/views/대여관리/대여관리View"),

  // 유축기현황 (빈 페이지)
  "유축기현황>유축기현황": () =>
    import("@/views/유축기현황/유축기현황View"),

  // 문자 (빈 페이지)
  "문자>문자": () =>
    import("@/views/문자/문자View"),

  // 합포장 (빈 페이지)
  "합포장>합포장": () =>
    import("@/views/합포장/합포장View"),

  // 집계 (빈 페이지)
  "집계>집계": () =>
    import("@/views/집계/집계View"),
};



