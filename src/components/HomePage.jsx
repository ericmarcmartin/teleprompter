import { useMemo } from 'react';

import { taskOptions } from '../data/prompts.js';

const HomePage = ({ taskId, onTaskChange, onLoad }) => {
  const localDateLabel = useMemo(() => new Date().toLocaleString(), []);

  return (
    <div className="dashboard-wrap">
      <header className="topbar panel glass">
        <div>
          <span className="meta-label">User</span>
          <div className="user-name">Jarren Dave</div>
        </div>
        <div className="access-badge">Employee</div>
        <div className="time-indicator">{localDateLabel}</div>
      </header>

      <div className="task-panel panel glass">
        <label className="field-label">Project</label>
        <div className="task-input-row">
          <select value={taskId} onChange={(event) => onTaskChange(event.target.value)}>
            {taskOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button className="primary" onClick={onLoad}>Load</button>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
