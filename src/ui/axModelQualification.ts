export const axModelQualification = {
  schemaVersion: "ax-model-qualification-presentation-v1",
  modelLabel: "A.X-4.0-Light · LoRA v2",
  dataModeLabel: "합성 검증",
  statusLabel: "Local 모델 슬롯 자격 · 제품 미활성",
  publicRuntimeLabel: "Upstage Hosted + 안전 템플릿",
  evidenceLabel: "동일 잠금 과업 · 원문 미저장",
  evidence: {
    trainingRecords: 1_800,
    validationPassed: 300,
    validationTotal: 300,
    frozenPassed: 300,
    frozenTotal: 300,
    productReviewPassed: 12,
    productReviewTotal: 12,
    fallbackCount: 0,
    unsafeDisplayCount: 0,
    localP95Label: "8.41초",
    hostedP95Label: "4.25초",
  },
  questions: [
    {
      question: "현재 설명을 A.X Local이 생성하나요?",
      answer:
        "아닙니다. 공개 Demo는 Upstage Hosted를 먼저 사용하고 검증 실패 시 안전 템플릿으로 전환합니다.",
    },
    {
      question: "A.X v2의 자격 통과는 무엇을 뜻하나요?",
      answer:
        "잠금 합성 과업에서 스키마·수치·인용·역할·인젝션 격리 기준을 통과했다는 뜻이며 현장 성과 주장이 아닙니다.",
    },
    {
      question: "왜 Local runtime을 바로 켜지 않았나요?",
      answer:
        "Hosted 기준보다 지연이 길고 인증·상태 확인·장애 복구·배포 rollback Gate가 아직 없기 때문입니다.",
    },
    {
      question: "A.X가 지원안이나 Safety 수치를 결정하나요?",
      answer:
        "아닙니다. 결정론 엔진의 검증된 사실을 설명할 뿐 추천·실행 가능성·승인 상태를 변경하지 않습니다.",
    },
  ],
} as const;
