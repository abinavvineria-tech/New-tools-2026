from flask import Flask, render_template, request
import requests, json, os
from collections import Counter

app = Flask(__name__)

API_KEY = "AIzaSyBizhMpkARHRrnBlWheLmJCylBQjPzMwv8"
DB_FILE = "leaderboard.json"


# ----------------------------
# 💾 DATABASE
# ----------------------------
def load_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            return json.load(f)
    return {}

def save_db(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ----------------------------
# 🎯 EXTRACT VIDEO ID
# ----------------------------
def extract_video_id(video_input):
    if not video_input:
        return None

    video_input = video_input.strip()

    try:
        if "youtu.be/" in video_input:
            return video_input.split("youtu.be/")[1].split("?")[0]

        if "v=" in video_input:
            return video_input.split("v=")[1].split("&")[0]

        if "youtube.com/shorts/" in video_input:
            return video_input.split("shorts/")[1].split("?")[0]

        if len(video_input) == 11:
            return video_input

    except:
        return None

    return None


# ----------------------------
# 📥 GET COMMENTS
# ----------------------------
def get_comments(video_id):
    url = "https://www.googleapis.com/youtube/v3/commentThreads"

    params = {
        "part": "snippet",
        "videoId": video_id,
        "maxResults": 100,
        "key": API_KEY
    }

    res = requests.get(url, params=params)
    data = res.json()

    if "error" in data:
        return None, data["error"]["message"]

    comments = []

    for item in data.get("items", []):
        c = item["snippet"]["topLevelComment"]["snippet"]

        comments.append({
            "author": c.get("authorDisplayName", "Unknown"),
            "text": c.get("textDisplay", ""),
            "likes": c.get("likeCount", 0)
        })

    if not comments:
        return None, "No comments found"

    return comments, None


# ----------------------------
# 🧠 BEST COMMENT LOGIC
# ----------------------------
def pick_best_comment(comments):
    # score = likes + length bonus
    best = None
    best_score = -1

    for c in comments:
        score = c["likes"] + len(c["text"]) // 20

        if score > best_score:
            best = c
            best_score = score

    return best


# ----------------------------
# 🧠 PROCESS
# ----------------------------
def process(video_id):
    db = load_db()
    comments, error = get_comments(video_id)

    if error:
        return None, [], None, error

    # 🧠 best comment instead of random
    winner = pick_best_comment(comments)

    # 📊 stats
    total_comments = len(comments)
    unique_users = len(set(c["author"] for c in comments))

    # leaderboard
    names = [c["author"] for c in comments]
    counts = Counter(names)

    for name, count in counts.items():
        db[name] = db.get(name, 0) + count

    save_db(db)

    leaderboard = sorted(db.items(), key=lambda x: x[1], reverse=True)[:10]

    stats = {
        "total": total_comments,
        "users": unique_users
    }

    return winner, leaderboard, stats, None


# ----------------------------
# 🌐 ROUTE
# ----------------------------
@app.route("/", methods=["GET", "POST"])
def index():
    winner = None
    leaderboard = []
    stats = None
    error = None
    video_input = ""

    if request.method == "POST":
        video_input = request.form.get("video_id")

        video_id = extract_video_id(video_input)

        if not video_id:
            error = "Invalid YouTube URL or ID"
        else:
            winner, leaderboard, stats, error = process(video_id)

    return render_template(
        "index.html",
        winner=winner,
        leaderboard=leaderboard,
        stats=stats,
        error=error,
        video_id=video_input
    )


if __name__ == "__main__":
    app.run(debug=True)
