import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import theme from '../theme';

const Login = ({ setUsername }) => {
  const [localUsername, setLocalUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const username = localUsername.trim();

    if (!username || !password) {
      return setError('Username and password required');
    }

    if (isSignup && password.length < 6) {
      return setError('Password must be at least 6 characters');
    }

    setLoading(true);
    setError('');

    try {
      const endpoint = isSignup ? '/signup' : '/login';
      const { data } = await api.post(endpoint, { username, password });

      localStorage.setItem('token', data.token);
      setUsername(data.user.username);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || `${isSignup ? 'Signup' : 'Login'} failed`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: theme.colors.bgPrimary,
      color: theme.colors.text,
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: theme.colors.bgPanel,
        border: `1px solid ${theme.colors.borderPanel}`,
        borderRadius: theme.borderRadius.lg,
        padding: '40px',
        boxShadow: theme.shadows.modal
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            margin: 0,
            marginBottom: 8,
            color: theme.colors.purpleLight
          }}>VolT</h1>
          <p style={{ margin: 0, color: theme.colors.textHint, fontSize: 14 }}>
            {isSignup ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 500,
              color: theme.colors.textLabel
            }}>
              Username
            </label>
            <input
              type="text"
              value={localUsername}
              onChange={(e) => setLocalUsername(e.target.value)}
              placeholder="username"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 14,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.borderInput}`,
                background: theme.colors.bgInput,
                color: theme.colors.text,
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = theme.colors.borderPrimary}
              onBlur={(e) => e.target.style.borderColor = theme.colors.borderInput}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 500,
              color: theme.colors.textLabel
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "minimum 6 characters" : "password"}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 14,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.borderInput}`,
                background: theme.colors.bgInput,
                color: theme.colors.text,
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = theme.colors.borderPrimary}
              onBlur={(e) => e.target.style.borderColor = theme.colors.borderInput}
            />
          </div>

          {error && (
            <div style={{
              padding: '12px 14px',
              borderRadius: theme.borderRadius.md,
              background: 'rgba(255,107,129,0.1)',
              border: '1px solid rgba(255,107,129,0.3)',
              color: theme.colors.error,
              fontSize: 14,
              marginBottom: 24
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: 15,
              fontWeight: 600,
              borderRadius: theme.borderRadius.md,
              border: 'none',
              background: theme.colors.purple,
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s',
              boxShadow: theme.shadows.button
            }}
            onMouseEnter={(e) => !loading && (e.target.style.background = theme.colors.purpleLight)}
            onMouseLeave={(e) => e.target.style.background = theme.colors.purple}
          >
            {loading ? (isSignup ? 'Creating Account...' : 'Signing In...') : (isSignup ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div style={{
          marginTop: 24,
          textAlign: 'center',
          fontSize: 13,
          color: theme.colors.textHint
        }}>
          <button
            onClick={() => {
              setIsSignup(!isSignup);
              setError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.purpleLight,
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: 13
            }}
          >
            {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
