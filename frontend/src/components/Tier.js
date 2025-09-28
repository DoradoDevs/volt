import React from 'react';

// Show only the DISCOUNT now; base fee is handled on the backend.
// Keeping original discount steps: Bronze 10%, Silver 20%, Gold 30%, Diamond 50%.
const Tier = ({ tier }) => {
  const discountByTier = {
    unranked: 0,
    bronze:   10,
    silver:   20,
    gold:     30,
    diamond:  50,
  };

  const safeTier = (tier ?? 'unranked').toString().toLowerCase();
  const pretty = safeTier.charAt(0).toUpperCase() + safeTier.slice(1);
  const discount = discountByTier[safeTier] ?? 0;

  return (
    <div style={{ margin: '16px 0', border:'1px solid #7B68EE', borderRadius:8, padding:12 }}>
      <h2 style={{ marginTop:0 }}>Your Tier: {pretty}</h2>
      <p style={{ marginBottom:0 }}>Your Discount: {discount.toFixed(0)}%</p>
    </div>
  );
};

export default Tier;
