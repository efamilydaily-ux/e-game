/**
 * GameClient.js
 * Encapsulates all API communication for 乘法神速賽.
 * Every request is bound to the configured gameId.
 */

const BASE_URL = ''; // Set to your API base URL, e.g. 'https://your-domain.com'
const GAME_ID = 'multiplication-blitz-v1'; // Fixed gameId for this game

class GameClient {
  constructor(gameId = GAME_ID) {
    this.gameId = gameId;
    this.trainerName = null;
    this.token = null;
  }

  /**
   * Login or auto-register a player.
   * @param {string} trainerName
   * @param {string} password
   * @param {object} defaultData  – sent on first-time registration
   * @returns {{ success, token, data, message }}
   */
  async login(trainerName, password, defaultData) {
    const res = await fetch(`${BASE_URL}/api/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trainerName,
        password,
        gameId: this.gameId,
        defaultData,
      }),
    });

    const json = await res.json();

    if (json.success) {
      this.trainerName = trainerName;
      this.token = json.token;
    }

    return json; // { success, message, token, data }
  }

  /**
   * Persist the full gameData object to Redis.
   * Requires a prior successful login().
   * @param {object} gameData
   * @returns {{ success, message }}
   */
  async saveScore(gameData) {
    if (!this.trainerName || !this.token) {
      return { success: false, message: '尚未登入，無法儲存。' };
    }

    const res = await fetch(`${BASE_URL}/api/save-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trainerName: this.trainerName,
        gameId: this.gameId,
        gameData,
        token: this.token,
      }),
    });

    return res.json(); // { success, message }
  }

  /**
   * Fetch the current game data from Redis.
   * @returns {{ success, data }}
   */
  async getScore() {
    if (!this.trainerName) {
      return { success: false, data: null, message: '尚未登入。' };
    }

    const params = new URLSearchParams({
      trainerName: this.trainerName,
      gameId: this.gameId,
    });

    const res = await fetch(`${BASE_URL}/api/get-score?${params}`);
    return res.json(); // { success, data }
  }

  /** Convenience: check whether client is authenticated. */
  get isAuthenticated() {
    return !!(this.trainerName && this.token);
  }
}

// Export a singleton so App.js and GameLogic.js share the same instance.
export const gameClient = new GameClient();
export default GameClient;
