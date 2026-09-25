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

    const runtimeUrl = new URL('runtime/questionnaire.js?v=3', document.baseURI).href;
    import(/* @vite-ignore */ runtimeUrl).then(({ mountQuestionnaire }) => {
      if (!mounted || !host.current) return;
      player = mountQuestionnaire(host.current, {
        title: 'SNS Demo · Four-question practice',
        shortTitle: 'SNS Demo',
        questions,
        search: '?mode=learn&answer-mode=typed',
        layoutControls: true,
        questionLabels: ['1', '2', '3', '4'],
        allowTryAnother: false,
        onQuestionAnswered: ({ index }: { index: number }) => {
          window.SNSExerciseInjection.questionAnswered({
            exerciseId: 'sns-demo',
            questionId: index + 1,
            index
          });
        },
        onComplete: () => {
          window.SNSExerciseInjection.exerciseEnded({
            exerciseId: 'sns-demo',
            questionCount: questions.length
          });
          onComplete();
        }
      });
      window.SNSExerciseInjection.exerciseStarted({
        exerciseId: 'sns-demo',
        questionCount: questions.length
      });
    });

    return () => {
      mounted = false;
      player?.destroy();
    };
  }, [onComplete]);

  return <main ref={host} className="demo-player" aria-label="SNS four-question demo" />;
}
