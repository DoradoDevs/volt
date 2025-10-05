import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import theme from '../theme';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [referrer, setReferrer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return setError('Email required');

    setLoading(true);
    try {
      await api.post('/signup', { email: normalized, referrer: referrer || null });
      localStorage.setItem('pendingEmail', normalized);
      setError('');
      navigate('/verify', { state: { email: normalized } });
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
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
          <p style={{ margin: 0, color: theme.colors.textHint, fontSize: 14 }}>Create your account</p>
        </div>

        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: 20 }}>
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 500,
              color: theme.colors.textLabel
            }}>
              Referral Code <span style={{ color: theme.colors.textHint, fontWeight: 400 }}>(Optional)</span>
            </label>
            <input
              type="text"
              value={referrer}
              onChange={(e) => setReferrer(e.target.value)}
              placeholder="Enter referral code"
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
            {loading ? 'Creating Account...' : 'Create Account & Send Code'}
          </button>
        </form>

        <div style={{
          marginTop: 24,
          textAlign: 'center',
          fontSize: 14,
          color: theme.colors.textHint
        }}>
          Already have an account?{' '}
          <a
            href="/login"
            style={{
              color: theme.colors.purple,
              textDecoration: 'none',
              fontWeight: 600
            }}
            onMouseEnter={(e) => e.target.style.color = theme.colors.purpleLight}
            onMouseLeave={(e) => e.target.style.color = theme.colors.purple}
          >
            Log In
          </a>
        </div>
      </div>
    </div>
  );
};

export default Signup;
