import { describe, expect, it } from "vitest";
import bundledSyntheticOperationsDocument from "../public/templates/daily-operations-documents-2026-07-25-bundled-v1.json";
import {
  createMemorySyntheticOperationsStore,
  handleSyntheticOperationsRequest,
} from "../server/synthetic-operations-store.mjs";
import { DailyOperationsPackageSchema } from "../src/domain/operations";

function loadBundle() {
  return structuredClone(bundledSyntheticOperationsDocument) as {
    documents: unknown[];
    extractedRecords: Array<{
      parentRecordId: string;
      courier: { courierId: string };
      plan: { remainingStopCount: number };
    }>;
  };
}

describe("25명 합성 운영 DB projection", () => {
  it("원문을 저장하지 않고 검증된 25명 패키지를 복원한다", async () => {
    const bundle = loadBundle();
    const store = createMemorySyntheticOperationsStore(bundle);
    const response = await handleSyntheticOperationsRequest(
      new Request(
        "http://localhost/api/operations/days/current/package",
      ),
      { memoryStore: store },
    );
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      package: unknown;
      storage: string;
      sourceBundleId: string;
      rawDocumentsStored: boolean;
    };
    const operationsPackage = DailyOperationsPackageSchema.parse(body.package);

    expect(body.storage).toBe("MEMORY_DEV");
    expect(body.sourceBundleId).toBe(
      "daily-operations-documents-2026-07-25-bundled-v1",
    );
    expect(body.rawDocumentsStored).toBe(false);
    expect(operationsPackage.records).toHaveLength(25);
    expect(
      operationsPackage.records.map((record) => record.courier.displayLabel),
    ).toEqual([
      "강태현", "윤재호", "문상혁", "배준영", "임세훈",
      "노현우", "곽민제", "서동하", "채우진", "백승기",
      "오태림", "신주완", "하은성", "남기석", "조민혁",
      "구본재", "정해윤", "최이든", "한서웅", "유정민",
      "김도윤", "이준서", "박시우", "송현준", "안재민",
    ]);
    expect(
      new Set(
        operationsPackage.records.map(
          (record) => record.courier.courierId,
        ),
      ).size,
    ).toBe(25);
    expect(body.package).not.toHaveProperty("documents");
    for (const record of operationsPackage.records) {
      expect(record).not.toHaveProperty("content");
    }
  });

  it("운영일 요약의 기사·남은 배송 수를 원천 레코드에서 계산한다", async () => {
    const bundle = loadBundle();
    const store = createMemorySyntheticOperationsStore(bundle);
    const response = await handleSyntheticOperationsRequest(
      new Request("http://localhost/api/operations/days/current"),
      { memoryStore: store },
    );
    const body = (await response?.json()) as {
      day: {
        courierCount: number;
        remainingStopCount: number;
        dataMode: string;
        storage: string;
      };
    };
    expect(body.day).toMatchObject({
      courierCount: 25,
      remainingStopCount: bundle.extractedRecords.reduce(
        (total, record) => total + record.plan.remainingStopCount,
        0,
      ),
      dataMode: "SYNTHETIC",
      storage: "MEMORY_DEV",
    });
  });

  it("중복 기사와 쓰기 요청을 거부한다", async () => {
    const bundle = loadBundle();
    bundle.extractedRecords[1].courier.courierId =
      bundle.extractedRecords[0].courier.courierId;
    expect(() => createMemorySyntheticOperationsStore(bundle)).toThrow(
      "중복",
    );

    const validStore = createMemorySyntheticOperationsStore(loadBundle());
    const response = await handleSyntheticOperationsRequest(
      new Request("http://localhost/api/operations/days/current", {
        method: "POST",
      }),
      { memoryStore: validStore },
    );
    expect(response?.status).toBe(405);
  });
});
