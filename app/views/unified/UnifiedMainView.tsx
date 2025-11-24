import GridHeader from "@/unified/components/GridHeader";
import GridTable from "@/unified/components/GridTable";

export default function UnifiedMainView() {
  return (
    <div className="w-full h-full">
      <div style={{ height: "0.5cm" }} />

      <GridHeader />
      <div style={{ height: "0.5cm" }} />

      <GridTable />
    </div>
  );
}






