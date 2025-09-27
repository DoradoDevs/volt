import React from 'react';

const Tier = ({ tier }) => {
  const fees = { unranked: 0.01, bronze: 0.009, silver: 0.008, gold: 0.007, diamond: 0.005 };
  const safeTier = (tier ?? 'unranked').toString().toLowerCase();
  const fee = fees[safeTier] ?? 0.01;

  // Base fee is 1%. Discount is (1% - tierFee)
  const base = 0.01;
  const discount = Math.max(base - fee, 0);

  const pretty = safeTier.charAt(0).toUpperCase() + safeTier.slice(1);

  return (
    <div style={{ margin: '16px 0', border:'1px solid #7B68EE', borderRadius:8, padding:12 }}>
      <h2 style={{ marginTop:0 }}>Your Tier: {pretty}</h2>
      <p style={{ marginBottom:0 }}>Your Discount: {(discount * 100).toFixed(2)}%</p>
    </div>
  );
};

export default Tier;
