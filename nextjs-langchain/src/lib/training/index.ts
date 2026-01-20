/**
 * Training Data Collection Module
 *
 * This module handles collection and export of human corrections
 * for fine-tuning classification models.
 */

export {
  logCorrection,
  logCorrections,
  getCorrections,
  getCorrectionsByAction,
  getCorrectionsByCode,
  getCorrectionStats,
  exportTrainingData,
  exportAsJSONL,
  clearCorrections,
  getCorrectionsCount,
  type CorrectionRecord,
  type CorrectionLogEntry,
} from "./corrections";
