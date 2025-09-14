import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Signup = ({ setUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referrer, setReferrer] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/signup', { email, password, referrer });
      setError('');
      navigate('/verify');
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#4B0082', color: '#9370DB' }}>
      <div style={{ padding: '20px', borderRadius: '8px', backgroundColor: 'rgba(147, 112, 219, 0.1)' }}>
        <h2>Sign Up</h2>
        <form onSubmit={handleSignup}>
          <div>
            <label>Email: </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ margin: '5px', padding: '5px' }} />
          </div>
          <div>
            <label>Password: </label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ margin: '5px', padding: '5px' }} />
          </div>
          <div>
            <label>Referrer Code (Optional): </label>
            <input type="text" value={referrer} onChange={(e) => setReferrer(e.target.value)} style={{ margin: '5px', padding: '5px' }} />
          </div>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit">Sign Up</button>
        </form>
        <p>Already have an account? <a href="/login" style={{ color: '#7B68EE' }}>Log In</a></p>
      </div>
    </div>
  );
};

export default Signup;