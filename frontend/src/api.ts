import axios from 'axios';

// ใช้ origin จาก window เพื่อรองรับ port ที่เปลี่ยนอัตโนมัติเมื่อ 8000 ถูกใช้งานแล้ว
const api = axios.create({
  baseURL: window.location.origin,
});

export default api;
