const http = require('http');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_PATH || 'license_db.json';

// Simple "Database" loaded from file
let db = {
    keys: {
        "KEY-1234-5678": { used: false, deviceId: null },
        "BUYER-BOB-001": { used: false, deviceId: null },
        "DEMO-123": { used: false, deviceId: null }
    }
};

// Load DB if exists
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) {
        console.error("Failed to load DB, starting fresh.");
    }
}

function saveDb() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/verify' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { key, deviceId } = JSON.parse(body);
                const license = db.keys[key];

                console.log(`Verifying: ${key} from Device: ${deviceId}`);

                if (!license) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ valid: false, message: "Invalid Key" }));
                    return;
                }

                if (!license.used) {
                    // First time use! Lock it.
                    license.used = true;
                    license.deviceId = deviceId;
                    saveDb();
                    res.writeHead(200);
                    res.end(JSON.stringify({ valid: true, message: "Activated!" }));
                    console.log(`-> Key ${key} LOCKED to ${deviceId}`);
                } else {
                    // Already used. Check device ID.
                    if (license.deviceId === deviceId) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ valid: true, message: "Welcome back!" }));
                        console.log(`-> Re-activation allowed for same device.`);
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ valid: false, message: "Key already used on another device." }));
                        console.log(`-> BLOCKED attempt from different device.`);
                    }
                }
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Invalid Request" }));
            }
        });
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
});

server.listen(PORT, () => {
    console.log(`License Server (Device Locked) running at http://localhost:${PORT}`);
    saveDb(); // Ensure DB file is created
});
