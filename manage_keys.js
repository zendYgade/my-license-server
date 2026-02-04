const fs = require('fs');
const readline = require('readline');

const DB_FILE = 'license_db.json';

// Initialize DB if missing
let db = { keys: {} };
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) {
        console.error("Error reading database.");
    }
}

function saveDb() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function generateKey() {
    // Generate format: PRE-XXXX-XXXX-XXXX
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, 0, I, 1
    let result = '';
    for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'LIC-' + result;
}

const args = process.argv.slice(2);
const command = args[0];

// CLI LOGIC
if (command === 'list') {
    console.log("\n___ LICENSE KEYS ___");
    console.log(String("KEY").padEnd(25) + " | " + String("STATUS").padEnd(10) + " | " + "DEVICE");
    console.log("-".repeat(60));

    for (const [key, data] of Object.entries(db.keys)) {
        const status = data.used ? "USED" : "NEW";
        const device = data.deviceId ? data.deviceId : "(none)";
        console.log(`${key.padEnd(25)} | ${status.padEnd(10)} | ${device}`);
    }
    console.log("\n");

} else if (command === 'create') {
    const count = parseInt(args[1]) || 1;
    console.log(`\nGenerating ${count} new key(s)...`);

    for (let i = 0; i < count; i++) {
        const newKey = generateKey();
        db.keys[newKey] = { used: false, deviceId: null };
        console.log(`-> Created: ${newKey}`);
    }
    saveDb();
    console.log("Database updated.\n");

} else if (command === 'reset') {
    const key = args[1];
    if (db.keys[key]) {
        db.keys[key].used = false;
        db.keys[key].deviceId = null;
        saveDb();
        console.log(`\n[SUCCESS] Key ${key} has been RESET. It can be used again on a new device.\n`);
    } else {
        console.log(`\n[ERROR] Key ${key} not found.\n`);
    }

} else {
    console.log("\n--- License Admin Tool ---");
    console.log("Usage:");
    console.log("  node manage_keys.js list             Show all keys");
    console.log("  node manage_keys.js create [num]     Generate new keys (default 1)");
    console.log("  node manage_keys.js reset [key]      Unlock a key (allow new device)");
    console.log("\n");
}
