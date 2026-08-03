export const syntheticCourierDirectoryVersion = "synthetic-courier-directory-v2";

export const syntheticCourierDirectory = [
  ["demo-courier-001", "강태현", 27],
  ["demo-courier-002", "윤재호", 34],
  ["demo-courier-003", "문상혁", 42],
  ["demo-courier-004", "배준영", 49],
  ["demo-courier-005", "임세훈", 58],
  ["demo-courier-006", "노현우", 67],
  ["demo-courier-007", "곽민제", 76],
  ["demo-courier-008", "서동하", 41],
  ["demo-courier-009", "채우진", 39],
  ["demo-courier-010", "백승기", 46],
  ["demo-courier-011", "오태림", 54],
  ["demo-courier-012", "신주완", 63],
  ["demo-courier-013", "하은성", 72],
  ["demo-courier-014", "남기석", 82],
  ["demo-courier-015", "조민혁", 39],
  ["demo-courier-016", "구본재", 36],
  ["demo-courier-017", "정해윤", 44],
  ["demo-courier-018", "최이든", 52],
  ["demo-courier-019", "한서웅", 61],
  ["demo-courier-020", "유정민", 70],
  ["demo-courier-021", "김도윤", 79],
  ["demo-courier-022", "이준서", 33],
  ["demo-courier-023", "박시우", 48],
  ["demo-courier-024", "송현준", 65],
  ["demo-courier-025", "안재민", 88],
].map(([courierId, displayName, initialSafetyBudget], index) => ({
  courierId,
  displayName,
  initialSafetyBudget,
  displayOrder: index + 1,
  dataMode: "SYNTHETIC",
  syntheticAlias: true,
}));

const directoryById = new Map(
  syntheticCourierDirectory.map((entry) => [entry.courierId, entry]),
);

export function findSyntheticCourierDirectoryEntry(courierId) {
  return directoryById.get(courierId);
}

export function initialSafetyBudgetForCourier(courierId) {
  const entry = findSyntheticCourierDirectoryEntry(courierId);
  if (!entry) {
    throw new Error(`합성 기사 디렉터리에 없는 ID입니다: ${courierId}`);
  }
  return entry.initialSafetyBudget;
}

export function applySyntheticCourierDirectory(records) {
  return records.map((record) => {
    const entry = findSyntheticCourierDirectoryEntry(record.courier.courierId);
    if (!entry) {
      throw new Error(
        `합성 기사 디렉터리에 없는 운영 레코드입니다: ${record.courier.courierId}`,
      );
    }
    return {
      ...record,
      courier: {
        ...record.courier,
        displayLabel: entry.displayName,
      },
    };
  });
}
