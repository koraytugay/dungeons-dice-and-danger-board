document.addEventListener('DOMContentLoaded', () => {
  const boardImage = document.getElementById('board-image');
  const canvas = document.getElementById('draw-canvas');
  const ctx = canvas.getContext('2d');
  const btnXLarge = document.getElementById('btn-x-large');
  const btnXSmall = document.getElementById('btn-x-small');
  const btnYellowRect = document.getElementById('btn-yellow-rect');
  const btnEraser = document.getElementById('btn-eraser');
  const btnUndo = document.getElementById('btn-undo');
  const btnClear = document.getElementById('btn-clear');

  // Application State
  // Tools: 'x-large' | 'x-small' | 'yellow-rect' | 'eraser' | null
  let activeTool = 'x-large';
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  // History Stacks for Undo / Redo
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 40;

  // Drawing settings
  const X_COLOR = 'rgba(0, 0, 0, 0.70)'; // Crisp black with subtle 30% transparency
  const ERASER_WIDTH = 51;
  const X_LARGE_RADIUS = 42; // Big X stamp (Tool 1)
  const X_LARGE_STROKE = 20;
  const X_SMALL_RADIUS = 14; // Small X stamp (Tool 2)
  const X_SMALL_STROKE = 8;
  const YELLOW_RECT_COLOR = 'rgba(255, 225, 0, 0.5)'; // 50% transparent yellow
  const YELLOW_STAMP_WIDTH = 54;  // Rotated 90 degrees (vertical)
  const YELLOW_STAMP_HEIGHT = 76;

  // Ensure canvas internal resolution matches natural image resolution
  function setupCanvasResolution() {
    if (boardImage.naturalWidth && boardImage.naturalHeight) {
      canvas.width = boardImage.naturalWidth;
      canvas.height = boardImage.naturalHeight;
    } else {
      // Fallback if natural dimensions not immediately available
      canvas.width = 3099;
      canvas.height = 2101;
    }
  }

  // =========================================================================
  // Passcode Decryption & Image Loading Logic
  // =========================================================================
  const passcodeModal = document.getElementById('passcodeModal');
  const passcodeForm = document.getElementById('passcodeForm');
  const passcodeInput = document.getElementById('passcodeInput');
  const togglePasscodeBtn = document.getElementById('togglePasscodeBtn');
  const submitPasscodeBtn = document.getElementById('submitPasscodeBtn');
  const passcodeError = document.getElementById('passcodeError');
  const eyeIcon = document.getElementById('eyeIcon');

  let encryptedFileData = null;

  if (togglePasscodeBtn && passcodeInput) {
    togglePasscodeBtn.addEventListener('click', () => {
      const isPassword = passcodeInput.type === 'password';
      passcodeInput.type = isPassword ? 'text' : 'password';
      if (eyeIcon) {
        eyeIcon.innerHTML = isPassword
          ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
          : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
      }
    });
  }

  async function decryptAndLoadImage(passcode) {
    if (!submitPasscodeBtn || !passcodeInput) return;
    const btnText = submitPasscodeBtn.querySelector('.btn-text');
    const btnSpinner = submitPasscodeBtn.querySelector('.btn-spinner');

    try {
      submitPasscodeBtn.disabled = true;
      passcodeInput.disabled = true;
      if (btnText) btnText.textContent = 'Decrypting...';
      if (btnSpinner) btnSpinner.style.display = 'inline-block';
      if (passcodeError) passcodeError.style.display = 'none';

      // Fetch encrypted file if not already cached in memory
      if (!encryptedFileData) {
        const response = await fetch('DungeonsDiceDanger.enc');
        if (!response.ok) {
          throw new Error('Failed to load encrypted board file.');
        }
        encryptedFileData = await response.arrayBuffer();
      }

      const fileBytes = new Uint8Array(encryptedFileData);
      if (fileBytes.length < 28 + 16) {
        throw new Error('Encrypted file format is corrupted.');
      }

      const salt = fileBytes.slice(0, 16);
      const iv = fileBytes.slice(16, 28);
      const ciphertextAndTag = fileBytes.slice(28);

      const enc = new TextEncoder();
      const baseKey = await crypto.subtle.importKey(
        'raw',
        enc.encode(passcode),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      const aesKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        aesKey,
        ciphertextAndTag
      );

      // Decryption succeeded: create image blob
      const blob = new Blob([decryptedBuffer], { type: 'image/png' });
      const objectUrl = URL.createObjectURL(blob);

      boardImage.onload = () => {
        setupCanvasResolution();
        if (passcodeModal) {
          passcodeModal.classList.add('fade-out');
          setTimeout(() => {
            passcodeModal.remove();
          }, 450);
        }
      };

      boardImage.src = objectUrl;

    } catch (err) {
      console.warn('Decryption failed:', err);
      submitPasscodeBtn.disabled = false;
      passcodeInput.disabled = false;
      if (btnText) btnText.textContent = 'Unlock Board';
      if (btnSpinner) btnSpinner.style.display = 'none';
      if (passcodeError) {
        passcodeError.textContent = 'Incorrect passcode. Please try again.';
        passcodeError.style.display = 'block';
      }
      passcodeInput.focus();
      passcodeInput.select();
    }
  }

  if (passcodeForm) {
    passcodeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = passcodeInput ? passcodeInput.value.trim() : '';
      if (code) {
        decryptAndLoadImage(code);
      }
    });
  }

  // Undo / Redo Functions
  function saveState() {
    if (!canvas.width || !canvas.height) return;
    try {
      const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStack.push(state);
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack.length = 0; // Clear redo on new action
    } catch (err) {
      console.warn('Unable to save canvas state:', err);
    }
  }

  function undo() {
    if (undoStack.length === 0) return;
    try {
      const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
      redoStack.push(currentState);
      const previousState = undoStack.pop();
      ctx.putImageData(previousState, 0, 0);
    } catch (err) {
      console.warn('Undo failed:', err);
    }
  }

  function redo() {
    if (redoStack.length === 0) return;
    try {
      const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStack.push(currentState);
      const nextState = redoStack.pop();
      ctx.putImageData(nextState, 0, 0);
    } catch (err) {
      console.warn('Redo failed:', err);
    }
  }

  // Set Active Tool
  function setActiveTool(tool) {
    // If clicking already active tool, keep it active (or toggle off if needed)
    activeTool = tool;

    // Update button states
    if (btnXLarge) {
      btnXLarge.classList.toggle('active', activeTool === 'x-large');
      btnXLarge.setAttribute('aria-pressed', activeTool === 'x-large' ? 'true' : 'false');
    }

    if (btnXSmall) {
      btnXSmall.classList.toggle('active', activeTool === 'x-small');
      btnXSmall.setAttribute('aria-pressed', activeTool === 'x-small' ? 'true' : 'false');
    }

    if (btnYellowRect) {
      btnYellowRect.classList.toggle('active', activeTool === 'yellow-rect');
      btnYellowRect.setAttribute('aria-pressed', activeTool === 'yellow-rect' ? 'true' : 'false');
    }

    if (btnEraser) {
      btnEraser.classList.toggle('active', activeTool === 'eraser');
      btnEraser.setAttribute('aria-pressed', activeTool === 'eraser' ? 'true' : 'false');
    }

    // Update canvas cursor classes
    canvas.classList.toggle('x-large-active', activeTool === 'x-large');
    canvas.classList.toggle('x-small-active', activeTool === 'x-small');
    canvas.classList.toggle('yellow-active', activeTool === 'yellow-rect');
    canvas.classList.toggle('eraser-active', activeTool === 'eraser');
  }

  if (btnXLarge) {
    btnXLarge.addEventListener('click', () => {
      setActiveTool(activeTool === 'x-large' ? null : 'x-large');
    });
  }

  if (btnXSmall) {
    btnXSmall.addEventListener('click', () => {
      setActiveTool(activeTool === 'x-small' ? null : 'x-small');
    });
  }

  if (btnYellowRect) {
    btnYellowRect.addEventListener('click', () => {
      setActiveTool(activeTool === 'yellow-rect' ? null : 'yellow-rect');
    });
  }

  if (btnEraser) {
    btnEraser.addEventListener('click', () => {
      setActiveTool(activeTool === 'eraser' ? null : 'eraser');
    });
  }

  // Undo button
  if (btnUndo) {
    btnUndo.addEventListener('click', undo);
  }

  // Clear button
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      saveState();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  // Keyboard shortcuts (1: Big X, 2: Small X, 3: Yellow Stamp, 4: Eraser, Cmd+Z: Undo)
  window.addEventListener('keydown', (e) => {
    // Ignore if passcode modal is active or typing in input or textarea
    if (document.getElementById('passcodeModal')) {
      return;
    }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      return;
    }

    // Number keys 1-4 for tool switching and R for Roll Dice (without Cmd / Ctrl / Alt)
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        startRoll();
        return;
      } else if (e.key === '1') {
        e.preventDefault();
        setActiveTool('x-large');
        return;
      } else if (e.key === '2') {
        e.preventDefault();
        setActiveTool('x-small');
        return;
      } else if (e.key === '3') {
        e.preventDefault();
        setActiveTool('yellow-rect');
        return;
      } else if (e.key === '4') {
        e.preventDefault();
        setActiveTool('eraser');
        return;
      }
    }

    // Undo / Redo shortcuts
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redo();
    }
  });

  // Get transformed canvas coordinates
  function getCanvasCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  // Setup stroke context based on active tool
  function applyToolContext() {
    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = ERASER_WIDTH;
    } else if (activeTool === 'x-large') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = X_COLOR;
      ctx.fillStyle = X_COLOR;
      ctx.lineWidth = X_LARGE_STROKE;
    } else if (activeTool === 'x-small') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = X_COLOR;
      ctx.fillStyle = X_COLOR;
      ctx.lineWidth = X_SMALL_STROKE;
    } else if (activeTool === 'yellow-rect') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = YELLOW_RECT_COLOR;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1.0;
  }

  // Pointer Event Handlers for drawing/erasing/stamping/highlighting
  function startDrawing(e) {
    if (!activeTool) return;
    // Primary button only (left click / touch / pen)
    if (e.button !== undefined && e.button !== 0) return;

    // Save state before this action begins
    saveState();

    isDrawing = true;
    const { x, y } = getCanvasCoordinates(e);
    startX = x;
    startY = y;
    lastX = x;
    lastY = y;

    // Capture pointer
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore if not supported
    }

    // Configure stroke style
    applyToolContext();

    if (activeTool === 'x-large') {
      // Draw Large X centered at the clicked coordinate
      const r = X_LARGE_RADIUS;
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
    } else if (activeTool === 'x-small') {
      // Draw Small X centered at the clicked coordinate
      const r = X_SMALL_RADIUS;
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
    } else if (activeTool === 'yellow-rect') {
      // Stamp a 50% transparent yellow vertical rectangle centered at click
      const w = YELLOW_STAMP_WIDTH;
      const h = YELLOW_STAMP_HEIGHT;
      ctx.fillStyle = YELLOW_RECT_COLOR;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
    } else if (activeTool === 'eraser') {
      // Erase single dot on click
      const radius = ERASER_WIDTH / 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw(e) {
    if (!isDrawing || !activeTool) return;
    // Stamps do not drag
    if (activeTool === 'x-large' || activeTool === 'x-small' || activeTool === 'yellow-rect') return;

    const { x, y } = getCanvasCoordinates(e);

    applyToolContext();
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX = x;
    lastY = y;
  }

  function stopDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;

    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (err) {
      // Ignore
    }
  }

  // Attach pointer events for seamless mouse, touch, and stylus support
  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  canvas.addEventListener('pointerleave', stopDrawing);

  // Activate Big X by default on load
  setActiveTool('x-large');

  // =========================================================================
  // Dice Roller Logic (from dungeons-dice-and-danger)
  // =========================================================================
  const rollBtn = document.getElementById('rollBtn');
  const blackDie = document.getElementById('blackDie');
  const useBlackDie = document.getElementById('useBlackDie');
  const combinationsSection = document.getElementById('combinationsSection');
  const whiteCombinations = document.getElementById('whiteCombinations');
  const blackCombinations = document.getElementById('blackCombinations');
  const sectionDivider = document.getElementById('sectionDivider');

  let lastDice = [];

  function toggleBlackFromDie() {
    if (!useBlackDie) return;
    useBlackDie.checked = !useBlackDie.checked;
    toggleBlackDie();
  }

  function toggleBlackDie() {
    if (!useBlackDie || !blackDie) return;
    const isChecked = useBlackDie.checked;
    blackDie.style.opacity = isChecked ? '1' : '0.3';
    blackDie.textContent = isChecked ? (blackDie.textContent === '?' ? '?' : blackDie.textContent) : '-';
    if (lastDice.length > 0) calculatePairings(lastDice);
  }

  if (blackDie) {
    blackDie.addEventListener('click', toggleBlackFromDie);
  }
  if (useBlackDie) {
    useBlackDie.addEventListener('change', toggleBlackDie);
  }

  function startRoll() {
    if (!rollBtn || !combinationsSection) return;
    const useBlack = useBlackDie ? useBlackDie.checked : false;

    rollBtn.disabled = true;
    combinationsSection.classList.add('rolling-overlay');

    const diceEls = document.querySelectorAll('#diceContainer .die');
    diceEls.forEach((die, index) => {
      if (index === 4 && !useBlack) return;
      die.classList.add('rolling');
    });

    setTimeout(() => {
      rollDice();
      rollBtn.disabled = false;
      combinationsSection.classList.remove('rolling-overlay');
    }, 600);
  }

  if (rollBtn) {
    rollBtn.addEventListener('click', startRoll);
  }

  function rollDice() {
    const useBlack = useBlackDie ? useBlackDie.checked : false;
    const dice = [];
    for (let i = 0; i < 4; i++) {
      dice.push({ id: i, value: Math.floor(Math.random() * 6) + 1, type: 'white' });
    }
    if (useBlack) {
      dice.push({ id: 4, value: Math.floor(Math.random() * 6) + 1, type: 'black' });
    }
    lastDice = dice;
    renderDice(dice);
    calculatePairings(dice);
  }

  function renderDice(dice) {
    const useBlack = useBlackDie ? useBlackDie.checked : false;
    const diceEls = document.querySelectorAll('#diceContainer .die');
    for (let i = 0; i < 4; i++) {
      if (diceEls[i]) {
        diceEls[i].textContent = dice[i].value;
        diceEls[i].classList.remove('rolling');
      }
    }
    const blackDieEl = diceEls[4];
    if (blackDieEl) {
      blackDieEl.classList.remove('rolling');
      if (useBlack) {
        const d = dice.find(x => x.type === 'black');
        blackDieEl.textContent = d ? d.value : '?';
        blackDieEl.style.opacity = '1';
      } else {
        blackDieEl.textContent = '-';
        blackDieEl.style.opacity = '0.3';
      }
    }
  }

  function createPairObj(pair) {
    const sortedDice = [...pair].sort((a, b) => b.value - a.value);
    return {
      dice: sortedDice,
      sum: sortedDice[0].value + sortedDice[1].value,
      hasBlack: sortedDice[0].type === 'black' || sortedDice[1].type === 'black',
      isDoubles: sortedDice[0].value === sortedDice[1].value
    };
  }

  function calculatePairings(dice) {
    if (!whiteCombinations || !blackCombinations || !sectionDivider) return;

    whiteCombinations.innerHTML = '';
    blackCombinations.innerHTML = '';

    const uniqueOptions = new Map();

    function addOption(pairSet) {
      const p1 = createPairObj(pairSet[0]);
      const p2 = createPairObj(pairSet[1]);
      const sums = [p1.sum, p2.sum].sort((a, b) => b - a);
      const hasBlackInSet = p1.hasBlack || p2.hasBlack;
      const key = `${sums[0]}|${sums[1]}`;
      const existing = uniqueOptions.get(key);
      if (!existing || (existing.hasBlackInSet && !hasBlackInSet)) {
        uniqueOptions.set(key, {
          p1: p1.sum >= p2.sum ? p1 : p2,
          p2: p1.sum >= p2.sum ? p2 : p1,
          hasBlackInSet: hasBlackInSet
        });
      }
    }

    if (dice.length === 5) {
      for (let i = 0; i < 5; i++) {
        const remaining = dice.filter((_, idx) => idx !== i);
        const sets = [
          [[remaining[0], remaining[1]], [remaining[2], remaining[3]]],
          [[remaining[0], remaining[2]], [remaining[1], remaining[3]]],
          [[remaining[0], remaining[3]], [remaining[1], remaining[2]]]
        ];
        sets.forEach(set => addOption(set));
      }
    } else if (dice.length === 4) {
      const sets = [
        [[dice[0], dice[1]], [dice[2], dice[3]]],
        [[dice[0], dice[2]], [dice[1], dice[3]]],
        [[dice[0], dice[3]], [dice[1], dice[2]]]
      ];
      sets.forEach(set => addOption(set));
    }

    const results = Array.from(uniqueOptions.values()).sort((a, b) => {
      if (a.hasBlackInSet !== b.hasBlackInSet) return a.hasBlackInSet ? 1 : -1;
      if (a.p1.sum !== b.p1.sum) return b.p1.sum - a.p1.sum;
      return b.p2.sum - a.p2.sum;
    });

    let hasBlack = false;
    let hasWhite = false;

    results.forEach(res => {
      const el = document.createElement('div');
      el.className = `combination ${res.hasBlackInSet ? 'has-black' : ''}`;

      function formatDice(pairObj) {
        const d1 = pairObj.dice[0];
        const d2 = pairObj.dice[1];
        return `
          <div class="mini-die ${d1.type}">${d1.value}</div>
          <div class="plus-sign">+</div>
          <div class="mini-die ${d2.type}">${d2.value}</div>
        `;
      }

      el.innerHTML = `
        <div class="pair-square ${res.p1.isDoubles ? 'is-doubles' : ''}">
          <div class="pair-sum">${res.p1.sum}</div>
          <div class="pair-dice">${formatDice(res.p1)}</div>
        </div>
        <div class="pair-square ${res.p2.isDoubles ? 'is-doubles' : ''}">
          <div class="pair-sum">${res.p2.sum}</div>
          <div class="pair-dice">${formatDice(res.p2)}</div>
        </div>
      `;

      if (res.hasBlackInSet) {
        blackCombinations.appendChild(el);
        hasBlack = true;
      } else {
        whiteCombinations.appendChild(el);
        hasWhite = true;
      }
    });

    sectionDivider.style.display = (hasWhite && hasBlack) ? 'flex' : 'none';
  }
});
