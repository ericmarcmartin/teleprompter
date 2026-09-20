const LoginPage = ({ email, password, onEmailChange, onPasswordChange, onLogin, onReset }) => (
  <div className="auth-panel panel glass">
    <div className="auth-brand">ThothAI</div>
    <h1>Welcome back</h1>
    <div className="field-group">
      <label>Email</label>
      <input value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="Email" />
    </div>
    <div className="field-group">
      <label>Password</label>
      <input
        type="password"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        placeholder="Password"
      />
    </div>
    <div className="auth-actions">
      <button className="primary" onClick={onLogin}>Login</button>
      <button className="ghost" onClick={onReset}>Reset</button>
    </div>
  </div>
);

export default LoginPage;
