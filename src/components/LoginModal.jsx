import { useState } from 'react';

// Account pick-in: type a name and it is created on the spot (there is no
// password — the "account" is just a label for the save slot in this browser).
export function LoginModal({ onLogin, onSkip }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Enter a name');
      return;
    }
    setError('');
    onLogin(username.trim());
  };

  return (
    <div className="login-scrim" role="dialog" aria-modal="true" aria-label="Log in">
      <form className="login-card" onSubmit={submit}>
        <h2 className="login-title">LOGIN</h2>
        <p className="login-note">
          A name keeps your journey in this browser: press SAVE at any point,
          then CONTINUE to pick the ride back up where it stopped.
        </p>
        <input
          className="login-input"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="YOUR NAME"
          maxLength={16}
          autoFocus
        />
        {error && <div className="login-error">{error}</div>}
        <div className="login-row">
          <button type="submit" className="login-go">
            {username.trim() ? 'PLAY AS ' + username.trim().toUpperCase() : 'START'}
          </button>
          <button type="button" className="login-skip" onClick={onSkip}>
            SKIP
          </button>
        </div>
      </form>
    </div>
  );
}
