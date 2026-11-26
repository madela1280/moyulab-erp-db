// app/api/manuals/image/[filename]/route.ts
//
// 메뉴얼 업로드 이미지 서빙 전용 API.
// public/manual-images 정적 서빙은 Next.js가 서버 시작 이후 새로 추가된 파일을
// 재시작 전까지 못 읽는 문제가 있어서(실서버에서 확인됨), 매 요청마다 디스크에서
// 직접 읽어 응답하는 이 라우트로 대신한다. 업로드 직후에도 재시작 없이 바로 보인다.

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(_req: NextRequest, context: { params: Promise<{ filename: string }> }) {
  try {
    const { filename: rawFilename } = await context.params;
    const filename = path.basename(rawFilename);
    const ext = path.extname(filename).toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext];

    if (!contentType) {
      return NextResponse.json({ ok: false, error: "invalid_ext" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "public", "manual-images", filename);
    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    console.error("GET /api/manuals/image/[filename] error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
