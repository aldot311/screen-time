export {
  computeMetrics,
  frameSamples,
  framesToSegments,
  centreWeight,
  prominenceScore,
  MAX_GAP_FRAMES,
  AREA_SATURATION,
  PROMINENCE_WEIGHTS,
  type FrameSample,
} from "./compute";
export { checkTerm, checkTerms, clipSegments, clock, disclosureWhere } from "./rules";
export { findDisclosures, findMentions, tokenize, type TranscriptTurn } from "./mentions";
