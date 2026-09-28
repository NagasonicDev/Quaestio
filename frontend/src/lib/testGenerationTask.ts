import { useSyncExternalStore } from "react";
import type { GeneratedTestMeta } from "../api/types";

export type TestGenerationPhase = "selecting" | "hydrating" | "paper" | "preview" | "saving";

export interface TestGenerationTask {
  courseId: string;
  status: "running" | "complete" | "failed";
  phase: TestGenerationPhase;
  startedAt: number;
  questionCount: number;
  completedQuestions: number;
  estimatedSeconds: number;
  result?: GeneratedTestMeta;
  error?: string;
}

let task: TestGenerationTask | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function useTestGenerationTask(): TestGenerationTask | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => task,
    () => null,
  );
}

export function beginTestGeneration(next: TestGenerationTask) {
  task = next;
  notify();
}

export function updateTestGeneration(patch: Partial<TestGenerationTask>) {
  if (!task) return;
  task = { ...task, ...patch };
  notify();
}

export function dismissTestGeneration() {
  task = null;
  notify();
}
