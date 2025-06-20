import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// Define interface for Mode
interface KarteMode {
  id: string;
  title: string;
  systemPrompt: string;
}

// Initial default modes
const defaultModes: KarteMode[] = [
  {
    id: 'shoshin',
    title: '初診',
    systemPrompt: `あなたは経験豊富な医療専門家です。以下の患者との会話（文字起こしテキスト）と追加情報を分析し、**初診**の患者向けの構造化された医療カルテ（SOAP形式など）を作成してください。\n重要な症状、現病歴、既往歴、家族歴、生活歴、診察所見、アセスメント、治療計画などを正確に抽出・要約し、専門的かつ簡潔な言葉で記述してください。\n必要に応じて、追加で確認すべき事項やフォローアップの提案も含めてください。`
  },
  {
    id: 'saishin1',
    title: '再診1',
    systemPrompt: `あなたは経験豊富な医療専門家です。以下の患者との会話（文字起こしテキスト）と追加情報を分析し、**再診**の患者向けの構造化された医療カルテ（SOAP形式など）を作成してください。\n前回の診察からの変化、現在の症状、治療効果、副作用、検査結果、アセスメントの更新、治療計画の調整などを中心に記述してください。\n必要に応じて、追加で確認すべき事項やフォローアップの提案も含めてください。`
  },
   {
    id: 'kanryaku',
    title: '簡略',
    systemPrompt: `あなたは経験豊富な医療専門家です。以下の患者との会話（文字起こしテキスト）と追加情報を分析し、**簡潔な**医療メモを作成してください。\n要点のみを箇条書きなどで記述してください。`
  },
  {
    id: 'saishin2',
    title: '再診2',
    systemPrompt: `あなたは経験豊富な医療専門家です。以下の患者との会話（文字起こしテキスト）と追加情報を分析し、**再診（前回から期間が空いた場合など）**の患者向けの構造化された医療カルテ（SOAP形式など）を作成してください。\n前回の治療内容の確認、その後の経過、現在の状態、今後の治療方針などを中心に記述してください。`
  },
  {
    id: 'shokaijo',
    title: '紹介状',
    systemPrompt: `あなたは経験豊富な医療専門家です。以下の患者との会話（文字起こしテキスト）と追加情報を分析し、他の医療機関への**紹介状（診療情報提供書）**を作成してください。\n患者情報、紹介目的、診断名、主な症状・所見、治療経過、現在の処方、依頼事項などを簡潔かつ正確に記述してください。`
  },
  {
    id: 'shindan',
    title: '診断書',
    systemPrompt: `あなたは経験豊富な医療専門家です。以下の患者との会話（文字起こしテキスト）と追加情報を分析し、**診断書**を作成してください。\n患者氏名、生年月日、診断名、症状・所見、治療内容、今後の見通しなどを、診断書の様式に合わせて記述してください。`
  }
];

// localStorage key
const LOCAL_STORAGE_KEY_MODES = 'voiceKarteModes'; // Restored to original key
const LOCAL_STORAGE_KEY_API_KEY = 'voiceKarteApiKey'; // Key for storing API key


function App() {
  // State variables
  // Load API key from localStorage on initial load
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LOCAL_STORAGE_KEY_API_KEY) || '');
  const [isKeySet, setIsKeySet] = useState(false); // Track if API key is successfully set on backend
  const [keyStatusChecked, setKeyStatusChecked] = useState(false); // Track if initial key status check is done
  const [status, setStatus] = useState('APIキーの状態を確認中...'); // Initial status
  const [transcript, setTranscript] = useState('');
  const [supplementaryInfo, setSupplementaryInfo] = useState(''); // State for additional info
  const [karte, setKarte] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Mode States
  const [modes, setModes] = useState<KarteMode[]>(() => {
    // Load modes from localStorage or use defaults
    const savedModes = localStorage.getItem(LOCAL_STORAGE_KEY_MODES);
    try {
        if (savedModes) {
            const parsedModes = JSON.parse(savedModes);
            // Basic validation to ensure it's an array of objects with expected keys
            if (Array.isArray(parsedModes) && parsedModes.every(m => m && typeof m === 'object' && 'id' in m && 'title' in m && 'systemPrompt' in m)) {
                // Check if we need to add missing default modes
                const savedModeIds = parsedModes.map(m => m.id);
                const missingDefaultModes = defaultModes.filter(dm => !savedModeIds.includes(dm.id));
                
                // If there are missing modes, add them
                if (missingDefaultModes.length > 0) {
                    console.log('Adding missing default modes:', missingDefaultModes.map(m => m.title));
                    return [...parsedModes, ...missingDefaultModes];
                }
                
                return parsedModes;
            }
        }
    } catch (e) {
        console.error("Failed to parse modes from localStorage", e);
    }
    
    // No saved modes or invalid data - use defaults
    console.log('Using default modes');
    return defaultModes;
  });
  const [selectedModeId, setSelectedModeId] = useState<string>(modes[0]?.id || ''); // Default to first mode
  const [editingMode, setEditingMode] = useState<KarteMode | null>(null); // Mode being edited
  const [showEditModal, setShowEditModal] = useState<boolean>(false); // Control modal visibility


  // Refs for recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // --- API Key Handling ---

  // Check API key status and auto-set if available in localStorage
  useEffect(() => {
    const initializeApiKey = async () => {
      let backendKeyIsSet = false;
      try {
        // 1. Check backend status first
        const statusResponse = await fetch('/api/key-status');
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          backendKeyIsSet = statusData.isKeySet;
        } else {
          console.error('Failed to fetch API key status from backend');
        }

        // 2. If backend key is NOT set, but key exists in localStorage, try setting it
        const storedApiKey = localStorage.getItem(LOCAL_STORAGE_KEY_API_KEY);
        if (!backendKeyIsSet && storedApiKey) {
          console.log("Found API key in localStorage, attempting to set on backend...");
          setStatus('保存されたAPIキーを設定中...');
          const setResponse = await fetch('/api/set-api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: storedApiKey }),
          });
          if (setResponse.ok) {
            setIsKeySet(true);
            setStatus('待機中');
            console.log("Successfully set API key from localStorage on backend.");
          } else {
            // Failed to set the stored key (maybe invalid now?)
            console.error('Failed to set stored API key on backend');
            localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY); // Remove invalid key
            setApiKey(''); // Clear state
            setIsKeySet(false);
            setStatus('保存されたAPIキーが無効です。再設定してください。');
          }
        } else if (backendKeyIsSet) {
           // Backend already has a key (maybe set in a previous session or manually)
           setIsKeySet(true);
           setStatus('待機中');
           // Optionally sync localStorage if it's empty or different? For now, assume backend is source of truth if set.
           // if (!storedApiKey) localStorage.setItem(LOCAL_STORAGE_KEY_API_KEY, 'KEY_SET_ON_BACKEND'); // Placeholder?
        } else {
            // No key on backend or in localStorage
            setIsKeySet(false);
            setStatus('APIキーを設定してください');
        }

      } catch (error) {
        console.error('Error during API key initialization:', error);
        setStatus('バックエンド接続エラー');
      } finally {
          setKeyStatusChecked(true); // Mark initialization attempt as complete
      }
    };
    initializeApiKey();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Save modes to localStorage whenever modes state changes
  useEffect(() => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY_MODES, JSON.stringify(modes));
    } catch (e) {
        console.error("Failed to save modes to localStorage", e);
    }
  }, [modes]);

  // Ensure selectedModeId is valid if modes change
   useEffect(() => {
    if (!modes.find(mode => mode.id === selectedModeId) && modes.length > 0) {
      setSelectedModeId(modes[0].id);
    } else if (modes.length === 0) {
        setSelectedModeId('');
    }
  }, [modes, selectedModeId]);

  // --- Mode Editing Logic ---
  const handleEditModeClick = (modeToEdit: KarteMode) => {
    setEditingMode({ ...modeToEdit }); // Create a copy to edit
    setShowEditModal(true);
  };

  const handleSaveEditedMode = () => {
    if (!editingMode) return;
    setModes(prevModes =>
      prevModes.map(mode =>
        mode.id === editingMode.id ? editingMode : mode
      )
    );
    setShowEditModal(false);
    setEditingMode(null);
  };

  const handleCancelEditMode = () => {
    setShowEditModal(false);
    setEditingMode(null);
  };

  const handleEditingModeChange = (field: keyof KarteMode, value: string) => {
    if (!editingMode) return;
    setEditingMode(prev => prev ? { ...prev, [field]: value } : null);
  };

  // TODO: Implement adding and deleting modes


  const handleApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(event.target.value);
  };

  const handleSetApiKey = async () => {
    if (!apiKey.trim()) {
      alert('APIキーを入力してください。');
      return;
    }
    setIsLoading(true);
    setStatus('APIキーを設定中...');
    try {
      const response = await fetch('/api/set-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (response.ok) {
        localStorage.setItem(LOCAL_STORAGE_KEY_API_KEY, apiKey); // Save key on success
        setIsKeySet(true);
        setStatus('待機中');
        alert('APIキーが設定されました。');
      } else {
        // Don't save key if setting failed
        localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY); // Remove potentially invalid key
        let errorMsg = `APIキーの設定に失敗しました: ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorMsg = `APIキーの設定に失敗しました: ${errorData.error || response.statusText}`;
        } catch (e) {
            // Ignore if response is not JSON
        }
        alert(errorMsg);
        setIsKeySet(false);
         setStatus('APIキー設定失敗');
      }
    } catch (error) {
      console.error('Error setting API key:', error);
      alert('APIキーの設定中にエラーが発生しました。');
      setIsKeySet(false);
      setStatus('APIキー設定エラー');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to allow changing the API key
  const handleChangeApiKeyClick = () => {
    setIsKeySet(false); // Show the input field again
    setApiKey(''); // Clear the current input field
    setStatus('新しいAPIキーを入力してください');
  };

   // Function to clear the API key
  const handleClearApiKey = async () => {
    if (!confirm('保存されているAPIキーをクリアしてもよろしいですか？')) {
        return;
    }
    setIsLoading(true);
    setStatus('APIキーをクリア中...');
    try {
        // Clear from backend
        const response = await fetch('/api/clear-api-key', { method: 'POST' });
        if (!response.ok) {
            throw new Error('Failed to clear API key on backend');
        }
        // Clear from localStorage and state
        localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY);
        setApiKey('');
        setIsKeySet(false);
        setStatus('APIキーを設定してください');
        alert('APIキーがクリアされました。');
    } catch (error) {
        console.error('Error clearing API key:', error);
        alert('APIキーのクリア中にエラーが発生しました。');
        // Keep UI state consistent even if backend fails? Or reflect backend state?
        // For now, assume frontend clear is desired outcome.
        localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY);
        setApiKey('');
        setIsKeySet(false);
        setStatus('APIキーのクリアエラー');
    } finally {
        setIsLoading(false);
    }
  };

  // Function to clear saved data (uploads, transcripts)
  const handleClearData = async () => {
    if (!confirm('サーバーに保存されている全ての音声ファイルと文字起こしテキストを削除します。よろしいですか？この操作は元に戻せません。')) {
        return;
    }
    setIsLoading(true);
    setStatus('保存データをクリア中...');
    try {
        const response = await fetch('/api/clear-data', { method: 'POST' });
        if (response.ok) {
            alert('保存されている音声ファイルと文字起こしテキストが削除されました。');
            setStatus(isKeySet ? '待機中' : 'APIキーを設定してください'); // Reset status
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to clear data on backend');
        }
    } catch (error: unknown) { // Explicitly type error as unknown
        console.error('Error clearing data:', error);
        let errorMsg = '不明なエラーが発生しました。';
        if (error instanceof Error) {
            errorMsg = error.message; // Access message safely if it's an Error instance
        } else if (typeof error === 'string') {
            errorMsg = error;
        }
        alert(`保存データのクリア中にエラーが発生しました: ${errorMsg}`);
        setStatus('保存データクリアエラー');
    } finally {
        setIsLoading(false);
    }
  };


  // --- Recording Logic ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = []; // Reset chunks

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); // Specify MIME type
        // Automatically trigger transcription after recording stops
        transcribeAudio(audioBlob, 'recording.webm'); // Pass blob and a filename
        // Stop timer
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
         // Stop microphone track
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setStatus('録音中...');
      setRecordingTime(0); // Reset timer
      // Start timer
      timerIntervalRef.current = window.setInterval(() => {
          setRecordingTime(prevTime => prevTime + 1);
      }, 1000);

    } catch (err) {
      console.error("Error starting recording:", err);
      setStatus('録音開始エラー (マイク権限を確認してください)');
      alert('マイクへのアクセス許可が必要です。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); // This will trigger the onstop event
      setStatus('録音停止、処理中...');
    }
  };

  // --- File Handling ---
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setStatus(`ファイル選択: ${event.target.files[0].name}`);
    } else {
      setSelectedFile(null);
       setStatus(isKeySet ? '待機中' : 'APIキーを設定してください');
    }
  };

  // --- Transcription Logic ---
  const transcribeAudio = async (audioData: Blob | File, filename: string) => {
    if (!isKeySet) {
        alert('APIキーが設定されていません。');
        setStatus('APIキー未設定');
        return;
    }
    setIsLoading(true);
    setTranscript(''); // Clear previous transcript
    setKarte(''); // Clear previous karte
    setStatus(`「${filename}」を文字起こし中...`);

    const formData = new FormData();
    formData.append('audio', audioData, filename); // Append blob/file with filename

    try {
        const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData, // Send FormData
        });

        const result = await response.json();

        if (response.ok) {
            setTranscript(result.transcript);
            setStatus('文字起こし完了');
        } else {
            console.error('Transcription API error:', result.error);
            setStatus(`文字起こしエラー: ${result.error || response.statusText}`);
            alert(`文字起こしエラー: ${result.error || response.statusText}`);
        }
    } catch (error) {
        console.error('Error calling transcription API:', error);
        setStatus('文字起こしAPI接続エラー');
        alert('文字起こしAPIへの接続中にエラーが発生しました。');
    } finally {
        setIsLoading(false);
        setSelectedFile(null); // Clear selected file after attempt
        // Reset file input visually (optional, might need more complex handling)
        const fileInput = document.getElementById('audioFile') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    }
  };

  // --- Karte Generation Logic ---
  const handleGenerateKarte = async () => {
     if (!isKeySet) {
        alert('APIキーが設定されていません。');
        setStatus('APIキー未設定');
        return;
    }
     if (!transcript) {
        alert('カルテを生成するための文字起こし結果がありません。');
        return;
    }
     if (!selectedModeId) {
        alert('カルテ生成モードを選択してください。');
        return;
    }
    const selectedMode = modes.find(mode => mode.id === selectedModeId);
    if (!selectedMode) {
        alert('選択されたモードが見つかりません。');
        return;
    }

    setIsLoading(true);
    setKarte(''); // Clear previous karte
    setStatus(`「${selectedMode.title}」モードでカルテを生成中...`);

    // Combine transcript and supplementary info
    const combinedText = `
## 文字起こし結果:\n
${transcript}\n
## 追加情報:\n
${supplementaryInfo || '(追加情報なし)'}
`;

    try {
        const response = await fetch('/api/generate-karte', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send combined text AND the selected system prompt
            body: JSON.stringify({
                combinedText: combinedText,
                systemPrompt: selectedMode.systemPrompt // Send selected mode's prompt
            }),
        });

        const result = await response.json();

        if (response.ok) {
            setKarte(result.generatedKarte);
            setStatus('カルテ生成完了');
        } else {
            console.error('Karte generation API error:', result.error);
            setStatus(`カルテ生成エラー: ${result.error || response.statusText}`);
            alert(`カルテ生成エラー: ${result.error || response.statusText}`);
        }
    } catch (error) {
        console.error('Error calling karte generation API:', error);
        setStatus('カルテ生成API接続エラー');
        alert('カルテ生成APIへの接続中にエラーが発生しました。');
    } finally {
        setIsLoading(false);
    }
  };

  // --- Utility Functions ---
  const handleCopy = async (textToCopy: string, buttonId: string) => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      // Briefly change button text/style to indicate success
      const button = document.getElementById(buttonId);
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'コピー完了!';
        button.classList.add('success');
        setTimeout(() => {
          if (button.textContent === 'コピー完了!') { // Avoid overwriting if changed again
             button.textContent = originalText;
             button.classList.remove('success');
          }
        }, 1500);
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
      alert('テキストのコピーに失敗しました。');
    }
  };

  // Format recording time (MM:SS)
  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60).toString().padStart(2, '0');
    const seconds = (timeInSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };


  // Render loading or main content based on initial key check
   if (!keyStatusChecked) {
    return (
        <div className="container">
             <div className="loading-indicator">
                <div className="spinner"></div>
                <p>APIキーの状態を確認中...</p>
            </div>
        </div>
    );
  }

  return (
    <div className="container">
       <h1>Voice Karte - AI Transcription & Charting (React)</h1>

       {/* API Key Section - Show input if key is not set */}
       {!isKeySet && (
         <div className="section api-key-section">
            <h2>APIキー設定</h2>
            <p>Gemini API を使用するために API キーを設定してください。</p>
            <input
                type="password" // Use password type for sensitive keys
                placeholder="Gemini API Key"
                value={apiKey}
                onChange={handleApiKeyChange}
                disabled={isLoading}
                style={{ marginRight: '10px', padding: '8px', minWidth: '300px' }}
            />
            <button onClick={handleSetApiKey} disabled={isLoading || !apiKey.trim()}>
                {isLoading ? '設定中...' : 'APIキーを設定'}
            </button>
         </div>
       )}

       {/* Show Change/Clear API Key and Clear Data buttons if key is set */}
       {isKeySet && keyStatusChecked && (
           <div style={{ textAlign: 'center', marginBottom: '20px', display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
               <button onClick={handleChangeApiKeyClick} disabled={isLoading}>
                   APIキーを変更
               </button>
                <button onClick={handleClearApiKey} disabled={isLoading} style={{ backgroundColor: '#6c757d', color: 'white' }}> {/* Adjusted color */}
                   APIキーをクリア
                </button>
                 <button onClick={handleClearData} disabled={isLoading} style={{ backgroundColor: '#dc3545', color: 'white' }}> {/* Danger color */}
                   保存データクリア
                </button>
           </div>
       )}


      {/* Main App Sections (only enabled if key is set and check is complete) */}
      {isKeySet && keyStatusChecked && (
        <>
          <p>マイクからの音声を録音、またはファイルを選択して文字起こしを行い、カルテを作成します。</p>
          <div className="section">
            <h2>1. 音声入力</h2>
             <div className="controls">
                <button id="recordButton" onClick={startRecording} disabled={isLoading || mediaRecorderRef.current?.state === 'recording'}>録音開始</button>
                <button id="stopButton" onClick={stopRecording} disabled={isLoading || mediaRecorderRef.current?.state !== 'recording'}>録音停止</button>
                <span className="status">録音時間: <span>{formatTime(recordingTime)}</span></span>
            </div>
             <div className="file-upload-controls">
                <label htmlFor="audioFile">または、音声ファイルを選択:</label>
                <input type="file" id="audioFile" name="audioFile" accept="audio/*" onChange={handleFileChange} disabled={isLoading || mediaRecorderRef.current?.state === 'recording'}/>
                {/* Trigger transcription directly when file is selected and button clicked */}
                <button
                    id="uploadButton"
                    onClick={() => selectedFile && transcribeAudio(selectedFile, selectedFile.name)}
                    disabled={isLoading || !selectedFile || mediaRecorderRef.current?.state === 'recording'}
                >
                    ファイルを文字起こし
                </button>
            </div>
            <div className="status">
              <p>ステータス: <span>{status}</span></p>
            </div>
            {isLoading && (
              <div className="loading-indicator">
                <div className="spinner"></div>
                <p>処理中...</p>
              </div>
            )}
          </div>

          <div className="section">
            <h2>2. 文字起こし結果</h2>
            <button
                id="copyTranscriptButton"
                className="copy-button"
                onClick={() => handleCopy(transcript, 'copyTranscriptButton')}
                disabled={isLoading || !transcript}
            >
                全文コピー
            </button>
            <div className="output-area">
              <pre>{transcript || 'ここに文字起こし結果が表示されます...'}</pre>
            </div>
          </div>

          {/* New Section for Supplementary Info */}
          <div className="section">
            <h2>3. その他の情報追加</h2>
            <p>問診票のテキストなど、カルテ生成の参考になる情報を貼り付けてください。</p>
            <textarea
                id="supplementaryInfo"
                rows={8}
                style={{ width: '95%', padding: '10px', fontFamily: 'monospace' }}
                placeholder="ここに問診票などのテキストを入力..."
                value={supplementaryInfo}
                onChange={(e) => setSupplementaryInfo(e.target.value)}
                disabled={isLoading}
            />
          </div>


          <div className="section">
             {/* Renumbered Section */}
            <h2>4. カルテ生成</h2>

            {/* Mode Selection Buttons */}
            <div className="mode-selection" style={{ marginBottom: '15px', textAlign: 'center' }}>
                <span style={{ marginRight: '10px' }}>モード選択:</span>
                {modes.map((mode) => (
                    <React.Fragment key={mode.id}>
                        <button
                            onClick={() => setSelectedModeId(mode.id)}
                            disabled={isLoading}
                            style={{
                                marginRight: '5px',
                                backgroundColor: selectedModeId === mode.id ? '#007bff' : undefined,
                                color: selectedModeId === mode.id ? 'white' : undefined,
                                border: selectedModeId === mode.id ? '1px solid #0056b3': undefined,
                            }}
                        >
                            {mode.title}
                        </button>
                        <button
                            onClick={() => handleEditModeClick(mode)} // Call edit handler
                            disabled={isLoading}
                            title={`${mode.title} の設定を編集`}
                            style={{ padding: '0.3em 0.6em', fontSize: '0.9em', marginLeft: '-5px', marginRight: '10px' }}
                        >
                            設定
                        </button>
                    </React.Fragment>
                ))}
                 {/* TODO: Add button to add a new mode */}
            </div>
            
            {/* Settings Export/Import */}
            <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '10px' }}>
                <button
                    onClick={() => {
                        const data = {
                            modes: modes,
                            exportDate: new Date().toISOString()
                        };
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `voicekarte-settings-${new Date().toISOString().split('T')[0]}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                    }}
                    style={{ marginRight: '10px', fontSize: '0.9em' }}
                    title="現在の設定をファイルに保存"
                >
                    設定をエクスポート
                </button>
                <input
                    type="file"
                    accept=".json"
                    id="importSettings"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                try {
                                    const data = JSON.parse(event.target?.result as string);
                                    if (data.modes && Array.isArray(data.modes)) {
                                        setModes(data.modes);
                                        localStorage.setItem(LOCAL_STORAGE_KEY_MODES, JSON.stringify(data.modes));
                                        alert('設定をインポートしました');
                                    } else {
                                        alert('無効なファイル形式です');
                                    }
                                } catch (error) {
                                    alert('ファイルの読み込みに失敗しました');
                                }
                            };
                            reader.readAsText(file);
                        }
                        // Reset input
                        e.target.value = '';
                    }}
                />
                <button
                    onClick={() => document.getElementById('importSettings')?.click()}
                    style={{ fontSize: '0.9em' }}
                    title="保存した設定ファイルを読み込み"
                >
                    設定をインポート
                </button>
            </div>

             {/* Generate Button (now uses selected mode) */}
             <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                 <button
                    id="generateKarteButton"
                    onClick={handleGenerateKarte}
                    disabled={isLoading || !transcript || !selectedModeId}
                 >
                    {selectedModeId ? `「${modes.find(m=>m.id===selectedModeId)?.title || ''}」モードで` : ''}カルテ生成
                 </button>
             </div>

             {/* Output Area */}
             <button
                id="copyKarteButton"
                className="copy-button"
                onClick={() => handleCopy(karte, 'copyKarteButton')}
                disabled={isLoading || !karte}
            >
                全文コピー
            </button>
            <div className="output-area">
              <pre>{karte || 'ここに生成されたカルテが表示されます...'}</pre>
            </div>
          </div>
        </>
      )}

      {/* Mode Edit Modal */}
      {showEditModal && editingMode && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2>モード設定編集: {editingMode.title}</h2>
            <div style={{ marginBottom: '10px' }}>
              <label htmlFor="editModeTitle" style={{ display: 'block', marginBottom: '5px' }}>モード名:</label>
              <input
                type="text"
                id="editModeTitle"
                value={editingMode.title}
                onChange={(e) => handleEditingModeChange('title', e.target.value)}
                style={{ width: '95%', padding: '8px' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="editModePrompt" style={{ display: 'block', marginBottom: '5px' }}>システムプロンプト:</label>
              <textarea
                id="editModePrompt"
                rows={15}
                value={editingMode.systemPrompt}
                onChange={(e) => handleEditingModeChange('systemPrompt', e.target.value)}
                style={{ width: '95%', padding: '10px', fontFamily: 'monospace' }}
              />
            </div>
            <div style={{ textAlign: 'right' }}>
              <button onClick={handleCancelEditMode} style={{ marginRight: '10px' }}>キャンセル</button>
              <button onClick={handleSaveEditedMode} style={{ backgroundColor: '#007bff', color: 'white' }}>保存</button>
               {/* TODO: Add delete button */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
