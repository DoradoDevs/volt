import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Login = ({ setUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/login', { email, password });
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
      setError('');
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#4B0082', color: '#9370DB' }}>
      <div style={{ padding: '20px', borderRadius: '8px', backgroundColor: 'rgba(147, 112, 219, 0.1)' }}>
        <h2>Login</h2>
        <form onSubmit={handleLogin}>
          <div>
            <label>Email: </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ margin: '5px', padding: '5px' }} />
          </div>
          <div>
            <label>Password: </label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ margin: '5px', padding: '5px' }} />
          </div>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit">Login</button>
        </form>
        <p>Don't have an account? <a href="/signup" style={{ color: '#7B68EE' }}>Sign Up</a></p>
      </div>
    </div>
  );
};

export default Login;