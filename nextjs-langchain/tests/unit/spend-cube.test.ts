import { describe, it, expect } from "vitest";
import {
  buildSpendCube,
  formatSpendCubeReport,
  getSpendCubeJSON,
} from "@/lib/spend-cube";
import type { SpendCubeStateType } from "@/types";

// Helper to create a mock state
function createMockState(overrides: Partial<SpendCubeStateType> = {}): SpendCubeStateType {
  return {
    messages: [],
    userQuery: "",
    sessionId: "test-session",
    stage: "idle",
    inputRecords: [],
    classifications: [],
    qaResults: [],
    hitlQueue: [],
    hitlDecisions: [],
    errors: [],
    ...overrides,
  } as SpendCubeStateType;
}

describe("Spend Cube Module", () => {
  describe("buildSpendCube", () => {
    it("should build cube with WHO × WHAT × FROM WHOM dimensions", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01", department: "IT" },
          { id: "2", vendor: "Dell", description: "Monitor", amount: 500, date: "2024-01-02", department: "IT" },
          { id: "3", vendor: "Microsoft", description: "Office License", amount: 200, date: "2024-01-03", department: "HR" },
        ],
        classifications: [
          { recordId: "1", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-01", classifiedBy: "agent" },
          { recordId: "2", unspscCode: "43211900", unspscTitle: "Computer displays", confidence: 85, reasoning: "Test", classifiedAt: "2024-01-02", classifiedBy: "agent" },
          { recordId: "3", unspscCode: "43231500", unspscTitle: "Software", confidence: 80, reasoning: "Test", classifiedAt: "2024-01-03", classifiedBy: "agent" },
        ],
      });

      const cube = buildSpendCube(state);

      // Verify totals via summary
      expect(cube.summary.totalSpend).toBe(2200);
      expect(cube.summary.totalRecords).toBe(3);
      expect(cube.summary.uniqueVendors).toBe(2);
      expect(cube.summary.uniqueCategories).toBe(3);
      expect(cube.summary.uniqueDepartments).toBe(2);

      // Verify WHO dimension (departments)
      expect(cube.dimensions.byDepartment).toHaveLength(2);
      const itDept = cube.dimensions.byDepartment.find(d => d.name === "IT");
      expect(itDept?.value).toBe(2000); // 1500 + 500

      // Verify WHAT dimension (categories)
      expect(cube.dimensions.byCategory).toHaveLength(3);
      const laptopCat = cube.dimensions.byCategory.find(c => c.name === "Personal computers");
      expect(laptopCat?.value).toBe(1500);

      // Verify FROM WHOM dimension (vendors)
      expect(cube.dimensions.byVendor).toHaveLength(2);
      const dellVendor = cube.dimensions.byVendor.find(v => v.name === "Dell");
      expect(dellVendor?.value).toBe(2000); // 1500 + 500
    });

    it("should handle uncategorized records", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "Unknown Vendor", description: "Misc expense", amount: 100, date: "2024-01-01" },
        ],
        classifications: [], // No classifications
      });

      const cube = buildSpendCube(state);

      // Verify uncategorized handling
      expect(cube.dimensions.byCategory).toHaveLength(1);
      expect(cube.dimensions.byCategory[0].name).toBe("Uncategorized");
      expect(cube.dimensions.byDepartment[0].name).toBe("Unassigned");
    });

    it("should calculate data quality metrics", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01", poNumber: "PO-001" },
          { id: "2", vendor: "HP", description: "Desktop", amount: 1000, date: "2024-01-02" }, // No PO
        ],
        classifications: [
          { recordId: "1", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-01", classifiedBy: "agent" },
          { recordId: "2", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 60, reasoning: "Test", classifiedAt: "2024-01-02", classifiedBy: "agent" }, // Low confidence
        ],
      });

      const cube = buildSpendCube(state);

      expect(cube.dataQuality.classifiedRate).toBe(100);
      expect(cube.dataQuality.highConfidenceRate).toBe(50); // 1 of 2 >= 70%
      expect(cube.dataQuality.withPORate).toBe(50); // 1 of 2 has PO
    });

    it("should generate insights for vendor concentration", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "MegaCorp", description: "Big purchase", amount: 10000, date: "2024-01-01" },
          { id: "2", vendor: "SmallVendor", description: "Small purchase", amount: 100, date: "2024-01-02" },
        ],
        classifications: [
          { recordId: "1", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-01", classifiedBy: "agent" },
          { recordId: "2", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-02", classifiedBy: "agent" },
        ],
      });

      const cube = buildSpendCube(state);

      // MegaCorp has >30% of spend, should trigger vendor concentration insight
      const concentrationInsight = cube.insights.risks.find(i => i.title.includes("Concentration"));
      expect(concentrationInsight).toBeDefined();
      expect(concentrationInsight?.severity).toBe("high"); // >50% triggers high severity
    });

    it("should generate insights for maverick spend", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01" }, // No PO
          { id: "2", vendor: "HP", description: "Desktop", amount: 1000, date: "2024-01-02" }, // No PO
        ],
        classifications: [
          { recordId: "1", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-01", classifiedBy: "agent" },
          { recordId: "2", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-02", classifiedBy: "agent" },
        ],
      });

      const cube = buildSpendCube(state);

      // 0% PO rate should trigger compliance insight
      const maverickInsight = cube.insights.compliance.find(i => i.title.includes("Maverick"));
      expect(maverickInsight).toBeDefined();
      expect(maverickInsight?.severity).toBe("high"); // <50% triggers high severity
    });

    it("should identify cross-dimensional patterns", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "Dell", description: "Laptop", amount: 2000, date: "2024-01-01", department: "IT" },
          { id: "2", vendor: "Dell", description: "Server", amount: 5000, date: "2024-01-02", department: "IT" },
          { id: "3", vendor: "Staples", description: "Office supplies", amount: 100, date: "2024-01-03", department: "HR" },
        ],
        classifications: [
          { recordId: "1", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-01", classifiedBy: "agent" },
          { recordId: "2", unspscCode: "43211600", unspscTitle: "Servers", confidence: 85, reasoning: "Test", classifiedAt: "2024-01-02", classifiedBy: "agent" },
          { recordId: "3", unspscCode: "44111500", unspscTitle: "Office supplies", confidence: 80, reasoning: "Test", classifiedAt: "2024-01-03", classifiedBy: "agent" },
        ],
      });

      const cube = buildSpendCube(state);

      // Top category for IT should be Servers ($5000)
      expect(cube.crossDimensional.topCategoryByDepartment["IT"]).toBeDefined();
      expect(cube.crossDimensional.topCategoryByDepartment["IT"].category).toBe("Servers");
      expect(cube.crossDimensional.topCategoryByDepartment["IT"].amount).toBe(5000);

      // Top vendor for Personal computers should be Dell
      expect(cube.crossDimensional.topVendorByCategory["Personal computers"]).toBeDefined();
      expect(cube.crossDimensional.topVendorByCategory["Personal computers"].vendor).toBe("Dell");
    });

    it("should build executive summary with headline", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01", department: "IT" },
        ],
        classifications: [
          { recordId: "1", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-01", classifiedBy: "agent" },
        ],
      });

      const cube = buildSpendCube(state);

      expect(cube.executiveSummary).toBeDefined();
      expect(cube.executiveSummary.headline).toBeDefined();
      expect(cube.executiveSummary.totalSpend).toBe(1500);
      expect(cube.executiveSummary.dataQualityGrade).toBeDefined();
      expect(cube.executiveSummary.mondayMorningAction).toBeDefined();
    });
  });

  describe("formatSpendCubeReport", () => {
    it("should generate readable report", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01", department: "IT" },
        ],
        classifications: [
          { recordId: "1", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-01", classifiedBy: "agent" },
        ],
      });

      const cube = buildSpendCube(state);
      const report = cube.textReport || "";

      // Verify report structure
      expect(report).toContain("SPEND CUBE");
      expect(report).toContain("BY CATEGORY (WHAT)");
      expect(report).toContain("BY VENDOR (FROM WHOM)");
      expect(report).toContain("BY DEPARTMENT (WHO)");
      expect(report).toContain("DATA QUALITY");
    });

    it("should include insights section when present", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "MegaCorp", description: "Big purchase", amount: 10000, date: "2024-01-01" },
        ],
        classifications: [
          { recordId: "1", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-01", classifiedBy: "agent" },
        ],
      });

      const cube = buildSpendCube(state);
      const report = cube.textReport || "";

      expect(report).toContain("INSIGHTS");
    });
  });

  describe("getSpendCubeJSON", () => {
    it("should return structured JSON for API response", () => {
      const state = createMockState({
        inputRecords: [
          { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01", department: "IT" },
        ],
        classifications: [
          { recordId: "1", unspscCode: "43211500", unspscTitle: "Personal computers", confidence: 90, reasoning: "Test", classifiedAt: "2024-01-01", classifiedBy: "agent" },
        ],
      });

      const cube = buildSpendCube(state);
      const json = getSpendCubeJSON(cube);

      // Verify JSON structure
      expect(json.executiveSummary).toBeDefined();
      expect(json.summary).toBeDefined();
      expect(json.summary.totalSpend).toBe(1500);
      expect(json.dimensions).toBeDefined();
      expect(json.dimensions.byDepartment).toBeDefined();
      expect(json.dimensions.byCategory).toBeDefined();
      expect(json.dimensions.byVendor).toBeDefined();
      expect(json.crossDimensional).toBeDefined();
      expect(json.dataQuality).toBeDefined();
      expect(json.insights).toBeDefined();
    });
  });
});
