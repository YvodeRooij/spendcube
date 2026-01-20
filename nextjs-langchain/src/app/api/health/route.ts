import { NextResponse } from "next/server";
import { getCheckpointer } from "@/lib/langchain/checkpointer";

/**
 * Health status response
 */
interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    name: string;
    status: "pass" | "fail" | "warn";
    message?: string;
    latency?: number;
  }[];
}

const startTime = Date.now();

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring and load balancers.
 * Returns overall health status and individual component checks.
 */
export async function GET() {
  const checks: HealthStatus["checks"] = [];

  // Check 1: Environment variables
  const envCheck = checkEnvironment();
  checks.push(envCheck);

  // Check 2: Checkpointer (database)
  const checkpointerCheck = await checkCheckpointer();
  checks.push(checkpointerCheck);

  // Check 3: Memory usage
  const memoryCheck = checkMemory();
  checks.push(memoryCheck);

  // Determine overall status
  const hasFail = checks.some(c => c.status === "fail");
  const hasWarn = checks.some(c => c.status === "warn");

  let overallStatus: HealthStatus["status"] = "healthy";
  if (hasFail) {
    overallStatus = "unhealthy";
  } else if (hasWarn) {
    overallStatus = "degraded";
  }

  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return NextResponse.json(healthStatus, { status: statusCode });
}

/**
 * Check environment variables
 */
function checkEnvironment(): HealthStatus["checks"][0] {
  const required = [
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
  ];

  const optional = [
    "ANTHROPIC_API_KEY",
    "LANGSMITH_API_KEY",
    "DATABASE_URL",
  ];

  const missingRequired = required.filter(key => !process.env[key]);
  const missingOptional = optional.filter(key => !process.env[key]);

  if (missingRequired.length > 0) {
    return {
      name: "environment",
      status: "fail",
      message: `Missing required: ${missingRequired.join(", ")}`,
    };
  }

  if (missingOptional.length > 0) {
    return {
      name: "environment",
      status: "warn",
      message: `Missing optional: ${missingOptional.join(", ")}`,
    };
  }

  return {
    name: "environment",
    status: "pass",
    message: "All environment variables configured",
  };
}

/**
 * Check checkpointer connectivity
 */
async function checkCheckpointer(): Promise<HealthStatus["checks"][0]> {
  const start = Date.now();

  try {
    const checkpointer = getCheckpointer();

    // Try to get a non-existent checkpoint (tests connectivity)
    await checkpointer.get({
      configurable: { thread_id: "__health_check__" },
    });

    const latency = Date.now() - start;

    return {
      name: "checkpointer",
      status: latency < 500 ? "pass" : "warn",
      message: latency < 500 ? "Checkpointer healthy" : "Checkpointer slow",
      latency,
    };
  } catch (error) {
    return {
      name: "checkpointer",
      status: "fail",
      message: error instanceof Error ? error.message : "Checkpointer unavailable",
      latency: Date.now() - start,
    };
  }
}

/**
 * Check memory usage
 */
function checkMemory(): HealthStatus["checks"][0] {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const usagePercent = (used.heapUsed / used.heapTotal) * 100;

  if (usagePercent > 90) {
    return {
      name: "memory",
      status: "warn",
      message: `High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent.toFixed(1)}%)`,
    };
  }

  return {
    name: "memory",
    status: "pass",
    message: `Memory: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent.toFixed(1)}%)`,
  };
}

/**
 * HEAD /api/health
 *
 * Simple health check for load balancers that only check HTTP status.
 */
export async function HEAD() {
  // Quick check - just verify the service is running
  return new NextResponse(null, { status: 200 });
}
