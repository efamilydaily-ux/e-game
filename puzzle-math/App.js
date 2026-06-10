/**
 * App.js  ── 乘法神速賽（重構版）
 *
 * 變更摘要：
 *  - 音效改為 DOM getElementById，不再 new Audio()
 *  - 圖片路徑改為 .png
 *  - 新增 MainMenu 頁面（常錯清單 + 已解鎖照片清單）
 *  - 答題後凍結 1500ms 再進下一題
 *  - 錯題邏輯修正：答錯只記錄，不連續重複出題
 *  - 遊戲中加入 Exit 按鈕，返回主選單
 *  - 解鎖格子時播放 snd-unlock；完成拼圖時播放 snd-complete
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { gameClient } from './GameClient.js';
import {
  createDefaultGameData,
  generateQuestion,
  generateOptions,
  processAnswer,
  getUnlockedSet,
  puzzleProgress,
  scoreToNextCell,
  GAME_CONFIG,
  UNLOCK_ORDER,
} from './GameLogic.js';

// ─── Pages ────────────────────────────────────────────────────────────────────
const PAGE = { LOGIN: 'login', MENU: 'menu', GAME: 'game' };

// ─── Audio helper ─────────────────────────────────────────────────────────────
function playSound(id) {
  try {
    const el = document.getElementById(id);
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch (_) {}
}

// ─── useCountdown ─────────────────────────────────────────────────────────────
function useCountdown(seconds, onExpire) {
  const [remaining, setRemaining] = useState(seconds);
  const timerRef   = useRef(null);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  const reset = useCallback((s = seconds) => {
    clearInterval(timerRef.current);
    setRemaining(s);
    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); onExpireRef.current(); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [seconds]);

  const stop = useCallback(() => clearInterval(timerRef.current), []);
  useEffect(() => () => clearInterval(timerRef.current), []);
  return { remaining, reset, stop };
}

// ─── LoginScreen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [name, setName]     = useState('');
  const [pass, setPass]     = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !pass.trim()) { setError('請輸入名字與密碼'); return; }
    if (pass.length < 6) { setError('密碼至少需要 6 個字元'); return; }
    setLoading(true); setError('');
    const result = await gameClient.login(name.trim(), pass, createDefaultGameData());
    setLoading(false);
    if (result.success) onLogin(result.data || createDefaultGameData());
    else setError(result.message || '登入失敗，請再試一次');
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">✖</div>
        <h1 className="login-title">乘法神速賽</h1>
        <p className="login-subtitle">解鎖拼圖，挑戰極速乘法！</p>
        <div className="field-group">
          <label>訓練師名字</label>
          <input type="text" placeholder="輸入你的名字…" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>
        <div className="field-group">
          <label>密碼（至少 6 字）</label>
          <input type="password" placeholder="設定或輸入密碼…" value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>
        {error && <p className="login-error">{error}</p>}
        <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? '連線中…' : '進入遊戲 →'}
        </button>
      </div>
    </div>
  );
}

// ─── MainMenu ─────────────────────────────────────────────────────────────────
function MainMenu({ gameData, onStartGame }) {
  // 常錯 10 題：取 errorTracker 裡錯誤次數最多的前 10 題
  const errorEntries = Object.values(gameData.errorTracker || {});
  const top10 = [...errorEntries]
    .sort((a, b) => (b.replayed?.length ?? 0) - (a.replayed?.length ?? 0)
      || (b.replayAt?.length ?? 0) - (a.replayAt?.length ?? 0))
    .slice(0, 10);

  // 已解鎖照片：至少解鎖 1 格的拼圖
  const unlockedPhotos = gameData.puzzles
    .map((p, i) => ({ index: i, count: p.unlockedIndices.length, completed: p.completed }))
    .filter(p => p.count > 0);

  return (
    <div className="menu-screen">
      <div className="menu-header">
        <h1 className="login-title">乘法神速賽</h1>
        <p className="menu-score">累積得分：<strong>{gameData.totalScore}</strong></p>
      </div>

      <button className="btn-primary btn-start" onClick={onStartGame}>
        ▶ 開始遊戲
      </button>

      <div className="menu-panels">
        {/* 常錯清單 */}
        <div className="menu-panel">
          <h2 className="panel-title">📋 常錯 10 題</h2>
          {top10.length === 0
            ? <p className="panel-empty">尚無錯題紀錄，繼續加油！</p>
            : <ul className="error-list">
                {top10.map(e => (
                  <li key={`${e.a}x${e.b}`} className="error-item">
                    <span className="error-eq">{e.a} × {e.b} = {e.a * e.b}</span>
                    <span className="error-badge">
                      待複習 {e.replayAt?.length ?? 0} 次
                    </span>
                  </li>
                ))}
              </ul>
          }
        </div>

        {/* 已解鎖照片 */}
        <div className="menu-panel">
          <h2 className="panel-title">🖼 解鎖照片</h2>
          {unlockedPhotos.length === 0
            ? <p className="panel-empty">尚未解鎖任何圖片，快去答題！</p>
            : <div className="photo-list">
                {unlockedPhotos.map(p => (
                  <div key={p.index} className="photo-thumb-wrap">
                    <div
                      className="photo-thumb"
                      style={{ backgroundImage: `url(images/puzzle_${p.index}.png)` }}
                    >
                      {!p.completed && (
                        <div className="photo-thumb-overlay">
                          {p.count}/{GAME_CONFIG.CELLS_PER_PUZZLE}
                        </div>
                      )}
                      {p.completed && <div className="photo-thumb-done">✓</div>}
                    </div>
                    <span className="photo-label">拼圖 {p.index + 1}</span>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

// ─── PuzzleGrid ───────────────────────────────────────────────────────────────
function PuzzleGrid({ backgroundImage, unlockedSet, newlyUnlocked }) {
  const COLS = 4, ROWS = 3;
  return (
    <div className="puzzle-grid">
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const col = i % COLS, row = Math.floor(i / COLS);
        const revealed = unlockedSet.has(i);
        const flashing = newlyUnlocked.has(i);
        const bpX = (col / (COLS - 1)) * 100;
        const bpY = (row / (ROWS - 1)) * 100;
        return (
          <div
            key={i}
            className={['puzzle-cell', revealed ? 'revealed' : 'masked', flashing ? 'unlocking' : '']
              .filter(Boolean).join(' ')}
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
              backgroundPosition: `${bpX}% ${bpY}%`,
            }}
          >
            {!revealed && <span className="mask-icon">🔒</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── CongratsOverlay ─────────────────────────────────────────────────────────
function CongratsOverlay({ puzzleIndex, onNext, onMenu }) {
  const isLast = puzzleIndex >= GAME_CONFIG.TOTAL_PUZZLES - 1;
  return (
    <div className="congrats-overlay">
      <div className="congrats-card">
        <div className="congrats-emoji">🎉</div>
        <h2>拼圖完成！</h2>
        <p>第 <strong>{puzzleIndex + 1}</strong> 幅圖解鎖完畢，你太厲害了！</p>
        <div className="congrats-actions">
          <button className="btn-secondary" onClick={onMenu}>回主選單</button>
          {!isLast && <button className="btn-primary" onClick={onNext}>繼續挑戰 →</button>}
          {isLast  && <p className="all-done">🏆 全部 10 幅拼圖已完成！你是乘法冠軍！</p>}
        </div>
      </div>
    </div>
  );
}

// ─── GameScreen ───────────────────────────────────────────────────────────────
function GameScreen({ gameData: initialData, onDataUpdate, onExit }) {
  const [gameData, setGameData] = useState(initialData);
  const [question, setQuestion]       = useState(null);
  const [options, setOptions]         = useState([]);
  const [feedback, setFeedback]       = useState(null);   // 'correct' | 'wrong' | null
  const [selectedOption, setSelectedOption] = useState(null);
  const [locked, setLocked]           = useState(false);
  const [newlyUnlocked, setNewlyUnlocked]   = useState(new Set());
  const [showCongrats, setShowCongrats]     = useState(false);
  const [saveStatus, setSaveStatus]         = useState('');

  // Refs for stale-closure safety
  const gameDataRef  = useRef(gameData);
  const questionRef  = useRef(null);
  const lockedRef    = useRef(false);
  useEffect(() => { gameDataRef.current = gameData; }, [gameData]);
  useEffect(() => { questionRef.current = question; }, [question]);
  useEffect(() => { lockedRef.current = locked; }, [locked]);

  // ── Load next question ─────────────────────────────────────────
  const loadQuestion = useCallback(data => {
    const q = generateQuestion(data.errorTracker, data.answeredCount);
    setQuestion(q);
    setOptions(generateOptions(q.answer));
    setFeedback(null);
    setSelectedOption(null);
    setLocked(false);
  }, []);

  // ── Timer expire = timeout (treat as wrong) ────────────────────
  const handleExpire = useCallback(() => {
    if (lockedRef.current || !questionRef.current) return;
    handleAnswer(-1);           // -1 never matches any valid answer
  }, []);

  const { remaining, reset: resetTimer, stop: stopTimer } =
    useCountdown(3, handleExpire);

  // ── Answer handler ─────────────────────────────────────────────
  async function handleAnswer(playerAnswer) {
    if (lockedRef.current || !questionRef.current || !gameDataRef.current) return;

    // Freeze immediately
    setLocked(true);
    lockedRef.current = true;
    stopTimer();
    setSelectedOption(playerAnswer);

    const { gameData: nextData, correct, newUnlocks } =
      processAnswer(gameDataRef.current, questionRef.current, playerAnswer);

    setFeedback(correct ? 'correct' : 'wrong');

    // Audio
    playSound(correct ? 'snd-correct' : 'snd-wrong');

    // Unlock animation
    if (newUnlocks.length > 0) {
      playSound('snd-unlock');
      setNewlyUnlocked(new Set(newUnlocks));
      setTimeout(() => setNewlyUnlocked(new Set()), 1400);
    }

    // Check puzzle complete (compare old vs new)
    const prevPuzzle = gameDataRef.current.puzzles[gameDataRef.current.currentPuzzleIndex];
    const justCompleted = nextData.puzzles[gameDataRef.current.currentPuzzleIndex]?.completed
      && !prevPuzzle?.completed;

    setGameData(nextData);
    onDataUpdate(nextData);         // bubble up so MainMenu stays fresh

    // Persist
    setSaveStatus('saving');
    const saveResult = await gameClient.saveScore(nextData);
    setSaveStatus(saveResult.success ? 'saved' : 'error');
    setTimeout(() => setSaveStatus(''), 2000);

    if (justCompleted) {
      playSound('snd-complete');
      // Wait 1.5 s then show congrats
      setTimeout(() => setShowCongrats(true), 1500);
      return;
    }

    // 1.5 s freeze then next question
    setTimeout(() => {
      loadQuestion(nextData);
      resetTimer(3);
    }, 1500);
  }

  // ── Init ───────────────────────────────────────────────────────
  useEffect(() => {
    loadQuestion(gameData);
    resetTimer(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Congrats continue ──────────────────────────────────────────
  function handleContinue() {
    setShowCongrats(false);
    loadQuestion(gameData);
    resetTimer(3);
  }

  if (!question) return (
    <div className="loading-screen">
      <div className="spinner" /><p>載入中…</p>
    </div>
  );

  const pidx       = gameData.currentPuzzleIndex;
  const unlockedSet = getUnlockedSet(gameData, pidx);
  const progress   = puzzleProgress(gameData);
  const toNext     = scoreToNextCell(gameData);
  const combo      = gameData.combo;
  const comboLabel = combo >= 6 ? '🔥🔥🔥 MAX COMBO'
    : combo >= 3 ? `🔥 COMBO x${combo}`
    : combo > 0  ? `Combo x${combo}` : '';
  const timerFraction = remaining / 3;
  const timerColor = remaining <= 1 ? '#ef4444' : remaining <= 2 ? '#f59e0b' : '#22c55e';

  return (
    <div className="game-screen">
      {/* HUD */}
      <header className="hud">
        <div className="hud-score">
          <span className="hud-label">得分</span>
          <span className="hud-value">{gameData.totalScore}</span>
        </div>
        <div className="hud-center">
          <div className="timer-ring"
            style={{ '--fraction': timerFraction, '--color': timerColor }}>
            <span className="timer-number">{remaining}</span>
          </div>
        </div>
        <div className="hud-right">
          <div className="hud-puzzle">
            <span className="hud-label">拼圖 {pidx + 1}/10</span>
            <span className="hud-value">{progress}%</span>
          </div>
          <button className="btn-exit" onClick={onExit} title="退出至主選單">✕ 退出</button>
        </div>
      </header>

      {/* Combo */}
      {comboLabel && (
        <div className={`combo-banner${combo >= 6 ? ' max' : ''}`}>{comboLabel}</div>
      )}

      {/* Puzzle */}
      <section className="puzzle-section">
        <PuzzleGrid
          backgroundImage={`images/puzzle_${pidx}.png`}
          unlockedSet={unlockedSet}
          newlyUnlocked={newlyUnlocked}
        />
        <p className="next-unlock-hint">再 {toNext} 分解鎖下一格</p>
      </section>

      {/* Question */}
      <section className="question-section">
        {question.isReplay && <span className="replay-badge">📋 複習題</span>}
        <div className="question-display">
          <span className="operand">{question.a}</span>
          <span className="operator">✕</span>
          <span className="operand">{question.b}</span>
          <span className="operator">=</span>
          <span className="answer-blank">?</span>
        </div>
      </section>

      {/* Options */}
      <section className="options-grid">
        {options.map(opt => {
          let cls = 'option-btn';
          if (selectedOption !== null) {
            if (opt === question.answer) cls += ' correct';
            else if (opt === selectedOption) cls += ' wrong';
          }
          return (
            <button key={opt} className={cls}
              onClick={() => handleAnswer(opt)} disabled={locked}>
              {opt}
            </button>
          );
        })}
      </section>

      {/* Feedback */}
      {feedback && (
        <div className={`feedback-flash ${feedback}`}>
          {feedback === 'correct' ? '✓ 正確！' : '✗ 再加油！'}
        </div>
      )}

      {/* Save */}
      {saveStatus && (
        <div className={`save-status ${saveStatus}`}>
          {saveStatus === 'saving' ? '☁️ 儲存中…'
            : saveStatus === 'saved' ? '✅ 已儲存' : '⚠️ 儲存失敗'}
        </div>
      )}

      {/* Congrats */}
      {showCongrats && (
        <CongratsOverlay
          puzzleIndex={pidx}
          onNext={handleContinue}
          onMenu={onExit}
        />
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]         = useState(PAGE.LOGIN);
  const [gameData, setGameData] = useState(null);

  function handleLogin(data) {
    setGameData(data);
    setPage(PAGE.MENU);
  }

  function handleDataUpdate(data) {
    setGameData(data);
  }

  if (page === PAGE.LOGIN) return <LoginScreen onLogin={handleLogin} />;
  if (page === PAGE.MENU)  return (
    <MainMenu
      gameData={gameData}
      onStartGame={() => setPage(PAGE.GAME)}
    />
  );
  if (page === PAGE.GAME)  return (
    <GameScreen
      gameData={gameData}
      onDataUpdate={handleDataUpdate}
      onExit={() => setPage(PAGE.MENU)}
    />
  );
}
