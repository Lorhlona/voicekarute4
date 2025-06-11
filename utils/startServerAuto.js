import { spawn } from 'child_process';
import { findAvailablePort } from './portFinder.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
    try {
        // Find available frontend port
        const frontendPort = await findAvailablePort(5173);
        
        console.log(`Starting servers...`);
        console.log(`Frontend will run on port: ${frontendPort}`);
        console.log('Backend will find an available port automatically...');
        console.log('-------------------------------------------');
        
        // Create a temporary file to communicate the backend port
        const portFile = path.join(__dirname, '..', `.backend-port-${process.pid}`);
        
        // Start backend server without specifying port (let it find one)
        const backend = spawn('node', ['server.js'], {
            env: {
                ...process.env,
                PORT_FILE: portFile  // Tell backend where to write its port
            },
            stdio: 'inherit',
            shell: true
        });
        
        // Wait for backend to write its port
        let backendPort;
        let attempts = 0;
        while (!backendPort && attempts < 50) {  // 5 seconds max
            try {
                const content = await fs.readFile(portFile, 'utf8');
                backendPort = parseInt(content.trim(), 10);
                if (backendPort) {
                    console.log(`Backend started on port: ${backendPort}`);
                    console.log(`Access the app at: http://localhost:${frontendPort}`);
                    break;
                }
            } catch (err) {
                // File doesn't exist yet
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!backendPort) {
            console.error('Backend failed to start within 5 seconds');
            backend.kill();
            process.exit(1);
        }
        
        // Start frontend with the backend port
        const frontendEnv = {
            ...process.env,
            VITE_BACKEND_PORT: backendPort.toString()
        };
        
        const frontend = spawn('npx', ['vite', '--port', frontendPort.toString()], {
            env: frontendEnv,
            stdio: 'inherit',
            shell: true
        });
        
        // Handle process termination
        process.on('SIGINT', async () => {
            console.log('\nShutting down servers...');
            backend.kill();
            frontend.kill();
            
            // Clean up port file
            try {
                await fs.unlink(portFile);
            } catch (err) {
                // Ignore
            }
            
            process.exit();
        });
        
        // Clean up on backend exit
        backend.on('exit', async () => {
            try {
                await fs.unlink(portFile);
            } catch (err) {
                // Ignore
            }
            frontend.kill();
            if (backendPort) {  // Only exit if backend was running
                process.exit();
            }
        });
        
        frontend.on('error', (err) => {
            console.error('Frontend failed to start:', err);
            backend.kill();
            process.exit(1);
        });
        
    } catch (error) {
        console.error('Failed to start servers:', error);
        process.exit(1);
    }
}

startServer();