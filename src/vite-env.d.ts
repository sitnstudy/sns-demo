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
  };
}
