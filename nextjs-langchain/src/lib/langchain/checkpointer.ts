import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";

/**
 * Checkpointer configuration
 */
export interface CheckpointerConfig {
  type: "memory" | "postgres";
  connectionString?: string;
  poolSize?: number;
}

/**
 * Environment-based configuration
 */
function getCheckpointerConfig(): CheckpointerConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (isProduction && connectionString) {
    return {
      type: "postgres",
      connectionString,
      poolSize: parseInt(process.env.PG_POOL_SIZE || "10", 10),
    };
  }

  // Development/test mode or no database URL
  return {
    type: "memory",
  };
}

/**
 * Singleton instances
 */
let checkpointerInstance: BaseCheckpointSaver | null = null;
let pgPool: Pool | null = null;

/**
 * Create a PostgreSQL connection pool
 */
function createPgPool(config: CheckpointerConfig): Pool {
  if (!config.connectionString) {
    throw new Error("PostgreSQL connection string is required");
  }

  return new Pool({
    connectionString: config.connectionString,
    max: config.poolSize || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

/**
 * Create a PostgresSaver checkpointer
 */
async function createPostgresSaver(config: CheckpointerConfig): Promise<PostgresSaver> {
  if (!pgPool) {
    pgPool = createPgPool(config);
  }

  const saver = PostgresSaver.fromConnString(config.connectionString!);

  // Setup the database tables (idempotent)
  await saver.setup();

  return saver;
}

/**
 * Get the singleton checkpointer instance
 *
 * Uses MemorySaver for development and PostgresSaver for production
 * based on environment configuration.
 */
export async function getCheckpointerAsync(): Promise<BaseCheckpointSaver> {
  if (!checkpointerInstance) {
    const config = getCheckpointerConfig();

    if (config.type === "postgres") {
      console.log("[Checkpointer] Using PostgreSQL persistence");
      checkpointerInstance = await createPostgresSaver(config);
    } else {
      console.log("[Checkpointer] Using in-memory persistence (development mode)");
      checkpointerInstance = new MemorySaver();
    }
  }

  return checkpointerInstance;
}

/**
 * Synchronous getter for backwards compatibility
 * Returns MemorySaver immediately, but logs a warning in production
 */
export function getCheckpointer(): BaseCheckpointSaver {
  const config = getCheckpointerConfig();

  if (config.type === "postgres") {
    console.warn(
      "[Checkpointer] Warning: Using synchronous getCheckpointer() in production. " +
      "Consider using getCheckpointerAsync() for PostgreSQL persistence."
    );
  }

  if (!checkpointerInstance) {
    // For sync access, fall back to MemorySaver
    checkpointerInstance = new MemorySaver();
  }

  return checkpointerInstance;
}

/**
 * Reset the checkpointer (useful for testing)
 */
export async function resetCheckpointer(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  checkpointerInstance = null;
}

/**
 * Create a new checkpointer instance (not singleton)
 * Useful when you need isolated state for specific operations
 */
export async function createCheckpointer(
  config?: Partial<CheckpointerConfig>
): Promise<BaseCheckpointSaver> {
  const mergedConfig = { ...getCheckpointerConfig(), ...config };

  if (mergedConfig.type === "postgres" && mergedConfig.connectionString) {
    return createPostgresSaver(mergedConfig);
  }

  return new MemorySaver();
}

/**
 * Check if using production persistence
 */
export function isProductionPersistence(): boolean {
  const config = getCheckpointerConfig();
  return config.type === "postgres";
}

/**
 * Get checkpointer health status
 */
export async function getCheckpointerHealth(): Promise<{
  healthy: boolean;
  type: "memory" | "postgres";
  error?: string;
}> {
  const config = getCheckpointerConfig();

  if (config.type === "memory") {
    return { healthy: true, type: "memory" };
  }

  try {
    if (!pgPool) {
      pgPool = createPgPool(config);
    }

    // Test the connection
    const client = await pgPool.connect();
    await client.query("SELECT 1");
    client.release();

    return { healthy: true, type: "postgres" };
  } catch (error) {
    return {
      healthy: false,
      type: "postgres",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Graceful shutdown - close all connections
 */
export async function shutdownCheckpointer(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  checkpointerInstance = null;
  console.log("[Checkpointer] Shutdown complete");
}
