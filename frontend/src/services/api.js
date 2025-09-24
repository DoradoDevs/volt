// frontend/src/services/api.js
import axios from 'axios';

const api = axios.create({
  // If REACT_APP_API_BASE is set, use it; otherwise default to :5000 at root.
  baseURL: process.env.REACT_APP_API_BASE || 'http://localhost:5000',
});

// Attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
