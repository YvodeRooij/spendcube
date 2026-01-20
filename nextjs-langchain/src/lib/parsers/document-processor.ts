import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import * as XLSX from "xlsx";
import type { SpendRecord } from "@/types";

/**
 * Document Processor using Gemini's multimodal capabilities
 *
 * Leverages Gemini 3's native document understanding for:
 * - PDF invoice/receipt parsing with OCR
 * - Excel/CSV intelligent data extraction
 * - Image-based document analysis
 *
 * Reference: https://ai.google.dev/gemini-api/docs/document-processing
 */

const EXTRACTION_PROMPT = `You are a procurement data extraction specialist. Analyze this document and extract all spend/purchase records.

For each transaction/line item found, extract:
- vendor: Company/supplier name
- description: Item or service description
- amount: Dollar amount (numeric only, no symbols)
- date: Date in YYYY-MM-DD format
- department: Department if mentioned (optional)
- poNumber: Purchase order number if present (optional)
- invoiceNumber: Invoice number if present (optional)

IMPORTANT:
- Extract ALL line items, not just summaries
- For invoices with multiple items, create separate records
- Convert all amounts to positive numbers
- Use the document date if line item dates aren't specified
- If vendor isn't clear, use the company name from the letterhead/header

Return a JSON array of records:
[
  {
    "vendor": "string",
    "description": "string",
    "amount": number,
    "date": "YYYY-MM-DD",
    "department": "string or null",
    "poNumber": "string or null",
    "invoiceNumber": "string or null"
  }
]

Return ONLY the JSON array, no other text.`;

const EXCEL_ANALYSIS_PROMPT = `Analyze this spreadsheet data and identify spend/purchase records.

The data contains these columns: {columns}

Sample rows:
{sampleData}

Identify which columns map to:
- vendor (supplier/payee name)
- description (item/service description)
- amount (cost/price/total)
- date (transaction/invoice date)
- department (optional)
- poNumber (optional)
- invoiceNumber (optional)

Return a JSON object with the column mappings:
{
  "vendor": "column_name or null",
  "description": "column_name or null",
  "amount": "column_name or null",
  "date": "column_name or null",
  "department": "column_name or null",
  "poNumber": "column_name or null",
  "invoiceNumber": "column_name or null"
}

Return ONLY the JSON object, no other text.`;

/**
 * Create a Gemini model for document processing
 */
function createDocumentModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is required for document processing");
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: "gemini-3-flash-preview",
    temperature: 0.1,
    maxOutputTokens: 8192,
  });
}

/**
 * Process a PDF document using Gemini's native PDF understanding
 */
export async function processPDFWithGemini(buffer: Buffer, filename: string): Promise<SpendRecord[]> {
  const model = createDocumentModel();
  const base64Data = buffer.toString("base64");

  const message = new HumanMessage({
    content: [
      {
        type: "text",
        text: EXTRACTION_PROMPT,
      },
      {
        type: "image_url",
        image_url: {
          url: `data:application/pdf;base64,${base64Data}`,
        },
      },
    ],
  });

  try {
    const response = await model.invoke([message]);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("No JSON array found in Gemini response for PDF:", filename);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return parsed.map((item: Record<string, unknown>) => ({
      id: uuidv4(),
      vendor: String(item.vendor || "Unknown Vendor"),
      description: String(item.description || "No description"),
      amount: Math.abs(Number(item.amount) || 0),
      date: String(item.date || new Date().toISOString().split("T")[0]),
      department: item.department ? String(item.department) : undefined,
      poNumber: item.poNumber ? String(item.poNumber) : undefined,
      invoiceNumber: item.invoiceNumber ? String(item.invoiceNumber) : undefined,
      rawText: `Extracted from: ${filename}`,
    }));
  } catch (error) {
    console.error("Error processing PDF with Gemini:", error);
    throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Process an image (receipt, invoice scan) using Gemini's vision
 */
export async function processImageWithGemini(buffer: Buffer, mimeType: string, filename: string): Promise<SpendRecord[]> {
  const model = createDocumentModel();
  const base64Data = buffer.toString("base64");

  const message = new HumanMessage({
    content: [
      {
        type: "text",
        text: EXTRACTION_PROMPT,
      },
      {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${base64Data}`,
        },
      },
    ],
  });

  try {
    const response = await model.invoke([message]);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("No JSON array found in Gemini response for image:", filename);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return parsed.map((item: Record<string, unknown>) => ({
      id: uuidv4(),
      vendor: String(item.vendor || "Unknown Vendor"),
      description: String(item.description || "No description"),
      amount: Math.abs(Number(item.amount) || 0),
      date: String(item.date || new Date().toISOString().split("T")[0]),
      department: item.department ? String(item.department) : undefined,
      poNumber: item.poNumber ? String(item.poNumber) : undefined,
      invoiceNumber: item.invoiceNumber ? String(item.invoiceNumber) : undefined,
      rawText: `Extracted from: ${filename}`,
    }));
  } catch (error) {
    console.error("Error processing image with Gemini:", error);
    throw new Error(`Failed to process image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Process Excel/CSV using Gemini for intelligent column mapping
 */
export async function processExcelWithGemini(buffer: Buffer, filename: string): Promise<SpendRecord[]> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const allRecords: SpendRecord[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (data.length === 0) continue;

    const headers = Object.keys(data[0]);
    const sampleData = data.slice(0, 3);

    // Use Gemini to intelligently map columns
    const model = createDocumentModel();
    const prompt = EXCEL_ANALYSIS_PROMPT
      .replace("{columns}", headers.join(", "))
      .replace("{sampleData}", JSON.stringify(sampleData, null, 2));

    try {
      const response = await model.invoke([new HumanMessage(prompt)]);
      const content = typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn("No column mapping found for sheet:", sheetName);
        continue;
      }

      const mapping = JSON.parse(jsonMatch[0]);

      // Extract records using the AI-detected mapping
      for (const row of data) {
        const vendor = mapping.vendor ? String(row[mapping.vendor] || "").trim() : "";
        const description = mapping.description ? String(row[mapping.description] || "").trim() : "";
        const amountRaw = mapping.amount ? row[mapping.amount] : 0;
        const amount = typeof amountRaw === "number" ? Math.abs(amountRaw) : Math.abs(parseFloat(String(amountRaw).replace(/[$,]/g, "")) || 0);

        if ((!vendor && !description) || amount === 0) continue;

        const dateRaw = mapping.date ? row[mapping.date] : null;
        let date = new Date().toISOString().split("T")[0];
        if (dateRaw) {
          if (dateRaw instanceof Date) {
            date = dateRaw.toISOString().split("T")[0];
          } else if (typeof dateRaw === "string") {
            const parsed = new Date(dateRaw);
            if (!isNaN(parsed.getTime())) {
              date = parsed.toISOString().split("T")[0];
            }
          } else if (typeof dateRaw === "number") {
            // Excel serial date
            const excelDate = XLSX.SSF.parse_date_code(dateRaw);
            if (excelDate) {
              date = `${excelDate.y}-${String(excelDate.m).padStart(2, "0")}-${String(excelDate.d).padStart(2, "0")}`;
            }
          }
        }

        allRecords.push({
          id: uuidv4(),
          vendor: vendor || "Unknown Vendor",
          description: description || "No description",
          amount,
          date,
          department: mapping.department ? String(row[mapping.department] || "").trim() || undefined : undefined,
          poNumber: mapping.poNumber ? String(row[mapping.poNumber] || "").trim() || undefined : undefined,
          invoiceNumber: mapping.invoiceNumber ? String(row[mapping.invoiceNumber] || "").trim() || undefined : undefined,
          rawText: `Sheet: ${sheetName}, File: ${filename}`,
        });
      }
    } catch (error) {
      console.error("Error processing Excel with Gemini:", error);
      // Fallback to basic parsing
      const records = parseExcelBasic(data, filename, sheetName);
      allRecords.push(...records);
    }
  }

  return allRecords;
}

/**
 * Basic Excel parsing fallback
 */
function parseExcelBasic(data: Record<string, unknown>[], filename: string, sheetName: string): SpendRecord[] {
  const records: SpendRecord[] = [];
  const headers = Object.keys(data[0] || {}).map(h => h.toLowerCase());

  const vendorIdx = headers.findIndex(h => h.includes("vendor") || h.includes("supplier"));
  const descIdx = headers.findIndex(h => h.includes("desc") || h.includes("item"));
  const amountIdx = headers.findIndex(h => h.includes("amount") || h.includes("total") || h.includes("cost"));
  const dateIdx = headers.findIndex(h => h.includes("date"));

  const actualHeaders = Object.keys(data[0] || {});

  for (const row of data) {
    const values = Object.values(row);
    const vendor = vendorIdx >= 0 ? String(values[vendorIdx] || "") : "";
    const description = descIdx >= 0 ? String(values[descIdx] || "") : "";
    const amountRaw = amountIdx >= 0 ? values[amountIdx] : 0;
    const amount = typeof amountRaw === "number" ? Math.abs(amountRaw) : Math.abs(parseFloat(String(amountRaw).replace(/[$,]/g, "")) || 0);

    if ((!vendor && !description) || amount === 0) continue;

    records.push({
      id: uuidv4(),
      vendor: vendor || "Unknown",
      description: description || "No description",
      amount,
      date: new Date().toISOString().split("T")[0],
      rawText: `Sheet: ${sheetName}, File: ${filename}`,
    });
  }

  return records;
}

/**
 * Process CSV file
 */
export async function processCSVWithGemini(buffer: Buffer, filename: string): Promise<SpendRecord[]> {
  // CSV is just a special case of Excel for xlsx library
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return processExcelWithGemini(buffer, filename);
}

/**
 * Main document processor - routes to appropriate handler
 */
export async function processDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<SpendRecord[]> {
  const lowerFilename = filename.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  if (lowerMime === "application/pdf" || lowerFilename.endsWith(".pdf")) {
    return processPDFWithGemini(buffer, filename);
  }

  if (
    lowerMime.includes("spreadsheet") ||
    lowerMime.includes("excel") ||
    lowerMime === "application/vnd.ms-excel" ||
    lowerMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    lowerFilename.endsWith(".xlsx") ||
    lowerFilename.endsWith(".xls")
  ) {
    return processExcelWithGemini(buffer, filename);
  }

  if (
    lowerMime === "text/csv" ||
    lowerMime === "application/csv" ||
    lowerFilename.endsWith(".csv")
  ) {
    return processCSVWithGemini(buffer, filename);
  }

  if (lowerMime.startsWith("image/")) {
    return processImageWithGemini(buffer, mimeType, filename);
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Supported file types
 */
export const SUPPORTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

export const ACCEPTED_FILE_EXTENSIONS = Object.values(SUPPORTED_FILE_TYPES).flat().join(",");
export const ACCEPTED_MIME_TYPES = Object.keys(SUPPORTED_FILE_TYPES).join(",");
