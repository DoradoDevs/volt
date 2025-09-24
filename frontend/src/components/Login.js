import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Login = ({ setEmail }) => {
  const [localEmail, setLocalEmail] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    const normalized = localEmail.trim().toLowerCase();
    if (!normalized) return setError('Email required');

    try {
      await api.post('/login', { email: normalized });
      setEmail(normalized);                      // keep in App state
      localStorage.setItem('pendingEmail', normalized); // survive refresh
      setError('');
      navigate('/verify', { state: { email: normalized } }); // pass via state too
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', backgroundColor:'#4B0082', color:'#9370DB' }}>
      <div style={{ padding:'20px', borderRadius:'8px', backgroundColor:'rgba(147, 112, 219, 0.1)' }}>
        <h2>Login</h2>
        <form onSubmit={handleLogin}>
          <div>
            <label>Email: </label>
            <input type="email" value={localEmail} onChange={(e) => setLocalEmail(e.target.value)} style={{ margin:'5px', padding:'5px' }} />
          </div>
          {error && <p style={{ color:'red' }}>{error}</p>}
          <button type="submit">Request Verification Code</button>
        </form>
        <p>New here? <a href="/signup" style={{ color:'#7B68EE' }}>Sign Up</a></p>
      </div>
    </div>
  );
};

export default Login;
