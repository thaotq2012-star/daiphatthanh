import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  Calendar, 
  Mic, 
  Library, 
  Settings, 
  Play, 
  Pause, 
  Square, 
  Plus, 
  Trash2, 
  Volume2, 
  Wifi, 
  WifiOff, 
  Smartphone, 
  AlertCircle, 
  History, 
  Upload, 
  Search, 
  Sun, 
  Moon, 
  ChevronRight, 
  MoreVertical, 
  Download, 
  Bluetooth, 
  Zap, 
  Bell, 
  X, 
  Radio,
  CheckCircle2, 
  RefreshCw, 
  Link as LinkIcon,
  Edit2
} from 'lucide-react';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';
import { generateSpeech } from './services/geminiService';
import { cn, AudioFile, Schedule, Announcement, SystemSettings, VOICES } from './types';

// --- Components ---

const Card = ({ children, className, title, icon: Icon }: { children: React.ReactNode; className?: string; title?: string; icon?: any }) => (
  <div className={cn("bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden", className)}>
    {title && (
      <div className="px-6 py-4 border-bottom border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          {Icon && <Icon size={18} className="text-zinc-500" />}
          {title}
        </h3>
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  icon: Icon, 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'; size?: 'sm' | 'md' | 'lg'; icon?: any }) => {
  const variants = {
    primary: 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200',
    secondary: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
    outline: 'bg-transparent border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };
  return (
    <button 
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed", 
        variants[variant], 
        sizes[size], 
        className
      )} 
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  );
};

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn(
      "w-full px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-all text-zinc-900 dark:text-zinc-100", 
      className
    )} 
    {...props} 
  />
);

const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select 
    className={cn(
      "w-full px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-all text-zinc-900 dark:text-zinc-100 appearance-none", 
      className
    )} 
    {...props}
  >
    {children}
  </select>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'schedule' | 'ai' | 'library' | 'settings'>('home');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<AudioFile | null>(null);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }[]>([]);
  const [remoteSessionId] = useState(Math.random().toString(36).substring(7).toUpperCase());
  const [connectedDevices, setConnectedDevices] = useState<string[]>([]);
  const [bluetoothDevice, setBluetoothDevice] = useState<string | null>(null);
  const [isEmergency, setIsEmergency] = useState(false);
  const [playedSchedules, setPlayedSchedules] = useState<Record<string, string>>({});
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  // --- Sub-component States ---
  const [newSchedule, setNewSchedule] = useState<Partial<Schedule>>({
    time: '08:00',
    label: '',
    section: 'morning',
    enabled: true,
    days: [1, 2, 3, 4, 5]
  });
  const [announcementText, setAnnouncementText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [aiSpeed, setAiSpeed] = useState(1);
  const [aiPitch, setAiPitch] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [liveLink, setLiveLink] = useState<string | null>(null);

  // --- Schedule Management Functions ---
  const addSchedule = () => {
    console.log("Adding/Updating schedule:", newSchedule, "Editing ID:", editingScheduleId);
    if (!newSchedule.label || !newSchedule.audioId) {
      addNotification("Vui lòng điền đầy đủ thông tin", "warning");
      return;
    }
    
    // Check for overlapping schedules (excluding the one being edited)
    const isOverlapping = schedules.some(s => s.time === newSchedule.time && s.id !== editingScheduleId);
    if (isOverlapping) {
      addNotification("Thời gian này đã có lịch phát sóng khác", "error");
      return;
    }

    if (editingScheduleId) {
      // Update existing schedule
      const updated = schedules.map(s => {
        if (s.id === editingScheduleId) {
          return {
            ...s,
            time: newSchedule.time!,
            label: newSchedule.label!,
            audioId: newSchedule.audioId!,
            section: parseInt(newSchedule.time!.split(':')[0]) < 12 ? 'morning' : 'afternoon' as 'morning' | 'afternoon',
            days: newSchedule.days!
          };
        }
        return s;
      });
      setSchedules(updated);
      saveToStorage('schedules', updated);
      setEditingScheduleId(null);
      setNewSchedule({
        time: '08:00',
        label: '',
        section: 'morning',
        enabled: true,
        days: [1, 2, 3, 4, 5]
      });
      addNotification("Đã cập nhật lịch phát", "success");
    } else {
      // Add new schedule
      const schedule: Schedule = {
        id: Date.now().toString(),
        time: newSchedule.time!,
        label: newSchedule.label!,
        audioId: newSchedule.audioId!,
        section: parseInt(newSchedule.time!.split(':')[0]) < 12 ? 'morning' : 'afternoon',
        enabled: true,
        days: newSchedule.days!
      };
      const updated = [...schedules, schedule];
      setSchedules(updated);
      saveToStorage('schedules', updated);
      addNotification("Đã thêm lịch phát mới", "success");
    }
  };

  const editSchedule = (schedule: Schedule) => {
    console.log("Editing schedule:", schedule);
    setEditingScheduleId(schedule.id);
    setNewSchedule({
      time: schedule.time,
      label: schedule.label,
      audioId: schedule.audioId,
      section: schedule.section,
      enabled: schedule.enabled,
      days: schedule.days
    });
    // Scroll to form if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingScheduleId(null);
    setNewSchedule({
      time: '08:00',
      label: '',
      section: 'morning',
      enabled: true,
      days: [1, 2, 3, 4, 5]
    });
  };

  const deleteSchedule = (id: string) => {
    if (editingScheduleId === id) {
      cancelEdit();
    }
    const updated = schedules.filter(s => s.id !== id);
    setSchedules(updated);
    saveToStorage('schedules', updated);
  };

  const onDrop = (acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const newFile: AudioFile = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          url: reader.result as string,
          type: 'local',
          createdAt: Date.now()
        };
        setAudioFiles(prev => {
          const updated = [newFile, ...prev];
          saveToStorage('audioFiles', updated);
          return updated;
        });
        addNotification(`Đã tải lên: ${file.name}`, 'success');
      };
      reader.readAsDataURL(file);
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'audio/*': ['.mp3', '.wav', '.m4a'] },
    multiple: true
  } as any);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // --- Initialization ---

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    // Load data from LocalStorage
    try {
      const savedFiles = localStorage.getItem('audioFiles');
      if (savedFiles) setAudioFiles(JSON.parse(savedFiles));

      const savedSchedules = localStorage.getItem('schedules');
      if (savedSchedules) setSchedules(JSON.parse(savedSchedules));

      const savedAnnouncements = localStorage.getItem('announcements');
      if (savedAnnouncements) setAnnouncements(JSON.parse(savedAnnouncements));

      const savedSettings = localStorage.getItem('settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setVolume(settings.volume);
        setIsDarkMode(settings.darkMode);
      }
    } catch (e) {
      console.error("Lỗi tải dữ liệu từ LocalStorage:", e);
    }

    // Initialize Socket.io
    try {
      // Use default connection which tries polling then upgrades to websocket
      // This is generally more compatible with different proxy environments
      socketRef.current = io({
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 20000,
      });

      socketRef.current.on('connect', () => {
        console.log("Đã kết nối Socket.io thành công");
        setIsOnline(true);
        if (socketRef.current) {
          socketRef.current.emit('join-room', remoteSessionId);
        }
      });

      socketRef.current.on('connect_error', (err) => {
        console.error("Lỗi kết nối Socket.io:", err.message);
        // If we get a websocket error, we might still be connected via polling
        // or it might be a temporary failure.
        if (socketRef.current?.connected) {
          setIsOnline(true);
        } else {
          setIsOnline(false);
        }
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log("Mất kết nối Socket.io:", reason);
        setIsOnline(false);
      });

      socketRef.current.on('remote-command', (data) => {
        handleRemoteCommand(data.command, data.payload);
        if (!connectedDevices.includes(data.sender)) {
          setConnectedDevices(prev => [...prev, data.sender]);
        }
      });
    } catch (e) {
      console.error("Lỗi khởi tạo Socket.io:", e);
    }

    return () => {
      clearInterval(timer);
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    const currentHHmm = format(currentTime, 'HH:mm');
    const currentDay = currentTime.getDay();

    schedules.forEach(schedule => {
      if (schedule.enabled && schedule.time === currentHHmm && schedule.days.includes(currentDay)) {
        if (playedSchedules[schedule.id] !== currentHHmm) {
          const audioFile = audioFiles.find(f => f.id === schedule.audioId);
          if (audioFile) {
            playAudio(audioFile);
            setPlayedSchedules(prev => ({ ...prev, [schedule.id]: currentHHmm }));
            addNotification(`Tự động phát theo lịch: ${schedule.label}`, 'success');
          }
        }
      }
    });
  }, [currentTime, schedules, audioFiles, playedSchedules]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // --- Audio Control ---

  const [youtubeId, setYoutubeId] = useState<string | null>(null);

  const getYoutubeId = (urlStr: string) => {
    try {
      const url = new URL(urlStr);
      if (url.hostname.includes('youtu.be')) {
        return url.pathname.slice(1).split(/[?#]/)[0];
      }
      if (url.hostname.includes('youtube.com')) {
        if (url.pathname.startsWith('/shorts/')) {
          return url.pathname.split('/')[2].split(/[?#]/)[0];
        }
        if (url.pathname.startsWith('/embed/')) {
          return url.pathname.split('/')[2].split(/[?#]/)[0];
        }
        if (url.pathname.startsWith('/live/')) {
          return url.pathname.split('/')[2].split(/[?#]/)[0];
        }
        if (url.pathname.startsWith('/v/')) {
          return url.pathname.split('/')[2].split(/[?#]/)[0];
        }
        return url.searchParams.get('v');
      }
    } catch (e) {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = urlStr.match(regExp);
      return (match && match[2].length === 11) ? match[2] : null;
    }
    return null;
  };

  const playAudio = (file: AudioFile) => {
    if (audioRef.current) {
      // Check if it's a YouTube link
      const videoId = getYoutubeId(file.url);
      
      if (videoId) {
        audioRef.current.pause(); // Stop any local audio
        setYoutubeId(videoId);
        setIsPlaying(true);
        setCurrentAudio(file);
        addNotification(`Đang phát YouTube: ${file.name}`, 'info');
        return; // Skip standard audio player
      } else if (file.url.includes('youtube.com') || file.url.includes('youtu.be')) {
        addNotification("Không thể nhận diện mã video YouTube. Hãy kiểm tra lại liên kết.", "error");
      }

      setYoutubeId(null);
      audioRef.current.src = file.url;
      audioRef.current.volume = volume / 100;
      audioRef.current.play().catch(error => {
        console.error("Lỗi phát âm thanh:", error);
        addNotification("Trình duyệt chặn tự động phát. Hãy nhấn nút Phát để bắt đầu.", "warning");
        setIsPlaying(false);
      });
      setCurrentAudio(file);
      setIsPlaying(true);
      addNotification(`Đang phát: ${file.name}`, 'info');
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentAudio(null);
      setYoutubeId(null);
    }
  };

  const handleRemoteCommand = (command: string, payload: any) => {
    switch (command) {
      case 'play':
        if (payload.fileId) {
          const file = audioFiles.find(f => f.id === payload.fileId);
          if (file) playAudio(file);
        }
        break;
      case 'stop':
        stopAudio();
        break;
      case 'emergency':
        triggerEmergency();
        break;
      case 'tts':
        handleTTS(payload.text, payload.voice, payload.speed || 1, payload.pitch || 1);
        break;
    }
  };

  const handleTTS = async (text: string, voice: string = 'Kore', speed: number = 1, pitch: number = 1) => {
    try {
      addNotification("Đang tạo giọng nói AI...", "info");
      const url = await generateSpeech(text, voice, speed);
      const newFile: AudioFile = {
        id: Date.now().toString(),
        name: `Thông báo: ${text.substring(0, 20)}...`,
        url,
        type: 'tts',
        createdAt: Date.now(),
      };
      setAudioFiles(prev => [newFile, ...prev]);
      playAudio(newFile);
    } catch (error) {
      addNotification("Lỗi tạo giọng nói AI", "error");
    }
  };

  const triggerEmergency = () => {
    setIsEmergency(true);
    stopAudio();
    // Play emergency sound or TTS
    const emergencyText = "THÔNG BÁO KHẨN CẤP. YÊU CẦU TOÀN TRƯỜNG TẬP TRUNG.";
    handleTTS(emergencyText, 'Puck', 1.2, 1);
    addNotification("CHẾ ĐỘ KHẨN CẤP ĐÃ KÍCH HOẠT", "error");
  };

  // --- Helpers ---

  const addNotification = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [{ id, message, type }, ...prev].slice(0, 5));
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const saveToStorage = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error("Lỗi lưu dữ liệu vào LocalStorage:", e);
      addNotification("Bộ nhớ trình duyệt đầy, không thể lưu dữ liệu.", "error");
    }
  };

  // --- Views ---

  const handleImportLink = () => {
    if (!remoteUrl.trim()) return;
    
    try {
      const videoId = getYoutubeId(remoteUrl);
      const url = new URL(remoteUrl);
      let name = `Liên kết: ${url.hostname}`;
      
      if (videoId) {
        name = `YouTube: ${videoId}`;
      } else if (remoteUrl.includes('tiktok.com')) {
        name = `TikTok: ${url.hostname}`;
      }

      const fileName = url.pathname.split('/').pop() || 'Âm thanh từ liên kết';
      if (fileName.includes('.') && !videoId && !remoteUrl.includes('tiktok')) {
        name = fileName;
      }
      
      const newFile: AudioFile = {
        id: Date.now().toString() + Math.random(),
        name: name,
        url: remoteUrl,
        type: 'remote',
        createdAt: Date.now()
      };
      
      setAudioFiles(prev => {
        const updated = [newFile, ...prev];
        saveToStorage('audioFiles', updated);
        return updated;
      });
      
      setRemoteUrl('');
      playAudio(newFile);
    } catch (e) {
      addNotification("Liên kết không hợp lệ", "error");
    }
  };

  const renderHome = () => (
    <div className="space-y-6">
      {/* Live Broadcast Player */}
      {isPlaying && (currentAudio?.type === 'remote' || youtubeId) && (
        <Card title="Đang phát trực tiếp" icon={Radio} className="border-zinc-900 dark:border-zinc-100 ring-2 ring-zinc-900/10 dark:ring-zinc-100/10">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/2 aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center relative group">
              {youtubeId ? (
                <iframe 
                  key={youtubeId}
                  className="w-full h-full"
                  src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&controls=1&rel=0&mute=0&enablejsapi=1&playsinline=1`} 
                  allow="autoplay; encrypted-media; picture-in-picture" 
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  title="YouTube Player"
                />
              ) : (
                <div className="text-center p-8">
                  <Radio size={48} className="mx-auto mb-4 text-zinc-700 animate-pulse" />
                  <p className="text-zinc-400 text-sm">Đang phát âm thanh từ liên kết...</p>
                  <p className="text-zinc-500 text-xs mt-2 truncate max-w-xs mx-auto">{currentAudio?.url}</p>
                </div>
              )}
              {youtubeId && (
                <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm text-[8px] text-white/70 px-1.5 py-0.5 rounded">
                  Nếu không có tiếng, hãy nhấn vào video
                </div>
              )}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
                <span className="text-[10px] font-bold text-white uppercase tracking-widest bg-red-500 px-2 py-0.5 rounded shadow-lg">LIVE</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <div className="mb-4">
                <h3 className="text-xl font-bold mb-1">{currentAudio?.name}</h3>
                <div className="flex items-center gap-2">
                  <p className="text-zinc-500 text-sm flex items-center gap-2 truncate flex-1">
                    <LinkIcon size={14} />
                    <span className="truncate">{currentAudio?.url}</span>
                  </p>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs h-7" 
                    onClick={() => window.open(currentAudio?.url, '_blank')}
                  >
                    Mở link gốc
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button variant="secondary" icon={Square} onClick={stopAudio}>Dừng phát</Button>
                {youtubeId && (
                  <Button variant="outline" icon={RefreshCw} onClick={() => {
                    const currentId = youtubeId;
                    setYoutubeId(null);
                    setTimeout(() => setYoutubeId(currentId), 100);
                  }}>Phát lại</Button>
                )}
                <div className="flex-1 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-900 dark:bg-zinc-100 w-1/3 animate-progress"></div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 text-white border-none">
          <div className="flex flex-col items-center justify-center py-4">
            <Clock size={48} className="mb-2 text-zinc-400" />
            <div className="text-4xl font-bold tracking-tighter">
              {format(currentTime, 'HH:mm:ss')}
            </div>
            <div className="text-zinc-400 text-sm mt-1">
              {format(currentTime, 'EEEE, dd/MM/yyyy')}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-center">
          <div className="flex items-center gap-4">
            <div className={cn("p-3 rounded-full", isOnline ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600")}>
              {isOnline ? <Wifi size={24} /> : <WifiOff size={24} />}
            </div>
            <div>
              <div className="text-sm text-zinc-500">Trạng thái hệ thống</div>
              <div className="font-bold">{isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}</div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-center">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <Calendar size={24} />
            </div>
            <div>
              <div className="text-sm text-zinc-500">Lịch hôm nay</div>
              <div className="font-bold">{schedules.filter(s => s.enabled).length} lịch phát</div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-center">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-purple-100 text-purple-600">
              <Smartphone size={24} />
            </div>
            <div>
              <div className="text-sm text-zinc-500">Điều khiển từ xa</div>
              <div className="font-bold">{connectedDevices.length} thiết bị</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Hành động nhanh" icon={Zap}>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <Button variant="primary" className="flex-col h-24" onClick={() => {
                if (audioFiles.length > 0) playAudio(audioFiles[0]);
                else addNotification("Thư viện trống. Hãy tải lên âm thanh trước.", "warning");
              }}>
                <Play size={24} />
                <span>Phát ngay</span>
              </Button>
              <Button variant="outline" className="flex-col h-24" onClick={() => setActiveTab('schedule')}>
                <Plus size={24} />
                <span>Tạo lịch</span>
              </Button>
              <Button variant="outline" className="flex-col h-24" onClick={() => setActiveTab('ai')}>
                <Mic size={24} />
                <span>MC AI</span>
              </Button>
              <Button variant="outline" className="flex-col h-24" onClick={() => setActiveTab('library')}>
                <Library size={24} />
                <span>Thư viện</span>
              </Button>
              <Button variant="danger" className="flex-col h-24" onClick={triggerEmergency}>
                <AlertCircle size={24} />
                <span>KHẨN CẤP</span>
              </Button>
            </div>
          </Card>

          <Card title="Lịch phát sóng tiếp theo" icon={Clock}>
            <div className="space-y-4">
              {schedules.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 italic">
                  Chưa có lịch phát sóng nào được thiết lập.
                </div>
              ) : (
                schedules
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .slice(0, 5)
                  .map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-4">
                        <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{s.time}</div>
                        <div>
                          <div className="font-medium">{s.label}</div>
                          <div className="text-xs text-zinc-500">
                            {audioFiles.find(f => f.id === s.audioId)?.name || 'Âm thanh đã bị xóa'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.enabled ? (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wider">Sẵn sàng</span>
                        ) : (
                          <span className="px-2 py-1 bg-zinc-200 text-zinc-600 text-[10px] font-bold rounded-full uppercase tracking-wider">Tắt</span>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Đang phát" icon={Play}>
            {isPlaying && currentAudio ? (
              <div className="text-center space-y-4">
                <div className="w-20 h-20 mx-auto bg-zinc-900 dark:bg-zinc-100 rounded-full flex items-center justify-center animate-pulse">
                  <Volume2 size={32} className="text-white dark:text-zinc-900" />
                </div>
                <div>
                  <div className="font-bold text-lg truncate px-4">{currentAudio.name}</div>
                  <div className="text-sm text-zinc-500">Đang phát trực tiếp...</div>
                </div>
                <div className="flex justify-center gap-4">
                  <Button variant="secondary" size="sm" icon={Pause} onClick={() => setIsPlaying(false)}>Tạm dừng</Button>
                  <Button variant="danger" size="sm" icon={Square} onClick={stopAudio}>Dừng</Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-zinc-400">
                <div className="mb-2 flex justify-center"><Square size={48} opacity={0.2} /></div>
                <p>Hệ thống đang ở trạng thái chờ</p>
              </div>
            )}
          </Card>

          <Card title="Thông báo hệ thống" icon={Bell}>
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <p className="text-sm text-zinc-500 italic">Không có thông báo mới.</p>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className={cn(
                    "p-3 rounded-xl text-sm border",
                    n.type === 'info' && "bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400",
                    n.type === 'success' && "bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400",
                    n.type === 'warning' && "bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400",
                    n.type === 'error' && "bg-red-50 border-red-100 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400",
                  )}>
                    {n.message}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderSchedule = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Lịch phát sóng</h2>
          {!editingScheduleId ? (
            <Button icon={Plus} onClick={() => {
              setNewSchedule({
                time: '08:00',
                label: '',
                section: 'morning',
                enabled: true,
                days: [1, 2, 3, 4, 5]
              });
            }}>Thêm lịch mới</Button>
          ) : (
            <Button variant="outline" icon={Plus} onClick={cancelEdit}>Quay lại thêm mới</Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title={editingScheduleId ? "Chỉnh sửa lịch phát" : "Thêm lịch phát"} className="lg:col-span-1">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Tên lịch phát</label>
                <Input placeholder="Ví dụ: Chào buổi sáng" value={newSchedule.label} onChange={e => setNewSchedule({...newSchedule, label: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Thời gian (24h)</label>
                <Input type="time" value={newSchedule.time} onChange={e => setNewSchedule({...newSchedule, time: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Chọn âm thanh</label>
                <div className="flex gap-2">
                  <Select className="flex-1" value={newSchedule.audioId} onChange={e => setNewSchedule({...newSchedule, audioId: e.target.value})}>
                    <option value="">-- Chọn âm thanh --</option>
                    {audioFiles.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </Select>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    icon={Upload} 
                    title="Tải lên âm thanh mới"
                    onClick={() => document.getElementById('schedule-audio-upload')?.click()} 
                  />
                  <input 
                    id="schedule-audio-upload" 
                    type="file" 
                    accept="audio/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const newFile: AudioFile = {
                            id: Date.now().toString(),
                            name: file.name,
                            url: reader.result as string,
                            type: 'local',
                            createdAt: Date.now()
                          };
                          setAudioFiles(prev => {
                            const updated = [newFile, ...prev];
                            saveToStorage('audioFiles', updated);
                            return updated;
                          });
                          setNewSchedule(prev => ({ ...prev, audioId: newFile.id }));
                          addNotification(`Đã tải lên và chọn: ${file.name}`, 'success');
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 mt-4" onClick={addSchedule}>
                  {editingScheduleId ? "Cập nhật lịch" : "Lưu lịch phát"}
                </Button>
                {editingScheduleId && (
                  <Button variant="outline" className="mt-4" onClick={cancelEdit}>Hủy</Button>
                )}
              </div>
            </div>
          </Card>

          <div className="lg:col-span-2 space-y-6">
            <Card title="Buổi sáng (00:00 - 12:00)">
              <div className="space-y-2">
                {schedules.filter(s => s.section === 'morning').length === 0 ? (
                  <p className="text-center py-4 text-zinc-500 italic">Chưa có lịch phát buổi sáng.</p>
                ) : (
                  schedules.filter(s => s.section === 'morning').sort((a, b) => a.time.localeCompare(b.time)).map(s => (
                    <div key={s.id} className={cn(
                      "flex items-center justify-between p-4 rounded-xl border transition-colors",
                      editingScheduleId === s.id 
                        ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800/50" 
                        : "border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    )}>
                      <div className="flex items-center gap-4">
                        <div className="text-xl font-bold">{s.time}</div>
                        <div>
                          <div className="font-semibold">{s.label}</div>
                          <div className="text-sm text-zinc-500">{audioFiles.find(f => f.id === s.audioId)?.name}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" icon={Play} onClick={() => {
                          const file = audioFiles.find(f => f.id === s.audioId);
                          if (file) playAudio(file);
                          else addNotification("Không tìm thấy file âm thanh", "error");
                        }} />
                        <Button variant="ghost" size="sm" icon={Edit2} onClick={() => editSchedule(s)} />
                        <Button variant="ghost" size="sm" icon={Trash2} className="text-red-500" onClick={() => deleteSchedule(s.id)} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card title="Buổi chiều (12:00 - 23:59)">
              <div className="space-y-2">
                {schedules.filter(s => s.section === 'afternoon').length === 0 ? (
                  <p className="text-center py-4 text-zinc-500 italic">Chưa có lịch phát buổi chiều.</p>
                ) : (
                  schedules.filter(s => s.section === 'afternoon').sort((a, b) => a.time.localeCompare(b.time)).map(s => (
                    <div key={s.id} className={cn(
                      "flex items-center justify-between p-4 rounded-xl border transition-colors",
                      editingScheduleId === s.id 
                        ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800/50" 
                        : "border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    )}>
                      <div className="flex items-center gap-4">
                        <div className="text-xl font-bold">{s.time}</div>
                        <div>
                          <div className="font-semibold">{s.label}</div>
                          <div className="text-sm text-zinc-500">{audioFiles.find(f => f.id === s.audioId)?.name}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" icon={Play} onClick={() => {
                          const file = audioFiles.find(f => f.id === s.audioId);
                          if (file) playAudio(file);
                          else addNotification("Không tìm thấy file âm thanh", "error");
                        }} />
                        <Button variant="ghost" size="sm" icon={Edit2} onClick={() => editSchedule(s)} />
                        <Button variant="ghost" size="sm" icon={Trash2} className="text-red-500" onClick={() => deleteSchedule(s.id)} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  const renderAI = () => {
    const onGenerate = async () => {
      if (!announcementText.trim()) return;
      try {
        await handleTTS(announcementText, selectedVoice, aiSpeed, aiPitch);
        const newAnn: Announcement = {
          id: Date.now().toString(),
          text: announcementText,
          voice: selectedVoice,
          speed: aiSpeed,
          pitch: aiPitch,
          createdAt: Date.now()
        };
        const updated = [newAnn, ...announcements];
        setAnnouncements(updated);
        saveToStorage('announcements', updated);
      } catch (e) {
        console.error("Lỗi tạo thông báo AI:", e);
        addNotification("Không thể tạo thông báo AI.", "error");
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">MC AI Đọc Thông Báo</h2>
          <div className="flex gap-2">
            <Button variant="outline" icon={History}>Lịch sử</Button>
            <Button variant="outline" icon={Upload}>Tải lên văn bản</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title="Soạn thảo thông báo" className="lg:col-span-2">
            <div className="space-y-4">
              <div className="relative">
                <textarea 
                  className="w-full h-64 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-all text-zinc-900 dark:text-zinc-100 resize-none"
                  placeholder="Nhập nội dung thông báo tại đây..."
                  value={announcementText}
                  onChange={e => setAnnouncementText(e.target.value)}
                />
                <div className="absolute bottom-4 right-4 text-xs text-zinc-400">
                  {announcementText.length} kí tự
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <Button variant="primary" size="lg" icon={Mic} onClick={onGenerate} disabled={!announcementText.trim()}>Phát ngay với AI</Button>
                <Button variant="secondary" size="lg" icon={Play} onClick={onGenerate} disabled={!announcementText.trim()}>Nghe thử</Button>
                <Button variant="outline" size="lg" icon={X} onClick={() => setAnnouncementText('')}>Xóa trắng</Button>
              </div>
            </div>
          </Card>

          <Card title="Cài đặt giọng đọc">
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-2 block">Chọn giọng đọc</label>
                <Select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}>
                  {VOICES.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block flex justify-between">
                  <span>Tốc độ đọc</span>
                  <span className="text-zinc-500">{aiSpeed}x</span>
                </label>
                <input type="range" min="0.5" max="2" step="0.1" value={aiSpeed} onChange={e => setAiSpeed(parseFloat(e.target.value))} className="w-full accent-zinc-900 dark:accent-zinc-100" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block flex justify-between">
                  <span>Cao độ</span>
                  <span className="text-zinc-500">{aiPitch}x</span>
                </label>
                <input type="range" min="0.5" max="1.5" step="0.1" value={aiPitch} onChange={e => setAiPitch(parseFloat(e.target.value))} className="w-full accent-zinc-900 dark:accent-zinc-100" />
              </div>
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
                <AlertCircle size={14} className="inline mr-1 mb-0.5" />
                Giọng đọc "Nữ - Miền Bắc" được khuyên dùng cho các thông báo chính thức của trường.
              </div>
            </div>
          </Card>
        </div>

        <Card title="Lịch sử thông báo gần đây" icon={History}>
          <div className="space-y-3">
            {announcements.length === 0 ? (
              <p className="text-center py-4 text-zinc-500 italic">Chưa có lịch sử thông báo.</p>
            ) : (
              announcements.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="font-medium truncate">{a.text}</div>
                    <div className="text-xs text-zinc-500">{format(a.createdAt, 'HH:mm - dd/MM/yyyy')} • {VOICES.find(v => v.id === a.voice)?.name}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" icon={Play} onClick={() => handleTTS(a.text, a.voice)} />
                    <Button variant="ghost" size="sm" icon={Trash2} className="text-red-500" onClick={() => {
                      const updated = announcements.filter(item => item.id !== a.id);
                      setAnnouncements(updated);
                      saveToStorage('announcements', updated);
                    }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    );
  };

  const renderLibrary = () => {
    const deleteFile = (id: string) => {
      const updated = audioFiles.filter(f => f.id !== id);
      setAudioFiles(updated);
      saveToStorage('audioFiles', updated);
    };

    const filteredFiles = audioFiles.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Thư viện âm thanh</h2>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <Input 
                className="pl-10 w-64" 
                placeholder="Tìm kiếm âm thanh..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card title="Danh sách âm thanh" icon={Library}>
              <div className="space-y-2">
                {filteredFiles.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 italic">
                    {searchQuery ? 'Không tìm thấy kết quả phù hợp.' : 'Thư viện trống. Hãy tải lên âm thanh đầu tiên.'}
                  </div>
                ) : (
                  filteredFiles.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={cn(
                          "p-2 rounded-lg",
                          f.type === 'local' ? "bg-blue-100 text-blue-600" : 
                          f.type === 'tts' ? "bg-purple-100 text-purple-600" : "bg-orange-100 text-orange-600"
                        )}>
                          {f.type === 'local' ? <Upload size={18} /> : f.type === 'tts' ? <Mic size={18} /> : <LinkIcon size={18} />}
                        </div>
                        <div className="truncate">
                          <div className="font-medium truncate">{f.name}</div>
                          <div className="text-xs text-zinc-500 uppercase tracking-wider">{f.type} • {format(f.createdAt, 'dd/MM/yyyy')}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" icon={Play} onClick={() => playAudio(f)} />
                        {f.type === 'remote' && (
                          <Button variant="ghost" size="sm" icon={LinkIcon} onClick={() => window.open(f.url, '_blank')} />
                        )}
                        <Button variant="ghost" size="sm" icon={Download} />
                        <Button variant="ghost" size="sm" icon={Trash2} className="text-red-500" onClick={() => deleteFile(f.id)} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <div {...getRootProps()} className={cn(
              "p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all",
              isDragActive ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
            )}>
              <input {...getInputProps()} />
              <Upload size={48} className="mx-auto mb-4 text-zinc-300" />
              <p className="font-medium">Kéo thả file âm thanh</p>
              <p className="text-sm text-zinc-500 mt-1">Hoặc click để chọn từ máy tính</p>
              <p className="text-xs text-zinc-400 mt-4">Hỗ trợ MP3, WAV, M4A</p>
            </div>

            <Card title="Nhập từ liên kết" icon={LinkIcon}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">Hỗ trợ YouTube, TikTok, Facebook...</p>
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Hỗ trợ phát trực tiếp</span>
                </div>
                <Input 
                  placeholder="Dán link tại đây..." 
                  value={remoteUrl}
                  onChange={e => setRemoteUrl(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    className="w-full" 
                    variant="outline" 
                    disabled={!remoteUrl}
                    onClick={() => {
                      handleImportLink();
                    }}
                  >
                    Lưu & Phát
                  </Button>
                  <Button 
                    className="w-full" 
                    variant="secondary" 
                    disabled={!remoteUrl}
                    onClick={() => {
                      // Play without saving
                      const url = new URL(remoteUrl);
                      const tempFile: AudioFile = {
                        id: 'temp-' + Date.now(),
                        name: `Phát nhanh: ${url.hostname}`,
                        url: remoteUrl,
                        type: 'remote',
                        createdAt: Date.now()
                      };
                      playAudio(tempFile);
                      setRemoteUrl('');
                    }}
                  >
                    Phát ngay
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Cài đặt hệ thống</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Cấu hình âm thanh" icon={Volume2}>
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium mb-2 block flex justify-between">
                <span>Âm lượng mặc định</span>
                <span className="text-zinc-500">{volume}%</span>
              </label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={volume} 
                onChange={e => setVolume(parseInt(e.target.value))} 
                className="w-full accent-zinc-900 dark:accent-zinc-100" 
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Tự động phát lịch</div>
                <div className="text-xs text-zinc-500">Tự động phát khi đến giờ đã hẹn</div>
              </div>
              <div className="w-12 h-6 bg-zinc-900 rounded-full relative cursor-pointer">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Chuông báo trước phát</div>
                <div className="text-xs text-zinc-500">Phát âm thanh báo hiệu trước khi thông báo</div>
              </div>
              <div className="w-12 h-6 bg-zinc-200 rounded-full relative cursor-pointer">
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Giao diện & Ngôn ngữ" icon={Sun}>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Chế độ tối (Dark Mode)</div>
                <div className="text-xs text-zinc-500">Chuyển đổi giao diện sáng/tối</div>
              </div>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-colors",
                  isDarkMode ? "bg-zinc-100" : "bg-zinc-900"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 rounded-full transition-all",
                  isDarkMode ? "right-1 bg-zinc-900" : "left-1 bg-white"
                )}></div>
              </button>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Ngôn ngữ hệ thống</label>
              <Select>
                <option value="vi">Tiếng Việt (Mặc định)</option>
                <option value="en">English</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Múi giờ</label>
              <Select>
                <option value="Asia/Ho_Chi_Minh">(GMT+07:00) Bangkok, Hanoi, Jakarta</option>
              </Select>
            </div>
          </div>
        </Card>

        <Card title="Điều khiển từ xa" icon={Smartphone}>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-zinc-100">
              <QRCodeSVG value={`${window.location.origin}/remote?id=${remoteSessionId}`} size={160} />
            </div>
            <div>
              <div className="font-bold text-lg">Mã kết nối: {remoteSessionId}</div>
              <p className="text-sm text-zinc-500 mt-1">Quét mã QR để điều khiển hệ thống bằng điện thoại</p>
            </div>
            <div className="w-full pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <div className="text-sm font-medium mb-2 text-left">Thiết bị đang kết nối ({connectedDevices.length})</div>
              {connectedDevices.length === 0 ? (
                <p className="text-xs text-zinc-400 text-left italic">Chưa có thiết bị nào kết nối.</p>
              ) : (
                <div className="space-y-2">
                  {connectedDevices.map(id => (
                    <div key={id} className="flex items-center justify-between text-xs p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                      <span className="font-mono">{id}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-red-500">Ngắt</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card title="Hệ thống & Lưu trữ" icon={Settings}>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-500">Dung lượng đã dùng</span>
                <span className="font-medium">12.5 MB / 50 MB</span>
              </div>
              <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-900 dark:bg-zinc-100" style={{ width: '25%' }}></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="text-xs" icon={RefreshCw}>Đồng bộ dữ liệu</Button>
              <Button variant="outline" className="text-xs text-red-500" icon={Trash2}>Xóa bộ nhớ đệm</Button>
            </div>
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <div className="text-xs text-zinc-400 text-center">
                Smart School Radio AI v1.0.0<br />
                © 2026 AI Studio Build
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans transition-colors">
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
      
      {/* Hidden YouTube Player */}
      {youtubeId && isPlaying && (
        <div className="hidden">
          <iframe 
            width="0" 
            height="0" 
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&controls=0`} 
            allow="autoplay; encrypted-media" 
            title="YouTube Player"
          />
        </div>
      )}
      
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-20 lg:w-64 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-900 z-50 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 dark:bg-zinc-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="text-white dark:text-zinc-900" size={24} />
          </div>
          <div className="hidden lg:block font-bold text-lg tracking-tight leading-none">
            SMART SCHOOL<br />
            <span className="text-zinc-500 text-sm font-medium">RADIO AI</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {[
            { id: 'home', label: 'Trang chủ', icon: Clock },
            { id: 'schedule', label: 'Lịch phát', icon: Calendar },
            { id: 'ai', label: 'MC AI', icon: Mic },
            { id: 'library', label: 'Thư viện', icon: Library },
            { id: 'settings', label: 'Cài đặt', icon: Settings },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "w-full flex items-center gap-4 p-3 rounded-xl transition-all group",
                activeTab === item.id 
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-lg shadow-zinc-900/10" 
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              )}
            >
              <item.icon size={22} />
              <span className="hidden lg:block font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4">
          <Button 
            variant="danger" 
            className={cn("w-full transition-all", isEmergency ? "animate-pulse" : "")} 
            icon={AlertCircle}
            onClick={triggerEmergency}
          >
            <span className="hidden lg:inline">KHẨN CẤP</span>
          </Button>
          <div className="hidden lg:block text-center mt-4 text-xs text-zinc-400 font-medium">
            Phát triển bởi CHU ĐỨC LỢI
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-20 lg:ml-64 p-4 lg:p-10 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'home' && renderHome()}
            {activeTab === 'schedule' && renderSchedule()}
            {activeTab === 'ai' && renderAI()}
            {activeTab === 'library' && renderLibrary()}
            {activeTab === 'settings' && renderSettings()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Player Bar (Floating) */}
      {isPlaying && currentAudio && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-4 z-50 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 bg-zinc-900 dark:bg-zinc-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Volume2 className="text-white dark:text-zinc-900" size={24} />
            </div>
            <div className="truncate">
              <div className="font-bold truncate">{currentAudio.name}</div>
              <div className="text-xs text-zinc-500 flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                ĐANG PHÁT TRỰC TIẾP
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 w-32">
              <Volume2 size={18} className="text-zinc-400" />
              <input type="range" min="0" max="100" value={volume} onChange={e => setVolume(parseInt(e.target.value))} className="w-full accent-zinc-900 dark:accent-zinc-100 h-1" />
            </div>
            <Button variant="secondary" size="sm" icon={Pause} onClick={() => setIsPlaying(false)}>Tạm dừng</Button>
            <Button variant="danger" size="sm" icon={Square} onClick={stopAudio}>Dừng</Button>
          </div>
        </div>
      )}

      {/* Emergency Overlay */}
      {isEmergency && (
        <div className="fixed inset-0 bg-red-600/90 backdrop-blur-md z-[100] flex flex-col items-center justify-center text-white p-6 text-center">
          <AlertCircle size={120} className="mb-8 animate-bounce" />
          <h1 className="text-6xl font-black mb-4 tracking-tighter">CHẾ ĐỘ KHẨN CẤP</h1>
          <p className="text-2xl font-medium mb-12 max-w-2xl">
            Tất cả lịch phát sóng đã bị tạm dừng. Thông báo khẩn cấp đang được phát.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12 w-full max-w-2xl">
            <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => handleTTS("Tập trung toàn trường ngay lập tức", "Puck")}>Tập trung toàn trường</Button>
            <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => handleTTS("Có sự cố khẩn cấp, yêu cầu giữ bình tĩnh", "Puck")}>Sự cố khẩn cấp</Button>
            <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => handleTTS("Di tản khẩn cấp theo lối thoát hiểm", "Puck")}>Di tản khẩn cấp</Button>
            <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => handleTTS("Kết thúc chế độ khẩn cấp", "Puck")}>Kết thúc sự cố</Button>
          </div>
          <Button 
            variant="secondary" 
            size="lg" 
            className="bg-white text-red-600 hover:bg-zinc-100 text-xl px-12 py-6 rounded-2xl"
            onClick={() => setIsEmergency(false)}
          >
            Tắt chế độ khẩn cấp
          </Button>
        </div>
      )}
    </div>
  );
}
