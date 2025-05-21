const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;

const app = express();

app.use(express.json());

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

// Load intents from JSON file
async function loadIntents(filePath = 'intents.json') {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const intents = JSON.parse(data).intents || [];
        console.log('Successfully loaded intents.json');
        return intents;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error('intents.json not found');
            return [];
        } else if (error instanceof SyntaxError) {
            console.error(`Invalid JSON format in intents.json: ${error.message}`);
            return [];
        }
        console.error(`Error loading intents: ${error.message}`);
        return [];
    }
}

// Knowledge base and intents (loaded once)
const knowledgeBase = {};
const relatedTopics = {
    'abstraction': ['datastructure'],
    'datastructure': ['abstraction'],
    'error': ['testing'],
    'testing': ['error', 'documentation'],
    'documentation': ['testing']
};
let intents = [];

// Load intents once at startup
(async () => {
    intents = await loadIntents();
    for (const intent of intents) {
        const tag = intent.tag;
        knowledgeBase[tag] = intent.responses[0];
    }
})();

// Convert perspective (your → my, my → your)
function convertPerspective(text) {
    text = text.toLowerCase();
    text = text.replace(/\byour\b/g, 'TEMPORARY');
    text = text.replace(/\bmy\b/g, 'your');
    text = text.replace(/\bTEMPORARY\b/g, 'my');
    text = text.replace(/\byou are\b/g, 'I am');
    text = text.replace(/\bi am\b/g, 'you are');
    return text;
}

// Normalize key
function normalizeKey(text) {
    return text.toLowerCase().trim();
}

// Learn a new fact
function learnFact(sentence) {
    const match = sentence.match(/^(.+?)\s+(?:is|as)\s+(.+)/i);
    if (!match) return null;
    const subjRaw = match[1].trim().toLowerCase();
    const desc = match[2].trim();
    const subjKey = normalizeKey(subjRaw);
    knowledgeBase[subjKey] = desc;
    return `Okay, I learned that ${match[1].trim()} is ${desc}.`;
}

// Answer a question
function answerQuestion(sentence) {
    const s = normalizeKey(sentence);

    // Special cases
    if (/^(hello|hlo|hllo|hii)[\?]*$/.test(s)) {
        return "Hello! Nice to hear from you! 😊 How can I assist you today?";
    }

    if (/^your name(?:\s+is)?[\?]*$/.test(s)) {
        const key = normalizeKey("your name");
        if (knowledgeBase[key]) {
            return `My name is ${knowledgeBase[key]}.`;
        }
        return "I don't know about that yet. You can teach me!";
    }

    if (/^(?:what is )?my name(?:\s+is)?[\?]*$/.test(s)) {
        const key = normalizeKey("my name");
        if (knowledgeBase[key]) {
            return `Your name is ${knowledgeBase[key]}.`;
        }
        return "I don't know your name yet. You can tell me by saying: my name is Akhil.";
    }

    if (/^how are you[\?]*$/.test(s)) {
        return "I'm doing great! Thanks for asking 😊";
    }

    for (const intent of intents) {
        const patterns = intent.patterns || [];
        for (const pattern of patterns) {
            const patternNormalized = normalizeKey(pattern);
            const escapedPattern = patternNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const patternRegex = new RegExp(`\\b${escapedPattern}\\b`, 'i');
            const intentRegex = new RegExp(`\\b${intent.tag}\\b`, 'i');
            if (patternRegex.test(s) || intentRegex.test(s)) {
                const mainAnswer = knowledgeBase[intent.tag];
                const extraInfo = [];
                for (const relatedTag of relatedTopics[intent.tag] || []) {
                    if (knowledgeBase[relatedTag]) {
                        extraInfo.push(`Related info: ${relatedTag.charAt(0).toUpperCase() + relatedTag.slice(1)} - ${knowledgeBase[relatedTag]}`);
                    }
                }
                if (extraInfo.length > 0) {
                    return mainAnswer + "\n" + extraInfo.join("\n");
                }
                return mainAnswer;
            }
        }
    }

    const match = s.match(/^(?:who|what)\s+is\s+(.+?)[\?]*$/);
    if (match) {
        const subjRaw = match[1].trim();
        const subjKey = normalizeKey(subjRaw);
        if (knowledgeBase[subjKey]) {
            const mainAnswer = `${subjRaw.charAt(0).toUpperCase() + subjRaw.slice(1)} is ${knowledgeBase[subjKey]}.`;
            const extraInfo = [];
            for (const relatedTag of relatedTopics[subjKey] || []) {
                if (knowledgeBase[relatedTag]) {
                    extraInfo.push(`Related info: ${relatedTag.charAt(0).toUpperCase() + relatedTag.slice(1)} - ${knowledgeBase[relatedTag]}`);
                }
            }
            if (extraInfo.length > 0) {
                return mainAnswer + "\n" + extraInfo.join("\n");
            }
            return mainAnswer;
        }
        return "I don't know about that yet. You can teach me!";
    }

    return null;
}

app.post('/chat', async (req, res) => {
    try {
        if (!req.is('application/json')) {
            return res.status(415).json({ error: 'Content-Type must be application/json' });
        }

        const userInput = req.body.message?.trim();
        if (!userInput) {
            return res.status(400).json({ error: 'Please provide a valid JSON with a "message" field' });
        }


        if (["exit", "quit"].includes(userInput.toLowerCase())) {
            return res.json({ response: 'Goodbye! 👋' });
        }

        // Try to answer
        const answer = answerQuestion(userInput);
        if (answer) {
            return res.json({ response: answer });
        }

        // Try to learn
        const learned = learnFact(userInput);
        if (learned) {
            return res.json({ response: learned });
        }

        // Fallback
        return res.json({ response: "Sorry, I didn't understand that." });

    } catch (error) {
        return res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// Handle preflight OPTIONS requests
app.options('/chat', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Start the server
const port = process.env.PORT || 3000; 
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app;