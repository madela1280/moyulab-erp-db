// app/menus/subMenus.ts

import { TopMenu } from "./topMenus";

export const SUB_MENUS: Record<TopMenu, string[]> = {
  user: ["UserAdd", "PermissionSetting", "AdminSetting"],

  unified: ["UnifiedMain", "Online", "HealthCenter", "PostpartumCare"],

  devices: [
    "Symphony",
    "Lactina",
    "Swing",
    "SwingMaxi",
    "Freestyle",
    "Similae",
    "Gaksamil",
  ],

  dataUpload: ["Signup"],

  rentals: ["RentalManagement"],

  pumpStatus: ["PumpStatus"],

  sms: ["Sms"],

  packaging: ["Packaging"],

  statistics: ["Statistics"],
};


