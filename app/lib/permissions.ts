// 정책: 클라우드 ERP에서 브라우저 로컬 저장소(localStorage 등)에
// 사용자/권한 정보를 저장하거나 그 값을 신뢰해서는 안 됨.
// 권한은 서버(/api/permissions 등)에서 로드된 데이터로만 판단한다.

export function getCurrentUser() {
  // 기존 코드 호환을 위해 함수는 유지하되, 로컬 저장소 접근은 완전 제거.
  return null;
}

export function isAdmin(user: any) {
  if (!user) return false;
  return user.role === 'admin' || user.username === 'medela1280';
}


