import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import theme from '../theme';

const Login = ({ setEmail }) => {
  const [localEmail, setLocalEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    const normalized = localEmail.trim().toLowerCase();
    if (!normalized) return setError('Email required');

    setLoading(true);
    try {
      await api.post('/login', { email: normalized });
      setEmail(normalized);
      localStorage.setItem('pendingEmail', normalized);
      setError('');
      navigate('/verify', { state: { email: normalized } });
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
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
          <p style={{ margin: 0, color: theme.colors.textHint, fontSize: 14 }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 500,
              color: theme.colors.textLabel
            }}>
              Email Address
            </label>
            <input
              type="email"
              value={localEmail}
              onChange={(e) => setLocalEmail(e.target.value)}
              placeholder="your@email.com"
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
            {loading ? 'Sending Code...' : 'Continue'}
          </button>
        </form>

        <div style={{
          marginTop: 24,
          textAlign: 'center',
          fontSize: 13,
          color: theme.colors.textHint,
          lineHeight: 1.5
        }}>
          New user? No problem! Just enter your email and we'll send you a verification code to get started.
        </div>
      </div>
    </div>
  );
};

export default Login;
