import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import theme from '../theme';

const Verify = ({ setUser, email: emailProp, onDisplayNameChange }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const email = useMemo(() =>
    (emailProp || location.state?.email || localStorage.getItem('pendingEmail') || '').trim().toLowerCase(),
  [emailProp, location.state]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/verify', { email, code: code.trim() });
      localStorage.setItem('token', response.data.token);
      localStorage.removeItem('pendingEmail');
      setUser(response.data.user);
      setError('');

      // Fetch displayName from dashboard endpoint
      try {
        const dashResponse = await api.get('/dashboard');
        if (onDisplayNameChange && dashResponse.data?.displayName) {
          onDisplayNameChange(dashResponse.data.displayName);
        }
      } catch (err) {
        console.warn('Failed to fetch displayName:', err);
      }

      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await api.post('/login', { email });
      setError('');
      alert('A new verification code has been sent.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend code');
    } finally {
      setResending(false);
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
          <p style={{ margin: 0, marginBottom: 8, color: theme.colors.textHint, fontSize: 14 }}>Enter verification code</p>
          <p style={{ margin: 0, color: theme.colors.textLabel, fontSize: 13, fontWeight: 500 }}>{email || 'No email detected'}</p>
        </div>

        <form onSubmit={handleVerify}>
          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 500,
              color: theme.colors.textLabel
            }}>
              Verification Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code"
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
                boxSizing: 'border-box',
                textAlign: 'center',
                letterSpacing: '4px',
                fontSize: 16
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
              boxShadow: theme.shadows.button,
              marginBottom: 12
            }}
            onMouseEnter={(e) => !loading && (e.target.style.background = theme.colors.purpleLight)}
            onMouseLeave={(e) => e.target.style.background = theme.colors.purple}
          >
            {loading ? 'Verifying...' : 'Verify & Continue'}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending || loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.borderInput}`,
              background: 'transparent',
              color: theme.colors.text,
              cursor: (resending || loading) ? 'not-allowed' : 'pointer',
              opacity: (resending || loading) ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => !(resending || loading) && (e.target.style.background = theme.colors.bgHover)}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
          >
            {resending ? 'Sending...' : 'Resend Code'}
          </button>
        </form>

        <div style={{
          marginTop: 20,
          textAlign: 'center',
          fontSize: 13,
          color: theme.colors.textHint,
          lineHeight: 1.5
        }}>
          Didn't receive it? Check your spam folder
        </div>
      </div>
    </div>
  );
};

export default Verify;
