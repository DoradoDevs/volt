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
        padding: '28px 32px',
        borderRadius: 12,
        maxWidth: 700,
        maxHeight: '90vh',
        width: '90%',
        color: '#E6E6FA',
        lineHeight: 1.5,
        overflowY: 'auto',
      }}
    >
      <h3 style={{ marginTop: 0 }}>VolT Volume Bot Guide</h3>

      <p><strong>🎯 Quick Start</strong></p>
      <ol style={{ marginLeft: -20, lineHeight: 1.8 }}>
        <li><strong>Deposit SOL:</strong> Fund your deposit wallet (shown in Funds tab)</li>
        <li><strong>Add Wallets:</strong> Create 3-10 bot wallets in the Wallets tab</li>
        <li><strong>Distribute:</strong> Split SOL evenly from deposit to bot wallets (e.g., 0.05 SOL each)</li>
        <li><strong>Configure:</strong> Set token mint, buy amounts (0.01-0.05 SOL), delays (500-2000ms)</li>
        <li><strong>Select Mode:</strong> Choose bot strategy (see below)</li>
        <li><strong>Start Bot:</strong> Click Start and monitor activity in the Activity tab</li>
      </ol>

      <p><strong>📊 Bot Modes Explained</strong></p>
      <ul style={{ lineHeight: 1.8 }}>
        <li><strong>Pure:</strong> Buy → Sell full amount. Best for pure volume generation.</li>
        <li><strong>Growth:</strong> Buy → Sell 90%. Slowly accumulates tokens while generating volume.</li>
        <li><strong>Moonshot:</strong> Buy only, no selling. Use to pump price and accumulate.</li>
        <li><strong>Human:</strong> Random wallet groups buy, wait 15-30s, then sell. Looks organic.</li>
      </ul>

      <p><strong>💰 Managing Funds</strong></p>
      <ul style={{ lineHeight: 1.8 }}>
        <li><strong>Distribute:</strong> Send equal SOL from deposit to all bot wallets</li>
        <li><strong>Consolidate:</strong> Sweep SOL from all bot wallets back to deposit wallet</li>
        <li><strong>Withdraw:</strong> Send SOL from deposit to external wallet (type "MAX" for all)</li>
        <li><strong>Close Accounts:</strong> Reclaim rent from empty token accounts (~0.002 SOL each)</li>
      </ul>

      <p><strong>🏆 Fee Tiers & Referrals</strong></p>
      <ul style={{ lineHeight: 1.8 }}>
        <li>Base fee: 0.1% of volume. Discounts: Bronze 10%, Silver 20%, Gold 30%, Diamond 50%</li>
        <li>Unlock tiers with volume: Bronze 100 SOL, Silver 250, Gold 500, Diamond 1000+</li>
        <li>Refer friends: Earn 10-25% of their fees as rewards (higher tiers = more rewards)</li>
      </ul>

      <p><strong>⚡ Pro Tips</strong></p>
      <ul style={{ lineHeight: 1.8 }}>
        <li>Use Human mode for the most organic-looking volume</li>
        <li>Keep 3-10 wallets active for best results</li>
        <li>Start with small amounts (0.01-0.02 SOL) to test</li>
        <li>Check Activity tab to monitor trades and catch errors early</li>
        <li>Run "Close Accounts" periodically to reclaim rent from empty token accounts</li>
      </ul>

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
