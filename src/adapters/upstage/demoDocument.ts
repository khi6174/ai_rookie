import {
  AllowedCitationSchema,
  ExtractedSafetyRuleSchema,
} from "../../domain/contracts";

export const demoRainSlopeCitation = AllowedCitationSchema.parse({
  citationId: "citation-demo-rain-slope-001",
  documentTitle: "합성 안전운영 매뉴얼",
  section: "우천·경사 구간",
  excerpt: "강수와 경사가 겹치면 정차 후 계획 조정을 검토한다.",
});

export const demoRainSlopeRule = ExtractedSafetyRuleSchema.parse({
  ruleId: "rule-demo-rain-slope-001",
  hazardType: "HEAVY_RAIN_SLOPE",
  applicableConditions: [
    {
      field: "rainfallMmPerHour",
      operator: "GTE",
      value: 8,
      unit: "mm/h",
    },
    {
      field: "slopePercent",
      operator: "GTE",
      value: 7,
      unit: "percent",
    },
  ],
  recommendedActions: ["REST", "TRANSFER_STOPS", "SAFER_ROUTE"],
  source: {
    documentId: "document-demo-safety-manual-001",
    section: "우천·경사 구간",
    excerpt: demoRainSlopeCitation.excerpt,
  },
});
