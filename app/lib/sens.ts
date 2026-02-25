// app/lib/sens.ts
//
// 네이버클라우드 SENS(Biz Message - 알림톡) 호출 유틸
// - sendAlimTalk: 알림톡 발송
// - getAlimTalkStatus / getSmsStatus: (현재 프로젝트에서는 스펙 확정 전) "골격"만 제공
//
// ⚠️ 결과조회 API 경로/응답코드는 SENS 문서에서 최종 확정 후 이 파일만 채우면 됨.

import crypto from "crypto";

const SENS_BASE = "https://sens.apigw.ntruss.com";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function makeSignatureV2(args: {
  method: string;
  urlPathWithQuery: string; // "/alimtalk/v2/services/..../messages"
  timestamp: string; // ms string
  accessKey: string;
  secretKey: string;
}) {
  const { method, urlPathWithQuery, timestamp, accessKey, secretKey } = args;

  // Ncloud Signature v2:
  // {method} {space} {url}\n{timestamp}\n{accessKey}
  const message = `${method} ${urlPathWithQuery}\n${timestamp}\n${accessKey}`;

  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(message);
  return hmac.digest("base64");
}

async function sensFetch<T>(args: {
  method: "GET" | "POST";
  path: string; // "/alimtalk/v2/services/..../messages"
  body?: any;
}) {
  const accessKey = mustEnv("NCLOUD_ACCESS_KEY");
  const secretKey = mustEnv("NCLOUD_SECRET_KEY");

  const timestamp = String(Date.now());
  const signature = makeSignatureV2({
    method: args.method,
    urlPathWithQuery: args.path,
    timestamp,
    accessKey,
    secretKey,
  });

  const url = `${SENS_BASE}${args.path}`;

  const res = await fetch(url, {
    method: args.method,
    headers: {
      "Content-Type": "application/json",
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": accessKey,
      "x-ncp-apigw-signature-v2": signature,
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      (json && (json.error?.message || json.message || json.error)) ||
      text ||
      `SENS_FAILED(${res.status})`;
    const err = new Error(msg);
    (err as any).status = res.status;
    (err as any).body = json ?? text;
    throw err;
  }

  return json as T;
}

/* -------------------- 알림톡 발송 -------------------- */

export type AlimTalkButton =
  | {
      type: "WL";
      name: string;
      linkMobile: string;
      linkPc?: string;
    }
  | {
      type: "AL";
      name: string;
      schemeIos: string;
      schemeAndroid: string;
    }
  | {
      type: "DS" | "BK" | "MD" | "AC";
      name: string;
    };

export type AlimTalkMessage = {
  to: string;
  content: string;
  countryCode?: string;

  title?: string;
  buttons?: AlimTalkButton[];

  useSmsFailover?: boolean;
  failoverConfig?: {
    type?: "SMS" | "LMS";
    from: string;
    subject?: string;
    content?: string;
  };
};

export type SendAlimTalkArgs = {
  serviceId: string;
  plusFriendId: string; // 채널 아이디
  templateCode: string;
  messages: AlimTalkMessage[];
  reserveTime?: string; // "YYYY-MM-DD HH:mm"
  reserveTimeZone?: string; // default Asia/Seoul
};

export type SendAlimTalkResponse = {
  requestId: string;
  requestTime: string;
  statusCode: string; // HTTP code (202 etc)
  statusName: "success" | "processing" | "reserved" | "fail";
  messages?: Array<{
    messageId: string;
    countryCode?: string;
    to: string;
    content: string;
    requestStatusCode: string; // A000 etc
    requestStatusName: "success" | "fail";
    requestStatusDesc: string;
    useSmsFailover: boolean;
  }>;
};

export async function sendAlimTalk(args: SendAlimTalkArgs) {
  const path = `/alimtalk/v2/services/${args.serviceId}/messages`;

  const payload: any = {
    plusFriendId: args.plusFriendId,
    templateCode: args.templateCode,
    messages: args.messages,
  };

  if (args.reserveTime) payload.reserveTime = args.reserveTime;
  if (args.reserveTimeZone) payload.reserveTimeZone = args.reserveTimeZone;

  return sensFetch<SendAlimTalkResponse>({
    method: "POST",
    path,
    body: payload,
  });
}

/* -------------------- 결과 조회(골격) -------------------- */

export type NormalizedSensStatus =
  | { status: "processing"; code?: string; desc?: string; failoverMessageId?: string | null }
  | { status: "success"; code?: string; desc?: string; failoverMessageId?: string | null }
  | { status: "fail"; code?: string; desc?: string; failoverMessageId?: string | null };

/**
 * ⚠️ TODO:
 * SENS 문서에서 "알림톡 발송 결과 조회" API 경로/응답을 확정한 뒤 이 함수 구현.
 * 현재는 빌드/흐름 연결을 위한 placeholder로만 동작하며 항상 processing을 반환한다.
 */
export async function getAlimTalkStatus(args: {
  serviceId: string;
  messageId: string;
}): Promise<NormalizedSensStatus> {
  const path = `/alimtalk/v2/services/${args.serviceId}/messages/${args.messageId}`;

  const detail = await sensFetch<any>({
    method: "GET",
    path,
  });

  const code = String(detail?.messageStatusCode ?? "");
  const desc = String(detail?.messageStatusDesc ?? detail?.messageStatusName ?? "");
  const name = String(detail?.messageStatusName ?? "").toUpperCase();

  // 콘솔에서 확인된 케이스:
  // - messageStatusCode: "0000", messageStatusName: "SUCCESS"
  // - messageStatusCode: "3016", messageStatusName: "FAIL"
  if (code === "0000" || name === "SUCCESS") {
    return { status: "success", code, desc, failoverMessageId: null };
  }
  if (name === "FAIL" || (code && code !== "0000")) {
    return { status: "fail", code, desc, failoverMessageId: null };
  }

  return { status: "processing", code, desc, failoverMessageId: null };
}

/**
 * ⚠️ TODO:
 * SENS 문서에서 "SMS 발송 결과 조회" API 경로/응답을 확정한 뒤 이 함수 구현.
 * 현재는 빌드/흐름 연결을 위한 placeholder로만 동작하며 항상 processing을 반환한다.
 */
export async function getSmsStatus(_args: {
  serviceId: string;
  messageId: string;
}): Promise<NormalizedSensStatus> {
  return {
    status: "processing",
    code: "not_implemented",
    desc: "SMS 결과조회 API 스펙 확정 후 구현 필요",
    failoverMessageId: null,
  };
}