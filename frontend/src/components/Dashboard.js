import React, { useEffect, useState } from 'react';
import api from '../services/api';
import WalletManager from './WalletManager';
import FundsManager from './FundsManager';
import BotControls from './BotControls';
import Referral from './Referral';
import Tier from './Tier';

const Dashboard = () => {
  const [data, setData] = useState({});

  useEffect(() => {
    const fetch = async () => {
      const { data } = await api.get('/dashboard');
      setData(data);
    };
    fetch();
  }, []);

  return (
    <div className="dashboard">
      <h1>VolT Dashboard</h1>
      <Tier tier={data.tier} />
      <Referral code={data.referralCode} rewards={data.earnedRewards} />
      <WalletManager numWallets={data.subWallets} />
      <FundsManager sourceAddress={data.sourceAddress} balance={data.sourceBalance} />
      <BotControls running={data.running} />
      {/* Fields for tokenMint, min/max buy/delay, RPC save, mode select */}
    </div>
  );
};

export default Dashboard;