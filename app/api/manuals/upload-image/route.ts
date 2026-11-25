// app/api/manuals/upload-image/route.ts
//
// 메뉴얼 콘텐츠용 캡쳐 이미지 업로드. public/manual-images/ 에 저장하고 URL을 반환한다.

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase() || ".png";
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ ok: false, error: "invalid_ext" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "public", "manual-images");
    await mkdir(dir, { recursive: true });

    const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);

    return NextResponse.json({ ok: true, url: `/manual-images/${filename}` });
  } catch (e) {
    console.error("POST /api/manuals/upload-image error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
