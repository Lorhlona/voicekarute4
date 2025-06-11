import { spawn } from 'child_process';
import { findAvailablePort } from './portFinder.js';

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
        
        // Set environment variables for backend
        const backendEnv = {
            ...process.env,
            PORT: backendPort.toString()
        };
        
        // Start backend server
        const backend = spawn('node', ['server.js'], {
            env: backendEnv,
            stdio: 'inherit',
            shell: true
        });
        
        // Wait for backend to exit if port is in use
        let backendStarted = false;
        backend.on('exit', (code) => {
            if (code !== 0 && !backendStarted) {
                console.error('Backend failed to start, exiting...');
                process.exit(1);
            }
        });
        
        // Wait a bit for backend to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        backendStarted = true;
        
        // Set environment variables for frontend
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
        process.on('SIGINT', () => {
            console.log('\nShutting down servers...');
            backend.kill();
            frontend.kill();
            process.exit();
        });
        
        backend.on('error', (err) => {
            console.error('Backend failed to start:', err);
            frontend.kill();
            process.exit(1);
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