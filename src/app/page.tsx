'use client';

import { useState, useRef, useEffect } from 'react';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

export default function Home() {
  const [inputType, setInputType] = useState<'text' | 'srt'>('text');
  const [selectedVoice, setSelectedVoice] = useState('BV074_streaming');
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');
  const [tiktokCookie, setTiktokCookie] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const savedCookie = localStorage.getItem('tiktok_cookie');
    if (savedCookie) {
      setTiktokCookie(savedCookie);
    }
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const saveCookie = () => {
    if (cookieInput.trim()) {
      localStorage.setItem('tiktok_cookie', cookieInput.trim());
      setTiktokCookie(cookieInput.trim());
      setShowSettings(false);
      setCookieInput('');
    }
  };

  const voices = [
    { id: 'BV074_streaming', name: 'Cô Gái Hoạt Ngôn' },
    { id: 'BV075_streaming', name: 'Thanh Niên Tự Tin' },
    { id: 'vi_female_huong', name: 'Giọng Nữ Phổ Thông' },
    { id: 'BV421_vivn_streaming', name: 'Nguồn Nhỏ Ngọt Ngào' },
    { id: 'BV560_streaming', name: 'Anh Dũng' },
    { id: 'BV562_streaming', name: 'Chí Mai' },
  ];

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (text.length <= 5000) {
      setInputText(text);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) {
      setError('Vui lòng nhập văn bản');
      return;
    }

    if (!tiktokCookie) {
      setError('Vui lòng cấu hình TikTok Cookie trong Settings');
      return;
    }

    setIsProcessing(true);
    setError('');
    setProgress(0);
    setDownloadUrl('');

    // Simulate progress while API processes
    let interval: NodeJS.Timeout | null = null;

    try {
      // Calculate estimated time based on character count
      // Roughly 1 second per 100 characters + 0.5 seconds per chunk for processing
      const charCount = inputText.length;
      const chunkCount = Math.ceil(charCount / 200);
      const estimated = (charCount / 100) + (chunkCount * 0.5);
      setEstimatedTime(Math.round(estimated));

      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            if (interval) clearInterval(interval);
            interval = null;
            return 100;
          }
          // Progress based on estimated time
          const increment = 100 / (estimated * 10);
          return Math.min(prev + increment, 100);
        });
      }, 100);

      const cookieSubmit = localStorage.getItem('tiktok_cookie');
      if (!executeRecaptcha) {
        setIsProcessing(false);
        setError('reCAPTCHA chưa tải. Vui lòng thử lại.');
        return;
      }
      const recaptchaToken = await executeRecaptcha('submit_tts');

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: inputText, 
          voice: selectedVoice, 
          type: inputType,
          cookie: cookieSubmit,
          recaptchaToken
        }),
      });

      if (interval) {
        clearInterval(interval);
        interval = null;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate audio');
      }

      const data = await response.json();
      setDownloadUrl(data.url);
      setProgress(100);
      setIsProcessing(false);

    } catch (err: unknown) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      const errorMessage = err instanceof Error ? err.message : 'Có lỗi xảy ra trong quá trình xử lý';
      setError(errorMessage);
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const { executeRecaptcha } = useGoogleReCaptcha();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 py-2 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-4">
          <img src="/logo.png" alt="TikTok TTS Logo" className="mx-auto h-40 w-40 mb-0 opacity-80" />
          <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-4">TikTok TTS Converter</h1>
          <p className="text-xl text-slate-600 dark:text-gray-300">Chuyển đổi văn bản thành giọng nói TikTok một cách dễ dàng và chuyên nghiệp</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-4 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input Type Selection */}
            <h2 className="text-xl font-semibold text-slate-700 dark:text-gray-200 mb-4">Chọn Loại Đầu Vào (Text to Speech hoặc SRT)</h2>
            <div>
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setInputType('text')}
                className={`flex-1 py-4 px-6 rounded-xl transition-all duration-200 font-medium ${
                  inputType === 'text'
                    ? 'bg-blue-500 text-white shadow-lg transform scale-105'
                    : 'bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700 hover:shadow-md'
                }`}
                >
                  Văn bản thường (Text to Speech)
                </button>
                <button
                  type="button"
                  onClick={() => setInputType('srt')}
                className={`flex-1 py-4 px-6 rounded-xl transition-all duration-200 font-medium ${
                  inputType === 'srt'
                    ? 'bg-blue-500 text-white shadow-lg transform scale-105'
                    : 'bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700 hover:shadow-md'
                }`}
                >
                  Định dạng SRT (Subtitle to Audio)
                </button>
              </div>
            </div>

            {/* Voice Selection */}
            <div>
              <label htmlFor="voice" className="block text-xl font-semibold text-slate-700 dark:text-gray-200 mb-4">
                Chọn giọng đọc
              </label>
              <select
                id="voice"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full p-4 border-2 border-slate-300 dark:border-gray-600 rounded-xl focus:ring-4 focus:ring-blue-400 focus:border-blue-400 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                disabled={isProcessing}
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id} className="text-slate-700 dark:text-gray-300">
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Text Input */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <label htmlFor="text" className="block text-xl font-semibold text-slate-700 dark:text-gray-200">
                  Nhập văn bản
                </label>
                <span className={`text-lg font-medium ${inputText.length > 4500 ? 'text-red-500' : 'text-slate-500 dark:text-gray-400'}`}>
                  {inputText.length}/5000 ký tự
                </span>
              </div>
              <textarea
                ref={textareaRef}
                id="text"
                value={inputText}
                onChange={handleTextChange}
                placeholder={inputType === 'srt' 
                  ? "Nhập văn bản SRT vào đây...\n1\n00:00:01,000 --> 00:00:05,000\nVăn bản đầu tiên\n\n2\n00:00:06,000 --> 00:00:10,000\nVăn bản thứ hai" 
                  : "Nhập văn bản vào đây..."}
                className="w-full h-40 p-6 border-2 border-slate-300 dark:border-gray-600 rounded-xl focus:ring-4 focus:ring-blue-500 focus:border-blue-500 text-slate-700 dark:text-gray-300 text-lg leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 bg-white dark:bg-gray-800"
                disabled={isProcessing}
              />
              {inputText.length > 4500 && (
                <p className="mt-3 text-base text-red-600 dark:text-red-400 font-medium">
                  ⚠️ Cảnh báo: Văn bản gần đạt giới hạn 5000 ký tự
                </p>
              )}
            </div>

            {/* Progress Bar */}
            {isProcessing && (
              <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-2xl font-semibold text-slate-700 dark:text-gray-200">Đang xử lý...</span>
                  <span className="text-2xl font-semibold text-blue-500 dark:text-blue-300">
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-400 to-indigo-500 h-6 rounded-full transition-all duration-300 ease-out shadow-inner"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <div className="mt-3 text-center text-slate-600 dark:text-gray-400 text-lg font-medium">
                  Thời gian ước tính còn lại: {formatTime(estimatedTime * (1 - progress / 100))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                <p className="text-red-700 dark:text-red-300 text-center text-lg font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                type="submit"
                disabled={isProcessing || !inputText.trim()}
                className={`flex-1 py-5 px-8 rounded-xl font-semibold text-xl transition-all duration-200 transform ${
                  isProcessing || !inputText.trim()
                    ? 'bg-slate-300 dark:bg-gray-700 text-slate-500 dark:text-gray-500 cursor-not-allowed opacity-60'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95'
                }`}
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Đang xử lý...
                  </span>
                ) : (
                  'Chuyển đổi thành giọng nói'
                )}
              </button>

              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download="tts-audio.mp3"
                  className="flex-1 py-5 px-8 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold text-xl text-center hover:from-green-600 hover:to-emerald-700 shadow-xl hover:shadow-2xl transform hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Tải xuống âm thanh
                </a>
              )}
            </div>
          </form>

          {/* Audio Player */}
          {downloadUrl && (
            <div className="mt-8 p-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
              <h3 className="text-xl font-semibold text-green-800 dark:text-green-200 mb-4 text-center">Âm thanh đã tạo thành công!</h3>
              <audio
                controls
                src={downloadUrl}
                className="w-full rounded-lg shadow-md"
                onEnded={() => console.log('Audio playback finished')}
              >
                Trình duyệt của bạn không hỗ trợ phát âm thanh.
              </audio>
              <p className="mt-3 text-center text-sm text-green-700 dark:text-green-300">
                Bạn có thể nghe trước hoặc tải xuống file MP3.
              </p>
            </div>
          )}
        </div>

        {/* Settings Button */}
        <div className="flex justify-center mb-8 mt-5">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-6 py-3 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-gray-700 transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-black dark:bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md w-full max-h-[80vh] overflow-y-auto shadow-2xl">
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">Cấu hình</h3>
              
              {/* Theme Toggle */}
              <div className="mb-6 hidden">
                <label className="block text-lg font-semibold text-slate-700 dark:text-gray-200 mb-3">
                  Chế độ giao diện
                </label>
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-gray-800 rounded-xl">
                  <span className="text-slate-700 dark:text-gray-300">Chế độ tối</span>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                  >
                    <span className="sr-only">Toggle dark mode</span>
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                    <span
                      className={`bg-slate-300 dark:bg-gray-600 w-11 h-6 rounded-full transition-colors ${
                        theme === 'dark' ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <p className="text-slate-600 dark:text-gray-400 mb-6">Nhập TikTok Cookie để sử dụng API TTS:</p>
              <textarea
                value={cookieInput}
                onChange={(e) => setCookieInput(e.target.value)}
                placeholder="Paste your TikTok cookie here..."
                className="w-full h-32 p-4 border-2 border-slate-300 dark:border-gray-600 rounded-xl focus:ring-4 focus:ring-blue-400 focus:border-blue-400 resize-none text-slate-700 dark:text-gray-300 text-base bg-white dark:bg-gray-800"
                rows={4}
              />
              <div className="flex gap-4 mt-6">
                <button
                  onClick={saveCookie}
                  disabled={!cookieInput.trim()}
                  className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
                    !cookieInput.trim()
                      ? 'bg-slate-300 dark:bg-gray-700 text-slate-500 dark:text-gray-500 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg hover:shadow-xl transform hover:scale-105'
                  }`}
                >
                  Lưu Cookie
                </button>
                <button
                  onClick={() => {
                    setShowSettings(false);
                    setCookieInput('');
                  }}
                  className="py-3 px-6 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300 rounded-xl font-medium hover:bg-slate-300 dark:hover:bg-gray-600 transition-all duration-200"
                >
                  Hủy
                </button>
              </div>
              {tiktokCookie && (
                <p className="mt-4 text-sm text-green-600 dark:text-green-400 text-center font-medium">
                  ✓ Cookie đã được lưu và sẵn sàng sử dụng.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-12 text-center text-slate-600 dark:text-gray-400 text-base leading-relaxed">
          <p className="mb-4">Hỗ trợ văn bản tối đa 5000 ký tự. Với định dạng SRT, hệ thống sẽ giữ nguyên khoảng thời gian trống giữa các phụ đề.</p>
        </div>
      </div>
    </div>
  );
}
