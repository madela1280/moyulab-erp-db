// app/lib/viewMap.ts
import UnifiedManagement from '@/components/UnifiedManagement';
import OnlineManagement from '@/components/OnlineManagement';
import HealthCenterManagement from '@/components/HealthCenterManagement';
import PostpartumManagement from '@/components/PostpartumManagement';

import DeviceSymphony from '@/components/DeviceSymphony';
import DeviceLactina from '@/components/DeviceLactina';
import DeviceSwing from '@/components/DeviceSwing';
import DeviceSwingMaxi from '@/components/DeviceSwingMaxi';
import DeviceFreestyle from '@/components/DeviceFreestyle';
import DeviceSirilac from '@/components/DeviceSirilac';
import DeviceGaksimil from '@/components/DeviceGaksimil';

import NewSignup from '@/components/NewSignup';

export const viewMap: Record<string, React.FC> = {
  '통합관리>통합관리': UnifiedManagement,
  '통합관리>온라인': OnlineManagement,
  '통합관리>보건소': HealthCenterManagement,
  '통합관리>조리원': PostpartumManagement,

  '기기관리>심포니': DeviceSymphony,
  '기기관리>락티나': DeviceLactina,
  '기기관리>스윙': DeviceSwing,
  '기기관리>스윙맥시': DeviceSwingMaxi,
  '기기관리>프리스타일': DeviceFreestyle,
  '기기관리>시밀래': DeviceSirilac,
  '기기관리>각시밀': DeviceGaksimil,

  '데이터업로드>신규가입': NewSignup,
};


