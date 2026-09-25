(function installExerciseLifecycleInjection(global) {
  if (global.SNSExerciseInjection) return;

  let active = false;
  let ended = false;
  const answeredQuestions = new Set();

  function publish(type, message, detail) {
    console.log(message);
    global.dispatchEvent(new CustomEvent(`sns:${type}`, { detail }));
  }

  global.SNSExerciseInjection = Object.freeze({
    exerciseStarted(detail = {}) {
      active = true;
      ended = false;
      answeredQuestions.clear();
      publish('exercise-started', 'exercise started', detail);
    },

    questionAnswered(detail = {}) {
      if (!active || ended) return;
      const questionId = String(detail.questionId ?? detail.index ?? answeredQuestions.size + 1);
      if (answeredQuestions.has(questionId)) return;
      answeredQuestions.add(questionId);
      publish('question-answered', 'question answered', detail);
    },

    exerciseEnded(detail = {}) {
      if (!active || ended) return;
      ended = true;
      active = false;
      publish('exercise-ended', 'exercise ended', detail);
    }
  });
})(window);
