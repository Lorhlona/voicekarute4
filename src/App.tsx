import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  // State variables
  const [apiKey, setApiKey] = useState('');
  const [isKeySet, setIsKeySet] = useState(false); // Track if API key is successfully set on backend
  const [keyStatusChecked, setKeyStatusChecked] = useState(false); // Track if initial key status check is done
  const [status, setStatus] = useState('APIキーを設定してください');
  const [transcript, setTranscript] = useState('');
  const [karte, setKarte] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Refs for recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // --- API Key Handling ---

  // Check API key status on component mount
  useEffect(() => {
    const checkApiKeyStatus = async () => {
      try {
        const response = await fetch('/api/key-status'); // Use relative path (Vite proxy handles it)
        if (response.ok) {
          const data = await response.json();
          setIsKeySet(data.isKeySet);
          if (data.isKeySet) {
            setStatus('待機中');
          }
        } else {
          console.error('Failed to fetch API key status');
        }
      } catch (error) {
        console.error('Error checking API key status:', error);
        setStatus('バックエンド接続エラー');
      } finally {
          setKeyStatusChecked(true); // Mark check as complete
      }
    };
    checkApiKeyStatus();
  }, []); // Empty dependency array ensures this runs only once on mount

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
        setIsKeySet(true);
        setStatus('待機中');
        alert('APIキーが設定されました。');
      } else {
        const errorData = await response.json();
        alert(`APIキーの設定に失敗しました: ${errorData.error || response.statusText}`);
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
    setIsLoading(true);
    setKarte(''); // Clear previous karte
    setStatus('カルテを生成中...');

    try {
        const response = await fetch('/api/generate-karte', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcriptText: transcript }),
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
          button.textContent = originalText;
          button.classList.remove('success');
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

       {/* Show Change API Key button if key is set */}
       {isKeySet && keyStatusChecked && (
           <div style={{ textAlign: 'center', marginBottom: '20px' }}>
               <button onClick={handleChangeApiKeyClick} disabled={isLoading}>
                   APIキーを変更
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

          <div className="section">
            <h2>3. カルテ生成</h2>
             <button
                id="generateKarteButton"
                onClick={handleGenerateKarte}
                disabled={isLoading || !transcript}
            >
                文字起こし結果からカルテ生成
            </button>
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
    </div>
  );
}

export default App;
