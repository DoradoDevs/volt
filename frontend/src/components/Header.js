import React from 'react';

const Header = ({ email }) => {
  const username = (email || '').split('@')[0] || 'user';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 20px',
      background: '#3a006f',
      color: '#E6E6FA',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      borderBottom: '1px solid #6a28b5'
    }}>
      <div style={{ fontWeight: 700 }}>VolT</div>
      <div style={{ opacity: 0.9 }}>Hi, <span style={{ fontWeight: 700 }}>{username}</span></div>
    </div>
  );
};

export default Header;
