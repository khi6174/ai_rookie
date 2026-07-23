const app = document.querySelector("#app");
const reviewerTarget = 5;
const stimulus = "/artifacts/evals/screenshots/rider-source-route-round2-390x844.png";
const study = {
  schemaVersion: "rider-reference-comprehension-v2",
  studyId: "rider-route-product-boundary-round2-001",
  dataMode: "DEMO",
  stimulusManifest: "artifacts/evals/rider-reference-round2-stimulus-manifest.json",
  reviewers: [],
};
let reviewerIndex = 0;
let trialStartedAt = 0;

function reviewerId() {
  return `reviewer-${String(reviewerIndex + 1).padStart(2, "0")}`;
}

function cloneTemplate(id) {
  const template = document.querySelector(id);
  app.replaceChildren(template.content.cloneNode(true));
}

function renderIntro() {
  cloneTemplate("#intro-template");
  app.querySelector("[data-reviewer-number]").textContent = String(
    reviewerIndex + 1,
  );
  const consent = app.querySelector("[data-consent]");
  const start = app.querySelector("[data-start]");
  consent.addEventListener("change", () => {
    start.disabled = !consent.checked;
  });
  start.addEventListener("click", renderTrial);
}

function renderTrial() {
  cloneTemplate("#trial-template");
  app.querySelector("[data-reviewer-label]").textContent = reviewerId();
  const image = app.querySelector("[data-stimulus]");
  const form = app.querySelector("[data-trial-form]");
  const timerState = app.querySelector("[data-timer-state]");
  form.inert = true;
  image.addEventListener("load", () => {
    trialStartedAt = performance.now();
    form.inert = false;
    timerState.textContent = "측정 중";
  }, { once: true });
  image.addEventListener("error", () => {
    timerState.textContent = "화면 오류 · 진행 중단";
    timerState.setAttribute("role", "alert");
  }, { once: true });
  image.src = stimulus;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    study.reviewers.push({
      reviewerId: reviewerId(),
      consentConfirmed: true,
      durationMs: Math.max(1, Math.round(performance.now() - trialStartedAt)),
      confidence: Number.parseInt(String(formData.get("confidence")), 10),
      answers: {
        currentSegment: String(formData.get("currentSegment")),
        nextSafetyStop: String(formData.get("nextSafetyStop")),
        supportBoundary: String(formData.get("supportBoundary")),
        productRole: String(formData.get("productRole")),
        approvalRule: String(formData.get("approvalRule")),
        demoBoundary: String(formData.get("demoBoundary")),
      },
      comment: String(formData.get("comment")).trim(),
    });
    if (study.reviewers.length >= reviewerTarget) renderComplete();
    else renderHandoff();
  });
}

function renderHandoff() {
  cloneTemplate("#handoff-template");
  app.querySelector("[data-next-reviewer]").addEventListener("click", () => {
    reviewerIndex += 1;
    renderIntro();
  });
}

function renderComplete() {
  cloneTemplate("#complete-template");
  const json = `${JSON.stringify(study, null, 2)}\n`;
  app.querySelector("[data-result-json]").textContent = json;
  app.querySelector("[data-download]").addEventListener("click", () => {
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "rider-reference-comprehension-round2-results.json";
    link.click();
    URL.revokeObjectURL(url);
  });
  app.querySelector("[data-reset]").addEventListener("click", () => {
    study.reviewers.length = 0;
    reviewerIndex = 0;
    renderIntro();
  });
}

renderIntro();
