const InstructionsPage = ({ onStart }) => (
  <div className="instruction-wrap">
    <div className="notice-panel panel glass">
      <div className="notice-title">Recording Notice</div>
      <p>
        Once you start recording, you will need to finish the recording. Please record in a quiet
        environment. Do not use headset.
      </p>
      <button className="primary start-btn" onClick={onStart}>START</button>
    </div>
  </div>
);

export default InstructionsPage;
