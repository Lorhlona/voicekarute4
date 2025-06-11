import { spawn } from 'child_process';
import { findAvailablePort } from './portFinder.js';
import { startViteServer } from './viteServer.js';

async function startServer() {
    try {
        // Find available ports
        const backendPort = await findAvailablePort(3004);
        const frontendPort = await findAvailablePort(5173);
        
        console.log(`Starting servers...`);
        console.log(`Backend will run on port: ${backendPort}`);
        console.log(`Frontend will run on port: ${frontendPort}`);
        console.log(`Access the app at: http://localhost:${frontendPort}`);
        console.log('-------------------------------------------');
        
        // Set environment variables
        const env = {
            ...process.env,
            BACKEND_PORT: backendPort.toString(),
            PORT: backendPort.toString(), // For server.js
            VITE_BACKEND_PORT: backendPort.toString() // For Vite
        };
        
        // Start backend server
        const backend = spawn('node', ['server.js'], {
            env,
            stdio: 'inherit',
            shell: true
        });
        
        // Start Vite server programmatically
        let viteServer;
        try {
            viteServer = await startViteServer(frontendPort, backendPort);
        } catch (err) {
            console.error('Failed to start Vite server:', err);
            backend.kill();
            process.exit(1);
        }
        
        // Handle process termination
        process.on('SIGINT', async () => {
            console.log('\nShutting down servers...');
            backend.kill();
            if (viteServer) {
                await viteServer.close();
            }
            process.exit();
        });
        
        backend.on('error', (err) => {
            console.error('Backend failed to start:', err);
            if (viteServer) {
                viteServer.close();
            }
            process.exit(1);
        });
        
    } catch (error) {
        console.error('Failed to start servers:', error);
        process.exit(1);
    }
}

startServer();