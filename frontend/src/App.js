// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Verify from './components/Verify';
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import api from './services/api';
import theme from './theme';
import './styles/App.css';

const App = () => {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setBootstrapping(false); return; }
    api.get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => { localStorage.removeItem('token'); setUser(null); })
      .finally(() => setBootstrapping(false));
  }, []);

  if (bootstrapping) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background: theme.colors.bgPrimary, color: theme.colors.text }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <Router>
      <ErrorBoundary>
        <div className="App" style={{ backgroundColor: theme.colors.bgPrimary, minHeight: '100vh', color: theme.colors.text, position:'relative' }}>
          {user && <Header email={user.email} />}

          <Routes>
            <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login setEmail={setEmail} />} />
            <Route path="/verify" element={user ? <Navigate to="/dashboard" /> : <Verify setUser={setUser} email={email} />} />
            <Route path="/signup" element={user ? <Navigate to="/dashboard" /> : <Signup />} />
            <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </div>
      </ErrorBoundary>
    </Router>
  );
};

export default App;
