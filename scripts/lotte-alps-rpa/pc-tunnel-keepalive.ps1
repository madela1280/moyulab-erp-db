# scripts/lotte-alps-rpa/pc-tunnel-keepalive.ps1
#
# 롯데 ALPS RPA용 SSH 역방향 SOCKS 터널을 "하루 종일" 유지하기 위한 스크립트.
# 서버(가비아)가 이 PC의 인터넷 회선을 거쳐 롯데 사이트(18210 포트)에 접속할 수 있도록
# 이 PC → 서버로 SSH 터널을 열고, 연결이 끊기면 자동으로 재연결한다.
#
# 사용법:
#   1) 아래 $PemPath 값을 이 PC에 있는 실제 키 파일 경로로 수정한다.
#   2) 이 스크립트를 더블클릭하거나, PowerShell에서 실행한다:
#        powershell -ExecutionPolicy Bypass -File pc-tunnel-keepalive.ps1
#   3) 이 창은 하루 종일(RPA를 쓰는 동안 내내) 열어둔 채로 둔다. 끄면 서버의 롯데 접속이 막힌다.
#   4) 중지하려면 이 창에서 Ctrl+C.

$PemPath = "C:\Users\key2\SSH_KeyPair-250916164158.pem"  # TODO: 이 PC의 실제 키 파일 경로로 수정
$ServerUser = "ubuntu"
$ServerHost = "121.78.183.227"
$RemotePort = 1080

if (-not (Test-Path $PemPath)) {
    Write-Host "키 파일을 찾을 수 없습니다: $PemPath" -ForegroundColor Red
    Write-Host "이 스크립트 위쪽의 `$PemPath 값을 이 PC의 실제 키 파일 경로로 고친 뒤 다시 실행하세요." -ForegroundColor Yellow
    exit 1
}

Write-Host "롯데 RPA용 SSH 터널을 시작합니다. 이 창은 하루 종일 열어두세요." -ForegroundColor Cyan
Write-Host "중지하려면 Ctrl+C를 누르세요." -ForegroundColor Cyan

while ($true) {
    Write-Host "`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 터널 연결 시도..." -ForegroundColor Green

    # ServerAliveInterval/CountMax: 30초마다 생존 확인, 3번 실패하면(약 90초 무응답) 끊고 재시도
    # ExitOnForwardFailure: 원격 포트(1080) 바인딩 자체가 실패하면 즉시 종료(무한 대기 방지)
    ssh -i "$PemPath" `
        -o ServerAliveInterval=30 `
        -o ServerAliveCountMax=3 `
        -o ExitOnForwardFailure=yes `
        -o StrictHostKeyChecking=accept-new `
        -R $RemotePort ${ServerUser}@${ServerHost} -N

    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 터널 연결이 끊겼습니다. 5초 후 재연결합니다..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}
