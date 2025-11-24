// app/views/unified/UnifiedMainView.tsx
"use client";

import GridHeader from "@/app/unified/components/GridHeader";
import GridTable from "@/app/unified/components/GridTable";

export default function UnifiedMainView() {
  return (
    <div className="w-full h-full px-2">
      <GridHeader />
      <GridTable />
    </div>
  );
}







