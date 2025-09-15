import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api', // Updated to include /api prefix
});

export default api;