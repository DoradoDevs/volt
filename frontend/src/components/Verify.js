import React, { useState } from 'react';
import api from '../services/api';
import { useLocation, useNavigate } from 'react-router-dom';

const Verify = () => {
  const [code, setCode] = useState('');
  const { state } = useLocation();
  const navigate = useNavigate();

  const handleVerify = async () => {
    try {
      const { data } = await api.post('/verify', { email: state.email, code });
      localStorage.setItem('token', data.token);
      navigate('/dashboard');
    } catch (e) {
      alert('Invalid code');
    }
  };

  return (
    <div>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Verification Code" />
      <button onClick={handleVerify}>Verify</button>
    </div>
  );
};

export default Verify;