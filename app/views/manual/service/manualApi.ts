// app/views/manual/service/manualApi.ts

export type ManualTreeNode = {
  id: number;
  category: string;
  subcategory: string;
  detail: string;
  title: string;
  order_index: number;
};

export type ManualContentItem = {
  id: number;
  category: string;
  subcategory: string;
  detail: string;
  title: string;
  body: string;
  images: string[];
  keywords: string;
};

export type ManualSearchResult = {
  id: number;
  category: string;
  subcategory: string;
  detail: string;
  title: string;
  snippet: string;
};

export async function fetchManualTree(): Promise<ManualTreeNode[]> {
  const res = await fetch("/api/manuals?tree=1");
  const data = await res.json();
  return data.ok ? data.nodes : [];
}

export async function fetchManualContent(
  category: string,
  subcategory: string,
  detail: string
): Promise<ManualContentItem | null> {
  const params = new URLSearchParams({ category, subcategory, detail });
  const res = await fetch(`/api/manuals?${params.toString()}`);
  const data = await res.json();
  return data.ok ? data.item : null;
}

export async function searchManuals(keyword: string): Promise<ManualSearchResult[]> {
  const params = new URLSearchParams({ search: keyword });
  const res = await fetch(`/api/manuals?${params.toString()}`);
  const data = await res.json();
  return data.ok ? data.results : [];
}

export async function saveManualContent(payload: {
  category: string;
  subcategory: string;
  detail: string;
  title: string;
  body: string;
  images: string[];
  keywords: string;
  orderIndex?: number;
}): Promise<boolean> {
  const res = await fetch("/api/manuals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return !!data.ok;
}

export async function uploadManualImage(file: File): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/manuals/upload-image", { method: "POST", body: form });
  const data = await res.json();
  return data.ok ? data.url : null;
}
