'use strict';

// ──────────────────────────────────────────────────────────────
// Constants  (mirrors checkers/constants.py)
// ──────────────────────────────────────────────────────────────
const ROWS = 8;
const COLS = 8;
const SQUARE_SIZE = 80;
const RED    = 'red';
const PURPLE = 'purple';

// ──────────────────────────────────────────────────────────────
// Piece  (mirrors checkers/piece.py)
// ──────────────────────────────────────────────────────────────
class Piece {
  constructor(row, col, color) {
    this.row   = row;
    this.col   = col;
    this.color = color;
    this.king  = false;
  }

  makeKing() { this.king = true; }

  move(row, col) {
    this.row = row;
    this.col = col;
  }
}

// ──────────────────────────────────────────────────────────────
// Board  (mirrors checkers/board.py)
// ──────────────────────────────────────────────────────────────
class Board {
  constructor() {
    this.board      = [];
    this.redLeft    = 12;
    this.whiteLeft  = 12;  // purple pieces — keeps Python's naming
    this.redKings   = 0;
    this.whiteKings = 0;
    this._createBoard();
  }

  // Exact port of create_board()
  _createBoard() {
    for (let row = 0; row < ROWS; row++) {
      this.board.push([]);
      for (let col = 0; col < COLS; col++) {
        if (col % 2 === (row + 1) % 2) {
          if (row < 3)      this.board[row].push(new Piece(row, col, PURPLE));
          else if (row > 4) this.board[row].push(new Piece(row, col, RED));
          else              this.board[row].push(0);
        } else {
          this.board[row].push(0);
        }
      }
    }
  }

  // Exact port of move()
  move(piece, row, col) {
    this.board[piece.row][piece.col] = 0;
    this.board[row][col] = piece;
    piece.move(row, col);

    if (row === ROWS - 1 || row === 0) {
      piece.makeKing();
      if (piece.color === PURPLE) this.whiteKings++;
      else                        this.redKings++;
    }
  }

  getPiece(row, col) { return this.board[row][col]; }

  // Exact port of remove()
  remove(pieces) {
    for (const piece of pieces) {
      this.board[piece.row][piece.col] = 0;
      if (piece.color === RED) this.redLeft--;
      else                     this.whiteLeft--;
    }
  }

  // Exact port of winner()
  winner() {
    if (this.redLeft   === 0) return PURPLE;
    if (this.whiteLeft === 0) return RED;
    return null;
  }

  // Exact port of evaluate()
  evaluate() {
    return this.whiteLeft - this.redLeft + (this.whiteKings * 0.5 - this.redKings * 0.5);
  }

  // Exact port of get_all_pieces()
  getAllPieces(color) {
    const pieces = [];
    for (const row of this.board)
      for (const piece of row)
        if (piece !== 0 && piece.color === color) pieces.push(piece);
    return pieces;
  }

  // Exact port of get_valid_moves()
  getValidMoves(piece) {
    const moves = {};
    const left  = piece.col - 1;
    const right = piece.col + 1;
    const row   = piece.row;

    if (piece.color === RED || piece.king) {
      Object.assign(moves, this._traverseLeft (row - 1, Math.max(row - 3, -1), -1, piece.color, left));
      Object.assign(moves, this._traverseRight(row - 1, Math.max(row - 3, -1), -1, piece.color, right));
    }
    if (piece.color === PURPLE || piece.king) {
      Object.assign(moves, this._traverseLeft (row + 1, Math.min(row + 3, ROWS), 1, piece.color, left));
      Object.assign(moves, this._traverseRight(row + 1, Math.min(row + 3, ROWS), 1, piece.color, right));
    }

    // Forced captures: if any capture moves exist, return only those
    const captures = {};
    for (const [key, skipped] of Object.entries(moves))
      if (skipped.length > 0) captures[key] = skipped;
    return Object.keys(captures).length > 0 ? captures : moves;
  }

  // Exact port of _traverse_left()
  // Move keys are strings "row,col" (JS can't use tuples as dict keys)
  _traverseLeft(start, stop, step, color, left, skipped = []) {
    const moves = {};
    let last = [];
    for (let r = start; step < 0 ? r > stop : r < stop; r += step) {
      if (left < 0) break;
      const current = this.board[r][left];
      if (current === 0) {
        if (skipped.length > 0 && last.length === 0) {
          break;
        } else if (skipped.length > 0) {
          moves[`${r},${left}`] = [...last, ...skipped];
        } else {
          moves[`${r},${left}`] = [...last];
        }
        if (last.length > 0) {
          const nextStop = step < 0 ? Math.max(r - 3, 0) : Math.min(r + 3, ROWS);
          Object.assign(moves, this._traverseLeft (r + step, nextStop, step, color, left - 1, last));
          Object.assign(moves, this._traverseRight(r + step, nextStop, step, color, left + 1, last));
        }
        break;
      } else if (current.color === color) {
        break;
      } else {
        last = [current];
      }
      left--;
    }
    return moves;
  }

  // Exact port of _traverse_right()
  _traverseRight(start, stop, step, color, right, skipped = []) {
    const moves = {};
    let last = [];
    for (let r = start; step < 0 ? r > stop : r < stop; r += step) {
      if (right >= COLS) break;
      const current = this.board[r][right];
      if (current === 0) {
        if (skipped.length > 0 && last.length === 0) {
          break;
        } else if (skipped.length > 0) {
          moves[`${r},${right}`] = [...last, ...skipped];
        } else {
          moves[`${r},${right}`] = [...last];
        }
        if (last.length > 0) {
          const nextStop = step < 0 ? Math.max(r - 3, 0) : Math.min(r + 3, ROWS);
          Object.assign(moves, this._traverseLeft (r + step, nextStop, step, color, right - 1, last));
          Object.assign(moves, this._traverseRight(r + step, nextStop, step, color, right + 1, last));
        }
        break;
      } else if (current.color === color) {
        break;
      } else {
        last = [current];
      }
      right++;
    }
    return moves;
  }

  // Deep clone — replaces Python's deepcopy() in minimax
  clone() {
    const b = new Board();
    b.board      = [];
    b.redLeft    = this.redLeft;
    b.whiteLeft  = this.whiteLeft;
    b.redKings   = this.redKings;
    b.whiteKings = this.whiteKings;
    for (let row = 0; row < ROWS; row++) {
      b.board.push([]);
      for (let col = 0; col < COLS; col++) {
        const p = this.board[row][col];
        if (p === 0) {
          b.board[row].push(0);
        } else {
          const np = new Piece(p.row, p.col, p.color);
          np.king = p.king;
          b.board[row].push(np);
        }
      }
    }
    return b;
  }
}

// ──────────────────────────────────────────────────────────────
// Minimax  (mirrors minimax/algorithm.py — depth 3, no pruning)
// ──────────────────────────────────────────────────────────────

// Port of get_all_moves() + simulate_move()
function _getAllMoves(board, color) {
  const results = [];
  for (const piece of board.getAllPieces(color)) {
    const validMoves = board.getValidMoves(piece);
    for (const [key, skip] of Object.entries(validMoves)) {
      const [r, c]  = key.split(',').map(Number);
      const temp    = board.clone();
      const tp      = temp.getPiece(piece.row, piece.col);
      // skip refs original board pieces — remove() only uses .row/.col/.color so this is safe
      temp.move(tp, r, c);
      if (skip.length > 0) temp.remove(skip);
      results.push(temp);
    }
  }
  return results;
}

// Exact port of minimax()
function minimax(position, depth, maxPlayer) {
  if (depth === 0 || position.winner() !== null) {
    return [position.evaluate(), position];
  }
  if (maxPlayer) {
    let maxEval  = -Infinity;
    let bestMove = null;
    for (const move of _getAllMoves(position, PURPLE)) {
      const evaluation = minimax(move, depth - 1, false)[0];
      if (evaluation > maxEval) { maxEval = evaluation; bestMove = move; }
    }
    return [maxEval, bestMove];
  } else {
    let minEval  = Infinity;
    let bestMove = null;
    for (const move of _getAllMoves(position, RED)) {
      const evaluation = minimax(move, depth - 1, true)[0];
      if (evaluation < minEval) { minEval = evaluation; bestMove = move; }
    }
    return [minEval, bestMove];
  }
}

// ──────────────────────────────────────────────────────────────
// Game  (mirrors checkers/game.py)
// ──────────────────────────────────────────────────────────────
class Game {
  constructor() { this._init(); }

  _init() {
    this.board                = new Board();
    this.turn                 = RED;       // RED goes first (human)
    this.selected             = null;
    this.validMoves           = {};
    this.movesSinceLastCapture = 0;
    this.lastPieceCount       = 24;
    this.over                 = false;
    this.winner               = null;
  }

  reset() { this._init(); }

  // Port of select() — try a move, or select a new piece
  select(row, col) {
    if (this.selected) {
      if (!this._move(row, col)) {
        this.selected = null;
        this._trySelect(row, col);
      }
    } else {
      this._trySelect(row, col);
    }
  }

  _trySelect(row, col) {
    const piece = this.board.getPiece(row, col);
    if (piece !== 0 && piece.color === this.turn) {
      this.selected   = piece;
      this.validMoves = this.board.getValidMoves(piece);
    }
  }

  // Port of _move()
  _move(row, col) {
    const key  = `${row},${col}`;
    const dest = this.board.getPiece(row, col);
    if (this.selected && dest === 0 && key in this.validMoves) {
      this.board.move(this.selected, row, col);
      const skipped = this.validMoves[key];
      if (skipped.length > 0) {
        this.board.remove(skipped);
        this.movesSinceLastCapture = 0;
        this.lastPieceCount = this.board.redLeft + this.board.whiteLeft;
      }
      this._changeTurn();
      return true;
    }
    return false;
  }

  // Port of change_turn()
  _changeTurn() {
    this.movesSinceLastCapture++;
    this.validMoves = {};
    this.selected   = null;
    this.turn = this.turn === RED ? PURPLE : RED;
  }

  // Port of winner() — includes 30-move draw rule
  checkWinner() {
    if (this.movesSinceLastCapture >= 30) return 'draw';
    return this.board.winner();
  }

  // Port of ai_move()
  aiMove() {
    const [, newBoard] = minimax(this.board, 3, true);
    if (newBoard) {
      const count = newBoard.redLeft + newBoard.whiteLeft;
      if (count < this.lastPieceCount) {
        this.movesSinceLastCapture = 0;
        this.lastPieceCount = count;
      }
      this.board = newBoard;
      this._changeTurn();
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Rendering
// ──────────────────────────────────────────────────────────────
const canvas   = document.getElementById('board');
const ctx      = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const game     = new Game();

function drawBoard() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      ctx.fillStyle = (row + col) % 2 === 1 ? '#3b1f0e' : '#f0d9b5';
      ctx.fillRect(col * SQUARE_SIZE, row * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
    }
  }
}

function drawHighlights() {
  // Yellow overlay on selected piece
  if (game.selected) {
    ctx.fillStyle = 'rgba(255, 255, 0, 0.35)';
    ctx.fillRect(
      game.selected.col * SQUARE_SIZE,
      game.selected.row * SQUARE_SIZE,
      SQUARE_SIZE, SQUARE_SIZE
    );
  }

  // Blue circles on valid move squares (matches Python's BLUE circles)
  for (const key of Object.keys(game.validMoves)) {
    const [r, c] = key.split(',').map(Number);
    ctx.beginPath();
    ctx.arc(
      c * SQUARE_SIZE + SQUARE_SIZE / 2,
      r * SQUARE_SIZE + SQUARE_SIZE / 2,
      15, 0, Math.PI * 2
    );
    ctx.fillStyle = 'rgba(0, 80, 255, 0.75)';
    ctx.fill();
  }
}

function drawPieces() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const piece = game.board.getPiece(row, col);
      if (piece === 0) continue;

      const cx = col * SQUARE_SIZE + SQUARE_SIZE / 2;
      const cy = row * SQUARE_SIZE + SQUARE_SIZE / 2;
      const r  = SQUARE_SIZE / 2 - 10;

      // Green outline (matches Python's GREEN outline)
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = '#00bb00';
      ctx.fill();

      // Piece body
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = piece.color === RED ? '#cc1111' : '#7b0099';
      ctx.fill();

      // King crown (replaces Python's crown.png asset)
      if (piece.king) {
        ctx.font = `bold ${Math.round(SQUARE_SIZE * 0.38)}px serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#ffd700';
        ctx.fillText('♛', cx, cy);
      }
    }
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBoard();
  drawHighlights();
  drawPieces();

  if (game.over) {
    if      (game.winner === 'draw')  statusEl.textContent = "It's a draw!";
    else if (game.winner === RED)     statusEl.textContent = 'Red wins!';
    else                              statusEl.textContent = 'Purple wins!';
  } else {
    statusEl.textContent = game.turn === RED
      ? 'Your turn (Red)'
      : 'AI is thinking… (Purple)';
  }
}

// ──────────────────────────────────────────────────────────────
// AI turn driver
// ──────────────────────────────────────────────────────────────
function runAI() {
  if (game.over || game.turn !== PURPLE) return;
  game.aiMove();
  const w = game.checkWinner();
  if (w) { game.over = true; game.winner = w; }
  render();
}

// ──────────────────────────────────────────────────────────────
// Events
// ──────────────────────────────────────────────────────────────
canvas.addEventListener('click', e => {
  if (game.over || game.turn !== RED) return;

  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const col    = Math.floor((e.clientX - rect.left) * scaleX / SQUARE_SIZE);
  const row    = Math.floor((e.clientY - rect.top ) * scaleY / SQUARE_SIZE);

  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

  game.select(row, col);

  const w = game.checkWinner();
  if (w) {
    game.over   = true;
    game.winner = w;
    render();
    return;
  }

  render();
  if (game.turn === PURPLE) setTimeout(runAI, 150);
});

document.getElementById('newGame').addEventListener('click', () => {
  game.reset();
  render();
});

// ──────────────────────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────────────────────
render();
