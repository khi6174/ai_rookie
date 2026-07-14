# SafeRoute AI

SafeRoute AI는 배송계획 변경 전에 모든 영향 기사의 미래 안전 가능영역을 검증하고, 같은 결정 근거와 기사 동의·관리자 승인 아래 계획을 갱신하는 라스트마일 안전운영 코파일럿입니다.

계약, 결정론적 Safety Budget과 Risk Transfer Guard 핵심 경로를 완료했습니다. 다음 단계는 배송순서 변경·안전경로·Safe Delay의 명시적 Demo 입력 계약과 평가입니다.

- TypeScript·Zod 데이터 계약
- 우천·폭염·야간 대표 fixture 3개
- 출처·Demo 상태와 개인정보 경계
- Safety Budget·Risk Transfer Guard 입력·출력 불변조건
- `dse-v1.0.0` Safety Budget·Time-to-Breach 엔진
- 세 대표 시나리오 정확값·경계·단조성 회귀 테스트
- 결정론적 휴식·이관·묶음 후보와 전체 계획 재계산
- 수신 기사 Budget 45·감소 15점 Risk Transfer Guard
- 시나리오 A 8건 허용·12건 차단·안전 후보 순위
- Vitest 계약 테스트

## 실행

```bash
pnpm install
pnpm test
pnpm run typecheck
pnpm run build
pnpm dev
```

## 핵심 문서

- `AGENTS.md`: 프로젝트 가드레일
- `docs/product-spec.md`: 궁극적 목표와 제품 수용기준
- `docs/decisions.md`: 지속 결정 기록
- `docs/architecture.md`: 모듈과 데이터 흐름
- `docs/data-contracts.md`: 데이터 계약 명세
- `docs/evals.md`: 평가·심사 증거 계획
- `docs/demo-script.md`: 3분 폐루프 시연

## 표현 경계

이 프로젝트의 결과는 사고확률이나 의료 진단이 아닙니다. 현재 fixtures와 결과는 합성·시뮬레이션이며 실제 운영 효과로 표현하지 않습니다.
