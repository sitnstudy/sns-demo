import { useEffect, useRef } from 'react';
import q1 from '../data/q1.json';
import q5 from '../data/q5.json';
import q6 from '../data/q6.json';
import q13 from '../data/q13.json';

const questions = [q1.questions[0], q5.questions[0], q6.questions[0], q13.questions[0]];

export default function QuestionPlayer({ onComplete }: { onComplete: () => void }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    let player: { destroy(): void } | undefined;

    const runtimeUrl = '/runtime/questionnaire.js';
    import(/* @vite-ignore */ runtimeUrl).then(({ mountQuestionnaire }) => {
      if (!mounted || !host.current) return;
      player = mountQuestionnaire(host.current, {
        title: 'SNS Demo · Four-question practice',
        shortTitle: 'SNS Demo',
        questions,
        search: '?mode=learn&answer-mode=typed',
        layoutControls: true,
        questionLabels: ['Q1', 'Q5', 'Q6', 'Q13'],
        allowTryAnother: false,
        onComplete
      });
    });

    return () => {
      mounted = false;
      player?.destroy();
    };
  }, [onComplete]);

  return <main ref={host} className="demo-player" aria-label="SNS four-question demo" />;
}
