import { Redis } from '@upstash/redis'
const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  const { trainerName, gameId, gameData, token } = req.body;

  if (!trainerName || !gameId || !gameData || !token) {
    return res.status(400).json({ success: false, message: '缺少必要參數。' });
  }

  try {
    // 驗證大廳配發的 Token 安全性 (改用 redis.get)
    const accountKey = `E_House:Account:${trainerName.toLowerCase()}`;
    const account = await redis.get(accountKey);

    if (!account || account.token !== token) {
      return res.status(403).json({ success: false, message: '驗證失敗，拒絕存取。' });
    }

    // 儲存進度到 Upstash (改用 redis.set)
    const dataKey = `E_House:${trainerName}:${gameId}`;
    await redis.set(dataKey, gameData);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Redis 儲存分數錯誤:', error);
    return res.status(500).json({ success: false, message: `無法寫入資料庫: ${error.message}` });
  }
}
