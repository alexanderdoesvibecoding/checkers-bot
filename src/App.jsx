import React, { useEffect, useMemo, useState } from "react";
import { Bot, Crown, RefreshCcw, Sparkles, Users } from "lucide-react";

const BOARD_SIZE = 8;
const STORAGE_KEY = "checkers-game-state-v1";

const PLAYERS = {
  red: {
    label: "Red",
    direction: 1,
    homeRows: [0, 1, 2],
    promotionRow: 7,
    pieceClass:
      "border-red-200/80 bg-[radial-gradient(circle_at_35%_25%,#fecaca_0%,#ef4444_28%,#991b1b_78%)] shadow-piece-red",
    ringClass: "ring-red-200/70",
    crownClass: "text-yellow-100 drop-shadow-[0_1px_2px_rgba(127,29,29,0.75)]",
  },
  black: {
    label: "Black",
    direction: -1,
    homeRows: [5, 6, 7],
    promotionRow: 0,
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

function createInitialGame(mode = "bot") {
  return {
    board: createInitialBoard(),
    turn: "red",
    mode,
    captured: {
      red: 0,
      black: 0,
    },
    winner: null,
    lastMove: null,
    forcedCapture: null,
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

function loadSavedGame() {
  if (typeof window === "undefined") return null;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    const hasValidShape =
      Array.isArray(parsed?.board) &&
      parsed.board.length === BOARD_SIZE &&
      ["red", "black"].includes(parsed.turn) &&
      ["bot", "pvp"].includes(parsed.mode) &&
      parsed.captured &&
      typeof parsed.captured.red === "number" &&
      typeof parsed.captured.black === "number";

    return hasValidShape ? parsed : null;
  } catch {
    return null;
  }
}

function saveGame(game) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
}

function squareLabel(row, col) {
  return `Row ${row + 1}, column ${col + 1}`;
}

export default function App() {
  const [game, setGame] = useState(() => loadSavedGame() || createInitialGame("bot"));
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
  const isBotTurn = game.mode === "bot" && game.turn === "black" && !game.winner;

  useEffect(() => {
    saveGame(game);
  }, [game]);

  useEffect(() => {
    if (!isBotTurn) {
      setBotThinking(false);
      return undefined;
    }

    setSelectedSquare(null);
    setBotThinking(true);

    const timer = window.setTimeout(() => {
      setGame((currentGame) => {
        if (currentGame.mode !== "bot" || currentGame.turn !== "black" || currentGame.winner) {
          return currentGame;
        }

        const botMoves = getAllLegalMoves(currentGame.board, "black", currentGame.forcedCapture);
        if (botMoves.length === 0) {
          return { ...currentGame, winner: "red", forcedCapture: null };
        }

        return applyMove(currentGame, chooseRandomMove(botMoves));
      });

      setBotThinking(false);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [isBotTurn, game.board, game.forcedCapture]);

  useEffect(() => {
    if (!game.forcedCapture || game.winner || isBotTurn) return;
    setSelectedSquare({ row: game.forcedCapture.row, col: game.forcedCapture.col });
  }, [game.forcedCapture, game.winner, isBotTurn]);

  function getMoveForDestination(row, col) {
    return selectedMoves.find((move) => move.to.row === row && move.to.col === col);
  }

  function resetGame(nextMode = game.mode) {
    setSelectedSquare(null);
    setBotThinking(false);
    setGame(createInitialGame(nextMode));
  }

  function setMode(mode) {
    setSelectedSquare(null);
    setGame((currentGame) => ({ ...currentGame, mode }));
  }

  function handleSquareClick(row, col) {
    if (game.winner || isBotTurn || botThinking) return;

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

  const statusText = game.winner
    ? `${PLAYERS[game.winner].label} wins`
    : botThinking
      ? "Bot thinking"
      : game.forcedCapture
        ? `${PLAYERS[game.turn].label} must continue jumping`
        : `${PLAYERS[game.turn].label}'s turn`;

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

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[auto_auto_auto_auto] xl:items-center">
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

              <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-zinc-900 p-1">
                <button
                  type="button"
                  onClick={() => setMode("pvp")}
                  className={[
                    "inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition",
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
                    "inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition",
                    game.mode === "bot"
                      ? "bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-950/30"
                      : "text-zinc-300 hover:bg-white/5 hover:text-white",
                  ].join(" ")}
                >
                  <Bot className="h-4 w-4" />
                  Bot
                </button>
              </div>

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
