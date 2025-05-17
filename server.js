import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import fs from 'fs/promises'; // Use promises version of fs
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net'; // Import net module for port checking

// --- 初期設定 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000; // Default port

// --- ディレクトリ作成 ---
const transcriptsDir = path.join(__dirname, 'transcripts');
const uploadsDir = path.join(__dirname, 'uploads');

// 非同期でディレクトリ作成 (起動時に実行)
const ensureDirectoryExists = async (dirPath) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`Directory ensured: ${dirPath}`);
    } catch (error) {
        console.error(`Error ensuring directory ${dirPath}:`, error);
    }
};
// Call these functions at startup
ensureDirectoryExists(transcriptsDir);
ensureDirectoryExists(uploadsDir);


// --- API キー管理 ---
// サーバー側でAPIキーを保持する変数 (サーバー再起動でリセットされる)
let serverApiKey = process.env.GEMINI_API_KEY || null;
let genAIInstance = null; // 初期化されたクライアントを保持 (任意)

// 起動時に環境変数からキーが提供されていればクライアントを初期化
if (serverApiKey) {
    const initResult = initializeGenAIClient(serverApiKey);
    if (!initResult) {
        console.warn('GEMINI_API_KEY が無効な可能性があります。');
        serverApiKey = null;
    }
} else {
    console.warn('GEMINI_API_KEY が設定されていません。');
}

// APIキーを設定する関数 (クライアントを再利用する場合)
function initializeGenAIClient(apiKey) {
    try {
        genAIInstance = new GoogleGenerativeAI(apiKey);
        console.log("Gemini API client initialized with provided key.");
        return genAIInstance;
    } catch (error) {
        console.error("Failed to initialize Gemini API client with provided key:", error.message);
        genAIInstance = null; // 初期化失敗時はnullに戻す
        return null;
    }
}


// --- Multer 設定 (ファイルアップロード) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // オリジナルのファイル名を保持しつつ、重複を避けるためにタイムスタンプを追加
        const timestamp = Date.now();
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8'); // 日本語ファイル名対応
        cb(null, `${timestamp}-${originalName}`);
    }
});
const upload = multer({ storage: storage });

// --- ミドルウェア ---
app.use(cors()); // CORSを許可 (Vite開発サーバーからのアクセス用)
app.use(express.json()); // JSONリクエストボディをパース

// --- API エンドポイント ---

// APIキー設定エンドポイント
app.post('/api/set-api-key', (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
        return res.status(400).json({ error: 'Invalid API Key provided.' });
    }
    serverApiKey = apiKey;
    // Initialize the client with the new key
    const clientInitialized = initializeGenAIClient(serverApiKey); // Call the function

    if (clientInitialized) {
        console.log("API Key has been set and client initialized successfully.");
        res.status(200).json({ message: 'API Key set successfully.' });
    } else {
        // Initialization failed (error logged within initializeGenAIClient)
        serverApiKey = null; // Reset the key if initialization failed
        res.status(503).json({ error: 'Failed to initialize Gemini client with the provided API Key. Please check the key.' });
    }
});

// APIキー削除エンドポイント
app.post('/api/clear-api-key', (req, res) => {
    serverApiKey = null;
    genAIInstance = null;
    console.log("API Key has been cleared from the server.");
    res.status(200).json({ message: 'API Key cleared successfully.' });
});

// APIキーステータス確認エンドポイント (任意)
app.get('/api/key-status', (req, res) => {
    try {
        // The logic is simple, but wrap in try-catch for robustness
        res.json({ isKeySet: !!serverApiKey });
    } catch (error) {
        console.error("Error in /api/key-status handler:", error);
        res.status(500).json({ error: "Internal server error checking key status." });
    }
});

// 保存データクリアエンドポイント
app.post('/api/clear-data', async (req, res) => {
    console.log("[Clear Data] Received request to clear uploads and transcripts.");
    try {
        // Helper function to clear directory contents
        const clearDirectory = async (dirPath) => {
            try {
                const files = await fs.readdir(dirPath);
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    try {
                        await fs.unlink(filePath); // Delete file
                        console.log(`[Clear Data] Deleted: ${filePath}`);
                    } catch (unlinkError) {
                        console.error(`[Clear Data] Error deleting file ${filePath}:`, unlinkError);
                        // Continue trying to delete other files
                    }
                }
            } catch (readError) {
                if (readError.code === 'ENOENT') {
                    console.log(`[Clear Data] Directory not found, nothing to clear: ${dirPath}`);
                } else {
                    console.error(`[Clear Data] Error reading directory ${dirPath}:`, readError);
                    throw readError; // Re-throw other errors
                }
            }
        };

        // Clear both directories
        await clearDirectory(uploadsDir);
        await clearDirectory(transcriptsDir);

        console.log("[Clear Data] Successfully cleared uploads and transcripts directories.");
        res.status(200).json({ message: 'Uploads and transcripts cleared successfully.' });

    } catch (error) {
        console.error('[Clear Data] Error clearing data:', error);
        res.status(500).json({ error: `Error clearing data: ${error.message}` });
    }
});


// 文字起こしエンドポイント
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    if (!serverApiKey) {
        return res.status(401).json({ error: 'API Key is not set. Please set the API Key first.' });
    }
    // リクエスト毎にクライアントを初期化する場合:
    // const currentGenAI = new GoogleGenerativeAI(serverApiKey);
    // または、事前に初期化されたインスタンスを使用:
    const currentGenAI = genAIInstance;
    if (!currentGenAI) {
         return res.status(503).json({ error: 'Gemini API client could not be initialized with the provided key.' });
    }
    // Use the unified model name
    const currentTranscriptionModel = currentGenAI.getGenerativeModel({ model: "gemini-2.5-pro-preview-03-25" });


    if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    const originalFilename = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); // 日本語ファイル名対応

    console.log(`[Transcribe] Received file: ${originalFilename} (${mimeType}), saved to: ${filePath}`);

    try {
        let filePart;
        let uploadedFileNameForLog = originalFilename; // For logging

        // Check if genAI.files and genAI.files.upload are available (like in voicekarte3)
        if (currentGenAI.files && typeof currentGenAI.files.upload === 'function') {
            console.log("[Transcribe] Attempting file upload using genAI.files.upload...");
            try {
                const uploadResult = await currentGenAI.files.upload({
                    file: filePath,
                    mimeType: mimeType,
                    // Optional: displayName for the uploaded file in the API
                    // displayName: originalFilename
                });
                const uploadedFile = uploadResult.file;
                if (!uploadedFile) {
                     console.error("[Transcribe] File upload via genAI.files.upload failed, no file object returned:", uploadResult);
                     throw new Error("File upload to Gemini API failed (no file object).");
                }
                console.log(`[Transcribe] Uploaded file via File API: ${uploadedFile.name}, URI: ${uploadedFile.uri}`);
                uploadedFileNameForLog = uploadedFile.name; // Update log name
                filePart = {
                    fileData: {
                        mimeType: uploadedFile.mimeType,
                        fileUri: uploadedFile.uri,
                    },
                };
            } catch (uploadError) {
                 console.warn("[Transcribe] genAI.files.upload failed, falling back to inlineData:", uploadError.message);
                 // Fallback will happen below if filePart is still undefined
            }
        } else {
             console.log("[Transcribe] genAI.files.upload not available, using inlineData approach.");
        }

        // If filePart wasn't created via File API (due to error or unavailability), use inlineData
        if (!filePart) {
            console.log("[Transcribe] Using inline data approach with base64 encoded audio...");
            const fileBuffer = await fs.readFile(filePath); // Use async readFile
            const base64Audio = fileBuffer.toString('base64');
            // Force audio MIME type even if detected as video
            let apiMimeType = mimeType || 'audio/webm'; // Default to audio/webm
            if (apiMimeType.startsWith('video/')) {
                console.warn(`[Transcribe] Detected video MIME type (${apiMimeType}), forcing to audio/webm.`);
                apiMimeType = 'audio/webm';
            }
            console.log(`[Transcribe] Using MIME type for inlineData: ${apiMimeType}`);
            filePart = {
                inlineData: {
                    mimeType: apiMimeType, // Use potentially corrected MIME type
                    data: base64Audio
                }
            };
        }

        console.log(`[Transcribe] Generating transcript for ${uploadedFileNameForLog}...`);
        const prompt = "これは医療現場での会話音声です。発言を正確に文字起こししてください。可能であれば話者を区別し、「医師:」「患者:」「家族:」のように記述してください。";
        // Ensure filePart is correctly structured within the parts array
        const contents = [{ role: "user", parts: [{ text: prompt }, filePart] }];


        // Safety Settings の設定例 (必要に応じて調整)
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];

        // currentTranscriptionModel を使用
        const result = await currentTranscriptionModel.generateContent({ contents, safetySettings });
        const response = result.response;

        let transcript = "";
        if (response && response.candidates && response.candidates.length > 0 && response.candidates[0].content && response.candidates[0].content.parts && response.candidates[0].content.parts.length > 0) {
             if (response.candidates[0].finishReason === 'STOP') {
                transcript = response.candidates[0].content.parts[0].text;
                console.log("[Transcribe] Transcript generated successfully.");
             } else {
                 console.warn("[Transcribe] Transcription finished with reason:", response.candidates[0].finishReason);
                 // 限定的な結果でも返す場合
                 transcript = response.candidates[0].content.parts[0].text || "[Transcription incomplete or stopped]";
                 if (response.promptFeedback && response.promptFeedback.blockReason) {
                    console.error("[Transcribe] Blocked by safety settings:", response.promptFeedback.blockReason);
                    throw new Error(`Request blocked by safety settings: ${response.promptFeedback.blockReason}`);
                 }
             }
        } else {
            console.error("[Transcribe] Invalid or empty response structure:", response);
             if (response && response.promptFeedback) {
                 console.error("[Transcribe] Prompt Feedback:", response.promptFeedback);
                 throw new Error(`Transcription failed due to prompt feedback: ${response.promptFeedback.blockReason || 'Unknown reason'}`);
             }
            throw new Error("Failed to get a valid response structure from the Gemini API.");
        }

        res.json({ transcript: transcript });

        // 文字起こし結果を保存
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-'); // ファイル名に使用可能な形式
        const outputFilename = `${timestamp}-${path.parse(originalFilename).name}.txt`;
        const outputPath = path.join(transcriptsDir, outputFilename);

        try { // Use try-catch for async file write
            await fs.writeFile(outputPath, transcript);
            console.log(`[Transcribe] Transcript saved to ${outputPath}`);
        } catch (err) {
            console.error('[Transcribe] Error writing transcript file:', err);
        }
        // 元の音声ファイルは uploadsDir に保存されているので、ここでは何もしない
        // (Multerで保存済み、ファイル名はタイムスタンプ付き)
        console.log(`[Transcribe] Original audio file preserved at: ${filePath}`);

        // ファイルAPIでアップロードした一時ファイルを削除 (任意)
        // if (uploadedFile && currentGenAI.files && typeof currentGenAI.files.delete === 'function') {
        //     try {
        //         await currentGenAI.files.delete(uploadedFile.name);
        //         console.log(`[Transcribe] Deleted temporary uploaded file: ${uploadedFile.name}`);
        //     } catch (delErr) {
        //         console.error(`[Transcribe] Error deleting temporary file ${uploadedFile.name}:`, delErr);
        //     }
        // }

    } catch (error) {
        console.error('[Transcribe] Error during transcription process:', error);
        res.status(500).json({ error: `Error during transcription: ${error.message}` });
        // エラーが発生した場合でも、アップロードされたファイルは uploadsDir に残る
        console.log(`[Transcribe] Audio file remains at: ${filePath} after error.`);
    }
});

// カルテ生成エンドポイント
app.post('/api/generate-karte', async (req, res) => {
    if (!serverApiKey) {
        return res.status(401).json({ error: 'API Key is not set. Please set the API Key first.' });
    }
    // リクエスト毎にクライアントを初期化する場合:
    // const currentGenAI = new GoogleGenerativeAI(serverApiKey);
    // または、事前に初期化されたインスタンスを使用:
     const currentGenAI = genAIInstance;
     if (!currentGenAI) {
         return res.status(503).json({ error: 'Gemini API client could not be initialized with the provided key.' });
     }
     // Use the unified model name
    const currentGenerationModel = currentGenAI.getGenerativeModel({ model: "gemini-2.5-pro-preview-03-25" });

    // Receive combinedText and systemPrompt from the frontend
    const { combinedText, systemPrompt } = req.body; // systemPrompt を受け取る

    if (!combinedText) {
        return res.status(400).json({ error: 'Combined text (transcript + supplementary info) is required.' });
    }
    if (!systemPrompt) { // systemPrompt のチェックを追加
        console.warn('[Generate Karte] System prompt was not provided by the frontend.');
        return res.status(400).json({ error: 'System prompt for the selected mode is required.' });
    }

    console.log(`[Generate Karte] Received combined text (length: ${combinedText.length})`);
    console.log(`[Generate Karte] Using system prompt: ${systemPrompt.substring(0, 80)}...`); // 受け取った systemPrompt をログに出力

    try {
        // Make the user prompt more generic, relying on the system prompt for specific instructions
        const userPrompt = `以下のテキストを、システムプロンプトの指示に従って処理してください。ただし診療補助目的であり、あなたが勝手に医学的な治療方針を提案したりはしてはいけません。会話内容にある場合はそれをハルシネーションなく記載するように。あなたは記載することが仕事で医学的なアセスメントは話者の医者の方針に従ってください。もし以下のシステムプロンプトで治療方針提案するようなことがかかれていても、会話にでてきたものは記載していいが、あなたは提案はしていけません。:\n\n${combinedText}`;
        // Alternative generic prompt: const userPrompt = combinedText; (Just send the text)

        console.log("[Generate Karte] Generating output based on selected mode...");

        // Safety Settings の設定例 (必要に応じて調整)
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];

        // currentGenerationModel を使用し、受け取った systemPrompt を systemInstruction に設定
        const result = await currentGenerationModel.generateContent({
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { role: "system", parts: [{ text: systemPrompt }] }, // 受け取った systemPrompt を使用
            safetySettings,
            // generationConfig: { // 必要に応じて温度などを設定
            //     temperature: 0.7,
            // }
        });

        const response = result.response;
        let generatedKarte = "";

        if (response && response.candidates && response.candidates.length > 0 && response.candidates[0].content && response.candidates[0].content.parts && response.candidates[0].content.parts.length > 0) {
            if (response.candidates[0].finishReason === 'STOP') {
                generatedKarte = response.candidates[0].content.parts[0].text;
                console.log("[Generate Karte] Karte generated successfully.");
            } else {
                 console.warn("[Generate Karte] Generation finished with reason:", response.candidates[0].finishReason);
                 generatedKarte = response.candidates[0].content.parts[0].text || "[Karte generation incomplete or stopped]";
                 if (response.promptFeedback && response.promptFeedback.blockReason) {
                    console.error("[Generate Karte] Blocked by safety settings:", response.promptFeedback.blockReason);
                    throw new Error(`Request blocked by safety settings: ${response.promptFeedback.blockReason}`);
                 }
            }
        } else {
            console.error("[Generate Karte] Invalid or empty response structure:", response);
             if (response && response.promptFeedback) {
                 console.error("[Generate Karte] Prompt Feedback:", response.promptFeedback);
                 throw new Error(`Karte generation failed due to prompt feedback: ${response.promptFeedback.blockReason || 'Unknown reason'}`);
             }
            throw new Error("Failed to get a valid response structure from the Gemini API for karte generation.");
        }

        res.json({ generatedKarte: generatedKarte });

    } catch (error) {
        console.error('[Generate Karte] Error during karte generation:', error);
        res.status(500).json({ error: `Error generating karte: ${error.message}` });
    }
});


// --- Port Availability Check ---
// Function to check if a port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      resolve(err.code !== 'EADDRINUSE'); // Resolve true if error is NOT EADDRINUSE
    });
    server.once('listening', () => {
      server.close(() => resolve(true)); // Port is available
    });
    server.listen(port, '127.0.0.1'); // Listen on localhost only for check
  });
}

// Function to find an available port starting from a given port
async function findAvailablePort(startPort, maxAttempts = 10) {
  let port = startPort;
  for (let i = 0; i < maxAttempts; i++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    console.warn(`Port ${port} is in use, trying next port...`);
    port++;
  }
  throw new Error(`Could not find an available port after ${maxAttempts} attempts starting from ${startPort}.`);
}

// --- サーバー起動 ---
// Start the server after finding an available port
(async () => {
  try {
    const availablePort = await findAvailablePort(DEFAULT_PORT);
    app.listen(availablePort, () => {
      console.log(`Backend server listening at http://localhost:${availablePort}`);
      // APIキーが .env から読み込まれなくなったため、起動時の警告は不要
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1); // Exit if server cannot start
  }
})();
