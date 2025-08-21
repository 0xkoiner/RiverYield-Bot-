export const SCORE_CONFIG = {
  inputDir: "src/parser/data",   // read per-parser files from here
  outputDir: "src/score/data",   // write TOP{N} files here
  topN: 10                       // ← set 10, 25, 50, etc.
} as const;