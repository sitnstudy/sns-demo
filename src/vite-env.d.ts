/// <reference types="vite/client" />

declare module '/runtime/questionnaire.js' {
  export function mountQuestionnaire(element: HTMLElement, options: Record<string, unknown>): {
    destroy(): void;
    ready: Promise<unknown>;
  };
}
