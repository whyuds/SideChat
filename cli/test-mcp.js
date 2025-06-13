#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Test MCP Server
async function testMCPServer() {
    console.log('Testing MCP Server...');
    
    const serverPath = path.join(__dirname, 'mcp-server.js');
    const server = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let responseData = '';
    
    server.stdout.on('data', (data) => {
        responseData += data.toString();
    });
    
    server.stderr.on('data', (data) => {
        console.error('Server error:', data.toString());
    });
    
    // Test initialization
    const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
    };
    
    server.stdin.write(JSON.stringify(initRequest) + '\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test tools list
    const toolsRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
    };
    
    server.stdin.write(JSON.stringify(toolsRequest) + '\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test sending notification (this will timeout because there's no VSCode extension responding)
    const notifyRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
            name: 'send_notification',
            arguments: {
                message: 'Test notification from MCP',
                title: 'MCP Test',
                timeout: 5 // 5 seconds timeout for testing
            }
        }
    };
    
    server.stdin.write(JSON.stringify(notifyRequest) + '\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    server.kill();
    
    console.log('Server responses:');
    console.log(responseData);
    
    // Parse responses
    const responses = responseData.trim().split('\n').filter(line => line.trim());
    responses.forEach((response, index) => {
        try {
            const parsed = JSON.parse(response);
            console.log(`\nResponse ${index + 1}:`, JSON.stringify(parsed, null, 2));
        } catch (error) {
            console.log(`\nInvalid JSON response ${index + 1}:`, response);
        }
    });
}

if (require.main === module) {
    testMCPServer().catch(console.error);
}