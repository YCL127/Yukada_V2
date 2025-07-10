// script.js (最終完整版 - 修正所有繪圖與儲存問題)

// --- 遊戲狀態變數 ---
let players = [];
let currentPlayerIndex = 0;
let currentQuestions = [];
let answeredQuestions = new Set();
let allQuizzes = {};
let selectedQuizId = 'default';
let currentQuiz = { name: '預設題庫', questions: [] };
let questionTimer = null;
let isStealable = false;
let gameCountdownTime = 30;
let isStealEnabled = true; // 新增：搶答機制開關變數

let compositeEditorState = {
    canvas: null,
    ctx: null,
    gridSize: 10,
    cellSize: 30,
    selectedCells: new Set(),
};

const defaultQuestions = [
    { question: "哪種動物以其長脖子而聞名？", answer: "長頸鹿", points: 10, type: 'normal_question' },
    { question: "地球上最大的海洋是什麼？", answer: "太平洋", points: 20, type: 'normal_question' },
    { question: "香蕉是什麼顏色？", options: ["紅色", "綠色", "黃色", "藍色"], correct_answer_index: 2, points: 15, type: 'multiple_choice' },
    { type: 'event_card', event_type: 'fixed_points', event_description: "恭喜！您獲得了額外點數！", event_points: 30 }
];

const katexRenderOptions = {
    delimiters: [
        { left: "\\(", right: "\\)", display: false }, { left: "\\[", right: "\\]", display: true },
        { left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }
    ],
    throwOnError: false
};


function drawShapeOnCanvas(canvas, width, height, unit) {
    const ctx = canvas.getContext('2d');
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const padding = { top: 10, right: 10, bottom: 40, left: 45 };
    
    const drawableWidth = canvasWidth - padding.left - padding.right;
    const drawableHeight = canvasHeight - padding.top - padding.bottom;
    
    const scale = Math.min(drawableWidth / width, drawableHeight / height);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    const startX = padding.left + (drawableWidth - scaledWidth) / 2;
    const startY = padding.top + (drawableHeight - scaledHeight) / 2;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    ctx.fillStyle = '#4285F4';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.fillRect(startX, startY, scaledWidth, scaledHeight);
    ctx.strokeRect(startX, startY, scaledWidth, scaledHeight);

    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px sans-serif';
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const widthLabel = `${width} ${unit}`;
    ctx.fillText(widthLabel, startX + scaledWidth / 2, startY + scaledHeight + 8);

    ctx.save();
    ctx.translate(padding.left / 2, startY + scaledHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const heightLabel = `${height} ${unit}`;
    ctx.fillText(heightLabel, 0, 0);
    ctx.restore();
}

function drawNumberLineOnCanvas(canvas, start, end, ticks, questionMark) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 25;
    const y_axis = height / 2 + 10;
    const y_tick_label = y_axis + 20;
    const tick_height = 10;
    
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#333';
    ctx.fillStyle = '#333';
    ctx.lineWidth = 2;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';

    ctx.beginPath();
    ctx.moveTo(padding, y_axis);
    ctx.lineTo(width - padding, y_axis);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - padding, y_axis);
    ctx.lineTo(width - padding - 10, y_axis - 5);
    ctx.moveTo(width - padding, y_axis);
    ctx.lineTo(width - padding - 10, y_axis + 5);
    ctx.stroke();
    
    const range = end - start;
    if (range <= 0) return;

    function getX(value) {
        return padding + ((value - start) / range) * (width - 2 * padding);
    }

    ticks.forEach(tickValue => {
        const x = getX(tickValue);
        ctx.beginPath();
        ctx.moveTo(x, y_axis - tick_height / 2);
        ctx.lineTo(x, y_axis + tick_height / 2);
        ctx.stroke();
        ctx.fillText(tickValue, x, y_tick_label);
    });
    
    if (questionMark && questionMark.value !== undefined) {
         const x = getX(questionMark.value);
         ctx.beginPath();
         ctx.moveTo(x, y_axis - tick_height / 2);
         ctx.lineTo(x, y_axis + tick_height / 2);
         ctx.stroke();
         ctx.fillStyle = '#E65100';
         ctx.fillText(questionMark.label, x, y_axis - tick_height - 5);
    }
}

function drawGrid(ctx, canvas, gridSize, cellSize) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#FFCC80";
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSize; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(gridSize * cellSize, i * cellSize);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, gridSize * cellSize);
        ctx.stroke();
    }
}

function cellToKey(x, y) { return `${x},${y}`; }
function keyToCell(key) { return key.split(',').map(Number); }

function calculateArea(shape) { return shape.length; }
function calculatePerimeter(shape) {
    const map = new Set(shape.map(cell => cellToKey(cell[0], cell[1])));
    let perimeter = 0;
    const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
    shape.forEach(([x, y]) => {
        dirs.forEach(([dx, dy]) => {
            if (!map.has(cellToKey(x + dx, y + dy))) perimeter++;
        });
    });
    return perimeter;
}

function redrawEditorCanvas() {
    const { ctx, canvas, gridSize, cellSize, selectedCells } = compositeEditorState;
    const editorFeedback = document.getElementById('composite-editor-feedback');
    const unitLengthInput = document.getElementById('composite-unit-length');
    const unitNameInput = document.getElementById('composite-unit-name');
    if(!ctx || !canvas || !editorFeedback || !unitLengthInput || !unitNameInput) return;

    drawGrid(ctx, canvas, gridSize, cellSize);
    
    ctx.fillStyle = "#4CAF50";
    selectedCells.forEach(key => {
        const [x, y] = keyToCell(key);
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    });

    const shape = Array.from(selectedCells).map(keyToCell);
    const unitLength = parseFloat(unitLengthInput.value) || 1;
    const unitName = unitNameInput.value.trim() || '單位';

    if (shape.length > 0) {
        const area = calculateArea(shape) * unitLength * unitLength;
        const perimeter = calculatePerimeter(shape) * unitLength;
        editorFeedback.textContent = `面積: ${area} 平方${unitName}, 周長: ${perimeter} ${unitName}`;
    } else {
        editorFeedback.textContent = '請點擊上方格子繪製圖形';
    }
}

function initializeShapeEditor() {
    const canvas = document.getElementById('composite-shape-canvas');
    if (!canvas) return;

    compositeEditorState.gridSize = 10;
    compositeEditorState.cellSize = canvas.width / compositeEditorState.gridSize;
    compositeEditorState.canvas = canvas;
    compositeEditorState.ctx = canvas.getContext('2d');
    compositeEditorState.selectedCells.clear();
    
    redrawEditorCanvas();
}

function handleEditorCanvasClick(event) {
    const { canvas, cellSize, selectedCells, gridSize } = compositeEditorState;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;
    const cellX = Math.floor(canvasX / cellSize);
    const cellY = Math.floor(canvasY / cellSize);

    if (cellX >= 0 && cellX < gridSize && cellY >= 0 && cellY < gridSize) {
        const cellKey = cellToKey(cellX, cellY);
        if (selectedCells.has(cellKey)) {
            selectedCells.delete(cellKey);
        } else {
            selectedCells.add(cellKey);
        }
        redrawEditorCanvas();
    }
}


function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]; } return array; }
function generateUniqueId() { return '_' + Math.random().toString(36).substr(2, 9); }

document.addEventListener('DOMContentLoaded', () => {
    const startGameButton = document.getElementById('start-game-button');
    const numPlayersInput = document.getElementById('num-players');
    const numQuestionsInput = document.getElementById('num-questions');
    const countdownTimeInput = document.getElementById('countdown-time');
    const enableStealAnswerCheckbox = document.getElementById('enable-steal-answer');
    const gameSettings = document.getElementById('game-settings');
    const gameContainer = document.getElementById('game-container');
    const currentPlayerDisplay = document.getElementById('current-player-display');
    const playerScoresContainer = document.getElementById('player-scores');
    const gameBoard = document.getElementById('game-board');
    const questionModal = document.getElementById('question-modal');
    const closeQuestionModalButton = document.querySelector('#question-modal .close-button');
    const questionTextElement = document.getElementById('question-text');
    const showAnswerButton = document.getElementById('show-answer-button');
    const correctAnswerDisplay = document.getElementById('correct-answer-display');
    const judgmentButtons = document.querySelector('.judgment-buttons');
    const markCorrectButton = document.getElementById('mark-correct-button');
    const markIncorrectButton = document.getElementById('mark-incorrect-button');
    const feedbackElement = document.getElementById('feedback');
    const multipleChoiceOptionsContainer = document.getElementById('multiple-choice-options');
    const finalScoreModal = document.getElementById('final-score-modal');
    const closeFinalScoreModalButton = document.getElementById('close-final-score-modal');
    const restartGameButton = document.getElementById('restart-game-button');
    const quizSelect = document.getElementById('quiz-select');
    const addQuizButton = document.getElementById('add-quiz-button');
    const deleteQuizButton = document.getElementById('delete-quiz-button');
    const importQuizButton = document.getElementById('import-quiz-button');
    const exportQuizButton = document.getElementById('export-quiz-button');
    const quizQuestionList = document.getElementById('quiz-question-list');
    const editQuizModal = document.getElementById('edit-quiz-modal');
    const closeEditModalButton = document.getElementById('close-edit-modal');
    const showAddQuestionSectionButton = document.getElementById('show-add-question-section-button');
    const questionTypeSelect = document.getElementById('question-type-select');
    const pointsInputContainer = document.getElementById('points-input-container');
    const pointsInput = document.getElementById('points-input');
    const saveQuestionButton = document.getElementById('save-question-button');
    const cancelAddQuestionButton = document.getElementById('cancel-add-question-button');
    const timerDisplay = document.getElementById('timer-display');
    const stealOptionsContainer = document.getElementById('steal-options-container');

    const normalQuestionInputs = document.getElementById('normal-question-inputs');
    const shapeQuestionInputs = document.getElementById('shape-question-inputs');
    const compositeShapeInputs = document.getElementById('composite-shape-inputs');
    const multipleChoiceInputs = document.getElementById('multiple-choice-inputs');
    const eventCardInputs = document.getElementById('event-card-inputs');

    const questionInput = document.getElementById('question-input');
    const answerInput = document.getElementById('answer-input');
    const imageUrlInput = document.getElementById('image-url-input');
    
    const shapeQuestionInput = document.getElementById('shape-question-input');
    const shapeAnswerInput = document.getElementById('shape-answer-input');
    const shapeImageUrlInput = document.getElementById('shape-image-url-input');
    const drawButtonShape = document.getElementById('draw-button-shape');
    const canvasShape = document.getElementById('drawing-canvas-shape');
    
    const shapeTypeSelect = document.getElementById('shape-type-select');
    const rectangleControls = document.getElementById('rectangle-controls');
    const numberLineControls = document.getElementById('number-line-controls');
    const drawerWidthShape = document.getElementById('drawer-width-shape');
    const drawerHeightShape = document.getElementById('drawer-height-shape');
    const drawerUnitShape = document.getElementById('drawer-unit-shape');
    const nlStart = document.getElementById('nl-start');
    const nlEnd = document.getElementById('nl-end');
    const nlTicks = document.getElementById('nl-ticks');
    const nlQuestionMark = document.getElementById('nl-question-mark');
    
    const compositeQuestionInput = document.getElementById('composite-question-input');
    const compositeAnswerInput = document.getElementById('composite-answer-input');
    const compositeImageUrlInput = document.getElementById('composite-image-url-input');
    const compositeShapeCanvas = document.getElementById('composite-shape-canvas');
    const clearCompositeButton = document.getElementById('clear-composite-button');
    const compositeUnitLengthInput = document.getElementById('composite-unit-length');
    const compositeUnitNameInput = document.getElementById('composite-unit-name');

    const mcQuestionInput = document.getElementById('mc-question-input');
    const option1Input = document.getElementById('option1-input');
    const option2Input = document.getElementById('option2-input');
    const option3Input = document.getElementById('option3-input');
    const option4Input = document.getElementById('option4-input');
    const correctOptionSelect = document.getElementById('correct-option-select');

    const eventTypeSelect = document.getElementById('event-type-select');
    const eventDescriptionContainer = document.getElementById('event-description-container');
    const eventDescriptionInput = document.getElementById('event-description-input');
    const eventPointsContainer = document.getElementById('event-points-container');
    const eventPointsInput = document.getElementById('event-points-input');
    
    let editingQuestionIndex = -1;
    
    function updateEventInputsVisibility() {
        const selectedEventType = eventTypeSelect.value;
        const noDescNeeded = ['double_score', 'swap_score', 'random_score', 'equalize_scores'];
        eventDescriptionContainer.style.display = noDescNeeded.includes(selectedEventType) ? 'none' : 'flex';
        eventPointsContainer.style.display = selectedEventType === 'fixed_points' ? 'flex' : 'none';
    }

    function showNextStepButton() {
        const nextButton = document.createElement('button');
        nextButton.textContent = '下一題';
        nextButton.className = 'next-question-button';
        nextButton.onclick = () => {
            hideQuestionModal();
            nextTurn();
        };
        feedbackElement.appendChild(nextButton);
    }

    function saveQuizzes() { localStorage.setItem('allQuizzes', JSON.stringify(allQuizzes)); }
    
    function loadQuizzes() {
        const storedQuizzes = localStorage.getItem('allQuizzes');
        if (storedQuizzes) { allQuizzes = JSON.parse(storedQuizzes); }
        else { allQuizzes = { 'default': { id: 'default', name: '預設題庫', questions: defaultQuestions } }; saveQuizzes(); }
        currentQuiz = allQuizzes[selectedQuizId] || allQuizzes['default'];
    }
    
    function populateQuizSelect() {
        quizSelect.innerHTML = '';
        for (const quizId in allQuizzes) {
            const option = document.createElement('option');
            option.value = quizId;
            option.textContent = allQuizzes[quizId].name;
            quizSelect.appendChild(option);
        }
        quizSelect.value = selectedQuizId;
    }

    function renderQuizList() {
        quizQuestionList.innerHTML = '';
        if (currentQuiz?.questions?.length > 0) {
            currentQuiz.questions.forEach((q, index) => {
                const item = document.createElement('li');
                let displayContent = '';
                switch (q.type) {
                    case 'normal_question': displayContent = `[標準題 ${q.points}點] Q: ${q.question}`; break;
                    case 'shape_question': displayContent = `[圖形題 ${q.points}點] Q: ${q.question}`; break;
                    case 'composite_shape': displayContent = `[複合圖形題 ${q.points}點] Q: ${q.question}`; break;
                    case 'multiple_choice': displayContent = `[選擇題 ${q.points}點] Q: ${q.question}`; break;
                    case 'event_card':
                        let eventTitle = '';
                        switch (q.event_type) {
                            case 'double_score': eventTitle = '分數加倍'; break;
                            case 'swap_score': eventTitle = '分數交換'; break;
                            case 'random_score': eventTitle = '隨機分數'; break;
                            case 'equalize_scores': eventTitle = '平分分數'; break;
                            default: eventTitle = `點數 ${q.event_points >= 0 ? '+' : ''}${q.event_points}`; break;
                        }
                        displayContent = `[事件卡 - ${eventTitle}] ${q.event_description}`; break;
                    default: displayContent = `[未知類型]`; break;
                }
                if (q.imageUrl) { displayContent += ` 🖼️`; }
                item.innerHTML = `<span></span><div class="item-actions"><button class="edit-question-btn" data-index="${index}">編輯</button><button class="delete-question-btn" data-index="${index}">刪除</button></div>`;
                item.querySelector('span').textContent = displayContent;
                if (window.renderMathInElement) { renderMathInElement(item, katexRenderOptions); }
                quizQuestionList.appendChild(item);
            });
        } else { quizQuestionList.innerHTML = '<li>此題庫中沒有題目。</li>'; }
    }
    
    function showAddQuestionSection(type = 'normal_question', questionToEdit = null, index = -1) {
        editQuizModal.style.display = 'flex';
        editQuizModal.classList.add('show-modal');
        editingQuestionIndex = index;
        
        document.querySelectorAll('#add-question-to-quiz-section input[type="text"], #add-question-to-quiz-section input[type="number"], #add-question-to-quiz-section textarea').forEach(i => i.value = '');
        pointsInput.value = '10';
        
        [normalQuestionInputs, shapeQuestionInputs, compositeShapeInputs, multipleChoiceInputs, eventCardInputs].forEach(d => d.style.display = 'none');
        pointsInputContainer.style.display = 'flex';

        questionTypeSelect.value = questionToEdit ? questionToEdit.type : type;
        
        canvasShape.getContext('2d').clearRect(0, 0, canvasShape.width, canvasShape.height);
        
        if (type === 'shape_question') {
            shapeTypeSelect.dispatchEvent(new Event('change'));
        }

        switch (questionTypeSelect.value) {
            case 'normal_question':
                normalQuestionInputs.style.display = 'block';
                if (questionToEdit) { questionInput.value = questionToEdit.question; answerInput.value = questionToEdit.answer; pointsInput.value = questionToEdit.points; imageUrlInput.value = questionToEdit.imageUrl || '';}
                break;
            case 'shape_question':
                shapeQuestionInputs.style.display = 'block';
                if (questionToEdit) { 
                    shapeQuestionInput.value = questionToEdit.question; 
                    shapeAnswerInput.value = questionToEdit.answer; 
                    pointsInput.value = questionToEdit.points; 
                    shapeImageUrlInput.value = questionToEdit.imageUrl || '';
                }
                break;
            case 'composite_shape':
                compositeShapeInputs.style.display = 'block';
                if (questionToEdit) {
                    compositeQuestionInput.value = questionToEdit.question;
                    compositeAnswerInput.value = questionToEdit.answer;
                    pointsInput.value = questionToEdit.points;
                    compositeUnitLengthInput.value = questionToEdit.unitLength || 1;
                    compositeUnitNameInput.value = questionToEdit.unitName || 'cm';
                } else {
                    compositeUnitLengthInput.value = 1;
                    compositeUnitNameInput.value = 'cm';
                }
                initializeShapeEditor();
                break;
            case 'multiple_choice':
                multipleChoiceInputs.style.display = 'block';
                if (questionToEdit) { mcQuestionInput.value = questionToEdit.question;[option1Input.value, option2Input.value, option3Input.value, option4Input.value] = questionToEdit.options || ['', '', '', '']; correctOptionSelect.value = questionToEdit.correct_answer_index; pointsInput.value = questionToEdit.points;}
                break;
            case 'event_card':
                eventCardInputs.style.display = 'block';
                pointsInputContainer.style.display = 'none';
                if (questionToEdit) { 
                    eventTypeSelect.value = questionToEdit.event_type || 'fixed_points'; 
                    eventDescriptionInput.value = questionToEdit.event_description || '';
                    eventPointsInput.value = questionToEdit.event_points || 0;
                }
                updateEventInputsVisibility();
                break;
        }
        saveQuestionButton.textContent = editingQuestionIndex !== -1 ? '更新題目' : '儲存題目';
    }
    
    function cancelAddQuestion() {
        editQuizModal.classList.remove('show-modal');
        setTimeout(() => { editQuizModal.style.display = 'none'; }, 300);
        editingQuestionIndex = -1;
    }

    function saveOrUpdateQuestion() {
        if (!currentQuiz) { alert("無選中題庫，無法儲存。"); return; }
        const type = questionTypeSelect.value;
        const questionData = { type };

        if (type !== 'event_card') {
            const points = parseInt(pointsInput.value);
            if (isNaN(points) || points <= 0) { alert("請輸入有效的分數。"); return; }
            questionData.points = points;
        }

        if (type === 'normal_question') {
            const q = questionInput.value.trim(); const a = answerInput.value.trim();
            if (!q || !a) { alert("題目和答案不能為空。"); return; }
            questionData.question = q; questionData.answer = a;
            if (imageUrlInput.value.trim()) { questionData.imageUrl = imageUrlInput.value.trim(); }
        } else if (type === 'shape_question') {
            const q = shapeQuestionInput.value.trim(); const a = shapeAnswerInput.value.trim();
            if (!q || !a) { alert("題目和答案不能為空。"); return; }
            questionData.question = q; questionData.answer = a;
            if (shapeImageUrlInput.value.trim()) { questionData.imageUrl = shapeImageUrlInput.value.trim(); }
        } else if (type === 'composite_shape') {
            const q = compositeQuestionInput.value.trim();
            const a = compositeAnswerInput.value.trim();
            if (!q || !a) { alert("題目和答案不能為空。"); return; }
            questionData.question = q;
            questionData.answer = a;
            
            questionData.unitLength = parseFloat(compositeUnitLengthInput.value) || 1;
            questionData.unitName = compositeUnitNameInput.value.trim() || '單位';

            if (compositeEditorState.selectedCells.size > 0) {
                 questionData.imageUrl = compositeEditorState.canvas.toDataURL();
            } else if (editingQuestionIndex !== -1 && currentQuiz.questions[editingQuestionIndex].imageUrl) {
                questionData.imageUrl = currentQuiz.questions[editingQuestionIndex].imageUrl;
            }
        } else if (type === 'multiple_choice') {
            const q = mcQuestionInput.value.trim();
            const opts = [option1Input, option2Input, option3Input, option4Input].map(i => i.value.trim());
            if (!q || opts.some(o => !o)) { alert("選擇題所有欄位不能為空。"); return; }
            questionData.question = q; questionData.options = opts;
            questionData.correct_answer_index = parseInt(correctOptionSelect.value);
        } else if (type === 'event_card') {
            questionData.event_type = eventTypeSelect.value;
            switch (questionData.event_type) {
                case 'fixed_points':
                    const desc = eventDescriptionInput.value.trim(); const pts = parseInt(eventPointsInput.value);
                    if (!desc || isNaN(pts)) { alert("事件描述不能為空，點數必須是數字。"); return; }
                    questionData.event_description = desc; questionData.event_points = pts;
                    break;
                case 'double_score': questionData.event_description = "天賜良機！分數加倍！"; break;
                case 'swap_score': questionData.event_description = "風水輪流轉！與一名玩家交換分數！"; break;
                case 'random_score': questionData.event_description = "命運的時刻！隨機增減分數！"; break;
                case 'equalize_scores': questionData.event_description = "天下大同！所有人的分數都均分了！"; break;
            }
        }

        if (editingQuestionIndex === -1) { currentQuiz.questions.push(questionData); }
        else { currentQuiz.questions[editingQuestionIndex] = questionData; }
        saveQuizzes(); renderQuizList(); cancelAddQuestion();
    }
    
    function initializeGame() {
        const numPlayers = parseInt(numPlayersInput.value);
        const numQuestions = parseInt(numQuestionsInput.value);
        gameCountdownTime = parseInt(countdownTimeInput.value) || 30;
        isStealEnabled = enableStealAnswerCheckbox.checked;
        if (numPlayers < 1) { alert("玩家數量至少需要1位。"); return; }
        players = Array.from({ length: numPlayers }, (_, i) => ({ id: i, score: 0 }));
        currentPlayerIndex = 0; answeredQuestions.clear();
        const shuffled = shuffleArray([...currentQuiz.questions]);
        currentQuestions = shuffled.slice(0, Math.min(numQuestions, shuffled.length));
        if (currentQuestions.length < numQuestions) { alert(`此題庫中只有 ${currentQuestions.length} 個題目，將以此數量進行遊戲。`); }
        gameSettings.style.display = 'none'; document.querySelector('#quiz-management-section').style.display = 'none';
        gameContainer.style.display = 'flex';
        updatePlayerInfo(); renderGameBoard(currentQuestions.length);
    }

    function resetGame() {
        gameSettings.style.display = 'block'; document.querySelector('#quiz-management-section').style.display = 'block';
        gameContainer.style.display = 'none';
        loadQuizzes(); populateQuizSelect(); renderQuizList();
    }

    function updatePlayerInfo() {
        currentPlayerDisplay.textContent = `當前玩家: 玩家 ${currentPlayerIndex + 1}`;
        playerScoresContainer.innerHTML = players.map((p, i) => `<div class="player-score ${i === currentPlayerIndex ? 'current' : ''}">玩家 ${i + 1}: ${p.score} 點</div>`).join('');
    }

    function renderGameBoard(numCards) {
        gameBoard.innerHTML = '';
        for (let i = 0; i < numCards; i++) {
            const card = document.createElement('div');
            card.className = 'question-card'; card.dataset.index = i; card.textContent = i + 1;
            card.addEventListener('click', handleCardClick);
            gameBoard.appendChild(card);
        }
    }

    function handleCardClick(event) {
        const cardIndex = parseInt(event.target.dataset.index);
        if (answeredQuestions.has(cardIndex)) { alert('這張卡片已經被翻過了！'); return; }
        displayQuestion(currentQuestions[cardIndex], cardIndex);
    }

    function displayQuestion(question, cardIndex) {
        closeQuestionModalButton.onclick = hideQuestionModal;
        [correctAnswerDisplay, judgmentButtons, multipleChoiceOptionsContainer, stealOptionsContainer].forEach(el => { if(el) el.style.display = 'none' });
        feedbackElement.innerHTML = '';
        showAnswerButton.style.display = 'block';
        questionModal.style.display = 'flex';
        questionModal.classList.add('show-modal');

        if (question.type === 'event_card') {
            timerDisplay.style.display = 'none';
            questionTextElement.innerHTML = `<p>${`事件卡：${question.event_description}`}</p>`;
            showAnswerButton.style.display = 'none';
            applyEventCardEffect(question);
            markCardAsAnswered(cardIndex);
            showNextStepButton();
            return;
        }
        
        // --- START: MODIFIED LOGIC ---
        if (isStealEnabled) {
            timerDisplay.style.display = 'block';
            let timeLeft = gameCountdownTime;
            timerDisplay.textContent = `剩餘時間：${timeLeft}`;
            questionTimer = setInterval(() => {
                timeLeft--;
                timerDisplay.textContent = `剩餘時間：${timeLeft}`;
                if (timeLeft <= 0) { 
                    clearInterval(questionTimer);
                    timerDisplay.textContent = "時間到！";
                    feedbackElement.innerHTML = '<span style="color: blue;">時間到！開放全員搶答！</span>';
                    isStealable = true;
                    showAnswerButton.style.display = 'none';
                    judgmentButtons.style.display = 'none';
                    multipleChoiceOptionsContainer.querySelectorAll('button').forEach(b => { b.onclick = null; b.disabled = true; });
                    stealOptionsContainer.style.display = 'flex';
                    stealOptionsContainer.innerHTML = '';
                    players.forEach((player, index) => {
                        const stealPlayerButton = document.createElement('button');
                        stealPlayerButton.textContent = `玩家 ${index + 1} 搶答`;
                        stealPlayerButton.onclick = () => { handleSteal(question, cardIndex, index); };
                        stealOptionsContainer.appendChild(stealPlayerButton);
                    });
                }
            }, 1000);
        } else {
            timerDisplay.style.display = 'none';
        }
        // --- END: MODIFIED LOGIC ---

        questionTextElement.innerHTML = '';
        const questionParagraph = document.createElement('p');
        questionParagraph.textContent = question.question;
        questionTextElement.appendChild(questionParagraph);
        if (question.imageUrl) {
            const imageElement = document.createElement('img');
            imageElement.src = question.imageUrl;
            imageElement.alt = "題目圖片";
            questionTextElement.appendChild(imageElement);

            if (question.type === 'composite_shape') {
                const unitLabel = document.createElement('p');
                unitLabel.className = 'unit-label';
                const unitLength = question.unitLength || 1;
                const unitName = question.unitName || '單位';
                unitLabel.textContent = `(每格邊長為 ${unitLength} ${unitName})`;
                questionTextElement.appendChild(unitLabel);
            }
        }
        renderMathInElement(questionTextElement, katexRenderOptions);

        if (question.type === 'normal_question' || question.type === 'shape_question' || question.type === 'composite_shape') {
            showAnswerButton.onclick = () => {
                clearInterval(questionTimer);
                timerDisplay.style.display = 'none';
                correctAnswerDisplay.textContent = `答案：${question.answer}`;
                renderMathInElement(correctAnswerDisplay, katexRenderOptions);
                correctAnswerDisplay.style.display = 'block';
                judgmentButtons.style.display = 'flex';
                showAnswerButton.style.display = 'none';
            };
            markCorrectButton.onclick = () => handleAnswer(true, question.points, cardIndex);
            markIncorrectButton.onclick = () => handleAnswer(false, 0, cardIndex);
        } else if (question.type === 'multiple_choice') {
            showAnswerButton.style.display = 'none';
            renderMultipleChoiceOptions(question, cardIndex);
        }
    }

    function handleSteal(question, cardIndex, stealerIndex) {
        stealOptionsContainer.style.display = 'none';
        feedbackElement.innerHTML = `<span style="font-weight: bold;">玩家 ${stealerIndex + 1} 進行搶答！</span>`;
        if (question.type === 'multiple_choice') {
            multipleChoiceOptionsContainer.querySelectorAll('button').forEach((button, optIndex) => {
                button.disabled = false;
                button.onclick = () => {
                    multipleChoiceOptionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
                    const isCorrect = optIndex === question.correct_answer_index;
                    handleAnswer(isCorrect, isCorrect ? question.points : 0, cardIndex, question, stealerIndex);
                };
            });
        } else {
            showAnswerButton.style.display = 'block';
            showAnswerButton.onclick = () => {
                correctAnswerDisplay.textContent = `答案：${question.answer}`;
                renderMathInElement(correctAnswerDisplay, katexRenderOptions);
                correctAnswerDisplay.style.display = 'block';
                judgmentButtons.style.display = 'flex';
                showAnswerButton.style.display = 'none';
            };
            markCorrectButton.onclick = () => handleAnswer(true, question.points, cardIndex, question, stealerIndex);
            markIncorrectButton.onclick = () => handleAnswer(false, 0, cardIndex, question, stealerIndex);
        }
    }

    function renderMultipleChoiceOptions(question, cardIndex) {
        multipleChoiceOptionsContainer.innerHTML = '';
        multipleChoiceOptionsContainer.style.display = 'flex';
        question.options.forEach((option, index) => {
            const button = document.createElement('button');
            button.className = 'mc-option-button';
            button.textContent = `${String.fromCharCode(65 + index)}. ${option}`;
            renderMathInElement(button, katexRenderOptions);
            button.onclick = () => {
                clearInterval(questionTimer);
                multipleChoiceOptionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
                const isCorrect = index === question.correct_answer_index;
                handleAnswer(isCorrect, isCorrect ? question.points : 0, cardIndex, question);
            };
            multipleChoiceOptionsContainer.appendChild(button);
        });
    }

    function handleAnswer(isCorrect, points, cardIndex, question = null, answeringPlayerIndex = currentPlayerIndex) {
        clearInterval(questionTimer);
        timerDisplay.style.display = 'none';

        const currentQuestion = currentQuestions[cardIndex];

        if (isCorrect) {
            players[answeringPlayerIndex].score += points;
            feedbackElement.innerHTML = `<span style="color: green; font-weight: bold;">玩家 ${answeringPlayerIndex + 1} 回答正確！獲得 ${points} 點。</span>`;
        } else {
            let correctAnswerText = '';
            if (currentQuestion.type === 'multiple_choice') {
                const correctOption = currentQuestion.options[currentQuestion.correct_answer_index];
                correctAnswerText = `正確答案是：${correctOption}`;
            } else {
                correctAnswerText = `正確答案是：${currentQuestion.answer}`;
            }
            
            feedbackElement.innerHTML = `
                <span style="color: red; font-weight: bold;">玩家 ${answeringPlayerIndex + 1} 回答錯誤。</span>
                <span style="font-weight: bold; margin-top: 5px;">${correctAnswerText}</span>
            `;
        }
        updatePlayerInfo();
        markCardAsAnswered(cardIndex);
        showNextStepButton();
    }

    function applyEventCardEffect(eventCard) {
        const player = players[currentPlayerIndex];
        let feedbackText = '';
        switch (eventCard.event_type) {
            case 'double_score': const oldScore = player.score; player.score *= 2; feedbackText = `玩家 ${currentPlayerIndex + 1} 分數加倍！從 ${oldScore} 點變為 ${player.score} 點！`; break;
            case 'swap_score':
                if (players.length > 1) { const otherPlayers = players.filter((_, i) => i !== currentPlayerIndex); const targetPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)]; const targetPlayerIndex = players.findIndex(p => p.id === targetPlayer.id);[player.score, players[targetPlayerIndex].score] = [players[targetPlayerIndex].score, player.score]; feedbackText = `玩家 ${currentPlayerIndex + 1} 與 玩家 ${targetPlayerIndex + 1} 交換了分數！`; }
                else { feedbackText = "只有一個玩家，無法交換分數！"; } break;
            case 'random_score': const randomPoints = Math.floor(Math.random() * 61) - 30; player.score += randomPoints; feedbackText = `隨機事件！玩家 ${currentPlayerIndex + 1} 分數 ${randomPoints >= 0 ? `增加 ${randomPoints}` : `減少 ${-randomPoints}`} 點！`; break;
            case 'equalize_scores':
                if (players.length > 1) { const totalScore = players.reduce((sum, p) => sum + p.score, 0); const averageScore = Math.floor(totalScore / players.length); players.forEach(p => { p.score = averageScore; }); feedbackText = `天下大同！所有玩家的分數都被重新洗牌，現在大家都是 ${averageScore} 點！`; }
                else { feedbackText = "只有一個玩家，分數無法平分！"; } break;
            default: const points = eventCard.event_points || 0; player.score += points; feedbackText = `${eventCard.event_description} 玩家 ${currentPlayerIndex + 1} 點數變化：${points >= 0 ? '+' : ''}${points}`; break;
        }
        feedbackElement.innerHTML = `<span style="color: #00008B; font-weight: bold;">${feedbackText}</span>`;
        updatePlayerInfo();
    }

    function hideQuestionModal() { clearInterval(questionTimer); questionModal.classList.remove('show-modal'); setTimeout(() => { questionModal.style.display = 'none'; }, 300); }
    
    function markCardAsAnswered(index) { answeredQuestions.add(index); const card = document.querySelector(`.question-card[data-index="${index}"]`); if (card) { card.classList.add('answered'); } }
    
    function nextTurn() { if (answeredQuestions.size >= currentQuestions.length) { endGame(); return; } currentPlayerIndex = (currentPlayerIndex + 1) % players.length; updatePlayerInfo(); }
    
    function endGame() {
        finalScoreModal.style.display = 'flex';
        finalScoreModal.classList.add('show-modal');
        const finalScoresDisplay = document.getElementById('final-scores-display');
        finalScoresDisplay.innerHTML = '';
        const header = document.createElement('h2');
        header.textContent = '最終得分';
        finalScoresDisplay.appendChild(header);

        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        sortedPlayers.forEach((p, index) => {
            const div = document.createElement('div');
            div.className = 'player-final-score';
            div.textContent = `玩家 ${p.id + 1}: ${p.score} 點`;
            if (index === 0 && p.score > 0) div.classList.add('winner');
            finalScoresDisplay.appendChild(div);
        });
    }

    // --- 事件監聽器 ---
    startGameButton.addEventListener('click', initializeGame);
    closeQuestionModalButton.addEventListener('click', hideQuestionModal);
    quizSelect.addEventListener('change', (e) => { selectedQuizId = e.target.value; currentQuiz = allQuizzes[selectedQuizId]; renderQuizList(); });
    addQuizButton.addEventListener('click', () => { const name = prompt('請輸入新題庫的名稱:'); if (name?.trim()) { const newId = generateUniqueId(); allQuizzes[newId] = { id: newId, name: name.trim(), questions: [] }; selectedQuizId = newId; saveQuizzes(); populateQuizSelect(); renderQuizList(); } });
    deleteQuizButton.addEventListener('click', () => { if (selectedQuizId === 'default' || Object.keys(allQuizzes).length <= 1) { alert('不能刪除最後一個或預設的題庫！'); return; } if (confirm(`確定要刪除題庫 "${currentQuiz.name}" 嗎？`)) { delete allQuizzes[selectedQuizId]; selectedQuizId = Object.keys(allQuizzes)[0]; saveQuizzes(); resetGame(); } });
    exportQuizButton.addEventListener('click', () => { if (!currentQuiz) return; const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentQuiz, null, 2)); a.download = `${currentQuiz.name}.json`; a.click(); });
    importQuizButton.addEventListener('click', () => { 
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
            input.onchange = e => {
                const file = e.target.files[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = re => {
                    try {
                        const data = JSON.parse(re.target.result);
                        if (data?.name && Array.isArray(data.questions)) { const newId = data.id || generateUniqueId(); allQuizzes[newId] = { ...data, id: newId }; selectedQuizId = newId; currentQuiz = allQuizzes[newId]; saveQuizzes(); populateQuizSelect(); renderQuizList(); alert(`題庫 "${data.name}" 已成功匯入！`); }
                        else { alert('檔案格式不正確。'); }
                    } catch (err) { alert('讀取檔案時發生錯誤。'); }
                };
                reader.readAsText(file);
            };
            input.click();
     });
    closeFinalScoreModalButton.addEventListener('click', () => { finalScoreModal.style.display = 'none'; resetGame(); });
    restartGameButton.addEventListener('click', () => { finalScoreModal.style.display = 'none'; resetGame(); });
    closeEditModalButton.addEventListener('click', cancelAddQuestion);
    showAddQuestionSectionButton.addEventListener('click', () => showAddQuestionSection('normal_question'));
    saveQuestionButton.addEventListener('click', saveOrUpdateQuestion);
    cancelAddQuestionButton.addEventListener('click', cancelAddQuestion);
    questionTypeSelect.addEventListener('change', (e) => showAddQuestionSection(e.target.value));
    
    quizQuestionList.addEventListener('click', (e) => {
        const target = e.target.closest('button'); if (!target) return;
        const index = parseInt(target.dataset.index);
        if (target.classList.contains('edit-question-btn')) { showAddQuestionSection(currentQuiz.questions[index].type, currentQuiz.questions[index], index); }
        else if (target.classList.contains('delete-question-btn')) { if (confirm('確定要刪除這道題目嗎？')) { currentQuiz.questions.splice(index, 1); saveQuizzes(); renderQuizList(); } }
    });

    eventTypeSelect.addEventListener('change', updateEventInputsVisibility);
    
    shapeTypeSelect.addEventListener('change', () => {
        const isRectangle = shapeTypeSelect.value === 'rectangle';
        rectangleControls.style.display = isRectangle ? 'flex' : 'none';
        numberLineControls.style.display = isRectangle ? 'none' : 'flex';
    });

    drawButtonShape.addEventListener('click', () => {
        const shapeType = shapeTypeSelect.value;
        
        if (shapeType === 'rectangle') {
            const width = parseFloat(drawerWidthShape.value);
            const height = parseFloat(drawerHeightShape.value);
            const unit = drawerUnitShape.value.trim() || '單位';

            if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
                alert('請輸入有效的寬度和高度！');
                return;
            }
            drawShapeOnCanvas(canvasShape, width, height, unit);

        } else if (shapeType === 'number_line') {
            const start = parseFloat(nlStart.value);
            const end = parseFloat(nlEnd.value);
            
            if (isNaN(start) || isNaN(end) || start >= end) {
                alert('請輸入有效的數線起點與終點，且起點必須小於終點！');
                return;
            }
            
            const ticks = nlTicks.value.split(',')
                .map(s => parseFloat(s.trim()))
                .filter(n => !isNaN(n) && n >= start && n <= end);
            
            const qmText = nlQuestionMark.value.trim();
            let questionMark = {};
            if (qmText) {
                 if(qmText.includes(':')){
                    const parts = qmText.split(':');
                    questionMark.label = parts[0].trim();
                    const qmValue = parseFloat(parts[1].trim());
                    if(!isNaN(qmValue) && qmValue >= start && qmValue <= end) {
                        questionMark.value = qmValue;
                    }
                } else {
                    questionMark.label = qmText;
                    const existingTicks = new Set(ticks);
                    let availableSpots = [];
                    for(let i = Math.ceil(start); i < end; i++){
                        if(!existingTicks.has(i)) availableSpots.push(i);
                    }
                    if(availableSpots.length > 0) {
                       questionMark.value = availableSpots[Math.floor(Math.random() * availableSpots.length)];
                    } else {
                       questionMark.value = (start + end) / 2.1;
                    }
                }
            }
            drawNumberLineOnCanvas(canvasShape, start, end, ticks, questionMark);
        }

        shapeImageUrlInput.value = canvasShape.toDataURL();
    });

    compositeShapeCanvas.addEventListener('click', handleEditorCanvasClick);
    clearCompositeButton.addEventListener('click', () => {
        compositeEditorState.selectedCells.clear();
        redrawEditorCanvas();
    });
    compositeUnitLengthInput.addEventListener('input', redrawEditorCanvas);
    compositeUnitNameInput.addEventListener('input', redrawEditorCanvas);

    // --- 初始化調用 ---
    loadQuizzes();
    populateQuizSelect();
    renderQuizList();
});