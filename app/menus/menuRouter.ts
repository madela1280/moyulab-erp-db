// app/menus/menuRouter.ts

import { SUB_MENUS } from "./subMenus";
import { TopMenu } from "./topMenus";

export function makeRouteKey(top: TopMenu, sub: string) {
  return `${top}>${sub}`;
}

export function getAllRouteKeys() {
  const result: string[] = [];
  for (const top of Object.keys(SUB_MENUS) as TopMenu[]) {
    for (const sub of SUB_MENUS[top]) {
      result.push(makeRouteKey(top, sub));
    }
  }
  return result;
}


