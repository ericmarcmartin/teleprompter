const Waveform = ({ levels }) => (
  <div className="waveform" aria-label="Audio waveform">
    {levels.map((level, index) => (
      <span
        key={`bar-${index}`}
        className="bar"
        style={{ height: `${level}%` }}
      />
    ))}
  </div>
);

export default Waveform;
