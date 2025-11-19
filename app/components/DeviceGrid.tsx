'use client';

import React from 'react';

export default function DeviceGrid({ viewId }: { viewId: string }) {
  return (
    <div className="p-4 text-center text-gray-600">
      <div className="text-lg font-semibold mb-2">{viewId}</div>
      <div>DeviceGrid 작업 예정</div>
    </div>
  );
}
