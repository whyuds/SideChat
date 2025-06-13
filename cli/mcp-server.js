#!/usr/bin/env node

const { sendNotification } = require('./notify.js');

class MCPServer {
    constructor() {
        this.tools = {
            'send_notification': {
                name: 'send_notification',
                description: 'Send a notification to User',
                inputSchema: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'string',
                            description: 'The notification message to display'
                        }
                    },
                    required: ['message']
                }
            }
        };
    }

    async handleRequest(request) {
        const { method, params } = request;

        switch (method) {
            case 'initialize':
                return {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {}
                    },
                    serverInfo: {
                        name: 'Notify',
                        version: '0.0.1'
                    }
                };

            case 'tools/list':
                return {
                    tools: Object.values(this.tools)
                };

            case 'tools/call':
                return await this.handleToolCall(params);

            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }

    async handleToolCall(params) {
        const { name, arguments: args } = params;

        if (name === 'send_notification') {
            try {
                const options = {
                    title: 'AI Notification',
                    message: args.message,
                    buttons: ['Continue', 'Reply'],
                    timeout: 300000 // 5 minutes
                };

                const response = await sendNotification(options);
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: `${response || 'No response'}`
                        }
                    ]
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error sending notification: ${error.message}`
                        }
                    ],
                    isError: true
                };
            }
        } else {
            throw new Error(`Unknown tool: ${name}`);
        }
    }

    async start() {
        process.stdin.setEncoding('utf8');
        process.stdout.setEncoding('utf8');

        let buffer = '';

        process.stdin.on('data', async (chunk) => {
            buffer += chunk;
            
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    let request = null;
                    try {
                        request = JSON.parse(line);
                        const response = await this.handleRequest(request);
                        
                        const responseMessage = {
                            jsonrpc: '2.0',
                            id: request.id,
                            result: response
                        };
                        
                        process.stdout.write(JSON.stringify(responseMessage) + '\n');
                    } catch (error) {
                        const errorResponse = {
                            jsonrpc: '2.0',
                            id: request && request.id ? request.id : null,
                            error: {
                                code: -32603,
                                message: error.message
                            }
                        };
                        
                        process.stdout.write(JSON.stringify(errorResponse) + '\n');
                    }
                }
            }
        });

        process.stdin.on('end', () => {
            process.exit(0);
        });
    }
}

if (require.main === module) {
    const server = new MCPServer();
    server.start();
}

module.exports = MCPServer;