const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

// 🔑 API KEY (SAFE + FALLBACK)
const API_KEY = process.env.API_KEY || "AIzaSyBizhMpkARHRrnBlWheLmJCylBQjPzMwv8";

// ----------------------------
// 💾 DATABASE
// ----------------------------
const DB_FILE = "leaderboard.json";

function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        return JSON.parse(fs.readFileSync(DB_FILE));
    }
    return {};
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ----------------------------
// 🎯 VIDEO ID FIX
// ----------------------------
function extractVideoId(input) {
    if (!input) return null;

    try {
        if (input.includes("youtu.be/"))
            return input.split("youtu.be/")[1].split("?")[0];

        if (input.includes("v="))
            return input.split("v=")[1].split("&")[0];

        if (input.includes("shorts/"))
            return input.split("shorts/")[1].split("?")[0];

        if (input.length === 11)
            return input;
    } catch {
        return null;
    }

    return null;
}

// ----------------------------
// 📥 GET COMMENTS
// ----------------------------
async function getComments(videoId) {
    const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&key=${API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.error) return { error: data.error.message };

    const comments = [];

    for (const item of data.items || []) {
        const c = item.snippet.topLevelComment.snippet;

        comments.push({
            author: c.authorDisplayName,
            text: c.textDisplay,
            likes: c.likeCount
        });
    }

    if (comments.length === 0)
        return { error: "No comments found" };

    return { comments };
}

// ----------------------------
// 🧠 BEST COMMENT
// ----------------------------
function pickBest(comments) {
    let best = null;
    let score = -1;

    for (const c of comments) {
        const s = c.likes + Math.floor(c.text.length / 20);
        if (s > score) {
            best = c;
            score = s;
        }
    }

    return best;
}

// ----------------------------
// 🚀 API ROUTE
// ----------------------------
app.post("/api/run", async (req, res) => {
    const videoId = extractVideoId(req.body.video_id);

    if (!videoId)
        return res.json({ error: "Invalid YouTube URL or ID" });

    const result = await getComments(videoId);

    if (result.error)
        return res.json({ error: result.error });

    const comments = result.comments;

    const winner = pickBest(comments);

    const db = loadDB();
    const counts = {};

    comments.forEach(c => {
        counts[c.author] = (counts[c.author] || 0) + 1;
    });

    for (const name in counts) {
        db[name] = (db[name] || 0) + counts[name];
    }

    saveDB(db);

    const leaderboard = Object.entries(db)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const stats = {
        total: comments.length,
        users: new Set(comments.map(c => c.author)).size
    };

    res.json({
        winner,
        leaderboard,
        stats
    });
});

// fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ----------------------------
// 🚀 START SERVER
// ----------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("🔥 Huntrix server running on port", PORT);
    console.log("API KEY LOADED:", API_KEY ? "YES" : "NO");
});
