import React, { useState } from 'react';

const Header = ({ username }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.assign('/login');
  };

  return (
    <>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        background: '#3b0a64',
        color: '#E6E6FA',
        borderBottom: '1px solid rgba(255,255,255,0.15)'
      }}>
        <div
          style={{ fontWeight: 700, cursor:'pointer' }}
          onClick={() => window.location.assign('/dashboard')}
          title="Go to Dashboard"
        >
          VolT
        </div>

        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setDropdownOpen(!dropdownOpen)}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            style={{
              opacity: 0.9,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 6,
              transition: 'background 0.2s',
              background: dropdownOpen || isHovering ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            <span style={{ fontWeight: 700 }}>{username || 'user'}</span>
            <span style={{ fontSize: 12, opacity: isHovering || dropdownOpen ? 1 : 0, transition: 'opacity 0.2s' }}>▼</span>
          </div>

          {dropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 8,
                background: '#2a0a4a',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                minWidth: 200,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 100
              }}
            >
              <div
                onClick={handleLogout}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  color: '#ff6b6b',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Logout
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div
          onClick={() => setDropdownOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9
          }}
        />
      )}
    </>
  );
};

export default Header;
