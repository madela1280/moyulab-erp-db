// app/menus/topMenus.ts

export const TOP_MENUS = [
  "사용자관리",
  "통합관리",
  "기기관리",
  "데이터업로드",
  "대여관리",
  "유축기현황",
  "문자",
  "합포장",
  "집계",
] as const;

export type TopMenu = (typeof TOP_MENUS)[number];


