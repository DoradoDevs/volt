// frontend/src/services/api.js
import axios from 'axios';

const api = axios.create({
  // In production (served via nginx), use relative URLs
  // In development, connect to localhost:5000
  baseURL: process.env.REACT_APP_API_BASE || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000'),
});

// Attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
