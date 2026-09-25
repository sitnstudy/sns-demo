(function installExerciseLifecycleInjection(global) {
  if (global.SNSExerciseInjection) return;

  let active = false;
  let ended = false;
  const answeredQuestions = new Set();
  const answers = [];
  let startDetail = null;
  let endDetail = null;
  let sessionId = null;

  function withSession(detail) {
    if (!sessionId) {
      sessionId = global.crypto?.randomUUID?.() || `sns-demo-${Date.now()}`;
    }
    return { ...detail, sessionId };
  }

  function publish(type, message, detail) {
    console.log(message);
    global.dispatchEvent(new CustomEvent(`sns:${type}`, { detail }));
  }

  global.SNSExerciseInjection = Object.freeze({
    exerciseStarted(detail = {}) {
      active = true;
      ended = false;
      answeredQuestions.clear();
      answers.length = 0;
      endDetail = null;
      sessionId = null;
      startDetail = withSession(detail);
      publish('exercise-started', 'exercise started', startDetail);
    },

    questionAnswered(detail = {}) {
      if (!active || ended) return;
      const questionId = String(detail.questionId ?? detail.index ?? answeredQuestions.size + 1);
      if (answeredQuestions.has(questionId)) return;
      answeredQuestions.add(questionId);
      const answerDetail = withSession(detail);
      answers.push(answerDetail);
      publish('question-answered', 'question answered', answerDetail);
    },

    exerciseEnded(detail = {}) {
      if (!active || ended) return;
      ended = true;
      active = false;
      endDetail = withSession(detail);
      publish('exercise-ended', 'exercise ended', endDetail);
    },

    getState() {
      return {
        started: Boolean(startDetail),
        ended,
        startDetail: startDetail && { ...startDetail },
        answers: answers.map(answer => ({ ...answer })),
        endDetail: endDetail && { ...endDetail }
      };
    }
  });
})(window);
