import { describe, expect, it } from "vitest";
import {
  syntheticCourierDirectory,
  syntheticCourierDirectoryVersion,
} from "../server/synthetic-courier-directory.mjs";
import {
  resolveRequestedRiderProfile,
  riderProfiles,
} from "../src/application/riderProfileRepository";

const originalNames = [
  "강태현",
  "윤재호",
  "문상혁",
  "배준영",
  "임세훈",
  "노현우",
  "곽민제",
  "서동하",
  "채우진",
  "백승기",
  "오태림",
  "신주완",
  "하은성",
  "남기석",
  "조민혁",
  "구본재",
  "정해윤",
  "최이든",
  "한서웅",
  "유정민",
];

describe("25명 합성 기사 디렉터리", () => {
  it("기존 20개 이름 순서와 신규 5개 합성 별칭을 고정한다", () => {
    expect(syntheticCourierDirectoryVersion).toBe(
      "synthetic-courier-directory-v2",
    );
    expect(syntheticCourierDirectory).toHaveLength(25);
    expect(
      syntheticCourierDirectory.slice(0, 20).map((entry) => entry.displayName),
    ).toEqual(originalNames);
    expect(
      syntheticCourierDirectory.slice(20).map((entry) => entry.displayName),
    ).toEqual(["김도윤", "이준서", "박시우", "송현준", "안재민"]);
    expect(
      new Set(syntheticCourierDirectory.map((entry) => entry.courierId)).size,
    ).toBe(25);
    expect(
      new Set(syntheticCourierDirectory.map((entry) => entry.displayName)).size,
    ).toBe(25);
    expect(
      syntheticCourierDirectory.every(
        (entry) => entry.dataMode === "SYNTHETIC" && entry.syntheticAlias,
      ),
    ).toBe(true);
  });

  it("초기 Budget이 네 밴드를 모두 포함하고 앱이 같은 ID·이름을 사용한다", () => {
    const budgets = syntheticCourierDirectory.map(
      (entry) => entry.initialSafetyBudget,
    );
    expect(Math.min(...budgets)).toBe(27);
    expect(Math.max(...budgets)).toBe(88);
    expect(budgets.some((value) => value < 30)).toBe(true);
    expect(budgets.some((value) => value >= 30 && value < 45)).toBe(true);
    expect(budgets.some((value) => value >= 45 && value < 60)).toBe(true);
    expect(budgets.some((value) => value >= 60)).toBe(true);

    expect(riderProfiles).toHaveLength(25);
    expect(
      resolveRequestedRiderProfile("?courier=demo-courier-009"),
    ).toMatchObject({
      courierId: "demo-courier-009",
      displayName: "채우진",
    });
  });
});
