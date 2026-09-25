/// <reference types="vite/client" />

declare module '/runtime/questionnaire.js' {
  export function mountQuestionnaire(element: HTMLElement, options: Record<string, unknown>): {
    destroy(): void;
    ready: Promise<unknown>;
  };
}

interface Window {
  SNSExerciseInjection: {
    exerciseStarted(detail?: Record<string, unknown>): void;
    questionAnswered(detail?: Record<string, unknown>): void;
    exerciseEnded(detail?: Record<string, unknown>): void;
    getState(): {
      started: boolean;
      ended: boolean;
      startDetail: Record<string, unknown> | null;
      answers: Record<string, unknown>[];
      endDetail: Record<string, unknown> | null;
    };
  };
}
