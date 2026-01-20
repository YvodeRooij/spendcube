/**
 * Performance Optimization Module
 *
 * Provides caching, batch processing optimization, and performance monitoring
 * for the SpendCube AI multi-agent system.
 */

/**
 * Simple in-memory cache with TTL support
 */
export class SimpleCache<T> {
  private cache: Map<string, { value: T; expiry: number }> = new Map();
  private ttlMs: number;

  constructor(ttlSeconds: number = 300) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttlMs,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

/**
 * Classification cache entry type
 */
export interface ClassificationCacheEntry {
  code: string;
  title: string;
  confidence: number;
}

/**
 * Taxonomy search result cache
 * Caches UNSPSC lookups to reduce repeated searches
 */
export const taxonomyCache = new SimpleCache<ClassificationCacheEntry>(600); // 10 minute TTL

/**
 * Vendor-only cache (same vendor = same category)
 * Used as Level 2 fallback when exact match not found
 */
export const vendorCache = new SimpleCache<ClassificationCacheEntry>(3600); // 1-hour TTL

/**
 * Generate cache key for taxonomy lookup
 */
export function getTaxonomyCacheKey(vendor: string, description: string): string {
  // Normalize the key to improve cache hits
  const normalizedVendor = vendor.toLowerCase().trim();
  const normalizedDesc = description.toLowerCase().trim().substring(0, 100);
  return `${normalizedVendor}::${normalizedDesc}`;
}

/**
 * Generate cache key for vendor-only lookup
 */
export function getVendorCacheKey(vendor: string): string {
  return vendor.toLowerCase().trim();
}

/**
 * Multi-level cache lookup result
 */
export interface CachedClassificationResult extends ClassificationCacheEntry {
  source: 'exact' | 'vendor';
}

/**
 * Multi-level cache lookup
 * Level 1: Exact match (vendor::description)
 * Level 2: Vendor-only match (same vendor = same category)
 */
export function getCachedClassification(
  vendor: string,
  description: string
): CachedClassificationResult | null {
  // Level 1: Exact match (vendor::description)
  const exactKey = getTaxonomyCacheKey(vendor, description);
  const exactHit = taxonomyCache.get(exactKey);
  if (exactHit) {
    return { ...exactHit, source: 'exact' };
  }

  // Level 2: Vendor-only match (same vendor = same category)
  const vendorKey = getVendorCacheKey(vendor);
  const vendorHit = vendorCache.get(vendorKey);
  if (vendorHit) {
    return {
      ...vendorHit,
      source: 'vendor',
      confidence: vendorHit.confidence * 0.9,  // Slightly lower confidence for vendor-only match
    };
  }

  return null;  // Cache miss
}

/**
 * Batch processing configuration
 */
export interface BatchConfig {
  /** Size of each batch for parallel processing */
  batchSize: number;
  /** Maximum concurrent batches */
  maxConcurrency: number;
  /** Delay between batches in ms (for rate limiting) */
  delayBetweenBatches: number;
}

/**
 * Default batch configurations by operation type
 */
export const BATCH_CONFIGS: Record<string, BatchConfig> = {
  classification: {
    batchSize: 10,      // Process 10 records per batch
    maxConcurrency: 3,  // Run 3 batches concurrently
    delayBetweenBatches: 100,
  },
  qa: {
    batchSize: 5,       // QA is more intensive
    maxConcurrency: 2,
    delayBetweenBatches: 200,
  },
  enrichment: {
    batchSize: 20,      // Enrichment can be faster
    maxConcurrency: 5,
    delayBetweenBatches: 50,
  },
};

/**
 * Process items in batches with concurrency control
 */
export async function processBatches<T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R[]>,
  config: BatchConfig
): Promise<R[]> {
  const results: R[] = [];
  const batches: T[][] = [];

  // Split items into batches
  for (let i = 0; i < items.length; i += config.batchSize) {
    batches.push(items.slice(i, i + config.batchSize));
  }

  // Process batches with concurrency control
  for (let i = 0; i < batches.length; i += config.maxConcurrency) {
    const concurrentBatches = batches.slice(i, i + config.maxConcurrency);

    const batchResults = await Promise.all(
      concurrentBatches.map(batch => processor(batch))
    );

    results.push(...batchResults.flat());

    // Delay between batch groups (except for the last group)
    if (i + config.maxConcurrency < batches.length && config.delayBetweenBatches > 0) {
      await sleep(config.delayBetweenBatches);
    }
  }

  return results;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Performance metrics tracking
 */
export interface PerformanceMetrics {
  operationType: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  itemCount: number;
  successCount: number;
  errorCount: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Performance tracker for monitoring agent operations
 */
export class PerformanceTracker {
  private metrics: PerformanceMetrics[] = [];
  private current: PerformanceMetrics | null = null;

  start(operationType: string, itemCount: number): void {
    this.current = {
      operationType,
      startTime: Date.now(),
      itemCount,
      successCount: 0,
      errorCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  recordSuccess(): void {
    if (this.current) {
      this.current.successCount++;
    }
  }

  recordError(): void {
    if (this.current) {
      this.current.errorCount++;
    }
  }

  recordCacheHit(): void {
    if (this.current) {
      this.current.cacheHits++;
    }
  }

  recordCacheMiss(): void {
    if (this.current) {
      this.current.cacheMisses++;
    }
  }

  end(): PerformanceMetrics | null {
    if (!this.current) return null;

    this.current.endTime = Date.now();
    this.current.duration = this.current.endTime - this.current.startTime;

    const completed = { ...this.current };
    this.metrics.push(completed);
    this.current = null;

    return completed;
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getSummary(): {
    totalOperations: number;
    totalDuration: number;
    averageDuration: number;
    totalItems: number;
    successRate: number;
    cacheHitRate: number;
    byOperationType: Record<string, {
      count: number;
      avgDuration: number;
      successRate: number;
    }>;
  } {
    if (this.metrics.length === 0) {
      return {
        totalOperations: 0,
        totalDuration: 0,
        averageDuration: 0,
        totalItems: 0,
        successRate: 0,
        cacheHitRate: 0,
        byOperationType: {},
      };
    }

    const totalDuration = this.metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    const totalItems = this.metrics.reduce((sum, m) => sum + m.itemCount, 0);
    const totalSuccess = this.metrics.reduce((sum, m) => sum + m.successCount, 0);
    const totalCacheHits = this.metrics.reduce((sum, m) => sum + m.cacheHits, 0);
    const totalCacheQueries = this.metrics.reduce((sum, m) => sum + m.cacheHits + m.cacheMisses, 0);

    // Group by operation type
    const byType: Record<string, PerformanceMetrics[]> = {};
    for (const metric of this.metrics) {
      if (!byType[metric.operationType]) {
        byType[metric.operationType] = [];
      }
      byType[metric.operationType].push(metric);
    }

    const byOperationType: Record<string, { count: number; avgDuration: number; successRate: number }> = {};
    for (const [type, metrics] of Object.entries(byType)) {
      const typeDuration = metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
      const typeItems = metrics.reduce((sum, m) => sum + m.itemCount, 0);
      const typeSuccess = metrics.reduce((sum, m) => sum + m.successCount, 0);

      byOperationType[type] = {
        count: metrics.length,
        avgDuration: typeDuration / metrics.length,
        successRate: typeItems > 0 ? (typeSuccess / typeItems) * 100 : 0,
      };
    }

    return {
      totalOperations: this.metrics.length,
      totalDuration,
      averageDuration: totalDuration / this.metrics.length,
      totalItems,
      successRate: totalItems > 0 ? (totalSuccess / totalItems) * 100 : 0,
      cacheHitRate: totalCacheQueries > 0 ? (totalCacheHits / totalCacheQueries) * 100 : 0,
      byOperationType,
    };
  }

  clear(): void {
    this.metrics = [];
    this.current = null;
  }
}

/**
 * Global performance tracker instance
 */
export const performanceTracker = new PerformanceTracker();

/**
 * Memoize function results with TTL
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ttlSeconds: number = 300
): T {
  const cache = new SimpleCache<ReturnType<T>>(ttlSeconds);

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): T {
  let timeoutId: NodeJS.Timeout | null = null;

  return ((...args: Parameters<T>): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  }) as T;
}

/**
 * Rate limiter for API calls
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }

    // Wait for tokens to refill
    const waitTime = (1 - this.tokens) / this.refillRate * 1000;
    await sleep(waitTime);
    this.refill();
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Default rate limiter for LLM API calls
 * 10 requests per second burst, 5 sustained
 */
export const llmRateLimiter = new RateLimiter(10, 5);
