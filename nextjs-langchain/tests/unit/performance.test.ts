import { describe, it, expect, beforeEach } from "vitest";
import {
  SimpleCache,
  processBatches,
  PerformanceTracker,
  RateLimiter,
  memoize,
  BATCH_CONFIGS,
} from "@/lib/performance";

describe("Performance Module", () => {
  describe("SimpleCache", () => {
    let cache: SimpleCache<string>;

    beforeEach(() => {
      cache = new SimpleCache<string>(1); // 1 second TTL
    });

    it("should store and retrieve values", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("should return undefined for missing keys", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("should expire entries after TTL", async () => {
      cache.set("expiring", "value");
      expect(cache.get("expiring")).toBe("value");

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(cache.get("expiring")).toBeUndefined();
    });

    it("should track cache size", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      expect(cache.size()).toBe(2);
    });

    it("should clear all entries", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it("should check existence with has()", () => {
      cache.set("exists", "value");
      expect(cache.has("exists")).toBe(true);
      expect(cache.has("missing")).toBe(false);
    });
  });

  describe("processBatches", () => {
    it("should process items in batches", async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const processed: number[] = [];

      const result = await processBatches(
        items,
        async (batch) => {
          processed.push(...batch);
          return batch.map((x) => x * 2);
        },
        { batchSize: 3, maxConcurrency: 2, delayBetweenBatches: 0 }
      );

      expect(result).toHaveLength(10);
      expect(result).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    });

    it("should respect batch size configuration", async () => {
      const items = [1, 2, 3, 4, 5];
      const batchSizes: number[] = [];

      await processBatches(
        items,
        async (batch) => {
          batchSizes.push(batch.length);
          return batch;
        },
        { batchSize: 2, maxConcurrency: 1, delayBetweenBatches: 0 }
      );

      expect(batchSizes).toEqual([2, 2, 1]); // 2 + 2 + 1 = 5 items
    });
  });

  describe("PerformanceTracker", () => {
    let tracker: PerformanceTracker;

    beforeEach(() => {
      tracker = new PerformanceTracker();
    });

    it("should track operation metrics", () => {
      tracker.start("classification", 10);
      tracker.recordSuccess();
      tracker.recordSuccess();
      tracker.recordError();
      const metrics = tracker.end();

      expect(metrics).toBeDefined();
      expect(metrics?.operationType).toBe("classification");
      expect(metrics?.itemCount).toBe(10);
      expect(metrics?.successCount).toBe(2);
      expect(metrics?.errorCount).toBe(1);
      expect(metrics?.duration).toBeGreaterThanOrEqual(0);
    });

    it("should track cache hits and misses", () => {
      tracker.start("lookup", 5);
      tracker.recordCacheHit();
      tracker.recordCacheHit();
      tracker.recordCacheMiss();
      const metrics = tracker.end();

      expect(metrics?.cacheHits).toBe(2);
      expect(metrics?.cacheMisses).toBe(1);
    });

    it("should provide summary statistics", () => {
      // First operation
      tracker.start("classification", 10);
      for (let i = 0; i < 8; i++) tracker.recordSuccess();
      for (let i = 0; i < 2; i++) tracker.recordError();
      tracker.end();

      // Second operation
      tracker.start("qa", 5);
      for (let i = 0; i < 5; i++) tracker.recordSuccess();
      tracker.end();

      const summary = tracker.getSummary();

      expect(summary.totalOperations).toBe(2);
      expect(summary.totalItems).toBe(15);
      expect(summary.successRate).toBeCloseTo(86.67, 1); // 13/15
      expect(summary.byOperationType["classification"]).toBeDefined();
      expect(summary.byOperationType["qa"]).toBeDefined();
    });

    it("should handle empty tracker", () => {
      const summary = tracker.getSummary();

      expect(summary.totalOperations).toBe(0);
      expect(summary.totalDuration).toBe(0);
      expect(summary.successRate).toBe(0);
    });

    it("should clear all metrics", () => {
      tracker.start("test", 5);
      tracker.end();

      tracker.clear();
      expect(tracker.getMetrics()).toHaveLength(0);
    });
  });

  describe("RateLimiter", () => {
    it("should allow requests within rate limit", async () => {
      const limiter = new RateLimiter(5, 5); // 5 burst, 5/sec

      const startTime = Date.now();

      // Should be immediate for first 5 requests
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(100); // Should be nearly instant
    });
  });

  describe("memoize", () => {
    it("should cache function results", () => {
      let callCount = 0;
      const expensive = (x: number) => {
        callCount++;
        return x * 2;
      };

      const memoized = memoize(expensive, 60);

      expect(memoized(5)).toBe(10);
      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(1); // Only called once
    });

    it("should call function for different arguments", () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };

      const memoized = memoize(fn, 60);

      expect(memoized(5)).toBe(10);
      expect(memoized(10)).toBe(20);
      expect(callCount).toBe(2);
    });
  });

  describe("BATCH_CONFIGS", () => {
    it("should have classification config", () => {
      expect(BATCH_CONFIGS.classification).toBeDefined();
      expect(BATCH_CONFIGS.classification.batchSize).toBeGreaterThan(0);
      expect(BATCH_CONFIGS.classification.maxConcurrency).toBeGreaterThan(0);
    });

    it("should have qa config", () => {
      expect(BATCH_CONFIGS.qa).toBeDefined();
      expect(BATCH_CONFIGS.qa.batchSize).toBeGreaterThan(0);
    });

    it("should have enrichment config", () => {
      expect(BATCH_CONFIGS.enrichment).toBeDefined();
      expect(BATCH_CONFIGS.enrichment.batchSize).toBeGreaterThan(0);
    });
  });
});
