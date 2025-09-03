import React from 'react';

const Tier = ({ tier }) => {
  const tierInfo = {
    unranked: { fee: '1%', referralShare: '10%' },
    bronze: { fee: '0.9%', referralShare: '12.5%' },
    silver: { fee: '0.8%', referralShare: '15%' },
    gold: { fee: '0.7%', referralShare: '20%' },
    diamond: { fee: '0.5%', referralShare: '25%' },
  };

  return (
    <div style={{ margin: '20px 0' }}>
      <h2>Your Tier: {tier.charAt(0).toUpperCase() + tier.slice(1)}</h2>
      <p>Fee per Transaction: {tierInfo[tier].fee}</p>
      <p>Referral Fee Share: {tierInfo[tier].referralShare}</p>
    </div>
  );
};

export default Tier;