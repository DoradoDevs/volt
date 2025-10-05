import React, { useState } from 'react';
import api from '../services/api';

const Header = ({ email, displayName: initialDisplayName, onDisplayNameChange }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(initialDisplayName || '');

  const username = (email || '').split('@')[0] || 'user';
  const displayText = displayName || username;

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.assign('/login');
  };

  const handleOpenModal = () => {
    setNewDisplayName(displayName);
    setModalOpen(true);
    setDropdownOpen(false);
  };

  const handleSaveDisplayName = async () => {
    setSaving(true);
    try {
      const { data } = await api.post('/settings/display-name', { displayName: newDisplayName });
      setDisplayName(data.displayName);
      if (onDisplayNameChange) {
        onDisplayNameChange(data.displayName);
      }
      setModalOpen(false);
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to update display name');
    } finally {
      setSaving(false);
    }
  };

  const [isHovering, setIsHovering] = useState(false);

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
            <span style={{ fontWeight: 700 }}>{displayText}</span>
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
                onClick={handleOpenModal}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Change Display Name
              </div>
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

      {/* Display Name Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#2a0a4a',
              padding: 24,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.2)',
              maxWidth: 400,
              width: '90%',
              color: '#E6E6FA'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Change Display Name</h3>
            <input
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Enter display name"
              maxLength={50}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.3)',
                color: '#E6E6FA',
                fontSize: 14,
                marginBottom: 16,
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: '#E6E6FA',
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDisplayName}
                disabled={saving}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#7c3aed',
                  color: 'white',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  opacity: saving ? 0.6 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
