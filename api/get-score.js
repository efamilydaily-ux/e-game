import { Redis } from '@upstash/redis'
const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  const { trainerName, gameId } = req.query;

  if (!trainerName || !gameId) {
    return res.status(400).json({ success: false, message: '缺少必要參數。' });
  }

  const dataKey = `E_Game:${trainerName}:${gameId}`;
  
  try {
    // 從 Upstash 讀取進度 (改用 redis.get)
    const data = await redis.get(dataKey);
    return res.status(200).json({ success: true, data: data ?? null });
  } catch (error) {
    console.error('Redis 讀取分數錯誤:', error);
    return res.status(500).json({ success: false, message: `無法讀取資料庫: ${error.message}` });
  }
}
