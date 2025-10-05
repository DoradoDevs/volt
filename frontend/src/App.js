// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import api from './services/api';
import theme from './theme';
import './styles/App.css';

const App = () => {
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setBootstrapping(false); return; }

    // Fetch user info and dashboard to get displayName
    Promise.all([
      api.get('/auth/me'),
      api.get('/dashboard')
    ])
      .then(([meRes, dashRes]) => {
        setUser(meRes.data);
        setDisplayName(dashRes.data?.displayName || '');
      })
      .catch(() => {
        localStorage.removeItem('token');
        setUser(null);
      })
      .finally(() => setBootstrapping(false));
  }, []);

  const handleDisplayNameChange = (newDisplayName) => {
    setDisplayName(newDisplayName);
  };

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
          {user && <Header username={user.username} displayName={displayName} onDisplayNameChange={handleDisplayNameChange} />}

          <Routes>
            <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login setUsername={setUser} />} />
            <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </div>
      </ErrorBoundary>
    </Router>
  );
};

export default App;
