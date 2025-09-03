import React, { useState } from 'react';
import api from '../services/api';

const Referral = ({ code, rewards }) => {
  const [destination, setDestination] = useState('');

  const handleClaim = async () => {
    try {
      const { data } = await api.post('/referral/claim', { destination });
      alert(`Rewards claimed: TXID ${data.txid}`);
      window.location.reload();
    } catch (e) {
      alert('Error claiming rewards');
    }
  };

  return (
    <div style={{ margin: '20px 0' }}>
      <h2>Referral</h2>
      <p>Your Referral Code: {code}</p>
      <p>Earned Rewards: {rewards} SOL</p>
      <div>
        <label>Claim to Address: </label>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Destination address"
          style={{ margin: '5px', padding: '5px' }}
        />
        <button onClick={handleClaim} disabled={rewards === 0}>Claim Rewards</button>
      </div>
    </div>
  );
};

export default Referral;