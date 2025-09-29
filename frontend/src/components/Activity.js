// frontend/src/components/Activity.js
import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const palette = {
  text: '#E6E6FA',
  dim: 'rgba(230,230,250,0.75)',
  border: 'rgba(230,230,250,0.18)',
  card: 'rgba(255,255,255,0.06)',
  ok: '#38bdf8',
  err: '#fb7185',
  badge: 'rgba(255,255,255,0.08)',
};

const Chip = ({ tone = 'ok', children }) => {
  const bg = tone === 'ok' ? 'rgba(56,189,248,0.18)' : 'rgba(251,113,133,0.18)';
  const bd = tone === 'ok' ? 'rgba(56,189,248,0.35)' : 'rgba(251,113,133,0.35)';
  const color = tone === 'ok' ? palette.ok : palette.err;
  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: 999,
      border: `1px solid ${bd}`,
      background: bg,
      color,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      whiteSpace: 'nowrap'
    }}>
      {children}
    </span>
  );
};

const Box = ({ children }) => (
  <div style={{
    background: 'rgba(255,192,203,0.08)',
    border: `1px solid rgba(255,192,203,0.25)`,
    borderRadius: 14,
    padding: 14,
  }}>
    {children}
  </div>
);

const short = (s = '', head = 4, tail = 4) =>
  s.length > head + tail + 3 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;

const fmtAmt = (n) => {
  if (!Number.isFinite(Number(n))) return '—';
  const x = Number(n);
  if (x >= 1) return x.toFixed(3);
  if (x >= 0.01) return x.toFixed(4);
  return x.toFixed(6);
};

const Row = ({ item }) => {
  const ts = useMemo(() => {
    try { return new Date(item.ts).toLocaleString(); } catch { return ''; }
  }, [item.ts]);

  const statusTone = item.status === 'confirmed' ? 'ok' : 'err';
  const explorer = item.txid
    ? `https://explorer.solana.com/tx/${item.txid}`
    : null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.2fr 1.2fr 1fr 1fr auto',
      gap: 10,
      alignItems: 'center',
      padding: '10px 12px',
      borderBottom: `1px solid ${palette.border}`,
    }}>
      <div style={{ color: palette.dim, fontSize: 13 }}>{ts}</div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{short(item.wallet, 6, 6)}</span>
        <Chip tone={statusTone}>{item.status}</Chip>
      </div>

      <div style={{ fontSize: 13, color: palette.text, textTransform: 'capitalize' }}>
        {item.action || item.mode || '—'}
      </div>

      <div style={{ fontSize: 13, color: palette.text }}>
        {fmtAmt(item.amount)} <span style={{ opacity: 0.8 }}>({short(item.inputMint, 4, 4)} → {short(item.outputMint, 4, 4)})</span>
      </div>

      <div style={{ textAlign: 'right' }}>
        {explorer ? (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 12,
              color: palette.text,
              textDecoration: 'none',
              background: palette.badge,
              border: `1px solid ${palette.border}`,
              padding: '6px 8px',
              borderRadius: 8
            }}
            title="Open in Solana Explorer"
          >
            View Tx
          </a>
        ) : (
          <span style={{ fontSize: 12, color: palette.dim }}>—</span>
        )}
      </div>
    </div>
  );
};

const Activity = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const { data } = await api.get('/activity?limit=75');
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setErr('Failed to load activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Activity</h2>
        <button onClick={load}>Refresh</button>
      </div>

      <Box>
        {loading ? (
          <div style={{ padding: 12, color: palette.dim }}>Loading…</div>
        ) : err ? (
          <div style={{ padding: 12, color: '#ffb4c0' }}>{err}</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 12, color: palette.dim }}>No activity yet.</div>
        ) : (
          <div style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 10,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1.2fr 1fr 1fr auto',
              gap: 10,
              padding: '10px 12px',
              fontWeight: 700,
              fontSize: 12,
              color: palette.dim,
              background: 'rgba(255,255,255,0.04)',
              borderBottom: `1px solid ${palette.border}`,
            }}>
              <div>Time</div>
              <div>Wallet / Status</div>
              <div>Action</div>
              <div>Amount (Mint)</div>
              <div style={{ textAlign: 'right' }}>Tx</div>
            </div>

            <div>
              {items.map((it, idx) => <Row key={idx} item={it} />)}
            </div>
          </div>
        )}
      </Box>
    </div>
  );
};

export default Activity;
