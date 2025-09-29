// frontend/src/components/Dashboard.js
import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import WalletManager from './WalletManager';
import BotControls from './BotControls';
import Referral from './Referral';
import Tier from './Tier';
import Activity from './Activity';

const Tabs = ({ tab, setTab }) => {
  const tabs = [
    { id: 'volume', label: 'Volume Panel' },
    { id: 'wallets', label: 'Wallets' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'rewards', label: 'Rewards' },
    { id: 'activity', label: 'Activity' },
  ];
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${active ? '#7B68EE' : 'rgba(230,230,250,0.25)'}`,
                background: active ? 'rgba(123,104,238,0.15)' : 'rgba(255,255,255,0.04)',
                color: '#E6E6FA',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Card = ({ children }) => (
  <div style={{
    background: 'rgba(255,192,203,0.08)',
    border: '1px solid rgba(255,192,203,0.25)',
    borderRadius: 14,
    padding: 14,
  }}>
    {children}
  </div>
);

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('volume');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/dashboard');
        setData(res.data || {});
      } catch (e) {
        console.error(e);
        setError(e.response?.data?.error || 'Failed to load dashboard');
        setData({});
      }
    };
    fetchData();
  }, []);

  const safeTier = data?.tier ?? 'unranked';

  // Portfolio state + 30s throttle (front-end respects backend cache)
  const [portfolio, setPortfolio] = useState([]);
  const [pLoading, setPLoading] = useState(false);
  const [pErr, setPErr] = useState('');
  const lastLoadRef = useRef(0);

  const loadPortfolio = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastLoadRef.current < 30_000) return; // respect cache
    setPLoading(true);
    setPErr('');
    try {
      const res = await api.get(`/portfolio${force ? '?force=1' : ''}`);
      setPortfolio(res.data || []);
      lastLoadRef.current = Date.now();
    } catch (e) {
      console.error(e);
      setPErr('Failed to load portfolio');
    } finally {
      setPLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'portfolio') loadPortfolio(false);
  }, [tab]);

  if (!data && !error) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'50vh' }}>
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="dashboard" style={{ padding: 24 }}>
      <h1 style={{ textAlign: 'center' }}>VolT Dashboard</h1>
      {error && <p style={{ color:'salmon', textAlign:'center' }}>{error}</p>}

      <Tabs tab={tab} setTab={setTab} />

      {tab === 'volume' && (
        <BotControls running={Boolean(data?.running)} />
      )}

      {tab === 'wallets' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <WalletManager />
        </div>
      )}

      {tab === 'portfolio' && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Portfolio</h2>
            <button onClick={() => loadPortfolio(true)}>Refresh</button>
          </div>
          {pLoading ? (
            <div style={{ padding: 10, opacity: 0.8 }}>Loading…</div>
          ) : pErr ? (
            <div style={{ padding: 10, color: 'salmon' }}>{pErr}</div>
          ) : !portfolio || portfolio.length === 0 ? (
            <div style={{ padding: 10, opacity: 0.8 }}>No holdings found.</div>
          ) : (
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {portfolio.map((w) => (
                <div key={w.wallet} style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(230,230,250,0.18)'
                }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, marginBottom: 6 }}>{w.wallet}</div>
                  {!w.holdings || w.holdings.length === 0 ? (
                    <div style={{ fontSize: 13, opacity: 0.8 }}>No token balances.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {w.holdings.map((h, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ opacity: 0.9 }}>{h.mint}</span>
                          <span style={{ opacity: 0.9 }}>{h.uiAmount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'rewards' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <Tier tier={safeTier} />
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: -6 }}>
              Your discount is based on your tier.
            </div>
          </Card>
          <Card>
            <Referral code={data?.referralCode ?? ''} rewards={data?.earnedRewards ?? 0} />
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <Activity />
      )}
    </div>
  );
};

export default Dashboard;
