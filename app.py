from flask import Flask, request, jsonify, send_from_directory
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__, static_folder="chatbot", static_url_path="")

def load_chunks(path="knowledge.txt"):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    return [c.strip() for c in text.split("\n\n") if c.strip()]

CHUNKS = load_chunks()
VECTORIZER = TfidfVectorizer(stop_words="english")
CHUNK_VECS = VECTORIZER.fit_transform(CHUNKS) if CHUNKS else None

def best_chunk(question):
    if not CHUNKS:
        return "Knowledge base is empty."

    q_vec = VECTORIZER.transform([question])
    sims = cosine_similarity(q_vec, CHUNK_VECS)[0]
    best_idx = sims.argmax()

    if sims[best_idx] < 0.15:
        return "I can’t find that information in the documents."

    return CHUNKS[best_idx]

@app.get("/")
def home():
    return send_from_directory("chatbot", "index.html")

@app.post("/ask")
def ask():
    data = request.get_json() or {}
    q = data.get("q", "").strip()
    if not q:
        return jsonify({"answer": "Please type a question."})

    answer = best_chunk(q)
    return jsonify({"answer": answer})

@app.get("/<path:filename>")
def static_files(filename):
    return send_from_directory("chatbot", filename)

if __name__ == "__main__":
    app.run(debug=True)
