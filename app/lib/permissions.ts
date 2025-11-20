export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('erp_user_data');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAdmin(user: any) {
  if (!user) return false;
  return user.role === 'admin' || user.username === 'medela1280';
}


