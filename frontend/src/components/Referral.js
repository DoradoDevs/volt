import React, { useEffect, useState } from 'react';
import api from '../services/api';

const MIN_CLAIM = 0.05;

const Referral = ({ code, rewards, onRewardsUpdate }) => {
  const [destination, setDestination] = useState('');
  const [tab, setTab] = useState('summary');
  const [referrals, setReferrals] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [newRefCode, setNewRefCode] = useState('');
  const [status, setStatus] = useState(null);

  const canClaim = Number(rewards) >= MIN_CLAIM;

  // Construct referral link
  const referralLink = `${window.location.origin}/signup?ref=${code}`;

  useEffect(() => {
    if (tab !== 'referred') return;
    const loadRefs = async () => {
      setLoadingRefs(true);
      setStatus(null);
      try {
        const { data } = await api.get('/referral/list');
        setReferrals(Array.isArray(data.referrals) ? data.referrals : []);
      } catch (e) {
        console.error('Failed to load referrals', e);
        setStatus({ type: 'error', message: e.response?.data?.error || 'Failed to load referred users' });
        setReferrals([]);
      } finally {
        setLoadingRefs(false);
      }
    };
    loadRefs();
  }, [tab]);

  const handleClaim = async () => {
    if (!destination.trim()) {
      setStatus({ type: 'error', message: 'Destination address required to claim' });
      return;
    }
    try {
      const { data } = await api.post('/referral/claim', { destination: destination.trim() });
      setStatus({ type: 'success', message: `Rewards claimed. TX: ${data.txid}` });
      setDestination('');
      onRewardsUpdate?.();
    } catch (e) {
      setStatus({ type: 'error', message: e.response?.data?.error || 'Error claiming rewards' });
    }
  };

  const setReferrer = async () => {
    if (!newRefCode.trim()) {
      setStatus({ type: 'error', message: 'Enter a referral code first' });
      return;
    }
    try {
      const { data } = await api.post('/referral/set', { code: newRefCode.trim() });
      setStatus({ type: 'success', message: `Referrer set: ${data.referrerEmail}` });
      setNewRefCode('');
    } catch (e) {
      setStatus({ type: 'error', message: e.response?.data?.error || 'Could not set referrer' });
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>Referrals</h2>

      <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px' }}>
        <button onClick={() => setTab('summary')} disabled={tab === 'summary'}>
          Summary
        </button>
        <button onClick={() => setTab('referred')} disabled={tab === 'referred'}>
          Referred Users
        </button>
      </div>

      {status && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            background: status.type === 'error' ? 'rgba(255,99,132,0.15)' : 'rgba(123,104,238,0.15)',
            color: status.type === 'error' ? '#ff6b81' : '#E6E6FA',
            fontSize: 13,
          }}
        >
          {status.message}
        </div>
      )}

      {tab === 'summary' && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Your Referral Link:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type='text'
                value={referralLink}
                readOnly
                style={{
                  padding: '6px 8px',
                  flex: 1,
                  background: 'rgba(123,104,238,0.1)',
                  border: '1px solid rgba(123,104,238,0.3)',
                  borderRadius: 4,
                  fontSize: 13,
                  color: '#E6E6FA'
                }}
                onClick={(e) => e.target.select()}
              />
              <button onClick={() => {
                navigator.clipboard.writeText(referralLink);
                setStatus({ type: 'success', message: 'Referral link copied!' });
                setTimeout(() => setStatus(null), 2000);
              }}>
                Copy Link
              </button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              Your code: <b>{code}</b>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type='text'
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder='Claim destination address'
              style={{ padding: '6px 8px', minWidth: 360 }}
            />
            <button onClick={handleClaim} disabled={!canClaim}>
              Claim Rewards (min {MIN_CLAIM} SOL)
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type='text'
              value={newRefCode}
              onChange={(e) => setNewRefCode(e.target.value)}
              placeholder='Have a referrer? Enter code'
              style={{ padding: '6px 8px', minWidth: 360 }}
            />
            <button onClick={setReferrer}>Set / Change Referrer</button>
          </div>

          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Pending rewards: {Number(rewards || 0).toFixed(4)} SOL
          </div>
        </div>
      )}

      {tab === 'referred' && (
        <div style={{ marginTop: 8 }}>
          {loadingRefs ? (
            <p>Loading referred users…</p>
          ) : referrals.length === 0 ? (
            <p>No referred users yet.</p>
          ) : (
            <div style={{ border: '1px solid #7B68EE', borderRadius: 8, overflow: 'hidden', maxWidth: 720 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 140px 160px',
                  padding: '8px 12px',
                  background: 'rgba(123,104,238,0.15)',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                <div>User</div>
                <div>Volume (SOL)</div>
                <div>Since</div>
              </div>
              {referrals.map((ref) => (
                <div
                  key={ref.userId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 140px 160px',
                    padding: '8px 12px',
                    borderTop: '1px solid rgba(123,104,238,0.35)'
                  }}
                >
                  <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{ref.userId}</div>
                  <div>{Number(ref.volume || 0).toFixed(2)}</div>
                  <div>{ref.since ? new Date(ref.since).toLocaleDateString() : '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Referral;
