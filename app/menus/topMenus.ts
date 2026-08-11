export const TOP_MENUS = [
  "사용자관리",
  "통합관리",
  "기기관리",
  "데이터업로드",
  "회수완료",
  "오류검사",
  "문자",
  "백업복원",
  "집계",
  "고객접수",
] as const;

export type TopMenu = (typeof TOP_MENUS)[number];
