import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [referrer, setReferrer] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return setError('Email required');
    try {
      await api.post('/signup', { email: normalized, referrer: referrer || null });
      localStorage.setItem('pendingEmail', normalized);
      setError('');
      navigate('/verify', { state: { email: normalized } });
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
    }
  };

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', backgroundColor:'#4B0082', color:'#9370DB' }}>
      <div style={{ padding:'20px', borderRadius:'8px', backgroundColor:'rgba(147, 112, 219, 0.1)' }}>
        <h2>Sign Up</h2>
        <form onSubmit={handleSignup}>
          <div>
            <label>Email: </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ margin:'5px', padding:'5px' }} />
          </div>
          <div>
            <label>Referrer Code (Optional): </label>
            <input type="text" value={referrer} onChange={(e) => setReferrer(e.target.value)} style={{ margin:'5px', padding:'5px' }} />
          </div>
          {error && <p style={{ color:'red' }}>{error}</p>}
          <button type="submit">Create Account & Send Code</button>
        </form>
        <p>Already have an account? <a href="/login" style={{ color:'#7B68EE' }}>Log In</a></p>
      </div>
    </div>
  );
};

export default Signup;
