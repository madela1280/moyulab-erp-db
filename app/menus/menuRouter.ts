// app/menus/menuRouter.ts

import { SUB_MENUS } from './subMenus';
import { TopMenu } from './topMenus';

export function makeRouteKey(top: TopMenu, sub: string) {
  return `${top}>${sub}`;
}

export function getDefaultSub(top: TopMenu): string {
  const list = SUB_MENUS[top];
  return list.length ? list[0] : '';
}
// app/menus/menuRouter.ts

import { SUB_MENUS } from './subMenus';
import { TopMenu } from './topMenus';

export function makeRouteKey(top: TopMenu, sub: string) {
  return `${top}>${sub}`;
}

export function getDefaultSub(top: TopMenu): string {
  const list = SUB_MENUS[top];
  return list.length ? list[0] : '';
}
