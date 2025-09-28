import React, { useEffect, useState } from 'react';
import api from '../services/api';

const MIN_CLAIM = 0.05;

const Referral = ({ code, rewards }) => {
  const [destination, setDestination] = useState('');
  const [tab, setTab] = useState('summary'); // 'summary' | 'referred'
  const [referrals, setReferrals] = useState([]);
  const [newRefCode, setNewRefCode] = useState('');

  useEffect(() => {
    if (tab === 'referred') {
      api.get('/referral/list')
        .then(({ data }) => setReferrals(data.referrals || []))
        .catch(() => setReferrals([]));
    }
  }, [tab]);

  const handleClaim = async () => {
    try {
      const { data } = await api.post('/referral/claim', { destination });
      alert(`Rewards claimed: TXID ${data.txid}`);
      window.location.reload();
    } catch (e) {
      alert(e.response?.data?.error || 'Error claiming rewards');
    }
  };

  const copy = async (txt) => {
    try { await navigator.clipboard.writeText(txt); alert('Copied'); } catch { /* ignore */ }
  };

  const setReferrer = async () => {
    if (!newRefCode.trim()) return;
    try {
      const { data } = await api.post('/referral/set', { code: newRefCode.trim() });
      alert(`Referrer set: ${data.referrerEmail || 'updated'}`);
      setNewRefCode('');
    } catch (e) {
      alert(e.response?.data?.error || 'Could not set referrer');
    }
  };

  const canClaim = Number(rewards) >= MIN_CLAIM;

  return (
    <div style={{ margin: '20px 0' }}>
      <h2 style={{ marginBottom: 10 }}>Referrals</h2>

      <div style={{ display:'flex', gap:8, margin:'8px 0 16px' }}>
        <button onClick={()=>setTab('summary')} disabled={tab==='summary'}>Summary</button>
        <button onClick={()=>setTab('referred')} disabled={tab==='referred'}>Referred Users</button>
      </div>

      {tab === 'summary' && (
        <div style={{ display:'grid', gap:12, maxWidth: 680 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div>Your Referral Code: <b>{code}</b></div>
            <button onClick={() => copy(code)}>Copy</button>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Claim destination address"
              style={{ padding: '6px 8px', minWidth: 360 }}
            />
            <button onClick={handleClaim} disabled={!canClaim}>
              Claim Rewards (min {MIN_CLAIM} SOL)
            </button>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
            <input
              type="text"
              value={newRefCode}
              onChange={(e) => setNewRefCode(e.target.value)}
              placeholder="Have a referrer? Enter code"
              style={{ padding:'6px 8px', minWidth: 360 }}
            />
            <button onClick={setReferrer}>Set/Change Referrer</button>
          </div>
        </div>
      )}

      {tab === 'referred' && (
        <div style={{ marginTop:8 }}>
          {referrals.length === 0 ? (
            <p>No referred users yet.</p>
          ) : (
            <div style={{ border:'1px solid #7B68EE', borderRadius:8, overflow:'hidden', maxWidth: 680 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 180px', padding:'8px 12px', background:'rgba(123,104,238,0.15)', fontWeight:600 }}>
                <div>User</div>
                <div>Earned for you (SOL)</div>
              </div>
              {referrals.map(r => (
                <div key={r.userId} style={{ display:'grid', gridTemplateColumns:'1fr 180px', padding:'8px 12px', borderTop:'1px solid #7B68EE' }}>
                  <div>{r.email}</div>
                  <div>{r.earnedSOL}</div>
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
