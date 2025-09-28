import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import WalletManager from './WalletManager';
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

const Progress = ({ volume }) => {
  const tiers = [
    { name:'Unranked', min:0, next:100 },
    { name:'Bronze', min:100, next:250 },
    { name:'Silver', min:250, next:500 },
    { name:'Gold', min:500, next:1000 },
    { name:'Diamond', min:1000, next:null },
  ];
  const t = tiers.findLast(t => volume >= t.min) || tiers[0];
  const remaining = t.next ? Math.max(0, t.next - volume) : 0;
  const pct = t.next ? Math.min(100, Math.round(((volume - t.min) / (t.next - t.min)) * 100)) : 100;

  return (
    <div style={{ margin:'16px 0' }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, opacity:0.9 }}>
        <span>{t.name}</span>
        {t.next ? <span>{volume.toFixed(2)} / {t.next} SOL</span> : <span>{volume.toFixed(2)} SOL</span>}
      </div>
      <div style={{ height:10, background:'rgba(255,255,255,0.2)', borderRadius:6, marginTop:4 }}>
        <div style={{ width:`${pct}%`, height:10, background:'#7B68EE', borderRadius:6 }} />
      </div>
      {t.next && <div style={{ fontSize:12, opacity:0.8, marginTop:4 }}>Need {remaining.toFixed(2)} SOL to reach {tiers[tiers.indexOf(t)+1]?.name}</div>}
    </div>
  );
};

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview'); // overview | wallets | portfolio | referrals
  const [portfolio, setPortfolio] = useState([]);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await api.get('/dashboard');
      setData(res.data || {});
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || 'Failed to load dashboard');
      setData({});
    }
  }, []);

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await api.get('/portfolio');
      setPortfolio(res.data || []);
    } catch (e) {
      console.error('Failed to load portfolio', e);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (tab === 'portfolio') loadPortfolio(); }, [tab, loadPortfolio]);

  if (!data && !error) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'50vh' }}>
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  const safeTier = data?.tier ?? 'unranked';
  const volume = Number(data?.volume || 0);

  return (
    <div className="dashboard" style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ textAlign:'center', marginBottom: 12 }}>VolT Dashboard</h1>
      {error && <p style={{ color:'salmon' }}>{error}</p>}

      <div style={{ display:'flex', justifyContent:'center', marginBottom: 16 }}>
        <TabButton active={tab==='overview'} onClick={() => setTab('overview')}>Overview</TabButton>
        <TabButton active={tab==='wallets'} onClick={() => setTab('wallets')}>Wallets</TabButton>
        <TabButton active={tab==='portfolio'} onClick={() => { setTab('portfolio'); loadPortfolio(); }}>Portfolio</TabButton>
        <TabButton active={tab==='referrals'} onClick={() => setTab('referrals')}>Referrals</TabButton>
      </div>

      {tab === 'overview' && (
        <>
          <Tier tier={safeTier} />
          <Progress volume={volume} />
          <BotControls running={Boolean(data?.running)} />
        </>
      )}

      {tab === 'wallets' && (
        <WalletManager
          numWallets={data?.subWallets ?? 0}
          onChanged={async () => {
            await loadDashboard();
            if (tab === 'portfolio') await loadPortfolio();
          }}
        />
      )}

      {tab === 'portfolio' && (
        <div>
          <h3 style={{ marginBottom: 12 }}>Holdings by Wallet</h3>
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
