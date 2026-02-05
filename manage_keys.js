const mongoose = require('mongoose');

// --- CONFIG ---
// Paste your Atlas Connection String here for local admin work
// OR set it in your terminal: $env:MONGO_URI="mongodb+srv..."
const MONGO_URI = process.env.MONGO_URI || "PASTE_YOUR_CONNECTION_STRING_HERE_IF_LOCAL";

if (MONGO_URI.includes("PASTE_YOUR")) {
    console.error("\n[ERROR] You need to set your MongoDB Connection String inside manage_keys.js (Line 5) first!\n");
    process.exit(1);
}

// Connect
mongoose.connect(MONGO_URI, {
    family: 4 // Force IPv4 (Fixes DNS ECONNREFUSED)
}).then(() => {
    // console.log("Connected to Cloud DB");
}).catch(err => {
    console.error("DB Connection Failed:", err);
    process.exit(1);
});

// Schema (Must match server)
const LicenseSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    used: { type: Boolean, default: false },
    deviceId: { type: String, default: null }
});
const License = mongoose.model('License', LicenseSchema);


// --- LOGIC ---
const args = process.argv.slice(2);
const command = args[0];

function generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'LIC-' + result;
}

async function run() {
    if (command === 'list') {
        console.log("\n___ CLOUD LICENSE KEYS ___");
        console.log(String("KEY").padEnd(25) + " | " + String("STATUS").padEnd(10) + " | " + "DEVICE");
        console.log("-".repeat(60));

        const licenses = await License.find({});
        if (licenses.length === 0) console.log("(No keys found)");

        for (const data of licenses) {
            const status = data.used ? "USED" : "NEW";
            const device = data.deviceId ? data.deviceId : "(none)";
            console.log(`${data.key.padEnd(25)} | ${status.padEnd(10)} | ${device}`);
        }
        console.log("\n");

    } else if (command === 'create') {
        const count = parseInt(args[1]) || 1;
        console.log(`\nGenerating ${count} new key(s) in Cloud...`);

        for (let i = 0; i < count; i++) {
            const newKey = generateKey();
            await License.create({ key: newKey });
            console.log(`-> Created: ${newKey}`);
        }
        console.log("Done.\n");

    } else if (command === 'reset') {
        const key = args[1];
        const res = await License.updateOne({ key: key }, { used: false, deviceId: null });

        if (res.matchedCount > 0) {
            console.log(`\n[SUCCESS] Key ${key} reset in Cloud DB.\n`);
        } else {
            console.log(`\n[ERROR] Key not found.\n`);
        }
    } else {
        console.log("\n--- Cloud Admin Tool ---");
        console.log("Usage:");
        console.log("  node manage_keys.js list             Show all keys");
        console.log("  node manage_keys.js create [num]     Generate new keys");
        console.log("  node manage_keys.js reset [key]      Unlock a key");
    }

    mongoose.disconnect();
}

run();
