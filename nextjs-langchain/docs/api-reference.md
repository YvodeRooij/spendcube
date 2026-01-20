# SpendCube AI - API Reference

## Overview

SpendCube AI provides a RESTful API for spend classification, analysis, and human-in-the-loop review workflows.

## Base URL

```
http://localhost:3000/api
```

---

## Endpoints

### Chat API

#### POST /api/chat

Stream a conversation with the SpendCube AI agent.

**Request Body:**
```json
{
  "message": "string",
  "sessionId": "string (optional)",
  "threadId": "string (optional)"
}
```

**Response:** Server-Sent Events (SSE) stream

**Event Types:**
- `message` - AI response text
- `classification` - Classification result
- `qa` - QA evaluation result
- `hitl` - HITL item created
- `complete` - Processing complete
- `error` - Error occurred

**Example:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Classify my spend data", "sessionId": "abc123"}'
```

---

### File Upload

#### POST /api/upload

Upload Excel, CSV, or PDF files for processing.

**Request:** `multipart/form-data`

**Fields:**
- `file` - The file to upload (required)
- `sessionId` - Session ID for tracking (optional)

**Supported Formats:**
- Excel: `.xlsx`, `.xls`
- CSV: `.csv`
- PDF: `.pdf` (via Gemini multimodal)
- Images: `.png`, `.jpg`, `.jpeg`

**Response:**
```json
{
  "success": true,
  "records": [
    {
      "id": "rec-001",
      "vendor": "Dell Technologies",
      "description": "Laptop computer",
      "amount": 1500,
      "date": "2024-01-15",
      "department": "IT"
    }
  ],
  "recordCount": 10,
  "sessionId": "abc123"
}
```

---

### Graph Execution

#### POST /api/graph

Execute the LangGraph workflow directly.

**Request Body:**
```json
{
  "message": "string",
  "records": [
    {
      "id": "string",
      "vendor": "string",
      "description": "string",
      "amount": "number",
      "date": "string",
      "department": "string (optional)",
      "poNumber": "string (optional)"
    }
  ],
  "sessionId": "string",
  "threadId": "string (optional)"
}
```

**Response:** SSE stream with workflow state updates

---

### HITL Queue

#### GET /api/hitl/queue

Get pending human-in-the-loop review items.

**Query Parameters:**
- `sessionId` - Filter by session (optional)
- `status` - Filter by status: `pending`, `in_review`, `resolved` (optional)
- `priority` - Filter by priority: `high`, `medium`, `low` (optional)

**Response:**
```json
{
  "items": [
    {
      "id": "hitl-001",
      "recordId": "rec-001",
      "reason": "low_confidence",
      "priority": "high",
      "status": "pending",
      "createdAt": "2024-01-15T10:00:00Z",
      "context": {
        "vendor": "Unknown Vendor",
        "description": "Misc expense",
        "amount": 500
      },
      "suggestedCode": "43211500",
      "suggestedTitle": "Personal computers",
      "confidence": 45
    }
  ],
  "totalCount": 5,
  "pendingCount": 3
}
```

---

### HITL Decision

#### POST /api/hitl/decision

Submit a human decision for a HITL item.

**Request Body:**
```json
{
  "itemId": "string",
  "action": "approve" | "modify" | "reject" | "escalate",
  "selectedCode": "string (required for modify)",
  "selectedTitle": "string (optional)",
  "notes": "string (optional)",
  "decidedBy": "string"
}
```

**Response:**
```json
{
  "success": true,
  "decision": {
    "itemId": "hitl-001",
    "recordId": "rec-001",
    "action": "modify",
    "selectedCode": "43211501",
    "selectedTitle": "Notebook computers",
    "decidedBy": "reviewer@company.com",
    "decidedAt": "2024-01-15T11:00:00Z"
  },
  "correction": {
    "id": "corr-001",
    "logged": true
  }
}
```

---

### Training Data

#### GET /api/training/corrections

Export correction data for model training.

**Query Parameters:**
- `format` - Export format: `json` (default) or `jsonl`
- `since` - Filter corrections after date (ISO 8601)
- `action` - Filter by action type: `modify`, `reject`

**Response (JSON format):**
```json
{
  "version": "1.0",
  "exportedAt": "2024-01-15T12:00:00Z",
  "count": 25,
  "examples": [
    {
      "input": {
        "vendor": "Dell Technologies",
        "description": "Laptop computer",
        "amount": 1500
      },
      "originalOutput": {
        "unspscCode": "43211500",
        "confidence": 65
      },
      "expectedOutput": {
        "unspscCode": "43211502",
        "unspscTitle": "Notebook computers"
      },
      "metadata": {
        "correctionId": "corr-001",
        "decidedBy": "reviewer",
        "reason": "low_confidence"
      }
    }
  ]
}
```

---

### Evaluation

#### GET /api/evaluation

Get pipeline evaluation metrics.

**Query Parameters:**
- `sessionId` - Evaluate specific session (optional)

**Response:**
```json
{
  "score": 82.5,
  "grade": "B",
  "metrics": {
    "classification": {
      "totalRecords": 100,
      "classifiedRecords": 98,
      "classificationRate": 98,
      "averageConfidence": 78.5,
      "confidenceDistribution": {
        "high": 65,
        "medium": 25,
        "low": 10
      }
    },
    "qa": {
      "totalEvaluated": 98,
      "approvedCount": 75,
      "flaggedCount": 18,
      "rejectedCount": 5,
      "approvalRate": 76.5
    },
    "hitl": {
      "totalItems": 23,
      "resolvedItems": 20,
      "pendingItems": 3,
      "resolutionRate": 87,
      "correctionRate": 35
    }
  },
  "issues": [
    "High rejection rate detected"
  ],
  "recommendations": [
    "Review classification prompts for rejected categories"
  ]
}
```

---

### Health Check

#### GET /api/health

Check system health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00Z",
  "version": "0.1.0",
  "components": {
    "database": {
      "status": "healthy",
      "latency": 5
    },
    "langchain": {
      "status": "healthy"
    },
    "cache": {
      "status": "healthy",
      "size": 150
    }
  },
  "metrics": {
    "uptime": 3600,
    "requestCount": 1250,
    "activeSessionCount": 12
  }
}
```

---

## Data Types

### SpendRecord

```typescript
interface SpendRecord {
  id: string;
  vendor: string;
  description: string;
  amount: number;
  date: string;
  department?: string;
  poNumber?: string;
  invoiceNumber?: string;
  glCode?: string;
}
```

### Classification

```typescript
interface Classification {
  recordId: string;
  unspscCode: string;
  unspscTitle: string;
  segment?: string;
  family?: string;
  confidence: number;  // 0-100
  reasoning: string;
  classifiedAt: string;
  classifiedBy: string;
}
```

### QAResult

```typescript
interface QAResult {
  recordId: string;
  verdict: "approved" | "flagged" | "rejected";
  qualityScore: number;  // 0-100
  reasoning: string;
  issues?: QAIssue[];
  evaluatedAt: string;
  evaluatedBy: string;
}
```

### HITLItem

```typescript
interface HITLItem {
  id: string;
  recordId: string;
  reason: "low_confidence" | "qa_flagged" | "qa_rejected" | "user_request";
  priority: "high" | "medium" | "low";
  status: "pending" | "in_review" | "resolved";
  createdAt: string;
  context: {
    vendor: string;
    description: string;
    amount: number;
  };
  suggestedCode?: string;
  suggestedTitle?: string;
  confidence?: number;
}
```

---

## Error Handling

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Request body validation failed |
| `SESSION_NOT_FOUND` | 404 | Session ID not found |
| `ITEM_NOT_FOUND` | 404 | HITL item not found |
| `FILE_TOO_LARGE` | 413 | Uploaded file exceeds limit |
| `UNSUPPORTED_FORMAT` | 415 | File format not supported |
| `RATE_LIMITED` | 429 | Too many requests |
| `MODEL_ERROR` | 500 | LLM API error |
| `PROCESSING_ERROR` | 500 | General processing error |

---

## Rate Limits

- Chat API: 60 requests/minute per session
- Upload API: 10 requests/minute per session
- HITL API: 100 requests/minute per session

---

## Authentication

Currently, the API does not require authentication. For production deployment, implement:

1. API key authentication via `X-API-Key` header
2. OAuth 2.0 for user-specific sessions
3. Session tokens for multi-turn conversations
