import { describe, expect, it } from "vitest";
import { DEMO_ORGANIZATION_ID, DEMO_SITE_ID, hasOperationsFixture } from "@/services/operations-runtime";

// #186: a Director of another organization must not be sent to the demo-organization walkthrough.
describe("hasOperationsFixture", () => {
  it("is true only in the demo organization with the demo site assigned", () => {
    expect(hasOperationsFixture({ organizationId: DEMO_ORGANIZATION_ID, sites: [{ id: DEMO_SITE_ID }] })).toBe(true);
  });
  it("is false for a generated-scenario organization, whatever the role", () => {
    expect(hasOperationsFixture({ organizationId: "62dc9966-0210-59ad-a8a6-fe5a89b68c0b", sites: [{ id: "other-site" }] })).toBe(false);
  });
  it("is false in the demo organization without the demo site", () => {
    expect(hasOperationsFixture({ organizationId: DEMO_ORGANIZATION_ID, sites: [{ id: "other-site" }] })).toBe(false);
  });
});
