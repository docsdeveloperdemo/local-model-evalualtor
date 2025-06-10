const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

console.log('🚀 Starting Ollama with Gemma 3 4B...');

class OllamaService {
    constructor() {
        this.ollamaProcess = null;
        this.apiUrl = 'http://127.0.0.1:11434';
        this.model = 'gemma3:4b';
    }

    // Check if Ollama CLI is installed
    async isOllamaInstalled() {
        try {
            await execAsync('which ollama');
            return true;
        } catch (error) {
            return false;
        }
    }

    // Install Ollama CLI
    async installOllama() {
        console.log('📦 Installing Ollama CLI...');
        
        try {
            const platform = os.platform();
            
            if (platform === 'darwin') {
                // macOS installation
                console.log('🍎 Detected macOS, installing via curl...');
                await execAsync('curl -fsSL https://ollama.com/install.sh | sh');
            } else if (platform === 'linux') {
                // Linux installation
                console.log('🐧 Detected Linux, installing via curl...');
                await execAsync('curl -fsSL https://ollama.com/install.sh | sh');
            } else {
                throw new Error(`Unsupported platform: ${platform}. Please install Ollama manually from https://ollama.com`);
            }
            
            // Verify installation
            if (await this.isOllamaInstalled()) {
                console.log('✅ Ollama CLI installed successfully');
                return true;
            } else {
                throw new Error('Installation completed but ollama command not found');
            }
            
        } catch (error) {
            console.error('❌ Failed to install Ollama:', error.message);
            console.log('💡 Please install Ollama manually from https://ollama.com');
            return false;
        }
    }

    // Ensure Ollama CLI is available
    async ensureOllamaInstalled() {
        if (await this.isOllamaInstalled()) {
            console.log('✅ Ollama CLI already installed');
            return true;
        }
        
        console.log('📦 Ollama CLI not found, attempting to install...');
        return await this.installOllama();
    }

    // Check if Ollama service is running
    async isOllamaRunning() {
        try {
            await execAsync(`curl -s ${this.apiUrl}/api/tags`);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Check if Gemma model is available
    async isGemmaAvailable() {
        try {
            const response = await execAsync(`curl -s ${this.apiUrl}/api/tags`);
            const data = JSON.parse(response.stdout);
            return data.models && data.models.some(model => 
                model.name.includes('gemma3:4b') || model.name.includes('gemma3')
            );
        } catch (error) {
            return false;
        }
    }

    // Start Ollama service
    async startOllama() {
        console.log('🔄 Starting Ollama service...');
        
        try {
            // Check if already running
            if (await this.isOllamaRunning()) {
                console.log('✅ Ollama already running');
                return true;
            }

            // Start Ollama service
            this.ollamaProcess = spawn('ollama', ['serve'], {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    OLLAMA_HOST: '0.0.0.0:11434'  // Bind to all interfaces
                }
            });
            
            this.ollamaProcess.unref();

            // Wait for service to start
            let attempts = 0;
            const maxAttempts = 15;
            
            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                if (await this.isOllamaRunning()) {
                    console.log('✅ Ollama service started successfully');
                    return true;
                }
                attempts++;
                console.log(`⏳ Waiting for Ollama to start... (${attempts}/${maxAttempts})`);
            }
            
            throw new Error('Ollama service failed to start within timeout');
            
        } catch (error) {
            console.error('❌ Failed to start Ollama:', error.message);
            return false;
        }
    }

    // Pull Gemma model if not available
    async ensureGemmaModel() {
        console.log('📥 Ensuring Gemma 3 4B model is available...');
        
        try {
            if (await this.isGemmaAvailable()) {
                console.log('✅ Gemma 3 4B model already available');
                return true;
            }

            console.log('📥 Pulling Gemma 3 4B model (this may take several minutes)...');
            console.log('☕ This is a good time to grab a coffee...');
            
            // Pull model synchronously so we know when it's done
            await execAsync(`ollama pull ${this.model}`, { timeout: 600000 }); // 10 minute timeout
            
            console.log('✅ Gemma 3 4B model pulled successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to pull Gemma model:', error.message);
            return false;
        }
    }

    // Get service status
    async getStatus() {
        const running = await this.isOllamaRunning();
        const gemmaReady = running ? await this.isGemmaAvailable() : false;
        
        return {
            ollamaRunning: running,
            gemmaAvailable: gemmaReady,
            apiUrl: this.apiUrl,
            model: this.model,
            ready: running && gemmaReady
        };
    }

    // Initialize everything
    async initialize() {
        console.log('🚀 Initializing Ollama with Gemma 3 4B...');
        
        try {
            // First ensure Ollama CLI is installed
            if (!(await this.ensureOllamaInstalled())) {
                throw new Error('Ollama CLI not available and installation failed');
            }

            // Start Ollama service
            const started = await this.startOllama();
            if (!started) {
                throw new Error('Failed to start Ollama service');
            }
            
            // Ensure Gemma model is available
            const modelReady = await this.ensureGemmaModel();
            if (!modelReady) {
                throw new Error('Failed to ensure Gemma model is available');
            }
            
            console.log('🎉 Ollama with Gemma 3 4B initialized successfully!');
            console.log(`📍 API available at: ${this.apiUrl}`);
            console.log(`🤖 Model ready: ${this.model}`);
            console.log('🌐 You can now make requests to the Ollama API');
            
            return true;
            
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            return false;
        }
    }
}

// Create a status file to track the service
async function createStatusFile(service) {
    const statusFile = path.join(__dirname, 'ollama-status.json');
    const status = await service.getStatus();
    const fullStatus = {
        installTime: new Date().toISOString(),
        ...status
    };
    
    try {
        fs.writeFileSync(statusFile, JSON.stringify(fullStatus, null, 2));
        console.log('📝 Updated status file: ollama-status.json');
    } catch (error) {
        console.log('⚠️  Could not create status file:', error.message);
    }
}

// Handle graceful shutdown
function setupGracefulShutdown() {
    const shutdown = async () => {
        console.log('\n🛑 Shutting down Ollama service...');
        try {
            await execAsync('pkill -f "ollama serve"');
            console.log('✅ Ollama service stopped');
        } catch (error) {
            console.log('ℹ️  Ollama service cleanup completed');
        }
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

// Main function
async function main() {
    const service = new OllamaService();
    
    // Setup graceful shutdown
    setupGracefulShutdown();
    
    // Initialize the service
    const success = await service.initialize();
    
    // Create/update status file
    await createStatusFile(service);
    
    if (success) {
        console.log('\n🔥 Ollama is now serving Gemma 3 4B!');
        console.log('🚀 Service is running in the background');
        console.log('📋 Check ollama-status.json for current status');
        console.log('⚡ Press Ctrl+C to stop the service');
        
        // Keep the process alive
        process.stdin.resume();
    } else {
        console.error('❌ Failed to start Ollama service');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('❌ Startup failed:', error.message);
    process.exit(1);
}); 