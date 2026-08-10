# SafeRoute AI Integration-ready Sandbox Goal

## 문서 상태

- 상태: Approved
- 담당: 팀 안전빵
- 최종 갱신: 2026-08-10
- 목표 상태: `INTEGRATION_READY_SANDBOX`
- 적용 범위: 실제 데이터·TMS·택배사·실제 기사 연결 전의 서버, 계약, 운영, 보안, 복구 및 평가 Gate

## 1. 결정사항

SafeRoute AI의 다음 Goal은 기존 본선 제출 Demo와 합성 운영 폐루프를 보존하면서, 외부 원천만 연결하면 제한된 Pilot을 시작할 수 있는 프로덕션급 합성 운영 Sandbox를 완성하는 것이다.

이 상태는 실제 택배 운영이나 `LIVE`가 아니다. 합성 조직·사용자·계획·이벤트만 허용하며 모든 화면과 응답은 `PRODUCTION_SANDBOX` 또는 동등한 검증 모드를 명시한다. 실제 개인정보·GPS·고객 연락처·비공개 TMS row를 수집하거나 실제 인증·계획 쓰기·고객 발송을 활성화하지 않는다.

## 2. 완료 범위

1. Demo·Sandbox·향후 Live Pilot의 환경과 기능 플래그를 분리한다.
2. 공급자 독립 인증 주체, 조직·거점·역할·권한 계약을 합성 ID로 검증한다.
3. TMS 입력 이벤트, 계획 적용 명령과 결과, 고객안내 Outbox 계약을 버전과 멱등키로 고정한다.
4. 결정론적 TMS Simulator가 정상·중복·역순·지연·부분 실패·복구를 재현한다.
5. D1은 스키마 버전, 합성 파생 상태, Outbox, 감사 이벤트와 만료시각만 저장한다.
6. 계획 적용은 승인·최신 계획·동의·Risk Transfer Guard를 재확인하고 실패 시 원 계획을 유지한다.
7. 고객안내는 합성 수신자 참조와 검증된 템플릿만 Outbox에 기록하며 네트워크 발송은 하지 않는다.
8. health와 인증된 readiness는 DB·AI·Sandbox 기능 플래그·계획·고객안내·AI Kill switch 상태를 분리해 보고한다.
9. 요청 크기, rate limit, 권한 격리, 민감 필드 거부, Secret 미기록과 보안 헤더를 검증한다.
10. 백업 내보내기·복원 검증·보존 만료·삭제·장애·롤백 리허설을 결정론적으로 재현한다.

## 3. 권한과 데이터 경계

- 합성 ID 접두사는 `sandbox-*`, `anon-*`, `plan-*`만 허용한다.
- 역할은 `PLATFORM_OPERATOR`, `TENANT_ADMIN`, `DISPATCHER`, `COURIER`로 제한한다.
- 실제 인증 공급자 대신 32자 이상 Sandbox 전용 Bearer token과 합성 actor header를 서버에서 검증한다.
- 토큰은 브라우저 번들·URL·응답·로그·증거에 포함하지 않는다.
- 실제 이름, 표시명, 전화번호, 이메일, 주소, 고객, 차량번호, 위도·경도, GPS, 생체정보는 중첩 위치와 관계없이 요청 전체를 거부한다.
- 조직·거점·actor가 다른 데이터는 존재 여부를 노출하지 않고 접근을 차단한다.
- 실제 공급자 연결 전까지 Sandbox 이벤트는 Safety 엔진의 Live 입력으로 승격하지 않는다.

## 4. 완료 Gate

- 기존 단위·계약·E2E·clean-start·production build가 회귀 없이 통과한다.
- Sandbox 계약의 정상·권한·테넌트 격리·중복·역순·크기·민감 필드·rate limit Gate가 통과한다.
- 계획 Outbox는 동일 명령 재전송을 한 번만 처리하고 stale 계획·Kill switch·무동의·불안전 명령을 적용하지 않는다.
- 고객안내 Outbox는 실제 연락처를 거부하고 합성 메시지를 네트워크로 발송하지 않는다.
- backup export는 Secret·원문·개인정보를 포함하지 않는다. 실제 Sandbox 복구는 계획·고객안내·AI Kill switch가 모두 켜진 경우에만 검증된 동일 상태 해시를 적용한다.
- 보존기간이 지난 Sandbox 파생 상태와 Outbox는 삭제되고 삭제 결과가 감사기록에 남는다.
- 공개 health는 민감정보 없는 최소 상태만 제공하고, 상세 readiness와 운영 변경은 인증을 요구한다.
- AI·DB·Simulator 장애에서도 기존 안전 계산과 활성 계획이 손상되지 않는다.
- Goal 감사 산출물이 명령, 결과, SHA-256, 명시적 한계와 배포 상태를 기록한다.

## 5. 비목표

- 실제 기사·관리자 계정 또는 인증 공급자 연결
- 실제 택배사 TMS/WMS webhook과 계획 쓰기
- 실제 GPS·주소·고객·연락처·생체정보 처리
- 실제 SMS·알림톡·푸시 발송
- 실제 현장 안전효과·사고감소·전국 운영 완료 주장
- 관리자·기사 독립 사람 검토를 자동 테스트로 대체
- Safety Budget·Risk Transfer Guard·동의·거절·AI 권한 변경

## 6. 승격 조건

`INTEGRATION_READY_SANDBOX`는 `LIVE_PILOT` 승인과 다르다. 실제 원천, 인증 공급자, 개인정보 처리범위, 보존·삭제 SLA, 지도·AI 처리조건, TMS 보상 트랜잭션, 고객 발송과 제한된 현장 Pilot이 별도로 승인되고 검증된 뒤에만 Live Pilot로 승격한다.
