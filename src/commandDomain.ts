import type { JsonValue } from "./itemDomain";

export interface ProcessedCommand {
  key: string;
  processedAt: number;
  result: JsonValue;
}
