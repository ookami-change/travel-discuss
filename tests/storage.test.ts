import { describe, expect, it } from "vitest";
import { serviceEndpoint } from "@/lib/storage";

describe("serviceEndpoint", () => {
  it("strips a bucket-prefixed COS domain", () => {
    expect(serviceEndpoint("https://travel-1250000000.cos.ap-guangzhou.myqcloud.com", "travel-1250000000")).toBe("https://cos.ap-guangzhou.myqcloud.com");
  });
  it("keeps a plain service endpoint", () => {
    expect(serviceEndpoint("https://cos.ap-guangzhou.myqcloud.com/", "travel-1250000000")).toBe("https://cos.ap-guangzhou.myqcloud.com");
    expect(serviceEndpoint("http://localhost:9000", "b")).toBe("http://localhost:9000");
  });
});
