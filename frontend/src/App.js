// frontend/src/app.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Verify from './components/Verify';
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import api from './services/api';
import './styles/App.css';

const HelpModal = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
    }}>
      <div style={{
        width: 'min(680px, 92vw)', background:'#2d0b4f', color:'#E6E6FA',
        border:'1px solid rgba(255,255,255,0.2)', borderRadius:12, padding:18, boxShadow:'0 10px 40px rgba(0,0,0,0.4)'
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0 }}>How VolT Works</h3>
          <button onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop:12, display:'grid', gap:10 }}>
          <div>
            <b>Modes</b>
            <ul style={{ margin:'6px 0 0 18px' }}>
              <li><b>Pure</b>: Buys then sells full amount each cycle (tight loops).</li>
              <li><b>Growth</b>: Buys then sells ~90% to accumulate small bags over time.</li>
              <li><b>Moonshot</b>: Buys only; no auto-sell.</li>
              <li><b>Human</b>: Randomized squads buy quickly, then staggered sells to mimic human activity.</li>
              <li><b>Bump</b>: Continuous buy/sell across all wallets (steady bumps).</li>
            </ul>
          </div>
          <div>
            <b>Deposits</b>
            <p>Your account has a deposit address (primary wallet) created automatically. Send SOL there. You can generate new deposit addresses; older ones remain usable.</p>
          </div>
          <div>
            <b>Withdrawals</b>
            <p>From the Wallets page, withdraw SOL from your deposit wallet to any address. Use “MAX” for full balance.</p>
          </div>
          <div>
            <b>Fees & Discounts</b>
            <p>Base fee: 0.1% per transaction. Tier discounts apply (Bronze 10%, Silver 20%, Gold 30%, Diamond 50%).</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#4B0082', color:'#E6E6FA' }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <Router>
      <ErrorBoundary>
        <div className="App" style={{ backgroundColor: '#4B0082', minHeight: '100vh', color: '#9370DB', position:'relative' }}>
          {user && <Header email={user.email} />}

          {/* Floating help button */}
          {user && (
            <>
              <button
                onClick={() => setHelpOpen(true)}
                title="Help"
                style={{
                  position:'fixed', right:18, bottom:18, width:48, height:48, borderRadius:'50%',
                  background:'#7B68EE', color:'#fff', border:'none', cursor:'pointer', fontSize:22,
                  boxShadow:'0 6px 18px rgba(0,0,0,0.35)', zIndex:999
                }}
              >
                ?
              </button>
              <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
            </>
          )}

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
