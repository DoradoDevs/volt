// frontend/src/components/HelpModal.js
import React from 'react';

const HelpModal = ({ onClose }) => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
    }}
  >
    <div
      style={{
        background: '#2a1a40',
        padding: '28px 32px', // more padding for spacing
        borderRadius: 12,
        maxWidth: 600,
        width: '90%',
        color: '#E6E6FA',
        lineHeight: 1.5, // better spacing
      }}
    >
      <h3 style={{ marginTop: 0 }}>How VolT Works</h3>

      <p><strong>Modes</strong></p>
      <ul>
        <li><strong>Pure:</strong> Buys then sells full amount each cycle (tight loops).</li>
        <li><strong>Growth:</strong> Buys then sells ~90% to accumulate small bags over time.</li>
        <li><strong>Moonshot:</strong> Buys only; no auto-sell.</li>
        <li><strong>Human:</strong> Randomized squads buy quickly, then staggered sells to mimic human activity.</li>
        <li><strong>Bump:</strong> Continuous buy/sell across all wallets (steady bumps).</li>
      </ul>

      <p><strong>Deposits</strong><br />
        Your account has a deposit address (primary wallet) created automatically. Send SOL there.  
        You can generate new deposit addresses; older ones remain usable.
      </p>

      <p><strong>Withdrawals</strong><br />
        From the Wallets page, withdraw SOL from your deposit wallet to any address. Use “MAX” for full balance.
      </p>

      <p><strong>Tier Discounts</strong><br />
        Bronze 10%, Silver 20%, Gold 30%, Diamond 50%.
      </p>

      <div style={{ textAlign: 'right', marginTop: 18 }}>
        <button
          onClick={onClose}
          style={{
            background: '#7B68EE',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  </div>
);

export default HelpModal;
