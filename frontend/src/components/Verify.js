import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

const Verify = ({ setUser, email: emailProp }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const email = useMemo(() =>
    (emailProp || location.state?.email || localStorage.getItem('pendingEmail') || '').trim().toLowerCase(),
  [emailProp, location.state]);

  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/verify', { email, code: code.trim() });
      localStorage.setItem('token', response.data.token);
      localStorage.removeItem('pendingEmail');
      setUser(response.data.user);
      setError('');
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
    }
  };

  const handleResend = async () => {
    try {
      await api.post('/login', { email }); // reuse login to resend a fresh code
      setError('');
      alert('A new verification code has been sent.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend code');
    }
  };

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', backgroundColor:'#4B0082', color:'#9370DB' }}>
      <div style={{ padding:'20px', borderRadius:'8px', backgroundColor:'rgba(147, 112, 219, 0.1)' }}>
        <h2>Enter Verification Code</h2>
        <p style={{ opacity:0.8, marginTop:-8 }}>{email || 'No email detected'}</p>
        <form onSubmit={handleVerify}>
          <div>
            <label>Verification Code: </label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} style={{ margin:'5px', padding:'5px' }} />
          </div>
          {error && <p style={{ color:'red' }}>{error}</p>}
          <button type="submit">Verify & Continue</button>
          <button type="button" style={{ marginLeft:8 }} onClick={handleResend}>Resend Code</button>
        </form>
        <p>Didn’t get it? Check spam or click “Resend Code”.</p>
      </div>
    </div>
  );
};

export default Verify;
