import { NextRequest, NextResponse } from "next/server";
import { processDocument, SUPPORTED_FILE_TYPES } from "@/lib/parsers";

export const runtime = "nodejs";
export const maxDuration = 120; // Allow longer for PDF processing

/**
 * POST /api/upload
 *
 * Upload and process documents (PDF, Excel, CSV, images)
 * Returns extracted spend records
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    const results = {
      success: true,
      totalFiles: files.length,
      processedFiles: 0,
      totalRecords: 0,
      records: [] as Awaited<ReturnType<typeof processDocument>>,
      errors: [] as { filename: string; error: string }[],
    };

    for (const file of files) {
      try {
        // Validate file type
        const mimeType = file.type || "application/octet-stream";
        const filename = file.name;

        const isSupported = Object.keys(SUPPORTED_FILE_TYPES).some(
          (mime) =>
            mimeType.includes(mime.split("/")[1]) ||
            Object.values(SUPPORTED_FILE_TYPES)
              .flat()
              .some((ext) => filename.toLowerCase().endsWith(ext))
        );

        if (!isSupported) {
          results.errors.push({
            filename,
            error: `Unsupported file type: ${mimeType}`,
          });
          continue;
        }

        // Read file buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Process document
        const records = await processDocument(buffer, filename, mimeType);

        results.records.push(...records);
        results.totalRecords += records.length;
        results.processedFiles++;
      } catch (error) {
        results.errors.push({
          filename: file.name,
          error: error instanceof Error ? error.message : "Processing failed",
        });
      }
    }

    if (results.processedFiles === 0 && results.errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "All files failed to process",
          details: results.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error: "Upload failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/upload
 *
 * Returns supported file types
 */
export async function GET() {
  return NextResponse.json({
    supportedTypes: SUPPORTED_FILE_TYPES,
    maxFileSize: "50MB",
    description: "Upload PDFs, Excel files, CSVs, or images of invoices/receipts",
  });
}
