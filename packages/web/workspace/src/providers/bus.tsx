import { createEmitter, createEventBus } from "@solid-primitives/event-bus";
import type { Log, LogEvent } from "@console/core/log";
import type {} from "sst/runtime/workers";
import type {} from "sst/runtime/runtime";
import type { Events } from "sst/bus";

export const bus = createEmitter<{
  poke: {
    workspaceID: string;
  };
  log: LogEvent[];
  "log.url": string;
  "log.cleared": {
    functionID: string;
  };
  "worker.stdout": Events["worker.stdout"];
  "function.invoked": Events["function.invoked"];
  "function.success": Events["function.success"];
  "function.error": Events["function.error"];
  "cli.dev": {
    stage: string;
    app: string;
  };
}>();
