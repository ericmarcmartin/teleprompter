import { formatTime } from '../../utils/format.js';

// Shown during the 2s inter-task gap while the mic is muted and clocks frozen.
const TransitionBuffer = ({ transitionCountdownMs }) => (
  <div className="transition-buffer" aria-live="polite">
    <div className="transition-ring">
      <svg viewBox="0 0 100 100" className="spinner-svg">
        <defs>
          <linearGradient id="spinner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C4B5FD" />
            <stop offset="50%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#14B8A6" />
          </linearGradient>
        </defs>

        {/* Background Track */}
        <circle cx="50" cy="50" r="42" className="spinner-track" />

        {/* Dynamic Progress Ring (Circumference ~ 264) */}
        <circle
          cx="50"
          cy="50"
          r="42"
          className="spinner-head"
          style={{
            strokeDashoffset: 264 * (1 - transitionCountdownMs / 2000)
          }}
        />
      </svg>

      <span>{Math.max(1, Math.ceil(transitionCountdownMs / 1000))}</span>
    </div>

    <div className="transition-copy">
      <div className="prompt-index">Next task</div>
      <div className="prompt-text prompt-text--buffer">Prepare</div>
    </div>
  </div>
);

// Shown once the final task completes naturally (not on a manual Stop):
// one-shot success ring + summary. All motion resolves to rest — no loops.
const SessionComplete = ({ totalTasks, totalDurationMs }) => (
  <div className="session-complete" role="status" aria-live="polite">
    <div className="success-ring">
      <svg viewBox="0 0 100 100" className="success-svg" aria-hidden="true">
        <defs>
          <linearGradient id="success-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C4B5FD" />
            <stop offset="50%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#14B8A6" />
          </linearGradient>
        </defs>

        {/* Faint full-circle track */}
        <circle cx="50" cy="50" r="42" className="success-track" />

        {/* Gradient arc draws once to 100% (circumference ~264) */}
        <circle cx="50" cy="50" r="42" className="success-arc" />

        {/* Check draws in after the arc completes */}
        <path d="M33 52 L45 64 L68 39" className="success-check" />
      </svg>
    </div>

    <div className="prompt-index">All {totalTasks} tasks recorded</div>
    <div className="prompt-text prompt-text--complete">Session complete</div>
    <div className="session-complete-meta">{formatTime(totalDurationMs)} total</div>
  </div>
);

// timerMs must already be the frozen value when stopped (freeze-on-stop
// invariant — this component never decides which value to show).
const TeleprompterDisplay = ({
  transitionCountdownMs,
  isRecording,
  isStopped,
  isStarting,
  isSessionComplete,
  totalTasks,
  totalDurationMs,
  countdown,
  currentPromptIndex,
  promptText,
  timerMs,
}) => (
  <div className="teleprompter-display">
    {transitionCountdownMs > 0 ? (
      <TransitionBuffer transitionCountdownMs={transitionCountdownMs} />
    ) : isSessionComplete ? (
      <SessionComplete totalTasks={totalTasks} totalDurationMs={totalDurationMs} />
    ) : isRecording || isStopped || isStarting || countdown > 0 ? (
      <>
        <div className="prompt-index">Task {currentPromptIndex + 1}</div>
        {/* Prompt text stays hidden during the 3-2-1 countdown — it is only
            revealed once recording actually starts (countdown hits 0). */}
        {countdown === 0 && <div className="prompt-text">{promptText}</div>}
        <div className="prompt-timer">
          {countdown > 0 ? `Starts in ${countdown}` : formatTime(timerMs)}
        </div>
      </>
    ) : (
      <div className="prompt-text prompt-text--idle">Select a task below and press record to begin.</div>
    )}
  </div>
);

export default TeleprompterDisplay;
