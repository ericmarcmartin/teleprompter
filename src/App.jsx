import { useEffect, useState } from 'react';

import HomePage from './components/HomePage.jsx';
import InstructionsPage from './components/InstructionsPage.jsx';
import LoginPage from './components/LoginPage.jsx';
import RecordingPage from './components/recording/RecordingPage.jsx';
import { usePlayback } from './hooks/usePlayback.js';
import { useRecordingSession } from './hooks/useRecordingSession.js';

const getPageFromLocation = () => {
  const pathname = window.location.pathname.replace(/\/+$/, '');
  return pathname === '/recording-collection-software' ? 'recording' : 'login';
};

function App() {
  const [page, setPage] = useState(() => getPageFromLocation());
  const [pageHistory, setPageHistory] = useState([]);
  const [canGoForward, setCanGoForward] = useState(false);
  const [forwardPage, setForwardPage] = useState(null);
  const [email, setEmail] = useState('jarren.dave');
  const [password, setPassword] = useState('••••••••');
  const [taskId, setTaskId] = useState('TASK-1001');

  const playback = usePlayback();
  const session = useRecordingSession({ taskId, playback });

  useEffect(() => {
    const handleLocationChange = () => {
      const nextPage = getPageFromLocation();
      if (nextPage === 'recording') {
        setPage('recording');
      }
    };

    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const navigateTo = (nextPage) => {
    setPageHistory((prev) => [...prev, page]);
    setPage(nextPage);
    if (nextPage === 'recording') {
      window.history.pushState({}, '', '/recording-collection-software');
    } else {
      window.history.pushState({}, '', '/');
    }
    setCanGoForward(false);
    setForwardPage(null);
  };

  const handleBack = () => {
    if (pageHistory.length === 0) return;
    const prev = pageHistory[pageHistory.length - 1];
    setForwardPage(page);
    setCanGoForward(true);
    setPage(prev);
    setPageHistory((h) => h.slice(0, -1));
  };

  const handleForward = () => {
    if (!canGoForward || !forwardPage) return;
    setPageHistory((prev) => [...prev, page]);
    setPage(forwardPage);
    setCanGoForward(false);
    setForwardPage(null);
  };

  const handleLogin = () => {
    navigateTo('home');
  };

  const handleReset = () => {
    setEmail('');
    setPassword('');
    setPage('login');
    setPageHistory([]);
    setCanGoForward(false);
    setForwardPage(null);
  };

  const startPromptSequence = async () => {
    const permissionGranted = await session.requestMicPermission();
    if (!permissionGranted) {
      return;
    }

    session.prepareRecordingSession();
    setPage('recording');
    window.history.pushState({}, '', '/recording-collection-software');
  };

  const handleStartOver = () => {
    playback.stopPlaybackAudio();
    if (playback.previewAudioRef.current) {
      playback.previewAudioRef.current.pause();
      playback.previewAudioRef.current.src = '';
    }

    playback.setIsPlayingPreview(false);
    session.setIsStopped(false);
    setPageHistory([]);
    setCanGoForward(false);
    setForwardPage(null);

    session.teardownRecorderAndStream();
    session.clearWaveform();
    session.resetRecordingState({ clearSavedRecordings: true });
    sessionStorage.clear();
    localStorage.clear();
    window.location.replace('/recording-collection-software');
  };

  return (
    <div className="app-shell">
      {/* Global back/forward nav — visible on all pages except login */}
      {page !== 'login' && (
        <div className="nav-controls">
          <button
            className="nav-btn"
            onClick={handleBack}
            disabled={pageHistory.length === 0}
            aria-label="Go back"
            title="Back"
          >
            ← Back
          </button>
          {canGoForward && (
            <button
              className="nav-btn"
              onClick={handleForward}
              aria-label="Go forward"
              title="Forward"
            >
              Forward →
            </button>
          )}
        </div>
      )}

      {page === 'login' && (
        <LoginPage
          email={email}
          password={password}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onLogin={handleLogin}
          onReset={handleReset}
        />
      )}

      {page === 'home' && (
        <HomePage
          taskId={taskId}
          onTaskChange={setTaskId}
          onLoad={() => navigateTo('instructions')}
        />
      )}

      {page === 'instructions' && (
        <InstructionsPage onStart={startPromptSequence} />
      )}

      {page === 'recording' && (
        <RecordingPage
          session={session}
          playback={playback}
          taskId={taskId}
          onStartOver={handleStartOver}
        />
      )}
    </div>
  );
}

export default App;
