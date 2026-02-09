const http = require('http');
const https = require('https'); // For Gumroad API
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; // Connection String from Atlas
const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin123"; // CHANGE THIS IN RENDER ENV VARS!

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
    deviceId: { type: String, default: null },
    banned: { type: Boolean, default: false } // NEW: Kill Switch
});

const License = mongoose.model('License', LicenseSchema);

// 3. Server Logic
const GUMROAD_PRODUCT_ID = 'alS-wte7nQtY-mrObxcL8w=='; // User's Product Permalink

async function verifyGumroad(key) {
    return new Promise((resolve) => {
        const req = https.request('https://api.gumroad.com/v2/licenses/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    // Gumroad returns { success: true, purchase: { ... } }
                    resolve(json.success === true && !json.purchase.refunded);
                } catch (e) {
                    console.error("Gumroad Parse Error", e);
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            console.error("Gumroad Request Error", e);
            resolve(false);
        });

        req.write(`product_permalink=${encodeURIComponent(GUMROAD_PRODUCT_ID)}&license_key=${encodeURIComponent(key)}`);
        req.end();
    });
}

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

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const path = req.url;

            // --- VERIFY ENDPOINT ---
            if (path === '/verify' && req.method === 'POST') {
                const { key, deviceId } = JSON.parse(body);
                console.log(`Verifying: ${key} (Device: ${deviceId})`);

                // A. Check Local Database Cache
                let license = await License.findOne({ key: key });

                // B. If not in DB, Check Gumroad API
                if (!license) {
                    console.log(`Key not in DB, checking Gumroad...`);
                    const isValidGumroad = await verifyGumroad(key);

                    if (isValidGumroad) {
                        console.log("Gumroad Validated! Caching to DB...");
                        // Create valid license entry in our DB
                        license = new License({
                            key: key,
                            used: false, // Not used yet (will be used below)
                            deviceId: null,
                            banned: false
                        });
                        await license.save();
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ valid: false, message: "Invalid Key (Gumroad Rejected)" }));
                        return;
                    }
                }

                // --- KILL SWITCH CHECK ---
                if (license.banned) {
                    console.log(`-> REJECTED BANNED USER: ${key}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ valid: false, banned: true, message: "License Suspended due to misuse." }));
                    return;
                }

                // C. Validation Logic (Standard)
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
            }

            // --- ADMIN BAN ENDPOINT ---
            else if (path === '/admin/ban' && req.method === 'POST') {
                const { adminKey, targetKey } = JSON.parse(body);
                if (adminKey !== ADMIN_SECRET) {
                    res.writeHead(403);
                    res.end(JSON.stringify({ error: "Unauthorized" }));
                    return;
                }

                const license = await License.findOne({ key: targetKey });
                if (license) {
                    license.banned = true;
                    await license.save();
                    console.log(`[ADMIN] Banned User: ${targetKey}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, message: `User ${targetKey} has been BANNED.` }));
                } else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, message: "User not found." }));
                }
            }

            else {
                res.writeHead(404);
                res.end("Not Found");
            }

        } catch (e) {
            console.error(e);
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Server Error" }));
        }
    });
});

server.listen(PORT, () => {
    console.log(`Cloud License Server running on port ${PORT}`);
});

