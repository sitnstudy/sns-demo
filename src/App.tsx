import { useState } from 'react';
import QuestionPlayer from './components/QuestionPlayer';

export default function App() {
  const [run, setRun] = useState(0);
  const [complete, setComplete] = useState(false);

  if (complete) {
    return (
      <main className="completion-screen">
        <img src="./quode-icon-192.png" alt="" width="72" height="72" />
        <p className="completion-kicker">SNS Demo</p>
        <h1>Demo complete</h1>
        <p>You completed all four questions.</p>
        <button
          type="button"
          onClick={() => {
            setRun(value => value + 1);
            setComplete(false);
          }}
        >
          Run the same demo again
        </button>
      </main>
    );
  }

  return <QuestionPlayer key={run} onComplete={() => setComplete(true)} />;
}
