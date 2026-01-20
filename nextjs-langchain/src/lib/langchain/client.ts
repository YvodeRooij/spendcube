import { Client } from "@langchain/langgraph-sdk";

/**
 * LangGraph SDK client for interacting with deployed graphs
 *
 * This client is used for:
 * - Connecting to LangGraph Cloud deployments
 * - Managing threads and runs
 * - Streaming graph execution
 */
let clientInstance: Client | null = null;

/**
 * Configuration for the LangGraph client
 */
export interface LangGraphClientConfig {
  apiUrl?: string;
  apiKey?: string;
}

/**
 * Get the default client configuration from environment
 */
function getDefaultConfig(): LangGraphClientConfig {
  return {
    apiUrl: process.env.LANGGRAPH_API_URL || "http://localhost:8000",
    apiKey: process.env.LANGSMITH_API_KEY,
  };
}

/**
 * Get or create the singleton LangGraph client
 */
export function getLangGraphClient(config?: LangGraphClientConfig): Client {
  if (!clientInstance) {
    const finalConfig = { ...getDefaultConfig(), ...config };
    clientInstance = new Client({
      apiUrl: finalConfig.apiUrl,
      apiKey: finalConfig.apiKey,
    });
  }
  return clientInstance;
}

/**
 * Create a new client instance with custom configuration
 */
export function createLangGraphClient(config: LangGraphClientConfig): Client {
  return new Client({
    apiUrl: config.apiUrl || "http://localhost:8000",
    apiKey: config.apiKey,
  });
}

/**
 * Reset the client singleton (useful for testing)
 */
export function resetClient(): void {
  clientInstance = null;
}
