const http = require('http');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; // Connection String from Atlas

// 1. Connect to MongoDB
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("Connected to MongoDB Atlas"))
        .catch(err => console.error("MongoDB Connection Error:", err));
} else {
    console.warn("WARNING: No MONGO_URI found. Server will fail.");
}

// 2. Define Schema
const LicenseSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    used: { type: Boolean, default: false },
    deviceId: { type: String, default: null }
});

const License = mongoose.model('License', LicenseSchema);

// 3. Server Logic
const server = http.createServer(async (req, res) => {
    // CORS
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
        req.on('end', async () => {
            try {
                const { key, deviceId } = JSON.parse(body);
                console.log(`Verifying: ${key} (Device: ${deviceId})`);

                // Find License in DB
                const license = await License.findOne({ key: key });

                if (!license) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ valid: false, message: "Invalid Key" }));
                    return;
                }

                if (!license.used) {
                    // First usage -> Lock it
                    license.used = true;
                    license.deviceId = deviceId;
                    await license.save();

                    res.writeHead(200);
                    res.end(JSON.stringify({ valid: true, message: "Activated!" }));
                    console.log(`-> Locked ${key} to ${deviceId}`);
                } else {
                    // Check Lock
                    if (license.deviceId === deviceId) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ valid: true, message: "Welcome back!" }));
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ valid: false, message: "Key used on another device." }));
                        console.log(`-> Blocked reuse attempt.`);
                    }
                }
            } catch (e) {
                console.error(e);
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Server Error" }));
            }
        });
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
});

server.listen(PORT, () => {
    console.log(`Cloud License Server running on port ${PORT}`);
});
