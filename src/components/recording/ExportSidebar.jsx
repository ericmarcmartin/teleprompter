const ExportSidebar = ({ onExportTimestamp, onExportIndividual, onExportSession, onExportAll }) => (
  <div className="export-sidebar panel glass">
    <div className="export-sidebar-title">Export</div>
    <button className="export-sidebar-btn export-sidebar-btn--timestamp" onClick={onExportTimestamp}>Timestamp</button>
    <button className="export-sidebar-btn export-sidebar-btn--individual" onClick={onExportIndividual}>Individual Tasks</button>
    <button className="export-sidebar-btn export-sidebar-btn--session" onClick={onExportSession}>Session</button>
    <button className="export-sidebar-btn export-sidebar-btn--all" onClick={onExportAll}>All</button>
  </div>
);

export default ExportSidebar;
