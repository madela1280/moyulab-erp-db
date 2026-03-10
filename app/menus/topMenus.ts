// app/menus/topMenus.ts

export const TOP_MENUS = [
  "사용자관리",
  "통합관리",
  "기기관리",
  "데이터업로드",
  "회수완료",
  "AAA",
  "문자",
  "BBB",
  "집계",
] as const;

export type TopMenu = (typeof TOP_MENUS)[number];


