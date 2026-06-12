import React, { useEffect, useMemo, useState } from "react";
import { Bot, Crown, RefreshCcw, Sparkles, Users } from "lucide-react";

const BOARD_SIZE = 8;
const STORAGE_KEY = "checkers-game-session-v3";
const DEFAULT_BOT_DIFFICULTY = "smart";
const DEFAULT_HUMAN_PLAYER = "red";
const WIN_SCORE = 100000;

const BOT_DIFFICULTIES = {
  easy: {
    label: "Easy",
    depth: 0,
  },
  smart: {
    label: "Smart",
    depth: 4,
  },
  hard: {
    label: "Hard",
    depth: 5,
  },
};

const PLAYERS = {
  red: {
    label: "Red",
    direction: -1,
    homeRows: [5, 6, 7],
    promotionRow: 0,
    pieceClass:
      "border-red-200/80 bg-[radial-gradient(circle_at_35%_25%,#fecaca_0%,#ef4444_28%,#991b1b_78%)] shadow-piece-red",
    ringClass: "ring-red-200/70",
    crownClass: "text-yellow-100 drop-shadow-[0_1px_2px_rgba(127,29,29,0.75)]",
  },
  black: {
    label: "Black",
    direction: 1,
    homeRows: [0, 1, 2],
    promotionRow: 7,
    pieceClass:
      "border-zinc-300/45 bg-[radial-gradient(circle_at_35%_25%,#71717a_0%,#18181b_36%,#020617_84%)] shadow-piece-black",
    ringClass: "ring-zinc-300/60",
    crownClass: "text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]",
  },
};

function createInitialBoard() {
  return Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => {
      if (!isDarkSquare(row, col)) return null;

      if (PLAYERS.red.homeRows.includes(row)) {
        return createPiece("red", row, col);
      }

      if (PLAYERS.black.homeRows.includes(row)) {
        return createPiece("black", row, col);
      }

      return null;
    }),
  );
}

function createPiece(player, row, col) {
  return {
    id: `${player}-${row}-${col}`,
    player,
    king: false,
  };
}

function createInitialGame(
  mode = "bot",
  botDifficulty = DEFAULT_BOT_DIFFICULTY,
  humanPlayer = DEFAULT_HUMAN_PLAYER,
) {
  return {
    board: createInitialBoard(),
    turn: "red",
    mode,
    botDifficulty,
    humanPlayer,
    captured: {
      red: 0,
      black: 0,
    },
    winner: null,
    lastMove: null,
    forcedCapture: null,
  };
}

function createInitialSession() {
  return {
    game: createInitialGame("bot", DEFAULT_BOT_DIFFICULTY, DEFAULT_HUMAN_PLAYER),
    gameStarted: false,
  };
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function isInsideBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function isDarkSquare(row, col) {
  return (row + col) % 2 === 1;
}

function getOpponent(player) {
  return player === "red" ? "black" : "red";
}

function getBotPlayer(game) {
  return getOpponent(game.humanPlayer || DEFAULT_HUMAN_PLAYER);
}

function getMoveDirections(piece) {
  if (piece.king) {
    return [
      [1, -1],
      [1, 1],
      [-1, -1],
      [-1, 1],
    ];
  }

  return [
    [PLAYERS[piece.player].direction, -1],
    [PLAYERS[piece.player].direction, 1],
  ];
}

function getPieceMoves(board, row, col, options = {}) {
  const { jumpsOnly = false } = options;
  const piece = board[row]?.[col];

  if (!piece) return [];

  const moves = [];
  const opponent = getOpponent(piece.player);

  for (const [rowDelta, colDelta] of getMoveDirections(piece)) {
    const stepRow = row + rowDelta;
    const stepCol = col + colDelta;
    const jumpRow = row + rowDelta * 2;
    const jumpCol = col + colDelta * 2;

    if (
      isInsideBoard(jumpRow, jumpCol) &&
      board[stepRow]?.[stepCol]?.player === opponent &&
      !board[jumpRow][jumpCol] &&
      isDarkSquare(jumpRow, jumpCol)
    ) {
      moves.push({
        from: { row, col },
        to: { row: jumpRow, col: jumpCol },
        capture: { row: stepRow, col: stepCol },
        pieceId: piece.id,
        player: piece.player,
        isJump: true,
      });
    }

    if (
      !jumpsOnly &&
      isInsideBoard(stepRow, stepCol) &&
      !board[stepRow][stepCol] &&
      isDarkSquare(stepRow, stepCol)
    ) {
      moves.push({
        from: { row, col },
        to: { row: stepRow, col: stepCol },
        capture: null,
        pieceId: piece.id,
        player: piece.player,
        isJump: false,
      });
    }
  }

  return moves;
}

function getAllLegalMoves(board, player, forcedCapture = null) {
  if (forcedCapture) {
    const forcedPiece = board[forcedCapture.row]?.[forcedCapture.col];

    if (!forcedPiece || forcedPiece.id !== forcedCapture.pieceId || forcedPiece.player !== player) {
      return [];
    }

    return getPieceMoves(board, forcedCapture.row, forcedCapture.col, { jumpsOnly: true });
  }

  const jumps = [];
  const regularMoves = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = board[row][col];

      if (!piece || piece.player !== player) continue;

      for (const move of getPieceMoves(board, row, col)) {
        if (move.isJump) {
          jumps.push(move);
        } else {
          regularMoves.push(move);
        }
      }
    }
  }

  return jumps.length > 0 ? jumps : regularMoves;
}

function getLegalMovesForPiece(board, row, col, player, forcedCapture = null) {
  const piece = board[row]?.[col];

  if (!piece || piece.player !== player) return [];

  if (forcedCapture && (forcedCapture.row !== row || forcedCapture.col !== col || forcedCapture.pieceId !== piece.id)) {
    return [];
  }

  return getAllLegalMoves(board, player, forcedCapture).filter(
    (move) => move.from.row === row && move.from.col === col,
  );
}

function shouldPromote(piece, row) {
  return !piece.king && row === PLAYERS[piece.player].promotionRow;
}

function countPieces(board) {
  return board.flat().reduce(
    (counts, piece) => {
      if (piece) {
        counts[piece.player] += 1;
      }

      return counts;
    },
    { red: 0, black: 0 },
  );
}

function getPieces(board) {
  const pieces = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = board[row][col];

      if (piece) {
        pieces.push({ ...piece, row, col });
      }
    }
  }

  return pieces;
}

function chooseRandomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

function getDistanceToPromotion(piece, row) {
  return Math.abs(PLAYERS[piece.player].promotionRow - row);
}

function getCenterControlBonus(row, col) {
  const distanceFromCenter = Math.abs(row - 3.5) + Math.abs(col - 3.5);
  return Math.max(0, 18 - distanceFromCenter * 5);
}

function getAdvancementBonus(piece, row) {
  if (piece.king) return 0;
  return (BOARD_SIZE - 1 - getDistanceToPromotion(piece, row)) * 6;
}

function getFriendlyNeighborCount(board, row, col, piece) {
  let neighbors = 0;

  for (const [rowDelta, colDelta] of [
    [1, -1],
    [1, 1],
    [-1, -1],
    [-1, 1],
  ]) {
    const neighborRow = row + rowDelta;
    const neighborCol = col + colDelta;

    if (isInsideBoard(neighborRow, neighborCol) && board[neighborRow][neighborCol]?.player === piece.player) {
      neighbors += 1;
    }
  }

  return neighbors;
}

function isPieceVulnerable(board, row, col, piece) {
  const opponent = getOpponent(piece.player);

  for (const [rowDelta, colDelta] of [
    [1, -1],
    [1, 1],
    [-1, -1],
    [-1, 1],
  ]) {
    const attackerRow = row - rowDelta;
    const attackerCol = col - colDelta;
    const landingRow = row + rowDelta;
    const landingCol = col + colDelta;

    if (!isInsideBoard(attackerRow, attackerCol) || !isInsideBoard(landingRow, landingCol)) {
      continue;
    }

    const attacker = board[attackerRow][attackerCol];
    const landingSquareIsOpen = !board[landingRow][landingCol];
    const attackerCanJumpThatWay =
      attacker?.player === opponent &&
      getMoveDirections(attacker).some(
        ([attackerRowDelta, attackerColDelta]) =>
          attackerRowDelta === rowDelta && attackerColDelta === colDelta,
      );

    if (landingSquareIsOpen && attackerCanJumpThatWay) {
      return true;
    }
  }

  return false;
}

function getPieceEvaluation(board, row, col, piece) {
  const distanceToPromotion = getDistanceToPromotion(piece, row);
  let score = piece.king ? 190 : 100;

  score += getCenterControlBonus(row, col);
  score += getFriendlyNeighborCount(board, row, col, piece) * 7;

  if (col === 0 || col === BOARD_SIZE - 1) {
    score += 8;
  }

  if (!piece.king) {
    score += getAdvancementBonus(piece, row);

    if (distanceToPromotion <= 2) {
      score += (3 - distanceToPromotion) * 18;
    }

    const backRow = piece.player === "red" ? BOARD_SIZE - 1 : 0;
    if (row === backRow) {
      score += 6;
    }
  }

  if (isPieceVulnerable(board, row, col, piece)) {
    score -= piece.king ? 85 : 60;
  }

  return score;
}

function getMobilityEvaluation(game, perspectivePlayer) {
  const opponent = getOpponent(perspectivePlayer);
  const perspectiveForcedCapture = game.turn === perspectivePlayer ? game.forcedCapture : null;
  const opponentForcedCapture = game.turn === opponent ? game.forcedCapture : null;
  const perspectiveMoves = getAllLegalMoves(game.board, perspectivePlayer, perspectiveForcedCapture);
  const opponentMoves = getAllLegalMoves(game.board, opponent, opponentForcedCapture);
  let score = (perspectiveMoves.length - opponentMoves.length) * 5;

  if (perspectiveMoves.some((move) => move.isJump)) {
    score += 38;
  }

  if (opponentMoves.some((move) => move.isJump)) {
    score -= 38;
  }

  return score;
}

function evaluateGame(game, perspectivePlayer) {
  if (game.winner) {
    return game.winner === perspectivePlayer ? WIN_SCORE : -WIN_SCORE;
  }

  let score = game.turn === perspectivePlayer ? 8 : -8;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = game.board[row][col];

      if (!piece) continue;

      const sign = piece.player === perspectivePlayer ? 1 : -1;
      score += sign * getPieceEvaluation(game.board, row, col, piece);
    }
  }

  return score + getMobilityEvaluation(game, perspectivePlayer);
}

function getMoveOrderingScore(game, move) {
  const piece = game.board[move.from.row][move.from.col];
  const capturedPiece = move.capture ? game.board[move.capture.row][move.capture.col] : null;
  let score = getCenterControlBonus(move.to.row, move.to.col);

  if (move.isJump) {
    score += 1000;
    score += capturedPiece?.king ? 320 : 180;
  }

  if (piece?.king) {
    score += 30;
  }

  if (piece && shouldPromote(piece, move.to.row)) {
    score += 520;
  }

  return score;
}

function orderMovesForSearch(game, moves) {
  return [...moves].sort((firstMove, secondMove) => {
    return getMoveOrderingScore(game, secondMove) - getMoveOrderingScore(game, firstMove);
  });
}

function getWinnerAfterTurn(board, nextPlayer, forcedCapture = null) {
  const pieces = countPieces(board);
  const opponent = getOpponent(nextPlayer);

  if (pieces[opponent] === 0) return nextPlayer;
  if (pieces[nextPlayer] === 0) return opponent;

  const legalMoves = getAllLegalMoves(board, nextPlayer, forcedCapture);
  return legalMoves.length === 0 ? opponent : null;
}

function applyMove(game, move) {
  const board = cloneBoard(game.board);
  const movingPiece = { ...board[move.from.row][move.from.col] };
  const captured = { ...game.captured };
  const opponent = getOpponent(movingPiece.player);

  board[move.from.row][move.from.col] = null;

  if (move.capture) {
    board[move.capture.row][move.capture.col] = null;
    captured[movingPiece.player] += 1;
  }

  const promoted = shouldPromote(movingPiece, move.to.row);
  if (promoted) {
    movingPiece.king = true;
  }

  board[move.to.row][move.to.col] = movingPiece;

  const followUpJumps =
    move.isJump && !promoted
      ? getPieceMoves(board, move.to.row, move.to.col, { jumpsOnly: true })
      : [];

  if (followUpJumps.length > 0) {
    const forcedCapture = {
      row: move.to.row,
      col: move.to.col,
      pieceId: movingPiece.id,
    };

    return {
      ...game,
      board,
      captured,
      turn: movingPiece.player,
      winner: getWinnerAfterTurn(board, movingPiece.player, forcedCapture),
      lastMove: {
        pieceId: movingPiece.id,
        from: move.from,
        to: move.to,
        capture: move.capture,
      },
      forcedCapture,
    };
  }

  return {
    ...game,
    board,
    captured,
    turn: opponent,
    winner: getWinnerAfterTurn(board, opponent),
    lastMove: {
      pieceId: movingPiece.id,
      from: move.from,
      to: move.to,
      capture: move.capture,
    },
    forcedCapture: null,
  };
}

function minimax(game, depth, alpha, beta, perspectivePlayer) {
  if (depth <= 0 || game.winner) {
    return evaluateGame(game, perspectivePlayer);
  }

  const legalMoves = orderMovesForSearch(
    game,
    getAllLegalMoves(game.board, game.turn, game.forcedCapture),
  );

  if (legalMoves.length === 0) {
    return evaluateGame({ ...game, winner: getOpponent(game.turn) }, perspectivePlayer);
  }

  if (game.turn === perspectivePlayer) {
    let bestScore = -Infinity;

    for (const move of legalMoves) {
      const nextGame = applyMove(game, move);
      const nextDepth = nextGame.turn === game.turn ? depth : depth - 1;
      const score = minimax(nextGame, nextDepth, alpha, beta, perspectivePlayer);

      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);

      if (beta <= alpha) {
        break;
      }
    }

    return bestScore;
  }

  let bestScore = Infinity;

  for (const move of legalMoves) {
    const nextGame = applyMove(game, move);
    const nextDepth = nextGame.turn === game.turn ? depth : depth - 1;
    const score = minimax(nextGame, nextDepth, alpha, beta, perspectivePlayer);

    bestScore = Math.min(bestScore, score);
    beta = Math.min(beta, bestScore);

    if (beta <= alpha) {
      break;
    }
  }

  return bestScore;
}

function getBestBotMove(game, perspectivePlayer) {
  const difficulty = BOT_DIFFICULTIES[game.botDifficulty] || BOT_DIFFICULTIES[DEFAULT_BOT_DIFFICULTY];
  const legalMoves = getAllLegalMoves(game.board, game.turn, game.forcedCapture);

  if (legalMoves.length === 0) return null;
  if (difficulty.depth === 0) return chooseRandomMove(legalMoves);

  const orderedMoves = orderMovesForSearch(game, legalMoves);
  const maximizing = game.turn === perspectivePlayer;
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMoves = [];

  for (const move of orderedMoves) {
    const nextGame = applyMove(game, move);
    const nextDepth = nextGame.turn === game.turn ? difficulty.depth : difficulty.depth - 1;
    const score = minimax(nextGame, nextDepth, -Infinity, Infinity, perspectivePlayer);
    const isBetter = maximizing ? score > bestScore : score < bestScore;
    const isTie = score === bestScore;

    if (isBetter) {
      bestScore = score;
      bestMoves = [move];
    } else if (isTie) {
      bestMoves.push(move);
    }
  }

  return chooseRandomMove(bestMoves);
}

function hasValidGameShape(game) {
  return (
    Array.isArray(game?.board) &&
    game.board.length === BOARD_SIZE &&
    ["red", "black"].includes(game.turn) &&
    ["bot", "pvp"].includes(game.mode) &&
    game.captured &&
    typeof game.captured.red === "number" &&
    typeof game.captured.black === "number"
  );
}

function hydrateSavedGame(game) {
  if (!hasValidGameShape(game)) return null;

  return {
    ...createInitialGame(game.mode),
    ...game,
    botDifficulty: BOT_DIFFICULTIES[game.botDifficulty]
      ? game.botDifficulty
      : DEFAULT_BOT_DIFFICULTY,
    humanPlayer: ["red", "black"].includes(game.humanPlayer)
      ? game.humanPlayer
      : DEFAULT_HUMAN_PLAYER,
    forcedCapture: game.forcedCapture || null,
    winner: game.winner || null,
    lastMove: game.lastMove || null,
  };
}

function loadSavedSession() {
  if (typeof window === "undefined") return null;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    const savedGame = hydrateSavedGame(parsed.game || parsed);

    if (!savedGame) return null;

    return {
      game: savedGame,
      gameStarted: Boolean(parsed.gameStarted),
    };
  } catch {
    return null;
  }
}

function saveSession(game, gameStarted) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, gameStarted }));
}

function squareLabel(row, col) {
  return `Row ${row + 1}, column ${col + 1}`;
}

export default function App() {
  const [initialSession] = useState(() => loadSavedSession() || createInitialSession());
  const [game, setGame] = useState(initialSession.game);
  const [gameStarted, setGameStarted] = useState(initialSession.gameStarted);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [botThinking, setBotThinking] = useState(false);

  const currentMoves = useMemo(
    () => getAllLegalMoves(game.board, game.turn, game.forcedCapture),
    [game.board, game.forcedCapture, game.turn],
  );

  const selectedMoves = useMemo(() => {
    if (!selectedSquare || game.winner) return [];

    return getLegalMovesForPiece(
      game.board,
      selectedSquare.row,
      selectedSquare.col,
      game.turn,
      game.forcedCapture,
    );
  }, [game.board, game.forcedCapture, game.turn, game.winner, selectedSquare]);

  const pieces = useMemo(() => getPieces(game.board), [game.board]);
  const pieceCounts = useMemo(() => countPieces(game.board), [game.board]);
  const jumpIsMandatory = currentMoves.some((move) => move.isJump);
  const botPlayer = getBotPlayer(game);
  const humanPlayer = game.humanPlayer || DEFAULT_HUMAN_PLAYER;
  const isBotTurn = gameStarted && game.mode === "bot" && game.turn === botPlayer && !game.winner;

  useEffect(() => {
    saveSession(game, gameStarted);
  }, [game, gameStarted]);

  useEffect(() => {
    if (!isBotTurn) {
      setBotThinking(false);
      return undefined;
    }

    setSelectedSquare(null);
    setBotThinking(true);

    const timer = window.setTimeout(() => {
      setGame((currentGame) => {
        const currentBotPlayer = getBotPlayer(currentGame);

        if (currentGame.mode !== "bot" || currentGame.turn !== currentBotPlayer || currentGame.winner) {
          return currentGame;
        }

        const botMove = getBestBotMove(currentGame, currentBotPlayer);
        if (!botMove) {
          return { ...currentGame, winner: getOpponent(currentGame.turn), forcedCapture: null };
        }

        return applyMove(currentGame, botMove);
      });

      setBotThinking(false);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [isBotTurn, game.board, game.botDifficulty, game.forcedCapture, game.humanPlayer]);

  useEffect(() => {
    if (!game.forcedCapture || game.winner || isBotTurn) return;
    setSelectedSquare({ row: game.forcedCapture.row, col: game.forcedCapture.col });
  }, [game.forcedCapture, game.winner, isBotTurn]);

  function getMoveForDestination(row, col) {
    return selectedMoves.find((move) => move.to.row === row && move.to.col === col);
  }

  function startGame() {
    setSelectedSquare(null);
    setBotThinking(false);
    setGame((currentGame) =>
      createInitialGame(
        currentGame.mode,
        currentGame.botDifficulty || DEFAULT_BOT_DIFFICULTY,
        currentGame.humanPlayer || DEFAULT_HUMAN_PLAYER,
      ),
    );
    setGameStarted(true);
  }

  function resetGame() {
    setSelectedSquare(null);
    setBotThinking(false);
    setGame((currentGame) =>
      createInitialGame(
        currentGame.mode,
        currentGame.botDifficulty || DEFAULT_BOT_DIFFICULTY,
        currentGame.humanPlayer || DEFAULT_HUMAN_PLAYER,
      ),
    );
    setGameStarted(false);
  }

  function setMode(mode) {
    setSelectedSquare(null);
    setGame((currentGame) =>
      createInitialGame(
        mode,
        currentGame.botDifficulty || DEFAULT_BOT_DIFFICULTY,
        currentGame.humanPlayer || DEFAULT_HUMAN_PLAYER,
      ),
    );
  }

  function setBotDifficulty(botDifficulty) {
    setGame((currentGame) =>
      createInitialGame(
        currentGame.mode,
        botDifficulty,
        currentGame.humanPlayer || DEFAULT_HUMAN_PLAYER,
      ),
    );
  }

  function setHumanPlayer(humanPlayer) {
    setSelectedSquare(null);
    setBotThinking(false);
    setGame((currentGame) =>
      createInitialGame(
        "bot",
        currentGame.botDifficulty || DEFAULT_BOT_DIFFICULTY,
        humanPlayer,
      ),
    );
  }

  function handleSquareClick(row, col) {
    if (!gameStarted || game.winner || isBotTurn || botThinking) return;

    const selectedMove = getMoveForDestination(row, col);
    if (selectedMove) {
      const nextGame = applyMove(game, selectedMove);
      setGame(nextGame);
      setSelectedSquare(
        nextGame.forcedCapture
          ? {
              row: nextGame.forcedCapture.row,
              col: nextGame.forcedCapture.col,
            }
          : null,
      );
      return;
    }

    const piece = game.board[row][col];

    if (piece?.player === game.turn) {
      const legalMoves = getLegalMovesForPiece(game.board, row, col, game.turn, game.forcedCapture);
      setSelectedSquare(legalMoves.length > 0 ? { row, col } : null);
      return;
    }

    setSelectedSquare(null);
  }

  function isSelected(row, col) {
    return selectedSquare?.row === row && selectedSquare?.col === col;
  }

  function isLastMoveSquare(row, col) {
    return (
      game.lastMove &&
      ((game.lastMove.from.row === row && game.lastMove.from.col === col) ||
        (game.lastMove.to.row === row && game.lastMove.to.col === col))
    );
  }

  function getPieceMoveCount(row, col) {
    return getLegalMovesForPiece(game.board, row, col, game.turn, game.forcedCapture).length;
  }

  const botDifficulty = BOT_DIFFICULTIES[game.botDifficulty] || BOT_DIFFICULTIES[DEFAULT_BOT_DIFFICULTY];
  const playerSideLabel = PLAYERS[humanPlayer].label;
  const botSideLabel = PLAYERS[botPlayer].label;
  const statusText = game.winner
    ? `${PLAYERS[game.winner].label} wins`
    : botThinking
      ? `${botDifficulty.label} bot thinking as ${botSideLabel}`
      : game.forcedCapture
        ? `${PLAYERS[game.turn].label} must continue jumping`
        : game.mode === "bot" && game.turn === humanPlayer
          ? `Your turn as ${playerSideLabel}`
          : game.mode === "bot"
            ? `${botSideLabel} bot's turn`
            : `${PLAYERS[game.turn].label}'s turn`;

  if (!gameStarted) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_30%),linear-gradient(135deg,#09090b_0%,#18181b_44%,#111827_100%)] px-4 py-6 text-zinc-100 sm:px-6 lg:py-10">
        <main className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center">
          <section className="rounded-lg border border-white/10 bg-zinc-950/78 p-5 shadow-2xl shadow-black/45 backdrop-blur md:p-8">
            <div className="flex flex-col gap-6">
              <div>
                <div className="flex items-center gap-2 text-emerald-300">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                    Forest Board
                  </span>
                </div>
                <h1 className="mt-2 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
                  Checkers
                </h1>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Mode</p>
                  <div className="mt-3 grid grid-cols-2 rounded-lg border border-white/10 bg-zinc-900 p-1">
                    <button
                      type="button"
                      onClick={() => setMode("pvp")}
                      className={[
                        "inline-flex h-12 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition",
                        game.mode === "pvp"
                          ? "bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-950/30"
                          : "text-zinc-300 hover:bg-white/5 hover:text-white",
                      ].join(" ")}
                    >
                      <Users className="h-4 w-4" />
                      PvP
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("bot")}
                      className={[
                        "inline-flex h-12 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition",
                        game.mode === "bot"
                          ? "bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-950/30"
                          : "text-zinc-300 hover:bg-white/5 hover:text-white",
                      ].join(" ")}
                    >
                      <Bot className="h-4 w-4" />
                      Bot
                    </button>
                  </div>
                </section>

                {game.mode === "bot" && (
                  <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Side</p>
                    <div className="mt-3 grid grid-cols-2 rounded-lg border border-white/10 bg-zinc-900 p-1">
                      <button
                        type="button"
                        onClick={() => setHumanPlayer("red")}
                        className={[
                          "inline-flex h-12 items-center justify-center rounded-md px-3 text-sm font-semibold transition",
                          humanPlayer === "red"
                            ? "bg-red-400 text-red-950 shadow-lg shadow-red-950/25"
                            : "text-zinc-300 hover:bg-white/5 hover:text-white",
                        ].join(" ")}
                      >
                        Red First
                      </button>
                      <button
                        type="button"
                        onClick={() => setHumanPlayer("black")}
                        className={[
                          "inline-flex h-12 items-center justify-center rounded-md px-3 text-sm font-semibold transition",
                          humanPlayer === "black"
                            ? "bg-zinc-200 text-zinc-950 shadow-lg shadow-black/25"
                            : "text-zinc-300 hover:bg-white/5 hover:text-white",
                        ].join(" ")}
                      >
                        Black Second
                      </button>
                    </div>
                  </section>
                )}

                {game.mode === "bot" && (
                  <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4 lg:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Bot Skill</p>
                    <div className="mt-3 grid grid-cols-3 rounded-lg border border-white/10 bg-zinc-900 p-1">
                      {Object.entries(BOT_DIFFICULTIES).map(([difficultyKey, difficulty]) => (
                        <button
                          type="button"
                          key={difficultyKey}
                          onClick={() => setBotDifficulty(difficultyKey)}
                          className={[
                            "inline-flex h-12 items-center justify-center rounded-md px-3 text-sm font-semibold transition",
                            game.botDifficulty === difficultyKey
                              ? "bg-amber-300 text-zinc-950 shadow-lg shadow-amber-950/20"
                              : "text-zinc-300 hover:bg-white/5 hover:text-white",
                          ].join(" ")}
                        >
                          {difficulty.label}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Setup</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {game.mode === "pvp"
                      ? "Player vs Player"
                      : `You: ${playerSideLabel} / Bot: ${botSideLabel} / ${botDifficulty.label}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={startGame}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-6 text-sm font-bold text-emerald-950 shadow-xl shadow-emerald-950/30 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <Sparkles className="h-4 w-4" />
                  Start Game
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_30%),linear-gradient(135deg,#09090b_0%,#18181b_44%,#111827_100%)] px-4 py-5 text-zinc-100 sm:px-6 lg:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="rounded-lg border border-white/10 bg-zinc-950/75 p-4 shadow-2xl shadow-black/40 backdrop-blur md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-emerald-300">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                  Forest Board
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Checkers
              </h1>
              <p className="mt-1 text-sm text-zinc-400">{statusText}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[auto_auto_auto_auto_auto] xl:items-center">
              <section className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Current Turn</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {game.winner ? "Game Over" : PLAYERS[game.turn].label}
                </p>
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Captured</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  Red {game.captured.red} / Black {game.captured.black}
                </p>
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Mode</p>
                <p className="mt-1 inline-flex items-center gap-2 text-lg font-semibold text-white">
                  {game.mode === "bot" ? <Bot className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                  {game.mode === "bot" ? "Bot" : "PvP"}
                </p>
              </section>

              {game.mode === "bot" && (
                <section className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Side</p>
                  <p className="mt-1 text-lg font-semibold text-white">{playerSideLabel}</p>
                </section>
              )}

              {game.mode === "bot" && (
                <section className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Bot Skill</p>
                  <p className="mt-1 text-lg font-semibold text-amber-200">{botDifficulty.label}</p>
                </section>
              )}

              <button
                type="button"
                onClick={() => resetGame()}
                className="inline-flex h-[52px] items-center justify-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/18 focus:outline-none focus:ring-2 focus:ring-amber-200/60"
              >
                <RefreshCcw className="h-4 w-4" />
                Reset Game
              </button>
            </div>
          </div>
        </header>

        <main className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="flex min-w-0 justify-center">
            <div className="relative aspect-square w-full max-w-[min(82vh,760px)] rounded-lg border border-amber-900/70 bg-[#2a170f] p-2 shadow-2xl shadow-black/55">
              <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-md border border-black/35">
                {Array.from({ length: BOARD_SIZE }, (_, row) =>
                  Array.from({ length: BOARD_SIZE }, (_, col) => {
                    const dark = isDarkSquare(row, col);
                    const move = getMoveForDestination(row, col);
                    const piece = game.board[row][col];
                    const playablePiece =
                      piece?.player === game.turn &&
                      getPieceMoveCount(row, col) > 0 &&
                      !game.winner &&
                      !isBotTurn;

                    return (
                      <button
                        type="button"
                        key={`${row}-${col}`}
                        onClick={() => handleSquareClick(row, col)}
                        aria-label={squareLabel(row, col)}
                        className={[
                          "relative isolate min-h-0 min-w-0 overflow-hidden transition duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-200/70 focus:ring-inset",
                          dark
                            ? "bg-[linear-gradient(135deg,#064e3b_0%,#022c22_100%)]"
                            : "bg-[linear-gradient(135deg,#d6a663_0%,#8a5526_100%)]",
                          dark && playablePiece ? "cursor-pointer hover:brightness-125" : "",
                          isSelected(row, col) ? "ring-4 ring-yellow-300 ring-inset" : "",
                          isLastMoveSquare(row, col) ? "after:absolute after:inset-0 after:bg-white/12" : "",
                        ].join(" ")}
                      >
                        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.14),transparent_42%)]" />
                        {move && (
                          <span
                            className={[
                              "absolute left-1/2 top-1/2 h-[42%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border transition duration-200",
                              move.isJump
                                ? "border-yellow-200 bg-yellow-300/50 shadow-[0_0_22px_rgba(253,224,71,0.45)]"
                                : "border-yellow-100/70 bg-yellow-200/28",
                            ].join(" ")}
                          />
                        )}
                      </button>
                    );
                  }),
                )}
              </div>

              <div className="pointer-events-none absolute inset-2">
                {pieces.map((piece) => {
                  const selected = isSelected(piece.row, piece.col);
                  const cell = 100 / BOARD_SIZE;

                  return (
                    <div
                      key={piece.id}
                      className="absolute flex items-center justify-center transition-transform duration-300 ease-out"
                      style={{
                        width: `${cell}%`,
                        height: `${cell}%`,
                        transform: `translate(${piece.col * 100}%, ${piece.row * 100}%)`,
                      }}
                    >
                      <div
                        className={[
                          "relative flex h-[76%] w-[76%] items-center justify-center rounded-full border-4 transition duration-200",
                          PLAYERS[piece.player].pieceClass,
                          selected
                            ? `scale-110 ring-4 ${PLAYERS[piece.player].ringClass}`
                            : "scale-100",
                        ].join(" ")}
                      >
                        <span className="absolute inset-[16%] rounded-full border border-white/20 bg-white/10 shadow-inner" />
                        <span className="absolute inset-[31%] rounded-full border border-black/20 bg-black/10" />
                        {piece.king && (
                          <Crown className={`relative h-[38%] w-[38%] ${PLAYERS[piece.player].crownClass}`} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="grid content-start gap-3 rounded-lg border border-white/10 bg-zinc-950/70 p-4 shadow-xl shadow-black/35">
            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Red Pieces</p>
              <p className="mt-1 text-3xl font-semibold text-red-300">{pieceCounts.red}</p>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Black Pieces</p>
              <p className="mt-1 text-3xl font-semibold text-zinc-100">{pieceCounts.black}</p>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Legal Moves</p>
              <p className="mt-1 text-3xl font-semibold text-emerald-300">{currentMoves.length}</p>
            </section>

            {game.mode === "bot" && (
              <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Matchup</p>
                <p className="mt-1 text-lg font-semibold text-white">You: {playerSideLabel}</p>
                <p className="mt-1 text-sm text-zinc-400">Bot: {botSideLabel}</p>
              </section>
            )}

            {game.mode === "bot" && (
              <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Bot Skill</p>
                <p className="mt-1 text-3xl font-semibold text-amber-200">{botDifficulty.label}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {botDifficulty.depth === 0 ? "Random move" : `${botDifficulty.depth} ply search`}
                </p>
              </section>
            )}

            <section className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm leading-6 text-yellow-50">
              {game.winner
                ? `${PLAYERS[game.winner].label} wins. Start fresh whenever you are ready.`
                : game.forcedCapture
                  ? "The same piece has another jump and must continue."
                  : jumpIsMandatory
                    ? "A capture is available, so jumping is mandatory."
                    : "Select a movable piece to highlight its legal destinations."}
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}
