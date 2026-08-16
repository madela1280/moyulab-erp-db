// app/api/kakao/clova-test/route.ts
//
// CLOVA 연동 확인용 임시 엔드포인트
// 브라우저에서 바로 호출해 동작·속도·정확도를 볼 수 있다.
//
//   https://moulab.kr/api/kakao/clova-test?q=유축기 사용이 불편해요
//
// ⚠️ 확인이 끝나면 이 파일은 삭제할 것. 외부에 열려 있는 테스트용이다.

import { NextRequest } from "next/server";
import { classifyIntent } from "@/api/kakao/_lib/clova";

export const dynamic = "force-dynamic";

/** 한 번에 돌려볼 기본 문장들 */
const SAMPLES = [
  "안녕하세요",
  "유축기 사용이 불편해요",
  "이제 그만 쓸래요",
  "좀 더 쓰고 싶은데요",
  "택배 언제 와요",
  "깔때기 하나 더 사고 싶어요",
  "다른 기기로 바꿀 수 있나요",
  "설명서 좀 보내주세요",
  "젖몸살이 왔어요",
  "언제까지 쓰는 건가요",
];

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");

  // 키가 등록됐는지만 확인 (값은 노출하지 않음)
  const hasKey = Boolean(process.env.CLOVA_API_KEY);

  if (q) {
    const r = await classifyIntent(q);
    return Response.json({ hasKey, utterance: q, ...r });
  }

  // q 없이 호출하면 샘플 전체를 순서대로 돌린다
  const results = [];
  for (const s of SAMPLES) {
    const r = await classifyIntent(s);
    results.push({ utterance: s, intent: r.intent, confidence: r.confidence, ok: r.ok, latencyMs: r.latencyMs, error: r.error });
  }

  const okCount = results.filter((r) => r.ok).length;
  const avgMs = Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / results.length);

  return Response.json({ hasKey, okCount, total: results.length, avgMs, results });
}
