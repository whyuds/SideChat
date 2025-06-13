import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Global variables to store current pending notifications
let pendingNotifications = new Map<string, { resolve: (value: string) => void, reject: (reason?: any) => void }>();
let globalWatcher: fs.FSWatcher | undefined;
let isWatcherActive = false;
let chatPanel: vscode.WebviewPanel | undefined;
let conversationHistory: Array<{type: 'notification' | 'reply', content: string, timestamp: number}> = [];
let currentNotificationId: string | undefined;
let statusBarItem: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
    console.log('Notify Extension is now active!');
    
    // Save context to global variable
    extensionContext = context;
    
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'sidechat-extension.openChatPanel';
    context.subscriptions.push(statusBarItem);
    
    // Register command
    let disposable = vscode.commands.registerCommand('sidechat-extension.showNotification', () => {
        vscode.window.showInformationMessage('SideChat Extension is active!');
    });
    
    // Register open chat panel command
    let openChatCommand = vscode.commands.registerCommand('sidechat-extension.openChatPanel', () => {
        createOrShowChatPanel(context);
    });
    
    context.subscriptions.push(disposable, openChatCommand);
    
    // Start global file watcher (ensure it's only started once)
    startGlobalFileWatcher(context);
}

function startGlobalFileWatcher(context: vscode.ExtensionContext) {
    // If global watcher is already active, don't start it again
    if (isWatcherActive && globalWatcher) {
        console.log('Global file watcher is already active');
        return;
    }
    
    const tempDir = os.tmpdir();
    const notifyDir = path.join(tempDir, 'vscode-notify');
    
    // Ensure directory exists
    if (!fs.existsSync(notifyDir)) {
        fs.mkdirSync(notifyDir, { recursive: true });
    }
    
    // Create global watcher marker file
    const lockFile = path.join(notifyDir, '.vscode-notify-lock');
    
    try {
        // Check if another VSCode instance is already watching
        if (fs.existsSync(lockFile)) {
            const lockContent = fs.readFileSync(lockFile, 'utf8');
            const lockData = JSON.parse(lockContent);
            
            // Check if lock file is expired (consider process dead after 30 seconds)
            if (Date.now() - lockData.timestamp < 30000) {
                console.log('Another VSCode instance is already watching for notifications');
                // Start backup watcher in case the main watcher fails
                startBackupWatcher(context, notifyDir);
                return;
            }
        }
        
        // Create lock file
        const lockData = {
            pid: process.pid,
            timestamp: Date.now(),
            windowId: context.extension.id
        };
        fs.writeFileSync(lockFile, JSON.stringify(lockData));
        
        // Watch directory changes
        globalWatcher = fs.watch(notifyDir, (eventType, filename) => {
            if (eventType === 'rename' && filename && filename.endsWith('.json')) {
                const filePath = path.join(notifyDir, filename);
                
                // Delay a bit to ensure file writing is complete
                setTimeout(() => {
                    if (fs.existsSync(filePath)) {
                        processNotificationFile(filePath);
                    }
                }, 100);
            }
        });
        
        isWatcherActive = true;
        console.log('Global file watcher started successfully');
        
        // Periodically update lock file timestamp
        const heartbeat = setInterval(() => {
            if (isWatcherActive) {
                try {
                    const lockData = {
                        pid: process.pid,
                        timestamp: Date.now(),
                        windowId: context.extension.id
                    };
                    fs.writeFileSync(lockFile, JSON.stringify(lockData));
                } catch (error) {
                    console.error('Failed to update lock file:', error);
                }
            } else {
                clearInterval(heartbeat);
            }
        }, 10000); // Update every 10 seconds
        
        // Cleanup function
        const cleanup = () => {
            if (globalWatcher) {
                globalWatcher.close();
                globalWatcher = undefined;
            }
            isWatcherActive = false;
            try {
                if (fs.existsSync(lockFile)) {
                    fs.unlinkSync(lockFile);
                }
            } catch (error) {
                console.error('Failed to remove lock file:', error);
            }
            clearInterval(heartbeat);
        };
        
        context.subscriptions.push({ dispose: cleanup });
        
        // Clean up when process exits
        process.on('exit', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        
    } catch (error) {
        console.error('Failed to start global file watcher:', error);
        // If unable to create global watcher, start local watcher
        startBackupWatcher(context, notifyDir);
    }
}

function startBackupWatcher(context: vscode.ExtensionContext, notifyDir: string) {
    console.log('Starting backup file watcher');
    
    // 备用监听器，监听频率较低
    const backupWatcher = setInterval(() => {
        try {
            const files = fs.readdirSync(notifyDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            for (const file of jsonFiles) {
                const filePath = path.join(notifyDir, file);
                const stats = fs.statSync(filePath);
                
                // 处理1秒内创建的文件
                if (Date.now() - stats.mtime.getTime() < 1000) {
                    setTimeout(() => {
                        if (fs.existsSync(filePath)) {
                            processNotificationFile(filePath);
                        }
                    }, 100);
                }
            }
        } catch (error) {
            console.error('Backup watcher error:', error);
        }
    }, 1000); // 每秒检查一次
    
    context.subscriptions.push({ dispose: () => clearInterval(backupWatcher) });
}

async function processNotificationFile(filePath: string) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const notification = JSON.parse(content);
        
        const { id, title, message, buttons } = notification;
        
        if (!id || !title || !message) {
            console.error('Invalid notification format');
            return;
        }
        
        // 显示通知
        let result: string | undefined;
        
        if (buttons && buttons.length > 0) {
            // 有按钮的通知
            result = await vscode.window.showInformationMessage(message, ...buttons);
        } else {
            // 简单通知，添加默认按钮
            result = await vscode.window.showInformationMessage(message, 'Continue', 'Reply');
        }
        
        if (result === 'Reply' || (buttons && buttons.includes(result) && result !== 'Continue')) {
            // Use chat panel for reply
            currentNotificationId = id;
            
            // Add notification to history
            conversationHistory.push({
                type: 'notification',
                content: `${title}: ${message}`,
                timestamp: Date.now()
            });
            
            // Show waiting for reply status
            updateStatusBar('Waiting for reply...');
            
            // Create or show chat panel
            createOrShowChatPanel(extensionContext);
            
            // Wait for user reply
            await waitForUserReply(filePath);
        } else {
            // 用户点击了其他按钮或关闭了通知
            const responseFile = filePath.replace('.json', '.response');
            fs.writeFileSync(responseFile, result || '', 'utf8');
        }
        
        // Delete original notification file
        fs.unlinkSync(filePath);
        
    } catch (error) {
        console.error('Error processing notification file:', error);
    }
}

// Update status bar
function updateStatusBar(text: string) {
    statusBarItem.text = `$(bell) ${text}`;
    statusBarItem.show();
}

// Hide status bar
function hideStatusBar() {
    statusBarItem.hide();
}

// Wait for user reply
function waitForUserReply(filePath: string): Promise<void> {
    return new Promise((resolve) => {
        const responseFile = filePath.replace('.json', '.response');
        
        // Check if response file already exists
        const checkForResponse = () => {
            if (fs.existsSync(responseFile)) {
                resolve();
                return;
            }
            setTimeout(checkForResponse, 500);
        };
        
        checkForResponse();
    });
}

// Create or show chat panel
function createOrShowChatPanel(context: vscode.ExtensionContext) {
    if (chatPanel) {
        chatPanel.reveal(vscode.ViewColumn.Beside);
        updateChatPanelContent();
        return;
    }
    
    chatPanel = vscode.window.createWebviewPanel(
        'sideChat',
        'SideChat',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );
    
    chatPanel.onDidDispose(() => {
        chatPanel = undefined;
    });
    
    // Handle messages from webview
    chatPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'sendReply':
                    handleUserReply(message.text);
                    break;
                case 'ready':
                    updateChatPanelContent();
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
    
    updateChatPanelContent();
}

// Update chat panel content
function updateChatPanelContent() {
    if (!chatPanel) return;
    
    const webview = chatPanel.webview;
    
    webview.html = getWebviewContent();
}

// Handle user reply
function handleUserReply(replyText: string) {
    if (!currentNotificationId) return;
    
    // Add reply to history
    conversationHistory.push({
        type: 'reply',
        content: replyText,
        timestamp: Date.now()
    });
    
    // Write response file
    const tempDir = os.tmpdir();
    const notifyDir = path.join(tempDir, 'vscode-notify');
    const responseFile = path.join(notifyDir, `${currentNotificationId}.response`);
    
    try {
        fs.writeFileSync(responseFile, replyText, 'utf8');
    } catch (error) {
        console.error('Error writing response file:', error);
    }
    
    // Clear current notification ID and status
    currentNotificationId = undefined;
    hideStatusBar();
    
    // Update chat panel content
    updateChatPanelContent();
    
    // Removed auto-close chat panel code
}

// Get WebView HTML content
function getWebviewContent(): string {
    const hasWaitingNotification = currentNotificationId !== undefined;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SideChat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        
        .status {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 12px;
            display: inline-block;
        }
        
        .status.waiting {
            background-color: var(--vscode-notificationsWarningIcon-foreground);
            animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .conversation {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 20px;
            padding: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
        }
        
        .message {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 8px;
            max-width: 80%;
        }
        
        .message.notification {
            background-color: var(--vscode-inputValidation-infoBackground);
            border-left: 4px solid var(--vscode-inputValidation-infoBorder);
            margin-right: auto;
        }
        
        .message.reply {
            background-color: var(--vscode-inputValidation-warningBackground);
            border-right: 4px solid var(--vscode-inputValidation-warningBorder);
            margin-left: auto;
            text-align: right;
        }
        
        .message-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        
        .input-area {
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 15px;
        }
        
        .input-container {
            position: relative;
        }
        
        #messageInput {
            width: 100%;
            min-height: 80px;
            max-height: 200px;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 5px;
            resize: vertical;
            font-family: inherit;
            font-size: inherit;
            box-sizing: border-box;
        }
        
        #messageInput:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .input-hint {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        
        .send-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 3px;
            cursor: pointer;
            margin-top: 10px;
            font-size: 12px;
        }
        
        .send-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .send-button:disabled {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
        }
        
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 40px 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h3>SideChat</h3>
        ${hasWaitingNotification ? '<div class="status waiting">⏳ Waiting for reply...</div>' : '<div class="status">✅ No pending notifications</div>'}
    </div>
    
    <div class="conversation" id="conversation">
        ${conversationHistory.length === 0 ? 
            '<div class="empty-state">No conversation history</div>' : 
            conversationHistory.map(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                return `
                    <div class="message ${msg.type}">
                        <div>${msg.content}</div>
                        <div class="message-time">${time}</div>
                    </div>
                `;
            }).join('')
        }
    </div>
    
    <div class="input-area">
        <div class="input-container">
            <textarea 
                id="messageInput" 
                placeholder="${hasWaitingNotification ? 'Please enter your reply...' : 'Waiting for new notifications...'}" 
                ${!hasWaitingNotification ? 'disabled' : ''}
            ></textarea>
            <div class="input-hint">
                ${hasWaitingNotification ? 'Shift+Enter for new line, Enter to send' : 'You can reply here after receiving a notification'}
            </div>
        </div>
        <button 
            id="sendButton" 
            class="send-button" 
            ${!hasWaitingNotification ? 'disabled' : ''}
        >
            Send Reply
        </button>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const conversation = document.getElementById('conversation');
        
        // Scroll to bottom
        function scrollToBottom() {
            conversation.scrollTop = conversation.scrollHeight;
        }
        
        // Send message
         function sendMessage() {
             const text = messageInput.value.trim();
             if (text && !sendButton.disabled) {
                 vscode.postMessage({
                     command: 'sendReply',
                     text: text
                 });
                 messageInput.value = '';
                 
                 // Show sent successfully message
                 sendButton.textContent = '✅ Sent Successfully';
                 sendButton.disabled = true;
                 messageInput.disabled = true;
                 
                 // Show window will close soon message
                 setTimeout(() => {
                     const hint = document.querySelector('.input-hint');
                     if (hint) {
                         hint.textContent = 'Reply sent, window will close soon...';
                     }
                 }, 500);
             }
         }
        
        // Keyboard event handling
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Send button click
        sendButton.addEventListener('click', sendMessage);
        
        // Page load complete
        window.addEventListener('load', () => {
            scrollToBottom();
            if (!messageInput.disabled) {
                messageInput.focus();
            }
            vscode.postMessage({ command: 'ready' });
        });
    </script>
</body>
</html>`;
}

export function deactivate() {
    console.log('SideChat Extension is deactivated');
    if (chatPanel) {
        chatPanel.dispose();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}