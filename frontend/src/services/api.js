// frontend/src/services/api.js
import axios from 'axios';

const api = axios.create({
  // All API routes are prefixed with /api
  // In production: /api (nginx proxies to backend)
  // In development: http://localhost:5000/api
  baseURL: process.env.REACT_APP_API_BASE || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api'),
});

// Attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
