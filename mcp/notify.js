#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
// Compatible with different versions of uuid package
let uuidv4;
try {
    // Try using the new import method
    const uuid = require('uuid');
    uuidv4 = uuid.v4;
} catch (error) {
    // If failed, try using the old import method
    const { v4 } = require('uuid');
    uuidv4 = v4;
}

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        title: 'VSCode Notification',
        message: '',
        buttons: ['Continue', 'Reply'],
        timeout: 300000 // 5 minutes timeout
    };
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-t':
            case '--title':
                options.title = args[++i];
                break;
            case '-m':
            case '--message':
                options.message = args[++i];
                break;
            case '-b':
            case '--buttons':
                options.buttons = args[++i].split(',').map(b => b.trim());
                break;
            case '--timeout':
                options.timeout = parseInt(args[++i]) * 1000;
                break;
            case '-h':
            case '--help':
                showHelp();
                process.exit(0);
                break;
            default:
                if (!options.message) {
                    options.message = args[i];
                }
                break;
        }
    }
    
    return options;
}

function showHelp() {
    console.log(`
VSCode Notification CLI Tool

Usage: node notify.js [options] [message]

Options:
  -t, --title <title>      Notification title (default: "VSCode Notification")
  -m, --message <message>  Notification message
  -b, --buttons <buttons>  Comma-separated list of buttons (default: "Continue,Reply")
  --timeout <seconds>      Timeout in seconds (default: 300)
  -h, --help              Show this help message

Examples:
  node notify.js "Hello World"
  node notify.js -t "Important" -m "Please confirm" -b "Yes,No,Cancel"
  node notify.js --title "Question" --message "Do you agree?" --buttons "Yes,No"
`);
}

async function sendNotification(options) {
    const tempDir = os.tmpdir();
    const notifyDir = path.join(tempDir, 'vscode-notify');
    
    // Ensure directory exists
    if (!fs.existsSync(notifyDir)) {
        fs.mkdirSync(notifyDir, { recursive: true });
    }
    
    const id = uuidv4();
    const notificationFile = path.join(notifyDir, `${id}.json`);
    const responseFile = path.join(notifyDir, `${id}.response`);
    
    // Create notification file
    const notification = {
        id,
        title: options.title,
        message: options.message,
        buttons: options.buttons
    };
    
    fs.writeFileSync(notificationFile, JSON.stringify(notification, null, 2));
    
    // Wait for response
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timeout waiting for response'));
        }, options.timeout);
        
        const checkResponse = () => {
            if (fs.existsSync(responseFile)) {
                clearTimeout(timeout);
                const response = fs.readFileSync(responseFile, 'utf8');
                cleanup();
                resolve(response);
            } else {
                setTimeout(checkResponse, 100);
            }
        };
        
        const cleanup = () => {
            try {
                if (fs.existsSync(notificationFile)) {
                    fs.unlinkSync(notificationFile);
                }
                if (fs.existsSync(responseFile)) {
                    fs.unlinkSync(responseFile);
                }
            } catch (error) {
                // Ignore cleanup errors
            }
        };
        
        checkResponse();
    });
}

async function main() {
    try {
        const options = parseArgs();
        
        if (!options.message) {
            console.error('Error: Message is required');
            showHelp();
            process.exit(1);
        }
        
        const response = await sendNotification(options);
        
        if (response) {
            console.log(response);
        } else {
            console.log('No response from user');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { sendNotification, parseArgs };