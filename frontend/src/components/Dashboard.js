// frontend/src/components/Dashboard.js
import React, { useEffect, useState } from 'react';
import api from '../services/api';
import WalletManager from './WalletManager';
import FundsManager from './FundsManager';
import BotControls from './BotControls';
import Referral from './Referral';
import Tier from './Tier';

const Dashboard = () => {
  const [data, setData] = useState(null); // start null so we can show loading
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/dashboard'); // or '/auth/me' if you switched
        setData(res.data || {});
      } catch (e) {
        console.error(e);
        setError(e.response?.data?.error || 'Failed to load dashboard');
        setData({});
      }
    };
    fetchData();
  }, []);

  if (!data && !error) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'50vh' }}>
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  const safeTier = data?.tier ?? 'unranked';

  return (
    <div className="dashboard" style={{ padding: 24 }}>
      <h1>VolT Dashboard</h1>
      {error && <p style={{ color:'salmon' }}>{error}</p>}

      <Tier tier={safeTier} />

      <Referral
        code={data?.referralCode ?? ''}
        rewards={data?.earnedRewards ?? 0}
      />

      <WalletManager
        numWallets={data?.subWallets ?? 0}
      />

      <FundsManager
        sourceAddress={data?.sourceAddress ?? ''}
        balance={data?.sourceBalance ?? 0}
      />

      <BotControls
        running={Boolean(data?.running)}
      />

      {/* Fields for tokenMint, min/max buy/delay, RPC save, mode select, etc. */}
    </div>
  );
};

export default Dashboard;
