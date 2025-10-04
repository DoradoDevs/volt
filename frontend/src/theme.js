// Centralized theme for VolT
export const theme = {
  colors: {
    // Backgrounds - Darker and sleeker
    bgPrimary: '#0a0012',           // Very dark purple-black
    bgSecondary: '#0f0520',         // Slightly lighter dark purple
    bgPanel: 'rgba(123,104,238,0.06)', // Subtle purple tint
    bgInput: 'rgba(123,104,238,0.08)', // Slightly more visible inputs
    bgDropdown: '#0f0520',          // Dropdown background
    bgHover: 'rgba(123,104,238,0.15)', // Hover state
    bgSelected: 'rgba(123,104,238,0.22)', // Selected state

    // Borders
    borderPrimary: 'rgba(123,104,238,0.6)',
    borderInput: 'rgba(123,104,238,0.3)',
    borderPanel: 'rgba(123,104,238,0.25)',

    // Text
    text: '#E6E6FA',                // Primary text (lavender)
    textHint: 'rgba(230,230,250,0.6)', // Hint/secondary text
    textLabel: 'rgba(230,230,250,0.85)', // Labels
    textHeading: '#b7a3ff',         // Headings

    // Accent colors
    purple: '#7B68EE',              // Primary purple
    purpleLight: '#b7a3ff',         // Light purple
    pink: 'rgba(123,104,238,0.08)', // Panel purple tint

    // Status colors
    success: '#b7a3ff',
    error: '#ff6b81',
    warning: '#ff6b81',
  },

  shadows: {
    focus: '0 0 0 3px rgba(123,104,238,0.25)',
    button: '0 2px 8px rgba(0,0,0,0.2)',
    dropdown: '0 8px 24px rgba(0,0,0,0.3)',
    modal: '0 20px 40px rgba(0,0,0,0.4)',
  },

  borderRadius: {
    sm: 8,
    md: 10,
    lg: 12,
    xl: 14,
    full: 999,
  },
};

export default theme;
