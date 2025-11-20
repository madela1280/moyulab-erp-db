// app/menus/menuRouter.ts

import { SUB_MENUS } from './subMenus';
import { TopMenu } from './topMenus';

// 라우팅 키 생성 함수
export function makeRouteKey(top: TopMenu, sub: string) {
  return `${top}>${sub}`;
}

// 유효한 라우트인지 확인
export function isValidRoute(top: TopMenu, sub: string) {
  return SUB_MENUS[top]?.includes(sub);
}

