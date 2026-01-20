import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { createSupervisorModel } from "@/lib/langchain/models";
import type { SpendCubeStateType, AgentTask, AgentType } from "@/types";
import { detectRelevantSkills } from "@/skills";

/**
 * Planning system prompt
 */
const PLANNING_SYSTEM_PROMPT = `You are the SpendCube Supervisor Planner, responsible for decomposing complex tasks into executable steps.

## Your Role
Analyze user requests and current state to create an execution plan for the multi-agent system.

## Available Agents
1. **extraction** - Extract and structure raw data
2. **cleansing** - Clean and validate data quality
3. **normalization** - Standardize vendor names and categories
4. **classification** - Classify to UNSPSC codes
5. **qa** - Quality assurance and validation
6. **enrichment** - Add business context and insights
7. **analysis** - Perform spend analysis (savings, risk, trends)

## Planning Guidelines
1. Order tasks by dependencies (extract before classify)
2. Identify parallel opportunities (cleansing and normalization can run together)
3. Skip unnecessary steps based on data quality
4. Include QA at appropriate checkpoints
5. Consider token budget constraints

## Task Priority
- critical: Must complete, blocks other work
- high: Important for quality
- normal: Standard processing
- low: Nice to have, can skip if needed

## Output Format
Return a JSON plan with ordered tasks and dependencies.`;

/**
 * Execution plan for processing records
 */
export interface ExecutionPlan {
  planId: string;
  tasks: AgentTask[];
  dependencies: Record<string, string[]>; // taskId -> prerequisite taskIds
  parallelGroups: string[][]; // Groups of tasks that can run in parallel
  estimatedTokens: number;
  createdAt: string;
}

/**
 * Create an execution plan based on current state and user request
 */
export async function createExecutionPlan(
  state: SpendCubeStateType,
  userRequest: string
): Promise<ExecutionPlan> {
  const { inputRecords, classifications, qaResults } = state;

  const planId = uuidv4();
  const tasks: AgentTask[] = [];
  const dependencies: Record<string, string[]> = {};
  const parallelGroups: string[][] = [];

  // Determine what needs to be done
  const needsExtraction = inputRecords.length > 0 && !hasBeenExtracted(state);
  const needsCleansing = inputRecords.length > 0;
  const needsNormalization = inputRecords.length > 0;
  const needsClassification = inputRecords.length > 0 && classifications.length < inputRecords.length;
  const needsQA = classifications.length > 0 && qaResults.length < classifications.length;
  const needsEnrichment = classifications.length > 0;
  const needsAnalysis = /analyz|savings|risk|trend|insight/i.test(userRequest);

  // Detect relevant skills for classification context
  const skills = detectRelevantSkills(inputRecords);

  // Build task list based on needs
  if (needsExtraction) {
    const extractionTask = createTask("classification", "extraction", "Extract structured data from raw records", {
      recordCount: inputRecords.length,
    });
    tasks.push(extractionTask);
  }

  // Cleansing and normalization can run in parallel
  const parallelGroup1: string[] = [];

  if (needsCleansing) {
    const cleansingTask = createTask("classification", "cleansing", "Clean and validate data quality", {
      recordCount: inputRecords.length,
    });
    tasks.push(cleansingTask);
    parallelGroup1.push(cleansingTask.id);

    if (needsExtraction) {
      dependencies[cleansingTask.id] = [tasks[0].id]; // Depends on extraction
    }
  }

  if (needsNormalization) {
    const normalizationTask = createTask("classification", "normalization", "Standardize vendor names and categories", {
      recordCount: inputRecords.length,
    });
    tasks.push(normalizationTask);
    parallelGroup1.push(normalizationTask.id);

    if (needsExtraction) {
      dependencies[normalizationTask.id] = [tasks[0].id];
    }
  }

  if (parallelGroup1.length > 1) {
    parallelGroups.push(parallelGroup1);
  }

  // Classification depends on cleansing/normalization
  if (needsClassification) {
    const classificationTask = createTask("classification", "classification", "Classify records to UNSPSC codes", {
      recordCount: inputRecords.length - classifications.length,
      skills: skills.map((s) => s.id),
    });
    tasks.push(classificationTask);

    const prerequisiteIds = parallelGroup1.length > 0 ? parallelGroup1 : [];
    if (prerequisiteIds.length > 0) {
      dependencies[classificationTask.id] = prerequisiteIds;
    }
  }

  // QA depends on classification
  if (needsQA || needsClassification) {
    const qaTask = createTask("qa", "qa", "Validate classification quality", {
      classificationCount: needsClassification
        ? inputRecords.length
        : classifications.length,
    });
    tasks.push(qaTask);

    if (needsClassification) {
      const classificationTaskId = tasks.find((t) => t.description.includes("Classify"))?.id;
      if (classificationTaskId) {
        dependencies[qaTask.id] = [classificationTaskId];
      }
    }
  }

  // Enrichment can run after classification
  if (needsEnrichment) {
    const enrichmentTask = createTask("classification", "enrichment", "Add business context and insights", {
      recordCount: classifications.length,
    });
    tasks.push(enrichmentTask);

    const qaTaskId = tasks.find((t) => t.description.includes("quality"))?.id;
    if (qaTaskId) {
      dependencies[enrichmentTask.id] = [qaTaskId];
    }
  }

  // Analysis at the end if requested
  if (needsAnalysis) {
    const analysisTask = createTask("analysis", "analysis", "Perform spend analysis", {
      analysisType: inferAnalysisType(userRequest),
    });
    tasks.push(analysisTask);

    // Depends on everything else being done
    const allPreviousTasks = tasks.slice(0, -1).map((t) => t.id);
    if (allPreviousTasks.length > 0) {
      dependencies[analysisTask.id] = allPreviousTasks;
    }
  }

  // Estimate token usage
  const estimatedTokens = estimateTokenUsage(tasks);

  return {
    planId,
    tasks,
    dependencies,
    parallelGroups,
    estimatedTokens,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a task
 */
function createTask(
  agentType: AgentType,
  taskType: string,
  description: string,
  payload: Record<string, unknown>,
  priority: AgentTask["priority"] = "normal"
): AgentTask {
  return {
    id: uuidv4(),
    type: agentType,
    description,
    payload: { ...payload, taskType },
    priority,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Check if extraction has been performed
 */
function hasBeenExtracted(state: SpendCubeStateType): boolean {
  // Check if records have been modified from raw input
  // This is a heuristic - in production, track extraction explicitly
  return false;
}

/**
 * Infer analysis type from user request
 */
function inferAnalysisType(request: string): string {
  const requestLower = request.toLowerCase();

  if (/savings|cost|reduc|optimi/i.test(requestLower)) {
    return "savings";
  }
  if (/risk|compliance|audit/i.test(requestLower)) {
    return "risk";
  }
  if (/trend|pattern|forecast/i.test(requestLower)) {
    return "trend";
  }
  if (/benchmark|compar/i.test(requestLower)) {
    return "benchmark";
  }

  return "spend_summary";
}

/**
 * Estimate token usage for tasks
 */
function estimateTokenUsage(tasks: AgentTask[]): number {
  const tokenEstimates: Record<string, number> = {
    extraction: 500,
    cleansing: 400,
    normalization: 300,
    classification: 800,
    qa: 600,
    enrichment: 700,
    analysis: 1500,
  };

  return tasks.reduce((total, task) => {
    const taskType = task.payload.taskType as string;
    const baseEstimate = tokenEstimates[taskType] || 500;
    const recordMultiplier = ((task.payload.recordCount as number) || 1) * 0.1;
    return total + baseEstimate + recordMultiplier;
  }, 0);
}

/**
 * Get next executable tasks from plan
 */
export function getNextTasks(
  plan: ExecutionPlan,
  completedTaskIds: string[]
): AgentTask[] {
  return plan.tasks.filter((task) => {
    // Already completed
    if (completedTaskIds.includes(task.id)) {
      return false;
    }

    // Check dependencies
    const taskDeps = plan.dependencies[task.id] || [];
    const allDepsCompleted = taskDeps.every((depId) =>
      completedTaskIds.includes(depId)
    );

    return allDepsCompleted;
  });
}

/**
 * Check if plan is complete
 */
export function isPlanComplete(
  plan: ExecutionPlan,
  completedTaskIds: string[]
): boolean {
  return plan.tasks.every((task) => completedTaskIds.includes(task.id));
}

/**
 * Generate plan using AI for complex requests
 */
export async function generateAIPlan(
  state: SpendCubeStateType,
  userRequest: string
): Promise<ExecutionPlan> {
  const model = createSupervisorModel();

  const stateContext = `
Current State:
- Input Records: ${state.inputRecords.length}
- Classifications: ${state.classifications.length}
- QA Results: ${state.qaResults.length}
- HITL Queue: ${state.hitlQueue.length}
- Stage: ${state.stage}
`;

  const prompt = `Create an execution plan for this request:

User Request: ${userRequest}

${stateContext}

Return JSON:
{
  "tasks": [
    {
      "taskType": "extraction|cleansing|normalization|classification|qa|enrichment|analysis",
      "description": "task description",
      "priority": "critical|high|normal|low",
      "payload": {}
    }
  ],
  "parallelGroups": [["task indices that can run in parallel"]],
  "reasoning": "explanation of the plan"
}`;

  const messages = [
    new SystemMessage(PLANNING_SYSTEM_PROMPT),
    new HumanMessage(prompt),
  ];

  try {
    const response = await model.invoke(messages);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fall back to rule-based planning
      return createExecutionPlan(state, userRequest);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const planId = uuidv4();

    // Convert AI plan to execution plan
    const tasks: AgentTask[] = (parsed.tasks || []).map((t: { taskType: string; description: string; priority: AgentTask["priority"]; payload: Record<string, unknown> }) => ({
      id: uuidv4(),
      type: mapTaskTypeToAgentType(t.taskType),
      description: t.description,
      payload: { ...t.payload, taskType: t.taskType },
      priority: t.priority || "normal",
      createdAt: new Date().toISOString(),
    }));

    return {
      planId,
      tasks,
      dependencies: {},
      parallelGroups: parsed.parallelGroups || [],
      estimatedTokens: estimateTokenUsage(tasks),
      createdAt: new Date().toISOString(),
    };
  } catch {
    // Fall back to rule-based planning
    return createExecutionPlan(state, userRequest);
  }
}

/**
 * Map task type to agent type
 */
function mapTaskTypeToAgentType(taskType: string): AgentType {
  const mapping: Record<string, AgentType> = {
    extraction: "classification",
    cleansing: "classification",
    normalization: "classification",
    classification: "classification",
    qa: "qa",
    enrichment: "classification",
    analysis: "analysis",
  };

  return mapping[taskType] || "supervisor";
}
