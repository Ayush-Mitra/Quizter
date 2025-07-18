import * as pdfjsLib from 'https://mozilla.github.io/pdf.js/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://mozilla.github.io/pdf.js/build/pdf.worker.mjs';

// --- DOM Elements Done!!!! ---
const fileUpload = document.getElementById('file-upload');
const fileName = document.querySelector('.file-name');
const createQuizBtn = document.getElementById('create-quiz-btn');
const uploadSection = document.getElementById('upload-section');
const quizContainer = document.getElementById('quiz-container');
const resultContainer = document.getElementById('result-container');
const questionTextEl = document.getElementById('question-text');
const answerButtonsEl = document.getElementById('answer-buttons');
const nextBtn = document.getElementById('next-btn');
const restartBtn = document.getElementById('restart-btn');
const resultText = document.getElementById('result-text'); // For text inside chart


let quizQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let resultChart; 

// Lets Ignore the Keywords
const stopWords = new Set(["a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"]);

// Doc Name
fileUpload.addEventListener('change', () => {
    fileName.textContent = fileUpload.files.length > 0 ? fileUpload.files[0].name : 'No file selected';
});

// Create Quiz Btn
createQuizBtn.addEventListener('click', async () => {
    if (!fileUpload.files[0]) {
        alert('Please select a PDF file first!');
        return;
    }

    createQuizBtn.textContent = 'Generating...';
    createQuizBtn.disabled = true;

    try {
        const text = await extractTextFromPdf(fileUpload.files[0]);
        if (text.length < 200) throw new Error("PDF content is too short to create a meaningful quiz.");

        quizQuestions = generateBetterMcqs(text, 5); // Generate 5 better questions
        if (quizQuestions.length < 1) throw new Error("Could not generate a quiz. The document might not have enough distinct keywords.");

        startQuiz();
    } catch (error) {
        alert(`Error: ${error.message}`);
    } finally {
        createQuizBtn.textContent = 'Create Quiz';
        createQuizBtn.disabled = false;
    }
});

// Next Btn
nextBtn.addEventListener('click', () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < quizQuestions.length) {
        showQuestion();
    } else {
        showResults();
    }
});

// Restart Btn Click
restartBtn.addEventListener('click', () => {
    resultContainer.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    fileName.textContent = 'No file selected';
    fileUpload.value = '';
    if(resultChart) {
        resultChart.destroy();
    }
});


/**
 * Text Extraction
 * @param {File} file - The PDF file object from the input.
 * @returns {Promise<string>} A promise that resolves with the extracted text.
 */
async function extractTextFromPdf(file) {
    const fileReader = new FileReader();
    return new Promise((resolve, reject) => {
        fileReader.onload = async (event) => {
            try {
                const typedarray = new Uint8Array(event.target.result);
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(' ');
                }
                resolve(fullText);
            } catch (err) {
                reject(err);
            }
        };
        fileReader.readAsArrayBuffer(file);
    });
}

/**
 * Answer Extract.
 * @param {string} sentence Keyword.
 * @returns {string|null} keyword or null if no good find.
 */
function extractKeyword(sentence) {
    const words = sentence.split(/\s+/);
    let potentialKeywords = [];

    // Priority 1: Proper Nouns (capitalized words not at the start)
    for(let i = 1; i < words.length; i++) {
        if (words[i] && words[i].length > 3 && /^[A-Z]/.test(words[i]) && !stopWords.has(words[i].toLowerCase())) {
            potentialKeywords.push(words[i].replace(/[.,:;]$/, '')); 
        }
    }
    if (potentialKeywords.length > 0) return potentialKeywords[0];

    // Priority 2: Fallback to longest ignore word
    const filteredWords = words.filter(word => word.length > 4 && !stopWords.has(word.toLowerCase()));
    if(filteredWords.length === 0) return null;

    filteredWords.sort((a, b) => b.length - a.length);
    return filteredWords[0].replace(/[.,:;]$/, '');
}

/**
 * Identifying keywords.
 * @param {string} text The source text from the PDF.
 * @param {number} numQuestions The number of questions to generate.
 * @returns {Array<Object>} An array of question objects.
 */
function generateBetterMcqs(text, numQuestions) {
    const sentences = text.split(/[.?!]/).map(s => s.trim()).filter(s => s.split(/\s+/).length > 5);
    const allKeywords = new Set(
        text.split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w.toLowerCase())).map(w => w.replace(/[.,:;]$/, ''))
    );
    const allKeywordsArray = Array.from(allKeywords);
    
    if (sentences.length < numQuestions || allKeywordsArray.length < 4) {
        return []; // Not enough content to generate a quiz
    }

    const questions = [];
    let usedSentences = new Set();

    while(questions.length < numQuestions && usedSentences.size < sentences.length) {
        let sentence = sentences[Math.floor(Math.random() * sentences.length)];
        if (usedSentences.has(sentence)) continue;
        
        usedSentences.add(sentence);

        let correctAnswer = extractKeyword(sentence);
        if (!correctAnswer) continue;

        const questionText = sentence.replace(new RegExp(correctAnswer.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'ig'), '_________');
        
        let distractors = new Set();
        while (distractors.size < 3) {
            let distractor = allKeywordsArray[Math.floor(Math.random() * allKeywordsArray.length)];
            if (distractor.toLowerCase() !== correctAnswer.toLowerCase()) {
                distractors.add(distractor);
            }
        }

        const answerOptions = [{ text: correctAnswer, correct: true }];
        distractors.forEach(d => answerOptions.push({ text: d, correct: false }));

        questions.push({
            question: questionText,
            answers: shuffleArray(answerOptions)
        });
    }

    return questions;
}


/**
 * Hides the upload section and shows the quiz container 
 */
function startQuiz() {
    score = 0;
    currentQuestionIndex = 0;
    uploadSection.classList.add('hidden');
    resultContainer.classList.add('hidden');
    quizContainer.classList.remove('hidden');
    showQuestion();
}

/**
 * Shows qsn and optn
 */
function showQuestion() {
    resetState();
    const currentQuestion = quizQuestions[currentQuestionIndex];
    questionTextEl.innerText = currentQuestion.question;

    currentQuestion.answers.forEach(answer => {
        const button = document.createElement('button');
        button.innerText = answer.text;
        button.classList.add('btn');
        if (answer.correct) {
            button.dataset.correct = true;
        }
        button.addEventListener('click', selectAnswer, { once: true }); 
        answerButtonsEl.appendChild(button);
    });

    nextBtn.textContent = (currentQuestionIndex === quizQuestions.length - 1) ? "Submit" : "Next";
}

/**
 * @param {Event} e The click event object.
 */
function selectAnswer(e) {
    const selectedBtn = e.target;
    const isCorrect = selectedBtn.dataset.correct === 'true';

    if (isCorrect) score++;

    // Green or Red clr ans
    Array.from(answerButtonsEl.children).forEach(button => {
        setStatusClass(button, button.dataset.correct === 'true');
        button.disabled = true; // Slct ans = rip btn
    });

    nextBtn.classList.remove('hidden');
}

/**
 * All btn wrking aftr next
 */
function resetState() {
    nextBtn.classList.add('hidden');
    while (answerButtonsEl.firstChild) {
        answerButtonsEl.removeChild(answerButtonsEl.firstChild);
    }
}

/**
 * Crct or wrong????
 */
function setStatusClass(element, isCorrect) {
    element.classList.remove('correct', 'wrong');
    element.classList.add(isCorrect ? 'correct' : 'wrong');
}

/**
 * Result!!!!!! Will I pass????
 */
function showResults() {
    quizContainer.classList.add('hidden');
    resultContainer.classList.remove('hidden');

    const correctAnswers = score;
    const wrongAnswers = quizQuestions.length - score;

    resultText.innerHTML = `${correctAnswers}<span style="font-size: 1.5rem; color: #666;"> / ${quizQuestions.length}</span>`;

    // No old chart lets create new one
    if (resultChart) {
        resultChart.destroy();
    }

    const ctx = document.getElementById('result-chart').getContext('2d');
    
    resultChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Correct', 'Wrong'],
            datasets: [{
                data: [correctAnswers, wrongAnswers],
                backgroundColor: [
                    '#007bff', // Blue 
                    '#dc3545',  // Red 
                ],
                borderColor: '#ffffff',
                borderWidth: 4
            }]
        },
        options: {
            responsive: true,
            cutout: '75%',
            animation: {
                animateScale: true
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            }
        }
    });
}


/**
 * Randomness
 * @param {Array} array The array to shuffle.
 * @returns {Array} shufld
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}