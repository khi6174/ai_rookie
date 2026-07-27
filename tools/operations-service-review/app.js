const studies = {
  ADMIN: {
    title: "관리자 운영 화면",
    image: "../../artifacts/evals/screenshots/operations-service-1440x900.png",
    alt: "SafeRoute 합성 운영 관리자 화면 전체",
    questions: [
      {
        id: "admin-purpose",
        prompt: "이 화면의 첫 번째 목적은 무엇입니까?",
        options: [
          ["SUPPORT", "향후 지원이 필요한 기사와 실행 가능한 조치를 확인한다."],
          ["RANK", "기사별 성과 순위를 정한다."],
          ["ACCIDENT", "기사별 사고확률을 진단한다."],
        ],
        expected: "SUPPORT",
        critical: true,
      },
      {
        id: "admin-data-mode",
        prompt: "화면의 기사·위치·배송 데이터는 무엇입니까?",
        options: [
          ["SYNTHETIC", "결정론적 합성 데이터다."],
          ["LIVE", "실제 운영사의 실시간 데이터다."],
          ["UNKNOWN", "화면만으로는 구분할 수 없다."],
        ],
        expected: "SYNTHETIC",
        critical: true,
      },
      {
        id: "admin-ai",
        prompt: "Upstage 설명이 할 수 있는 일은 무엇입니까?",
        options: [
          ["EXPLAIN", "계산된 결정 사실을 역할별 문장으로 설명한다."],
          ["DECIDE", "추천과 실행 가능 여부를 새로 결정한다."],
          ["OVERRIDE", "관리자 승인 없이 계획을 적용한다."],
        ],
        expected: "EXPLAIN",
        critical: true,
      },
      {
        id: "admin-consent",
        prompt: "기사 동의는 어디에서 기록해야 합니까?",
        options: [
          ["RIDER", "같은 decision ID를 여는 별도 기사 화면에서 기록한다."],
          ["ADMIN", "관리자가 기사 대신 동의 버튼을 누른다."],
          ["NONE", "관리자 승인만 있으면 동의가 필요 없다."],
        ],
        expected: "RIDER",
        critical: true,
      },
      {
        id: "admin-documents",
        prompt: "합성 운영 문서는 언제 Safety 계산에 사용할 수 있습니까?",
        options: [
          ["VALIDATED", "파일 해시·참조·추출 스키마를 검증해 정규화한 뒤에만 사용한다."],
          ["DIRECT", "업로드한 원문을 곧바로 Safety 계산에 넣는다."],
          ["AI_DECIDES", "Upstage가 안전하다고 판단하면 검증 없이 사용한다."],
        ],
        expected: "VALIDATED",
        critical: true,
      },
    ],
  },
  RIDER: {
    title: "기사 안전지원 화면",
    image: "../../artifacts/evals/screenshots/operations-rider-390x844.png",
    alt: "SafeRoute 합성 기사 안전지원 화면 전체",
    questions: [
      {
        id: "rider-choice",
        prompt: "기사에게 제공되는 선택은 무엇입니까?",
        options: [
          ["THREE", "동의, 수정 요청, 거절이 모두 제공된다."],
          ["CONSENT", "동의만 가능하다."],
          ["ADMIN", "기사는 선택할 수 없고 관리자가 결정한다."],
        ],
        expected: "THREE",
        critical: true,
      },
      {
        id: "rider-penalty",
        prompt: "수정 요청이나 거절은 무엇을 의미합니까?",
        options: [
          ["NO_PENALTY", "불이익을 의미하지 않으며 현재 계획을 유지한다."],
          ["PENALTY", "성과평가 점수가 낮아진다."],
          ["AUTO_APPLY", "다른 계획이 자동 적용된다."],
        ],
        expected: "NO_PENALTY",
        critical: true,
      },
      {
        id: "rider-map",
        prompt: "Kakao 지도·길찾기의 제품 경계는 무엇입니까?",
        options: [
          ["ASSIST", "합성 경로 시각화·ETA 비교 보조이며 안전계산을 덮어쓰지 않는다."],
          ["GPS", "실제 기사의 실시간 GPS와 턴바이턴 내비게이션이다."],
          ["SAFETY", "지도 결과가 Safety Budget을 직접 결정한다."],
        ],
        expected: "ASSIST",
        critical: true,
      },
      {
        id: "rider-apply",
        prompt: "동의를 누르면 언제 계획이 바뀝니까?",
        options: [
          ["AFTER_APPROVAL", "관리자 승인과 최신 계획 재검증을 통과한 뒤 바뀐다."],
          ["IMMEDIATE", "동의 즉시 바뀐다."],
          ["NEVER", "어떤 경우에도 바뀌지 않는다."],
        ],
        expected: "AFTER_APPROVAL",
        critical: true,
      },
    ],
  },
};

let role = "ADMIN";
const roleButtons = [...document.querySelectorAll("[data-role]")];
const questionsNode = document.querySelector("#questions");
const image = document.querySelector("#stimulus-image");
const stimulus = document.querySelector("#stimulus");
const title = document.querySelector("#stimulus-title");
const status = document.querySelector("#status");

function render() {
  const study = studies[role];
  roleButtons.forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.role === role)),
  );
  title.textContent = study.title;
  image.src = study.image;
  image.alt = study.alt;
  stimulus.classList.toggle("rider", role === "RIDER");
  questionsNode.innerHTML = "";
  study.questions.forEach((question, index) => {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `${index + 1}. ${question.prompt}`;
    fieldset.append(legend);
    question.options.forEach(([value, label]) => {
      const option = document.createElement("label");
      option.innerHTML = `<input required type="radio" name="${question.id}" value="${value}" /> <span>${label}</span>`;
      fieldset.append(option);
    });
    questionsNode.append(fieldset);
  });
  status.textContent = "";
}

roleButtons.forEach((button) =>
  button.addEventListener("click", () => {
    role = button.dataset.role;
    render();
  }),
);

document.querySelector("#review-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const study = studies[role];
  const answers = study.questions.map((question) => {
    const answer = String(form.get(question.id));
    return {
      questionId: question.id,
      answer,
      expected: question.expected,
      correct: answer === question.expected,
      critical: question.critical,
    };
  });
  const result = {
    schemaVersion: "operations-service-human-review-result-v1",
    studyId: "operations-service-human-review-v1",
    dataMode: "SYNTHETIC",
    role,
    reviewerCode: document.querySelector("#reviewer-code").value,
    completedAt: new Date().toISOString(),
    answers,
    correctCount: answers.filter((answer) => answer.correct).length,
    criticalMisconceptionCount: answers.filter(
      (answer) => answer.critical && !answer.correct,
    ).length,
    uploadPerformed: false,
  };
  const blob = new Blob([`${JSON.stringify(result, null, 2)}\n`], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `operations-service-review-${role.toLowerCase()}-${result.reviewerCode}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  status.textContent =
    "결과를 내려받았습니다. 파일은 서버로 전송되지 않습니다.";
});

render();
