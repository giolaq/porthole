import { useState } from "react";
import type { HumanQuestion } from "portholejs/protocol";

export function QuestionBanner({
  question,
  onAnswer,
}: {
  question: HumanQuestion;
  onAnswer: (text: string) => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  return (
    <section
      data-testid="question-banner"
      style={{
        padding: 12,
        margin: "8px 16px",
        background: "#27354a",
        border: "1px solid #5c86b4",
        borderRadius: 8,
      }}
    >
      <strong>🤖 Agent asks:</strong> {question.text}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {question.options?.map((option) => (
          <button key={option} onClick={() => void onAnswer(option)}>
            {option}
          </button>
        ))}
        <input
          aria-label="Your answer"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Type an answer"
          style={{ flex: 1, minWidth: 160 }}
        />
        <button onClick={() => void onAnswer(answer)} disabled={!answer.trim()}>
          Answer
        </button>
      </div>
    </section>
  );
}
