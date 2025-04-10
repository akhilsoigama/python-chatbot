import pandas as pd
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import SVC
from sklearn.pipeline import Pipeline
import random
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

intents_data = pd.read_json('intents.json')
with open('csvjson.json', 'r', encoding='utf-8') as file:
    kids_questions = json.load(file)
    
patterns = []
tags = []
responses = {}

for intent in intents_data['intents']:
    tag = intent['tag']
    responses[tag] = intent['responses']
    for pattern in intent['patterns']:
        patterns.append(pattern)
        tags.append(tag)

df = pd.DataFrame({'pattern': patterns, 'tag': tags})

programming_model = Pipeline([
    ('tfidf', TfidfVectorizer()),
    ('svc', SVC(kernel='linear'))
])
programming_model.fit(df['pattern'], df['tag'])

def get_chatbot_response(user_input):
    user_input = user_input.lower().strip()
    
    if user_input in ['exit', 'quit', 'bye']:
        return {"response": "Bye! Have a great day! 😊", "type": "exit"}
    
    for question in kids_questions:
        if user_input in question['question'].lower():
            return {
                "response": f"The answer is: {question['answer']}",
                "type": "kids_question",
                "image": question['image'],
                "question_type": question['question_type']
            }
    
    try:
        predicted_tag = programming_model.predict([user_input])[0]
        return {
            "response": random.choice(responses[predicted_tag]),
            "type": "programming_answer"
        }
    except:
        return {
            "response": "I'm not sure I understand. Could you rephrase your question?",
            "type": "unknown"
        }

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_input = data.get('message', '')
    response = get_chatbot_response(user_input)
    return jsonify(response)

@app.route('/random-kids-question', methods=['GET'])
def random_kids_question():
    question = random.choice(kids_questions)
    return jsonify(question)

@app.route('/check-answer', methods=['POST'])
def check_answer():
    data = request.get_json()
    user_answer = str(data.get('answer', '')).strip().lower()
    question_text = data.get('question')
    
    question = next((q for q in kids_questions if q['question'].lower() == question_text.lower()), None)
    
    if not question:
        return jsonify({'correct': False, 'message': 'Question not found'})
    
    correct_answer = str(question['answer']).lower()
    is_correct = user_answer == correct_answer
    
    return jsonify({
        'correct': is_correct,
        'correct_answer': question['answer'],
        'question_type': question.get('question_type', ''),
        'image': question.get('image', '')
    })

@app.route('/')
def home():
    return """
    <h1>Chatbot API is running</h1>
    <p>Available endpoints:</p>
    <ul>
        <li>POST /chat - Send chat messages</li>
        <li>GET /random-kids-question - Get a random kids question</li>
        <li>POST /check-answer - Check if an answer is correct</li>
    </ul>
    """

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)