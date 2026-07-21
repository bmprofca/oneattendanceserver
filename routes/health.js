import express from 'express';

const router = express.Router();


router.get('/', (req, res) => {
  res.json({ message: 'OneAttendance API', status: 'ok' });
});


router.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

export default router;
