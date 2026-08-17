// app/api/kakao/_lib/clova.ts
//
// CLOVA Studio (HCX-005) 연동
// - 키워드로 못 잡은 발화만 여기로 넘어온다 (하이브리드)
// - 실측 평균 응답 약 0.6초. 카카오 5초 제한에 여유가 있어 동기 호출로 처리한다.
// - 실패하거나 느리면 ok:false 로 돌려주고, 호출한 쪽에서 키워드 결과를 쓴다.
//
// 환경변수: CLOVA_API_KEY  (ecosystem.config.cjs 의 env 에 등록)

const CLOVA_URL = "https://clovastudio.stream.ntruss.com/v3/chat-completions/HCX-005";

const TIMEOUT_MS = 3500;

export type ClovaIntent =
  | "RETURN" | "EXTEND" | "OVERDUE" | "TROUBLE" | "DELIVERY"
  | "PARTS" | "CHANGE" | "MANUAL" | "AGENT" | "LOOKUP"
  | "GREET" | "OPEN" | "WRONG_INFO" | "UNRESOLVED" | "UNKNOWN";

export type ClassifyResult = {
  intent: ClovaIntent;
  confidence: number;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

const SYSTEM_PROMPT = `당신은 유축기 대여 업체의 고객 문의 분류기입니다.
고객 발화를 아래 의도 중 정확히 하나로 분류합니다.

의도 목록:
- RETURN: 반납, 회수, 수거, 그만 쓰겠다
- EXTEND: 연장, 더 쓰고 싶다, 기간 늘리기
- OVERDUE: 연체, 기간이 지났다
- TROUBLE: 기기 사용법, 세척, 소독, 부품 결합, 작동 문제, 압력, 소음, 역류, 사용이 불편함
- UNRESOLVED: 안내받은 방법을 해봤는데도 해결되지 않았다는 표현
- DELIVERY: 배송, 택배 언제 오는지, 송장
- PARTS: 부품을 추가로 사고 싶다, 깔때기 구매, 포장재 구매
- CHANGE: 지금 기기를 다른 기종으로 바꾸고 싶다
- WRONG_INFO: 조회된 내 정보가 틀렸다, 내가 빌린 건 이게 아니다
- MANUAL: 제품 설명서, 사용 안내서
- AGENT: 상담원 연결 요청
- LOOKUP: 만기일, 남은 기간, 내 대여 정보 확인
- GREET: 인사말
- OPEN: 다른 것을 물어보고 싶다는 표현
- UNKNOWN: 위 어디에도 해당하지 않음. 의료나 건강 관련도 UNKNOWN.

주의:
- CHANGE 와 WRONG_INFO 를 구분하세요.
  "다른 기기로 바꾸고 싶어요" = CHANGE (변경 의사)
  "제가 빌린 건 시밀레인데요" = WRONG_INFO (정보 정정)
- PARTS 는 구매 의사가 있을 때만입니다.
  "퍼스널핏 쓰고 있어요" 는 사실 진술이므로 PARTS 가 아닙니다.

출력 규칙 (반드시 지킬 것):
- 아래 형식의 JSON 한 개만 출력합니다.
- 여러 의도의 확률을 나열하지 마세요. 가장 가능성 높은 하나만 고릅니다.
- 설명, 마크다운, 코드블록을 붙이지 마세요.

형식:
{"intent":"의도이름","confidence":0.0~1.0}

예시:
입력: 이제 그만 쓸래요
출력: {"intent":"RETURN","confidence":0.9}

입력: 유축기 사용이 불편해요
출력: {"intent":"TROUBLE","confidence":0.8}

입력: 알려주신 대로 했는데 그래도 안 되네요
출력: {"intent":"UNRESOLVED","confidence":0.9}

입력: 나는 시밀레 빌렸는데요
출력: {"intent":"WRONG_INFO","confidence":0.85}

입력: 아기가 백일이에요
출력: {"intent":"UNKNOWN","confidence":0.2}`;

export async function classifyIntent(utterance: string): Promise<ClassifyResult> {
  const started = Date.now();
  const apiKey = process.env.CLOVA_API_KEY;

  if (!apiKey) {
    return { intent: "UNKNOWN", confidence: 0, ok: false, latencyMs: 0, error: "no api key" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(CLOVA_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-NCP-CLOVASTUDIO-REQUEST-ID": crypto.randomUUID().replace(/-/g, ""),
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: [{ type: "text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "text", text: utterance.slice(0, 500) }] },
        ],
        topP: 0.8,
        topK: 0,
        maxTokens: 100,
        temperature: 0.1,
        repetitionPenalty: 1.1,
        includeAiFilters: true,
      }),
    });

    const latencyMs = Date.now() - started;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        intent: "UNKNOWN", confidence: 0, ok: false, latencyMs,
        error: `HTTP ${res.status} ${body.slice(0, 200)}`,
      };
    }

    const json: any = await res.json();
    const raw = extractText(json);
    const parsed = parseAnswer(raw);

    if (!parsed) {
      return {
        intent: "UNKNOWN", confidence: 0, ok: false, latencyMs,
        error: `parse fail: ${raw.slice(0, 200)}`,
      };
    }

    return { intent: parsed.intent, confidence: parsed.confidence, ok: true, latencyMs };
  } catch (e: any) {
    const latencyMs = Date.now() - started;
    const error = e?.name === "AbortError" ? `timeout ${TIMEOUT_MS}ms` : String(e?.message ?? e);
    return { intent: "UNKNOWN", confidence: 0, ok: false, latencyMs, error };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* 응답 파싱                                                            */
/* ------------------------------------------------------------------ */

function extractText(json: any): string {
  const content = json?.result?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("").trim();
  }
  return "";
}

const VALID: ClovaIntent[] = [
  "RETURN", "EXTEND", "OVERDUE", "TROUBLE", "DELIVERY",
  "PARTS", "CHANGE", "MANUAL", "AGENT", "LOOKUP",
  "GREET", "OPEN", "WRONG_INFO", "UNRESOLVED", "UNKNOWN",
];
const VALID_SET = new Set<string>(VALID);

/**
 * 모델이 형식을 안 지켜도 최대한 건져낸다. 실제로 관찰된 형태들:
 *   {"intent":"RETURN","confidence":0.9}     정상
 *   {TROUBLE: 0.8, UNKNOWN: 0.2}             확률 분포로 답한 경우
 *   ```json { ... } ```                       코드블록으로 감싼 경우
 *   RETURN                                    의도 이름만 답한 경우
 */
function parseAnswer(raw: string): { intent: ClovaIntent; confidence: number } | null {
  if (!raw) return null;

  const cleaned = raw.replace(/```json|```/g, "").trim();

  // ① 정상 형식
  const block = cleaned.match(/\{[\s\S]*?\}/);
  if (block) {
    try {
      const obj = JSON.parse(block[0]);
      const intent = String(obj?.intent ?? "").toUpperCase();
      if (VALID_SET.has(intent)) {
        const conf = Number(obj?.confidence);
        return { intent: intent as ClovaIntent, confidence: Number.isFinite(conf) ? conf : 0.5 };
      }
    } catch {
      /* ② 로 넘어감 */
    }
  }

  // ② 확률 분포 형태 — 가장 높은 값을 고른다
  const pairs = [...cleaned.matchAll(/([A-Z_]{3,12})\s*[":]+\s*([0-9]*\.?[0-9]+)/g)];
  const scored = pairs
    .map((m) => ({ intent: m[1].toUpperCase(), score: Number(m[2]) }))
    .filter((p) => VALID_SET.has(p.intent) && Number.isFinite(p.score));

  if (scored.length > 0) {
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    return { intent: top.intent as ClovaIntent, confidence: top.score };
  }

  // ③ 의도 이름만 답한 경우
  const upper = cleaned.toUpperCase();
  for (const intent of VALID) {
    if (new RegExp(`\\b${intent}\\b`).test(upper)) {
      return { intent, confidence: 0.5 };
    }
  }

  return null;
}
