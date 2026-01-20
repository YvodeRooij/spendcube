"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSpendCubeStream, type ChatMessage } from "@/hooks/use-spendcube-stream";
import type { SpendRecord } from "@/types";
import { SpendCubeOutput } from "@/components/spend-cube";
import { PipelineStatus } from "@/components/pipeline";
import { HITLReviewPanel } from "@/components/hitl";

/**
 * Chat Interface Component with File Upload
 *
 * Full SpendCube functionality:
 * - Upload PDFs, Excel, CSV, images
 * - Automatic spend record extraction via Gemini
 * - UNSPSC classification
 * - QA review
 * - HITL flagging
 */
export function ChatInterface() {
  const [input, setInput] = useState("");
  const [uploadedRecords, setUploadedRecords] = useState<SpendRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [showDock, setShowDock] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    state,
    finalState,
    spendCube,
    streamingEvents,
    isLoading,
    error,
    threadId,
    sendMessage,
    reset,
  } = useSpendCubeStream({
    onError: (err) => console.error("Stream error:", err),
    onComplete: (finalState) => console.log("Complete:", finalState),
    onSpendCube: (data) => console.log("SpendCube data received:", data),
  });

  const lastMessage = useMemo(() => messages[messages.length - 1], [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (uploadedRecords.length > 0 || messages.length > 0) {
      setShowDock(true);
    }
  }, [uploadedRecords.length, messages.length]);

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    fileArray.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Upload failed");
      }

      if (result.records && result.records.length > 0) {
        setUploadedRecords((prev) => [...prev, ...result.records]);
      }

      if (result.errors && result.errors.length > 0) {
        setUploadError(`Some files had errors: ${result.errors.map((e: {filename: string; error: string}) => e.filename).join(", ")}`);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && uploadedRecords.length === 0) || isLoading) return;

    const message = input.trim() || "Please classify and analyze these spend records";
    setInput("");

    // Send with uploaded records
    await sendMessage(message, uploadedRecords.length > 0 ? uploadedRecords : undefined);

    // Clear uploaded records after sending
    if (uploadedRecords.length > 0) {
      setUploadedRecords([]);
    }
  };

  const handleReset = () => {
    reset();
    setUploadedRecords([]);
    setUploadError(null);
  };

  const clearRecords = () => {
    setUploadedRecords([]);
  };

  return (
    <div
      className="flex h-full flex-col"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-teal-600/10 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-teal-500 bg-white p-12 text-center shadow-lg dark:bg-zinc-900">
            <UploadIcon className="mx-auto h-16 w-16 text-teal-600" />
            <p className="mt-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">Drop files here</p>
            <p className="text-sm text-zinc-500">PDF, Excel, CSV, or images</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                SpendCube
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Procurement Analytics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-zinc-400">
              {threadId.slice(0, 8)}
            </span>
            <button
              onClick={handleReset}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              New Session
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 && uploadedRecords.length === 0 ? (
          <WelcomeScreen
            onFileSelect={() => fileInputRef.current?.click()}
            onExampleClick={setInput}
            onTalkToAgent={() => {
              setShowDock(true);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {/* Pipeline Status - Real-time tool call updates */}
            {(isLoading || streamingEvents.nodeStatuses.size > 0) && (
              <PipelineStatus events={streamingEvents} isLoading={isLoading} />
            )}
            {/* HITL Review Panel - shown when items need human review */}
            {!isLoading && (state?.hitlQueueCount ?? 0) > 0 && (
              <div className="mt-4">
                <HITLReviewPanel
                  threadId={threadId}
                  itemCount={state?.hitlQueueCount ?? 0}
                  onDecisionMade={() => {
                    // Could refresh state here if needed
                  }}
                />
              </div>
            )}
            {/* Spend Cube Output - McKinsey-quality display */}
            {spendCube && !isLoading && (
              <div className="mt-6">
                <SpendCubeOutput data={spendCube} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Uploaded Records Preview - hidden when agents are running */}
      {uploadedRecords.length > 0 && !isLoading && (
        <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-100 dark:bg-teal-900/30">
                <DocumentIcon className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              </div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {uploadedRecords.length} records ready
              </span>
              <span className="rounded-md bg-teal-600 px-2 py-1 text-xs font-medium text-white">
                Press Send to classify
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUploadedRecords([])}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Clear
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400"
              >
                + Add more
              </button>
            </div>
          </div>
          <div className="mt-3 max-h-32 overflow-y-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {uploadedRecords.slice(0, 5).map((record) => (
                  <tr key={record.id} className="border-b border-zinc-50 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                    <td className="px-3 py-1.5 truncate max-w-[150px]">{record.vendor}</td>
                    <td className="px-3 py-1.5 truncate max-w-[200px] text-zinc-500">{record.description}</td>
                    <td className="px-3 py-1.5 text-right font-mono">${record.amount.toLocaleString()}</td>
                  </tr>
                ))}
                {uploadedRecords.length > 5 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-center text-zinc-400">
                      + {uploadedRecords.length - 5} more records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status Bar */}
      {(state || finalState) && (
        <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-2 dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            {state && (
              <>
                <span>Stage: {state.stage}</span>
                <span>Classifications: {state.classificationsCount}</span>
                <span>QA: {state.qaResultsCount}</span>
                <span>HITL: {state.hitlQueueCount}</span>
              </>
            )}
            {finalState && !isLoading && (
              <span className="text-green-600 dark:text-green-400">
                Done ({finalState.classificationsCount} classified, {finalState.hitlQueueCount} flagged)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {(error || uploadError) && (
        <div className="border-t border-red-200 bg-red-50 px-6 py-3 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">
            {error?.message || uploadError}
          </p>
        </div>
      )}

      {/* Command Dock */}
      {(showDock || messages.length > 0 || uploadedRecords.length > 0) && (
        <div className="border-t border-zinc-200 bg-gradient-to-t from-white to-white/80 p-4 dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900/70">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-4xl">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3 px-2 pb-2">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {lastMessage && lastMessage.type !== "human"
                    ? "Awaiting your response — reply below"
                    : "Ask the procurement agent or generate the spend cube"}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isLoading}
                  className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {isUploading ? (
                    <>
                      <LoadingSpinner />
                      Processing...
                    </>
                  ) : (
                    <>
                      <UploadIcon className="h-4 w-4" />
                      Upload files
                    </>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                  <AgentIcon className="h-4 w-4" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    uploadedRecords.length > 0
                      ? "Add instructions or press Generate..."
                      : "Ask the agent about your spend data..."
                  }
                  disabled={isLoading || isUploading}
                  className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-teal-400 dark:disabled:bg-zinc-900"
                />
                <button
                  type="submit"
                  disabled={isLoading || isUploading || (!input.trim() && uploadedRecords.length === 0)}
                  className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? "Generating..." : "Generate"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * Welcome screen with file upload
 */
function WelcomeScreen({
  onFileSelect,
  onExampleClick,
  onTalkToAgent,
}: {
  onFileSelect: () => void;
  onExampleClick: (text: string) => void;
  onTalkToAgent: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-start overflow-y-auto px-4 py-10 text-center">
      <div className="w-full max-w-5xl space-y-10">
        <div className="space-y-3">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
            Source-of-Truth Spend Cube
          </div>
          <h2 className="font-display text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            Procurement Analytics that turns messy spend into clarity
          </h2>
          <p className="mx-auto max-w-2xl text-zinc-500 dark:text-zinc-400">
            Leaders like Sievo and SpendHQ build a structured, multi-dimensional spend cube to answer who is buying what from whom—and at what price.
          </p>
        </div>

        {/* Single primary action */}
        <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-8 text-left shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 text-white">
              <UploadIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Upload spend files</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Excel, CSV, PDF invoices, or images</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={onFileSelect}
              className="rounded-full bg-teal-600 px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-700"
            >
              Choose files
            </button>
            <button
              onClick={onTalkToAgent}
              className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300"
            >
              Talk to procurement agent
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <FeatureCard icon={<ExtractIcon />} title="Extract" description="Parse data from any document format" />
            <FeatureCard icon={<ClassifyIcon />} title="Classify" description="UNSPSC taxonomy categorization" />
            <FeatureCard icon={<AnalyzeIcon />} title="Analyze" description="Identify savings and anomalies" />
          </div>
        </div>

        {/* Spend cube definition */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-left shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            What is a Spend Cube?
          </h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            A spend cube is a multi-dimensional model that organizes spend across the core dimensions: Who, What, and From Whom.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <DefinitionCard title="Who" description="Departments, business units, or cost centers buying." />
            <DefinitionCard title="What" description="Category of goods or services purchased." />
            <DefinitionCard title="From Whom" description="Suppliers and parent entities receiving payment." />
          </div>
        </div>

        {/* Process */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-left shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Step Process to Build the Spend Cube
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ProcessStep step="1" title="Data Extraction" description="ERP, e-Procurement, T&E systems" />
            <ProcessStep step="2" title="Data Cleansing" description="Deduplicate, normalize, fix errors" />
            <ProcessStep step="3" title="Supplier Normalization" description="Group aliases into parent entities" />
            <ProcessStep step="4" title="Categorization" description="Map to UNSPSC or custom taxonomy" />
            <ProcessStep step="5" title="Enrichment" description="Diversity, ESG, credit, risk data" />
            <ProcessStep step="6" title="Validation & Loading" description="Review accuracy and load analytics" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Challenges */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-left shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Common Data Challenges</h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
              <li>Fragmented ERP landscape and inconsistent formats</li>
              <li>Vague or poor line-item descriptions</li>
              <li>Maverick spend without PO or contract metadata</li>
              <li>Manual entry errors and currency inconsistencies</li>
            </ul>
          </div>

          {/* Impact */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-left shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Impact Analysis on the Cube</h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
              <li>Identify tail-spend and price variance savings</li>
              <li>Supplier consolidation opportunities</li>
              <li>Preferred vs. non-preferred compliance monitoring</li>
              <li>Risk exposure by supplier or region</li>
            </ul>
          </div>
        </div>

        {/* Agentic querying */}
        <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-6 text-left shadow-sm dark:border-teal-800 dark:bg-teal-900/20">
          <h3 className="text-sm font-semibold text-teal-900 dark:text-teal-200">Agentic Querying accelerates the build</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <AgenticCard title="Contextual Mapping" description="Infer categories from description, supplier, and history." />
            <AgenticCard title="Iterative Correction" description="Flag anomalies and request clarification in real time." />
            <AgenticCard title="Natural Language" description="Ask questions while the cube is being built." />
          </div>
        </div>

        {/* Minimal quick actions */}
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">Suggested questions</p>
          <div className="flex flex-wrap justify-center gap-2">
            <ExampleButton
              onClick={() => onExampleClick("What categories will you classify for me?")}
              text="What will you classify?"
            />
            <ExampleButton
              onClick={() => onExampleClick("How do you normalize suppliers?")}
              text="How do you normalize?"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DefinitionCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-900/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">{title}</p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{description}</p>
    </div>
  );
}

function ProcessStep({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-900/30">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
          {step}
        </span>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
    </div>
  );
}

function AgenticCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-teal-200 bg-white/80 p-4 dark:border-teal-800 dark:bg-zinc-900/40">
      <p className="text-sm font-medium text-teal-900 dark:text-teal-200">{title}</p>
      <p className="mt-2 text-xs text-teal-700/80 dark:text-teal-200/70">{description}</p>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-4 text-left dark:border-zinc-800 dark:bg-zinc-800/50">
      <div className="text-teal-600 dark:text-teal-400">{icon}</div>
      <h3 className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</h3>
      <p className="mt-1 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.type === "human";
  const isSystem = message.type === "system";
  const markdownClassName = isUser
    ? "max-w-none whitespace-pre-wrap text-sm text-white"
    : isSystem
    ? "max-w-none whitespace-pre-wrap text-sm text-amber-800 dark:text-amber-200"
    : "max-w-none whitespace-pre-wrap text-sm text-zinc-900 dark:text-zinc-50";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
          isUser
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : isSystem
            ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
        }`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          className={markdownClassName}
          components={{
            p: ({ children }) => <p className="my-2 text-sm leading-6">{children}</p>,
            ul: ({ children }) => <ul className="my-2 list-disc pl-5 text-sm">{children}</ul>,
            ol: ({ children }) => <ol className="my-2 list-decimal pl-5 text-sm">{children}</ol>,
            li: ({ children }) => <li className="my-1">{children}</li>,
            h1: ({ children }) => <h1 className="my-2 text-lg font-semibold">{children}</h1>,
            h2: ({ children }) => <h2 className="my-2 text-base font-semibold">{children}</h2>,
            h3: ({ children }) => <h3 className="my-2 text-sm font-semibold">{children}</h3>,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            table: ({ children }) => (
              <div className="my-2 overflow-x-auto">
                <table className="w-full border-collapse text-sm">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-zinc-50 dark:bg-zinc-800">{children}</thead>,
            th: ({ children }) => (
              <th className="border border-zinc-200 px-2 py-1 text-left text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                {children}
              </td>
            ),
            hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-700" />,
            blockquote: ({ children }) => (
              <blockquote className="my-2 border-l-2 border-teal-500 pl-3 text-sm text-zinc-600 dark:text-zinc-300">
                {children}
              </blockquote>
            ),
            code: ({ children }) => (
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {children}
              </code>
            ),
          }}
        >
          {message.content}
        </ReactMarkdown>
        <p
          className={`mt-1 text-xs ${
            isUser
              ? "text-zinc-400 dark:text-zinc-500"
              : isSystem
              ? "text-amber-600 dark:text-amber-400"
              : "text-zinc-400"
          }`}
        >
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

function ExampleButton({ onClick, text }: { onClick: () => void; text: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
    >
      {text}
    </button>
  );
}

function LoadingSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function UploadIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function DocumentIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ExtractIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ClassifyIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function AnalyzeIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function AgentIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a7 7 0 017 7v1a2 2 0 002 2v3a2 2 0 01-2 2h-1a2 2 0 00-2 2v1a2 2 0 01-2 2H10a2 2 0 01-2-2v-1a2 2 0 00-2-2H5a2 2 0 01-2-2v-3a2 2 0 002-2v-1a7 7 0 017-7z" />
      <circle cx="9" cy="11" r="1" />
      <circle cx="15" cy="11" r="1" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15h6" />
    </svg>
  );
}

function CanvasHint({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-900/30">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
    </div>
  );
}
