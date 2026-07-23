const app = document.querySelector("#app");
const orders = [
  ["TWO_D", "DEMO_TWO_POINT_FIVE_D"],
  ["DEMO_TWO_POINT_FIVE_D", "TWO_D"],
  ["TWO_D", "DEMO_TWO_POINT_FIVE_D"],
];
const stimulus = {
  TWO_D: "/artifacts/evals/screenshots/g5-round4-admin-decision-2d-1280x720.png",
  DEMO_TWO_POINT_FIVE_D:
    "/artifacts/evals/screenshots/g5-round4-admin-decision-2-5d-1280x720.png",
};
const study = {
  schemaVersion: "g5-spatial-comprehension-v4",
  studyId: "g5-b-decision-spatial-comprehension-round4-001",
  dataMode: "DEMO",
  stimulusManifest: "artifacts/evals/g5-spatial-round4-stimulus-manifest.json",
  reviewers: [],
};
let reviewerIndex = 0;
let trialIndex = 0;
let trialStartedAt = 0;
let activeReviewer = null;

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
  start.addEventListener("click", () => {
    activeReviewer = {
      reviewerId: reviewerId(),
      consentConfirmed: true,
      trialOrder: [...orders[reviewerIndex]],
      trials: [],
      comparison: null,
    };
    trialIndex = 0;
    renderTrial();
  });
}

function integer(formData, key) {
  return Number.parseInt(String(formData.get(key)), 10);
}

function renderTrial() {
  cloneTemplate("#trial-template");
  const mode = activeReviewer.trialOrder[trialIndex];
  app.querySelector("[data-reviewer-label]").textContent = activeReviewer.reviewerId;
  app.querySelector("[data-trial-label]").textContent = String(trialIndex + 1);
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
  image.src = stimulus[mode];
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const durationMs = Math.max(1, Math.round(performance.now() - trialStartedAt));
    activeReviewer.trials.push({
      mode,
      durationMs,
      confidence: integer(formData, "confidence"),
      answers: {
        timeToBreachMinutes: integer(formData, "timeToBreachMinutes"),
        breachStopOrdinal: integer(formData, "breachStopOrdinal"),
        slopeExposureSegment: String(formData.get("slopeExposureSegment")),
        restMinutes: integer(formData, "restMinutes"),
        transferStopCount: integer(formData, "transferStopCount"),
        sourceImpact: String(formData.get("sourceImpact")),
        recipientImpact: String(formData.get("recipientImpact")),
        routePriority: String(formData.get("routePriority")),
      },
    });
    trialIndex += 1;
    if (trialIndex < 2) renderTrial();
    else renderComparison();
  });
}

function renderComparison() {
  cloneTemplate("#comparison-template");
  app.querySelector("[data-comparison-reviewer]").textContent =
    activeReviewer.reviewerId;
  const form = app.querySelector("[data-comparison-form]");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    activeReviewer.comparison = {
      clearerMode: String(formData.get("clearerMode")),
      twoPointFiveDAddedConfusion:
        formData.get("twoPointFiveDAddedConfusion") === "true",
      comment: String(formData.get("comment")).trim(),
    };
    study.reviewers.push(activeReviewer);
    activeReviewer = null;
    if (study.reviewers.length >= 3) renderComplete();
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
    link.download = "g5-spatial-comprehension-round4-results.json";
    link.click();
    URL.revokeObjectURL(url);
  });
  app.querySelector("[data-reset]").addEventListener("click", () => {
    study.reviewers.length = 0;
    reviewerIndex = 0;
    trialIndex = 0;
    activeReviewer = null;
    renderIntro();
  });
}

renderIntro();
