import type { AgentNodeType } from "@/types/streaming";

/**
 * Node display configuration for UI
 */
export const nodeConfig: Record<AgentNodeType, { label: string; icon: string; color: string }> = {
  supervisor: { label: "Orchestrator", icon: "🎯", color: "blue" },
  extraction: { label: "Data Extraction", icon: "📤", color: "purple" },
  cleansing: { label: "Data Cleansing", icon: "🧹", color: "orange" },
  normalization: { label: "Normalization", icon: "📐", color: "teal" },
  classification: { label: "Classification", icon: "🏷️", color: "indigo" },
  qa: { label: "Quality Assurance", icon: "✅", color: "green" },
  enrichment: { label: "Enrichment", icon: "✨", color: "yellow" },
  hitl: { label: "Human Review", icon: "👤", color: "pink" },
  analysis: { label: "Analysis", icon: "📊", color: "cyan" },
  response: { label: "Response", icon: "💬", color: "gray" },
};
