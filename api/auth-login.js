import { Redis } from '@upstash/redis'
const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { trainerName, password, gameId, defaultData } = req.body;

  // 1. 基礎欄位檢查
  if (!trainerName || !password || !gameId) {
    return res.status(400).json({ success: false, message: '請輸入完整的名字與密碼！' });
  }

  // 2. 用戶名長度驗證：最少 4 個字元
  if (trainerName.trim().length < 4) {
    return res.status(400).json({ success: false, message: '訓練師名字不能少於 4 個字元！' });
  }
  //  密碼長度驗證：最少 6 個字
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: '密碼長度不能少於 6 個字！' });
  }

  const cleanName = trainerName.trim();
  const accountKey = `E_Game:Account:${cleanName.toLowerCase()}`;
  const dataKey = `E_Game:${cleanName}:${gameId}`;

  try {
    // 檢查雲端有沒有這個帳號
    let account = await redis.get(accountKey);

    if (!account) {
      // ======= 找不到帳號 ➡️ 自動註冊建立帳號 =======
      const mockToken = `token_${Math.random().toString(36).substring(2)}_${Date.now()}`;
      account = {
        username: cleanName,
        password: password,
        token: mockToken
      };
      
      // 寫入帳戶密碼，並同時初始化全新進度
      await redis.set(accountKey, account);
      await redis.set(dataKey, defaultData);

      return res.status(200).json({
        success: true,
        message: '建立新帳號成功！',
        token: mockToken,
        data: defaultData
      });
    } else {
      // ======= 找到帳號 ➡️ 驗證密碼 =======
      if (account.password !== password) {
        return res.status(403).json({ success: false, message: '密碼不正確！如果是新玩家，請更換一個未被使用過的名字。' });
      }

      // 密碼正確，讀取玩家當前遊戲進度
      const gameData = await redis.get(dataKey);

      return res.status(200).json({
        success: true,
        message: '登入成功！歡迎回來。',
        token: account.token,
        data: gameData || defaultData
      });
    }
  } catch (error) {
    console.error('Redis 登入錯誤:', error);
    return res.status(500).json({ success: false, message: `伺服器資料庫出錯: ${error.message}` });
  }
}
