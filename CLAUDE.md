# CLAUDE.md

이 문서는 Moyulab ERP 프로젝트에서 Claude Code가 반드시 지켜야 하는 작업 규칙이다.

## 0. Claude Code 역할

Claude Code는 코드 검토, 수정 보조, 신규 파일 생성, 빌드 확인을 돕는 도구다.

최종 승인자는 사용자다.

Claude Code는 다음을 직접 하지 않는다.

git commit
git push
서버 배포
서버 코드 직접 수정
위험한 서버 설정 변경
DB 핵심 스키마 변경

배포가 필요하면 직접 배포하지 말고 사용자에게 "배포가 필요합니다"라고 알려준다.

사용자가 "커밋/푸시/배포 명령어 줘"라고 요청하면 명령어만 제공한다.
실제 실행은 사용자가 직접 한다.

## 1. 대화/작업 응답 규칙

사용자가 "대답해줘"라고 하면 한 줄로만 답한다.

사용자가 "설명해줘"라고 하면 5줄 내외로 간략하게 설명한다.

사용자가 "코드줘"라고 말하지 않으면 코드를 먼저 제공하지 않는다.

사용자가 아무 요청 없이 코드, 자료, 캡처, 로그를 올리면 "받았음"이라고만 답한다.

사용자가 별도로 요청한 형식이 있으면 그 형식을 우선한다.

## 2. 작업 승인 규칙

작업 전에는 항상 계획을 먼저 제시한다.

사용자가 승인하기 전에는 파일을 수정하지 않는다.

기본 계획 형식은 다음과 같다.

1. 현재 이해한 목표
2. 수정 대상 파일
3. 수정 방식
4. 영향 범위
5. 승인 요청

사용자가 "좋아 수정해", "진행해", "수정해"처럼 명확히 승인한 뒤에만 파일을 수정한다.

단, 사용자가 특정 파일 수정 요청 자체를 명확히 승인한 경우에는 해당 파일만 수정할 수 있다.

## 3. 데이터/API 절대 규칙

업무 데이터의 진짜 저장소는 항상 PostgreSQL DB다.

브라우저 저장소는 진짜 데이터 소스로 사용하지 않는다.

금지 대상은 다음과 같다.

localStorage
sessionStorage
indexedDB
service worker cache
caches
기타 브라우저 영속 저장소

CRUD는 반드시 Next.js Route Handler /api/** 를 통해서만 수행한다.

DB 직접 접근은 원칙적으로 app/api/**/route.ts 내부에서만 허용한다.

서버 컴포넌트, View, 컴포넌트, 훅에서 DB를 직접 조작하지 않는다.

## 4. 핵심 DB 스키마 불변 규칙

아래 구조는 임의 변경 금지다.

unified 테이블:

unified(id, data JSONB)

클라이언트 기본 형태:

{ id, data }

data JSONB를 여러 컬럼으로 쪼개거나 구조를 바꾸지 않는다.

locks 테이블:

locks(
  resource_type,
  resource_id,
  locked_by_username,
  locked_by_name,
  locked_at,
  expires_at,
  PRIMARY KEY(resource_type, resource_id)
)

락 테이블 구조와 PK는 변경 금지다.

스키마 변경이 꼭 필요하면 먼저 사용자와 규칙 변경을 합의한 후 진행한다.

## 5. 브라우저 저장소 차단 규칙

브라우저 저장소 사용 금지는 빌드에서 강제된다.

아래 파일과 설정은 삭제/비활성화/우회 금지다.

scripts/forbid-browser-storage.mjs
package.json의 prebuild -> npm run check:browser-storage

app/** 안에서 금지 저장소가 발견되어 빌드가 실패하면 정상 동작이다.

대체 원칙은 다음과 같다.

진짜 데이터: PostgreSQL + /api
임시 UI 상태: React state 사용 가능
새로고침 후 유지가 필요한 값: DB + /api 사용

## 6. 동기화 Sync Core 규칙

수정 금지 코어 파일은 다음과 같다.

/home/ubuntu/socket/socket-server.cjs
app/global-socket/socket-client.js
app/global-sync/sync-engine.ts
app/global-sync/global.d.ts

위 파일은 원칙적으로 수정 금지다.

다른 파일에서 socket.io-client를 직접 import 금지.

다른 파일에서 window.__MOYULAB_SOCKET__ 직접 접근 금지.

동기화가 필요하면 반드시 sync-engine.ts가 제공하는 함수만 호출한다.

syncPatch(...)
syncListen(...)

통합관리 셀 저장은 반드시 syncPatch(id, key, value)를 사용한다.

/api/unified만 호출하고 소켓 emit을 빠뜨리는 패턴 금지.

새 도메인 실시간 이벤트가 필요하면 사용자와 먼저 합의한 뒤 sync core 내부에서만 정의한다.

unified:update는 신호이므로 누락 가능성을 고려한다.

API 성공(res.ok) 확인 전에는 로컬 반영/emit 금지.

실패 또는 예외 발생 시 reload()로 복구한다.

삭제/삽입 같은 구조 변경에만 짧은 딜레이 1회 재-emit을 허용한다.
무한 재시도는 금지한다.

## 7. 충돌방지 Lock Core 규칙

수정 금지 코어는 다음과 같다.

locks 테이블
app/api/locks/route.ts
app/global-lock/lock-engine.ts

다른 파일에서 /api/locks 직접 fetch 금지.

락이 필요하면 반드시 아래 함수만 사용한다.

acquireLock(...)
releaseLock(...)
getLockStatus(...)

락 단위는 행 단위다.

resource_type + resource_id 기준으로 처리한다.

통합관리 resource_type은 unified다.

다른 도메인은 devices, users, rentals 등 도메인명을 사용한다.

다른 사용자가 락을 가진 경우 입력을 막고 사용자에게 알려야 한다.

## 8. UnifiedGrid 특별 보호 규칙

파일:

app/unified/components/UnifiedGrid.tsx

이 파일은 단순 UI가 아니라 통합관리 핵심 코어 화면이다.

역할은 다음과 같다.

가상스크롤
셀 편집
선택
붙여넣기
행 락
sync/lock 호출
표 렌더링

주의 사항은 다음과 같다.

onBlur finally 영역은 함부로 수정하지 않는다.

같은 행에서 A셀 -> B셀 이동 시 락/저장 레이스가 생길 수 있다.

applyRemoteSyncOnce, scheduleIdleReload, refreshVisibleRowsFromServer는 세트로 고려한다.

refreshCountAndMaybeReload 수정 시 삽입/삭제 동기화와 점멸 문제가 생길 수 있다.

붙여넣기/대량작업에서 updates 생성은 setRows 콜백 밖에서 먼저 계산한다.

reload()는 최후 수단이다. 가능한 부분 반영을 우선한다.

input key 정책 변경은 focus/blur 저장 누락을 만들 수 있으므로 매우 조심한다.

UnifiedGrid 수정 후 최소 확인 항목은 다음과 같다.

A탭 입력 -> B탭 즉시 반영
같은 행 여러 셀 연속 입력 저장 누락 없음
Ctrl+V 붙여넣기 후 /api/unified/bulk-patch 발생
행 삭제 시 B탭 점멸/롤링 없음
행 삽입 시 B탭 반영

## 9. 기존 코드 수정 원칙

이미 잘 동작하는 흐름은 삭제하거나 임의 리팩터링하지 않는다.

보호 대상은 다음과 같다.

통합관리 CRUD
사용자관리 CRUD
sync/lock 흐름
AppShell 메뉴 흐름
레이아웃/스크롤 흐름

새 기능은 기존 코드를 바꾸는 것보다 다음 방식으로 추가한다.

새 상태 추가
새 함수 추가
새 컴포넌트 추가
새 훅 추가
새 서비스 추가
새 API route 추가

문제 해결을 이유로 기존 로직을 삭제하지 않는다.

## 10. 공용 레이아웃 수정 제한

아래 파일은 공용 레이아웃이므로 웬만하면 수정 금지다.

app/components/AppShell.tsx
app/layout.tsx
app/globals.css

화면 간격, 여백, 스크롤 문제는 각 View 파일 안에서 해결한다.

예:

UnifiedMainView
UserAddView
각 카테고리 View

공용 파일을 어쩔 수 없이 수정해야 하면 다음 순서를 지킨다.

1. 사용자에게 먼저 영향 범위를 설명한다.
2. 승인 후 최소 변경한다.
3. git diff로 확인한다.
4. 통합관리 + 사용자관리 화면을 모두 확인한다.

## 11. 파일 비대화 방지 / 기능 분리 규칙

단일 파일이 약 300라인 또는 12KB를 넘으면 분리 후보로 본다.

기능은 가능한 아래 단위로 분리한다.

UI 컴포넌트: app/<domain>/components/<FeatureName>.tsx
훅: app/<domain>/<feature>/use*.ts
서비스: app/<domain>/<feature>/service*.ts
API Route: app/api/<feature>/route.ts

View 파일은 조립 중심으로 유지한다.

Grid/핵심 View에는 호출만 남긴다.

버튼 기능, 모달, 패널, 비즈니스 규칙은 별도 파일로 분리한다.

## 12. 새 페이지/카테고리 추가 규칙

새 기능은 아래 순서로 진행한다.

1. DB 테이블/뷰 설계
2. /api/<domain> REST route 설계
3. 서비스/훅 작성
4. UI 컴포넌트 작성
5. View에서 연결
6. 필요 시 sync-engine 호출
7. 필요 시 lock-engine 호출

코어 파일을 수정하지 않고 호출만 추가한다.

## 13. 권한 규칙

권한은 상위 레벨 또는 권한 전용 모듈에서 관리한다.

컴포넌트마다 if (role === "admin") 같은 조건을 무작위로 흩뿌리지 않는다.

관리자/권한 판단 로직은 기존 권한 구조를 따른다.

## 14. 서버 운영 보안 규칙

서버 교체로 해결하지 않는다.

장애 발생 시 먼저 아래를 확인한다.

포트
보안그룹
UFW
Nginx
PM2
로그
리소스
배포 절차

외부 인바운드 허용 포트는 다음만 허용한다.

22
80
443

외부 차단 대상은 다음과 같다.

3000 Next
4002 Socket
5432 PostgreSQL
6379 Redis

Next와 Socket은 127.0.0.1로만 listen한다.

외부 접근은 Nginx 80/443만 허용한다.

SSH 규칙은 다음과 같다.

PasswordAuthentication no
PermitRootLogin no
키 로그인만 사용
22번은 내 IP만 허용

모르는 SSH authorized_keys 발견 시 사용자에게 보고한다.

## 15. 아웃바운드 방화벽 규칙

OUTBOUND는 기본 차단 원칙이다.

단, 운영 필수로 아래는 상시 허용한다.

53/udp DNS
443/tcp HTTPS

443은 알림톡, SENS, 외부 API, 배포에 필요하므로 배포 후 닫지 않는다.

금지 사항은 다음과 같다.

ALL/ALL 아웃바운드 허용
sudo ufw delete allow out 443/tcp

## 16. 서버에서 금지되는 작업

서버에서 직접 코드 수정 금지.

금지 예시는 다음과 같다.

vim
nano
서버에서 파일 직접 수정
next dev 실행
포트 임의 오픈
DB 외부 오픈
보안그룹 전체 허용
방화벽 즉흥 변경
원인 모른 채 패키지/보안설정 변경

서버 운영은 production 기준이다.

Next는 next start 또는 PM2로만 운영한다.

## 17. PM2 / 환경변수 규칙

PM2_HOME은 고정이다.

export PM2_HOME=/home/ubuntu/.pm2

운영 환경변수는 임시 export로 운영하지 않는다.

DATABASE_URL 등 운영 환경변수는 아래 중 한 곳에 고정한다.

pm2 ecosystem 파일
또는 /etc/environment

배포 후 확인:

pm2 env erp

DATABASE_URL 존재 여부를 확인한다.

pm2 startup과 pm2 save는 서비스 자동복구 목적의 승인된 예외 작업이다.

재부팅 후 확인:

pm2 ls

erp/socket online 확인.

## 18. 배포 규칙

실서버 반영은 항상 아래 흐름이다.

로컬 수정
git add
git commit
git push origin main
Render 확인
가비아 서버 SSH 접속
git pull
npm run build
pm2 restart

Claude Code는 배포를 직접 실행하지 않는다.

배포가 필요하면 "배포가 필요합니다"라고 사용자에게 알려준다.

사용자가 요청하면 명령어만 제공한다.

로컬 PC 명령어:

cd "C:\Users\USER\Desktop\moyulab-erp-db"
git status
git add .
git commit -m "커밋 메시지"
git push origin main

가비아 서버 접속:

ssh -i "C:\Users\key2\SSH_KeyPair-250916164158.pem" ubuntu@121.78.183.227

가비아 서버 배포 명령어:

export PM2_HOME=/home/ubuntu/.pm2
cd /home/ubuntu/moyulab-erp-db
git pull origin main
npm run build
pm2 restart erp --update-env
pm2 status
pm2 env erp

필요할 때만 socket 재시작:

pm2 restart socket --update-env

## 19. 장애 점검 규칙

장애 시 서버 삭제/재생성 금지.

먼저 로그와 상태를 확인한다.

pm2 ls
pm2 logs
systemctl status nginx
df -h
free -h
sudo tail -n 100 /var/log/ufw.log

트래픽/비용 급증 시:

즉시 아웃바운드 차단
로그 확보
원인 조사

## 20. 작업 후 파일 목록 TSV 규칙

사용자가 오늘 작업 파일 정리를 요청하면 반드시 아래 형식만 출력한다.

코드블록 밖 설명 금지.

목록 기호 금지.

탭으로만 구분한다.

형식:

구분    경로    파일명    역할    비고
신규    프로젝트루트기준/경로    파일명    역할 설명    비고
수정    프로젝트루트기준/경로    파일명    역할 설명    비고
삭제    프로젝트루트기준/경로    파일명    역할 설명    비고

일부 주요 파일만 고르지 않는다.

신규/수정/삭제된 파일은 전부 포함한다.

제외 대상:

node_modules
.git
.next

## 21. 위험 명령어 금지

사용자 승인 없이 실행 금지:

rm -rf
git reset --hard
git clean -fd
git push --force
npm install
prisma migrate
DROP TABLE
ALTER TABLE unified
ALTER TABLE locks
sudo ufw allow all
sudo ufw disable

위험한 명령은 필요 이유와 영향 범위를 먼저 설명하고 승인받는다.

## 22. 외부 CS서버(moulab-cs-server) 분리 원칙

이 ERP와 완전히 별도인 고객접수/카카오상담 서버(moulab-cs-server, 로컬 저장소 moulab-customer-reception)가 있다.

원칙은 다음과 같다.

DB는 각자 자기 것만 접근한다.

ERP는 PostgreSQL(unified 등)만 접근한다.
CS서버는 자기 DB(moulab_cs)만 접근한다.
CS서버가 ERP DB(PostgreSQL)에 직접 연결해서 읽거나 쓰는 것은 금지다.

서로 데이터가 필요하면 반드시 인증된 API 호출로만 주고받는다.

ERP가 CS서버 데이터가 필요하면 CS서버 API를 호출한다(x-erp-api-key 방식, 반납접수 연동 참고).
CS서버가 ERP 데이터가 필요하면 ERP API를 호출한다(동일한 방식의 인증키 필요, 신규 설계 시 이 방식으로).

CS서버 관련 코드 수정은 이 저장소(moyulab-erp-db)가 아니라 moulab-customer-reception 저장소에서 한다.

커밋/푸시/배포도 두 저장소를 절대 섞지 않는다.

이 원칙을 어기는 방향(CS서버의 ERP DB 직접 접근, 코드 뒤섞기, 저장소 혼용 등)으로 작업을 진행하려는 요청이 있으면, 그냥 진행하지 말고 강하게 경고하고 사용자 확인을 받는다. 작업자(사람)나 계정이 다르더라도 예외 없이 적용한다.

## 23. 최우선 규칙

서로 규칙이 충돌하면 아래 우선순위를 따른다.

1. 데이터 보존
2. 보안
3. 기존 기능 보호
4. sync/lock core 보호
5. 최소 수정
6. 새 기능 구현

확실하지 않으면 추측해서 수정하지 말고 사용자에게 질문한다.
