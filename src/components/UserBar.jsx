// The player's account chip, parked top-left (the route picker owns top-right).
// SAVE / CONTINUE / CLEAR act on the journey stored for this username.
export function UserBar({ user, status, onLogin, onLogout, onSave, onLoad, onClear, hasProgress }) {
  const btn = 'userbar-btn';
  if (!user) {
    return (
      <div className="userbar">
        <button type="button" className={btn} onClick={onLogin} title="Log in to save your place">
          LOGIN
        </button>
        {status && <span className="userbar-status">{status}</span>}
      </div>
    );
  }
  return (
    <div className="userbar">
      <span className="userbar-name">{user.username.toUpperCase()}</span>
      <button type="button" className={btn} onClick={onSave} title="Save where you are now">
        SAVE
      </button>
      <button
        type="button"
        className={btn}
        onClick={onLoad}
        disabled={!hasProgress}
        title="Continue from your saved journey"
      >
        CONTINUE
      </button>
      <button
        type="button"
        className={btn}
        onClick={onClear}
        disabled={!hasProgress}
        title="Delete the saved journey"
      >
        CLEAR
      </button>
      <button type="button" className={btn} onClick={onLogout} title="Log out">
        LOGOUT
      </button>
      {status && <span className="userbar-status">{status}</span>}
    </div>
  );
}
