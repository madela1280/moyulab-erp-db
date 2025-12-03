'use client';

type NoAccessProps = {
  menuLabel: string; // 예: "사용자추가", "권한설정", "관리자설정"
};

export default function NoAccess({ menuLabel }: NoAccessProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-700 text-sm">
      <div className="mb-6">
        {/* 간단한 자물쇠 아이콘 (원하면 이미지로 교체 가능) */}
        <div className="w-16 h-16 flex items-center justify-center rounded-full bg-gray-200 text-3xl">
          🔒
        </div>
      </div>
      <div className="mb-2">
        <span className="font-semibold text-blue-600">({menuLabel})</span>{' '}
        메뉴 접근 권한이 없습니다.
      </div>
      <div className="mb-2">
        서비스를 이용하려면 회사 마스터에게 문의 바랍니다.
      </div>
      <div className="mt-4 font-bold text-lg">
        우리회사 마스터 : <span className="text-blue-600">장대윤</span>
      </div>
    </div>
  );
}