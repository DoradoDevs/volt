import React, { useEffect, useState } from 'react';
import api from '../services/api';
import WalletManager from './WalletManager';
import FundsManager from './FundsManager';
import BotControls from './BotControls';
import Referral from './Referral';
import Tier from './Tier';

const TabButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      background: active ? '#7B68EE' : 'transparent',
      border: '1px solid #7B68EE',
      color: '#E6E6FA',
      padding: '8px 14px',
      borderRadius: 6,
      marginRight: 8
    }}
  >
    {children}
  </button>
);

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview'); // overview | wallets | portfolio | referrals
  const [walletList, setWalletList] = useState([]);
  const [portfolio, setPortfolio] = useState([]);

  const loadDashboard = async () => {
    try {
      const res = await api.get('/dashboard');
      setData(res.data || {});
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || 'Failed to load dashboard');
      setData({});
    }
  };

  const loadWallets = async () => {
    try {
      const res = await api.get('/wallets/list');
      setWalletList(res.data.wallets || []);
    } catch (e) {
      console.error('Failed to load wallets', e);
    }
  };

  const loadPortfolio = async () => {
    try {
      const res = await api.get('/portfolio');
      setPortfolio(res.data || []);
    } catch (e) {
      console.error('Failed to load portfolio', e);
    }
  };

  useEffect(() => { loadDashboard(); }, []);
  useEffect(() => { if (tab === 'wallets') loadWallets(); }, [tab]);
  useEffect(() => { if (tab === 'portfolio') loadPortfolio(); }, [tab]);

  if (!data && !error) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'50vh' }}>
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  const safeTier = data?.tier ?? 'unranked';

  return (
    <div className="dashboard" style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ textAlign:'center', marginBottom: 12 }}>VolT Dashboard</h1>
      {error && <p style={{ color:'salmon' }}>{error}</p>}

      {/* Tabs */}
      <div style={{ display:'flex', justifyContent:'center', marginBottom: 16 }}>
        <TabButton active={tab==='overview'} onClick={() => setTab('overview')}>Overview</TabButton>
        <TabButton active={tab==='wallets'} onClick={() => setTab('wallets')}>Wallets</TabButton>
        <TabButton active={tab==='portfolio'} onClick={() => setTab('portfolio')}>Portfolio</TabButton>
        <TabButton active={tab==='referrals'} onClick={() => setTab('referrals')}>Referrals</TabButton>
      </div>

      {tab === 'overview' && (
        <>
          <Tier tier={safeTier} />
          <FundsManager
            sourceAddress={data?.sourceAddress ?? ''}
            balance={data?.sourceBalance ?? 0}
          />
          <BotControls running={Boolean(data?.running)} />
        </>
      )}

      {tab === 'wallets' && (
        <>
          <WalletManager numWallets={data?.subWallets ?? 0} onChanged={async () => { await loadDashboard(); await loadWallets(); }} />
          <div style={{ marginTop: 16 }}>
            <h3>Your Generated Wallets</h3>
            {walletList.length === 0 && <p>No wallets yet.</p>}
            {walletList.map((w) => (
              <div key={w.address} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #7B68EE', borderRadius:8, padding:'8px 12px', marginBottom:8 }}>
                <div>
                  <div style={{ fontFamily:'monospace', fontSize:13 }}>{w.address}</div>
                  <div style={{ fontSize:12, opacity:0.8 }}>{w.balanceSOL} SOL</div>
                </div>
                <button onClick={() => navigator.clipboard.writeText(w.address)}>Copy</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'portfolio' && (
        <div>
          <h3>Holdings by Wallet</h3>
          {portfolio.length === 0 && <p>No SPL token holdings detected.</p>}
          {portfolio.map((row) => (
            <div key={row.wallet} style={{ border:'1px solid #7B68EE', borderRadius:8, padding:12, marginBottom:12 }}>
              <div style={{ fontFamily:'monospace', fontSize:13, marginBottom:6 }}>{row.wallet}</div>
              {row.holdings.length === 0 ? (
                <div style={{ fontSize:12, opacity:0.8 }}>No tokens.</div>
              ) : (
                <ul style={{ margin:0, paddingLeft:18 }}>
                  {row.holdings.map((h, idx) => (
                    <li key={idx} style={{ fontSize:14 }}>
                      {h.mint} — <strong>{h.uiAmount}</strong> (decimals {h.decimals})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'referrals' && (
        <Referral
          code={data?.referralCode ?? ''}
          rewards={data?.earnedRewards ?? 0}
        />
      )}
    </div>
  );
};

export default Dashboard;
