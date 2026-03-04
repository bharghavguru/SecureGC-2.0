import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Lock, 
  Users, 
  MessageSquare, 
  Plus, 
  ArrowRight, 
  Copy, 
  Check, 
  LogOut, 
  Send, 
  Info,
  Terminal,
  Cpu,
  Zap,
  Menu,
  X,
  Moon,
  Sun,
  Github
} from 'lucide-react';
import { cn, formatDate } from './lib/utils';
import { 
  generateRoomKey, 
  exportKey, 
  importKey, 
  deriveKeyFromPassword, 
  encryptData, 
  decryptData, 
  hashPassword 
} from './lib/crypto';
import { View, User, Message, RoomInfo } from './types';
import { FallingPattern } from "@/src/components/ui/falling-pattern";
import { 
  Navbar, 
  NavBody, 
  NavbarLogo, 
  MobileNav, 
  MobileNavHeader,
  NavbarButton
} from "@/src/components/ui/resizable-navbar";

function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative w-10 h-10 flex items-center justify-center">
        <div className="absolute inset-0 bg-accent rounded-xl rotate-6 opacity-20 animate-pulse" />
        <div className="absolute inset-0 bg-accent rounded-xl -rotate-3 opacity-20" />
        <div className="relative w-8 h-8 bg-accent rounded-lg flex items-center justify-center glow-blue shadow-lg shadow-accent/20">
          <Shield className="w-5 h-5 text-white" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
        </div>
      </div>
      <span className="font-bold text-xl tracking-tighter text-foreground dark:text-white">
        SECURE<span className="text-accent">GC</span>
      </span>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [roomClosedBy, setRoomClosedBy] = useState<string | null>(null);

  const navItems = [
    { name: 'About', view: 'about' as View },
    { name: 'Portfolio', link: 'https://github.com/gurubharghav' }, // Informal link to portfolio
  ];

  const userIdRef = useRef<string | null>(null);
  const roomKeyRef = useRef<CryptoKey | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light';
    if (savedTheme) setTheme(savedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const handleCreateRoom = async (roomName: string, password?: string, username?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const masterKey = await generateRoomKey();
      const masterKeyStr = await exportKey(masterKey);
      
      let encryptedKey = masterKeyStr;
      let passHash = undefined;

      if (password) {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const passKey = await deriveKeyFromPassword(password, salt);
        encryptedKey = await encryptData(passKey, masterKeyStr);
        // Prepend salt to encrypted key
        encryptedKey = btoa(String.fromCharCode(...salt)) + ":" + encryptedKey;
        passHash = await hashPassword(password);
      }

      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName,
          passwordHash: passHash,
          encryptedKey,
          adminUsername: username
        })
      });

      const data = await res.json();
      setRoom({ id: data.roomId, name: roomName, password });
      setUser({ id: '', username: username || 'Admin' });
      roomKeyRef.current = masterKey;
      setView('success');
    } catch (err) {
      setError('Failed to create room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async (roomId: string, username: string, password?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (!res.ok) throw new Error('Room not found');
      const roomData = await res.json();

      let masterKey: CryptoKey;
      let passHash = undefined;

      if (roomData.hasPassword) {
        if (!password) throw new Error('Password required');
        const [saltB64, encryptedKey] = roomData.encryptedKey.split(':');
        const salt = new Uint8Array(atob(saltB64).split('').map(c => c.charCodeAt(0)));
        const passKey = await deriveKeyFromPassword(password, salt);
        const masterKeyStr = await decryptData(passKey, encryptedKey);
        masterKey = await importKey(masterKeyStr);
        passHash = await hashPassword(password);
      } else {
        masterKey = await importKey(roomData.encryptedKey);
      }

      roomKeyRef.current = masterKey;
      setRoom({ id: roomId, name: roomData.name });
      setUser({ id: '', username });
      connectWebSocket(roomId, username, passHash);
    } catch (err: any) {
      setError(err.message || 'Failed to join room.');
    } finally {
      setIsLoading(false);
    }
  };

  const connectWebSocket = (roomId: string, username: string, passwordHash?: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId, username, passwordHash }));
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'init':
          userIdRef.current = data.userId;
          setUser(prev => prev ? { ...prev, id: data.userId } : { id: data.userId, username: 'Unknown' });
          setIsAdmin(data.isAdmin);
          break;
        case 'user_joined':
          setMembers(data.members);
          if (userIdRef.current) {
            setIsAdmin(data.adminId === userIdRef.current);
          }
          setMessages(prev => [...prev, {
            id: Math.random().toString(),
            userId: 'system',
            username: 'System',
            content: `${data.username} joined the chat`,
            timestamp: data.timestamp,
            type: 'system'
          }]);
          setView('chat');
          break;
        case 'user_left':
          setMembers(data.members);
          if (userIdRef.current) {
            setIsAdmin(data.newAdminId === userIdRef.current);
          }
          const leaveMsg = data.wasAdmin ? `Admin (${data.username}) left. A new admin has been assigned.` : `${data.username} left the chat`;
          
          alert(leaveMsg);

          setMessages(prev => [...prev, {
            id: Math.random().toString(),
            userId: 'system',
            username: 'System',
            content: leaveMsg,
            timestamp: data.timestamp,
            type: 'system'
          }]);
          break;
        case 'chat':
          if (roomKeyRef.current) {
            const decrypted = await decryptData(roomKeyRef.current, data.content);
            setMessages(prev => [...prev, {
              id: Math.random().toString(),
              userId: data.userId,
              username: data.username,
              content: decrypted,
              timestamp: data.timestamp,
              type: 'chat'
            }]);
          }
          break;
        case 'room_closed':
          setRoomClosedBy(data.adminUsername);
          setMessages(prev => [...prev, {
            id: Math.random().toString(),
            userId: 'system',
            username: 'System',
            content: `Room closed by ${data.adminUsername}.`,
            timestamp: Date.now(),
            type: 'system'
          }]);
          break;
        case 'error':
          setError(data.message);
          ws.close();
          break;
      }
    };

    ws.onclose = () => {
      setSocket(null);
    };

    setSocket(ws);
  };

  const sendMessage = async (content: string) => {
    if (!socket || !roomKeyRef.current || !content.trim()) return;
    const ciphertext = await encryptData(roomKeyRef.current, content);
    socket.send(JSON.stringify({ type: 'chat', content: ciphertext }));
  };

  const closeRoom = () => {
    if (socket && isAdmin) {
      socket.send(JSON.stringify({ type: 'close_room' }));
    }
  };

  const leaveRoom = () => {
    if (socket) socket.close();
    window.location.reload();
  };

  const handleEnterCreatedRoom = async () => {
    if (!room || !user) return;
    setIsLoading(true);
    try {
      let passHash = undefined;
      if (room.password) {
        passHash = await hashPassword(room.password);
      }
      connectWebSocket(room.id, user.username, passHash);
    } catch (err) {
      setError('Failed to enter room.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {view === 'home' && (
        <FallingPattern 
          className="fixed inset-0 z-0 pointer-events-none h-screen [mask-image:radial-gradient(ellipse_at_center,transparent,var(--background))]" 
          duration={200}
        />
      )}
      {/* Header */}
      {(view === 'home' || view === 'about') && (
        <Navbar>
          <NavBody>
            <NavbarLogo>
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
                <Logo />
              </div>
            </NavbarLogo>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden md:flex items-center gap-2 mr-2">
                {navItems.map((item) => (
                  <NavbarButton 
                    key={item.name} 
                    href={item.link}
                    onClick={item.view ? () => setView(item.view!) : undefined}
                    variant="secondary"
                    className="px-4 py-2 h-auto text-sm uppercase tracking-wider font-bold"
                  >
                    {item.name}
                  </NavbarButton>
                ))}
              </div>
              {view === 'chat' && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                  <span className="text-xs font-mono text-foreground/50 dark:text-white/50 uppercase tracking-widest hidden sm:inline">Connected</span>
                </div>
              )}
            </div>
          </NavBody>

          <MobileNav>
            <MobileNavHeader>
              <NavbarLogo>
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
                  <Logo className="scale-90 origin-left" />
                </div>
              </NavbarLogo>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 mr-1">
                  {navItems.map((item) => (
                    <NavbarButton 
                      key={item.name} 
                      href={item.link}
                      onClick={item.view ? () => setView(item.view!) : undefined}
                      variant="secondary"
                      className="px-4 py-2 h-auto text-base uppercase tracking-wider font-bold !text-black dark:!text-white"
                    >
                      {item.name}
                    </NavbarButton>
                  ))}
                </div>
              </div>
            </MobileNavHeader>
          </MobileNav>
        </Navbar>
      )}

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <AnimatePresence mode="wait">
          {view === 'home' && <HomeView setView={setView} />}
          {view === 'about' && <AboutView onBack={() => setView('home')} />}
          {view === 'create' && <CreateView onBack={() => setView('home')} onCreate={handleCreateRoom} isLoading={isLoading} />}
          {view === 'join' && <JoinView onBack={() => setView('home')} onJoin={handleJoinRoom} isLoading={isLoading} error={error} />}
          {view === 'success' && <SuccessView room={room!} onEnter={handleEnterCreatedRoom} isLoading={isLoading} />}
          {view === 'chat' && (
            <ChatView 
              room={room!} 
              user={user!} 
              messages={messages} 
              members={members} 
              onSend={sendMessage} 
              onLeave={leaveRoom}
              onClose={() => setShowCloseConfirm(true)}
              isAdmin={isAdmin}
              isSidebarOpen={isSidebarOpen}
              setIsSidebarOpen={setIsSidebarOpen}
              scrollRef={scrollRef}
            />
          )}
        </AnimatePresence>

        {/* Modals & Overlays */}
        <AnimatePresence>
          {showCloseConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowCloseConfirm(false)}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md glass p-8 rounded-3xl shadow-2xl"
              >
                <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center mb-6">
                  <X className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Close Room?</h3>
                <p className="text-foreground/50 dark:text-white/50 mb-8">
                  This will disconnect all users and permanently delete all messages. This action cannot be undone.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => {
                      closeRoom();
                      setShowCloseConfirm(false);
                    }}
                    className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all"
                  >
                    Yes, Close Room
                  </button>
                  <button 
                    onClick={() => setShowCloseConfirm(false)}
                    className="flex-1 py-3 glass font-bold rounded-xl hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {roomClosedBy && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-background/95 backdrop-blur-xl"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative w-full max-w-md text-center"
              >
                <div className="w-20 h-20 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-8 glow-blue">
                  <Shield className="w-10 h-10 text-accent" />
                </div>
                <h2 className="text-4xl font-bold mb-4 tracking-tighter">Room Closed</h2>
                <p className="text-xl text-foreground/60 dark:text-white/60 mb-12">
                  The room has been closed by <span className="text-foreground dark:text-white font-bold">{roomClosedBy}</span>. 
                  All ephemeral data has been wiped.
                </p>
                <button 
                  onClick={() => window.location.reload()}
                  className="w-full py-4 bg-accent text-white dark:bg-white dark:text-black font-bold rounded-2xl hover:opacity-90 transition-all shadow-xl"
                >
                  Return to Home
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-Views ---

function HomeView({ setView }: { setView: (v: View) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto px-6 py-12 sm:py-24 text-center relative z-10"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium mb-8"
      >
        <Lock className="w-3 h-3" />
        <span>End-to-End Encrypted & Ephemeral</span>
      </motion.div>
      
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tighter mb-6 leading-tight !text-black dark:!text-white">
          Privacy is not an option. <br />
          <span className="!text-black/50 dark:!text-white/40">It's the standard.</span>
        </h1>
        
        <p className="text-lg !text-black dark:!text-white/90 mb-12 max-w-2xl mx-auto font-medium">
          Zero-knowledge group chat. No logs, no tracking, no permanent storage. 
          Your messages are encrypted in your browser and destroyed the moment you leave.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-24">
          <button 
            onClick={() => setView('create')}
            className="w-full sm:w-auto px-8 py-4 bg-accent text-white dark:bg-white dark:text-black font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 group shadow-lg shadow-accent/20 dark:shadow-none"
          >
            <Plus className="w-5 h-5" />
            Create Secure Room
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <button 
            onClick={() => setView('join')}
            className="w-full sm:w-auto px-8 py-4 glass font-bold rounded-xl hover:bg-white/10 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-2"
          >
            <Users className="w-5 h-5" />
            Join Existing Room
          </button>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        <FeatureCard 
          icon={<Terminal className="w-6 h-6 text-accent" />}
          title="Zero-Knowledge"
          description="The server only relays ciphertext. It never sees your keys or your plain-text messages."
        />
        <FeatureCard 
          icon={<Cpu className="w-6 h-6 text-accent" />}
          title="Web Crypto API"
          description="Uses industry-standard AES-GCM 256-bit encryption natively in your browser."
        />
        <FeatureCard 
          icon={<Zap className="w-6 h-6 text-accent" />}
          title="Ephemeral"
          description="All data is stored in-memory. Once the room is closed, every trace is wiped forever."
        />
      </div>

      <div className="mt-24 pt-24 border-t border-white/10 text-left">
        <h2 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Info className="w-8 h-8 text-accent" />
          Technical Deep Dive
        </h2>
        <div className="space-y-8 font-mono text-sm !text-black/50 dark:!text-white/50">
          <div className="p-6 glass rounded-2xl">
            <h3 className="!text-black dark:!text-white font-bold mb-2">1. Key Generation</h3>
            <p>Upon creation, a high-entropy 256-bit AES-GCM key is generated locally using window.crypto.subtle. This key never leaves your device in plain text.</p>
          </div>
          <div className="p-6 glass rounded-2xl">
            <h3 className="!text-black dark:!text-white font-bold mb-2">2. Password Derivation</h3>
            <p>If a password is set, we use PBKDF2 with 100,000 iterations and a unique salt to derive a key-encryption-key (KEK). The room key is then encrypted with this KEK before being sent to the relay server.</p>
          </div>
          <div className="p-6 glass rounded-2xl">
            <h3 className="!text-black dark:!text-white font-bold mb-2">3. Blind Relay Architecture</h3>
            <p>The server acts as a simple WebSocket broadcaster. It receives encrypted payloads and sends them to all members of the room. It has no capability to decrypt the content.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AboutView({ onBack }: { onBack: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-3xl mx-auto w-full px-6 py-12 sm:py-24"
    >
      <div className="glass p-8 sm:p-12 rounded-[2.5rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        
        <button 
          onClick={onBack}
          className="mb-8 flex items-center gap-2 text-sm font-bold text-accent hover:underline"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          Back to Home
        </button>

        <h2 className="text-4xl sm:text-6xl font-bold tracking-tighter mb-8 !text-black dark:!text-white">
          Hey, I'm <span className="text-accent">Gurubharghav</span>.
        </h2>

        <div className="space-y-6 text-lg !text-black/70 dark:!text-white/70 leading-relaxed">
          <p>
            Welcome to <span className="font-bold text-foreground dark:text-white">SecureGC</span>! 
            I built this project because I'm deeply passionate about digital privacy and personal security. 
            In a world where everything we say is logged, tracked, and sold, I wanted to create a space that's the exact opposite.
          </p>

          <p>
            Think of this as a digital "cone of silence." I used the <span className="font-mono text-accent text-base">Web Crypto API</span> to make sure that your messages are encrypted right in your browser. 
            The server? It's just a blind messenger. It passes along the scrambled data but has absolutely no clue what you're actually saying.
          </p>

          <div className="p-6 bg-accent/5 border border-accent/10 rounded-2xl my-8">
            <h3 className="text-xl font-bold mb-3 !text-black dark:!text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              The "Vibe" of this Project
            </h3>
            <ul className="space-y-3 text-base">
              <li className="flex gap-3">
                <span className="text-accent font-bold">01.</span>
                <span><span className="font-bold">Ephemeral:</span> Everything lives in RAM. Close the room, and it's gone. Poof.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-accent font-bold">02.</span>
                <span><span className="font-bold">Zero-Knowledge:</span> I don't want your data. I don't even have a database for messages.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-accent font-bold">03.</span>
                <span><span className="font-bold">Transparent & Open:</span> Crafted with React, Express, and a serious amount of late-night coding.</span>
              </li>
            </ul>
          </div>

          <p>
            I hope you find this useful for those times when you just need a quick, secure place to talk without leaving a digital footprint. 
            If you like what you see, feel free to check out my other stuff on my portfolio!
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-4">
          <a 
            href="https://github.com/gurubharghav" 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-6 py-3 bg-foreground dark:bg-white text-background dark:text-black font-bold rounded-xl hover:opacity-90 transition-all flex items-center gap-2"
          >
            <Github className="w-5 h-5" />
            My GitHub
          </a>
          <button 
            onClick={onBack}
            className="px-6 py-3 glass font-bold rounded-xl hover:bg-white/10 transition-all"
          >
            Start Chatting
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 glass rounded-3xl hover:border-accent/30 transition-all group">
      <div className="mb-4 p-3 bg-white/5 rounded-2xl w-fit group-hover:bg-accent/10 transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2 !text-black dark:!text-white">{title}</h3>
      <p className="!text-black/50 dark:!text-white/50 leading-relaxed">{description}</p>
    </div>
  );
}

function CreateView({ onBack, onCreate, isLoading }: { onBack: () => void, onCreate: (n: string, p?: string, u?: string) => void, isLoading: boolean }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-md mx-auto w-full px-6 py-12"
    >
      <div className="glass p-8 rounded-3xl">
        <h2 className="text-3xl font-bold mb-2">Create Room</h2>
        <p className="text-foreground/50 dark:text-white/50 mb-8">Set up your secure communication channel.</p>
        
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-foreground/40 dark:text-white/40 mb-2">Room Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project X"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-accent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-foreground/40 dark:text-white/40 mb-2">Your Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Alice"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-accent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-foreground/40 dark:text-white/40 mb-2">Room Password (Optional)</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-accent outline-none transition-all"
            />
            <p className="text-[10px] text-foreground/30 dark:text-white/30 mt-2">Used to encrypt the master key for joiners.</p>
          </div>

          <div className="pt-4 space-y-3">
            <button 
              disabled={!name || !username || isLoading}
              onClick={() => onCreate(name, password, username)}
              className="w-full py-4 bg-accent text-white dark:bg-white dark:text-black font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Generate Secure Room'}
            </button>
            <button 
              onClick={onBack}
              className="w-full py-4 text-foreground/50 dark:text-white/50 hover:text-foreground dark:hover:text-white transition-all text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function JoinView({ onBack, onJoin, isLoading, error }: { onBack: () => void, onJoin: (id: string, u: string, p?: string) => void, isLoading: boolean, error: string | null }) {
  const [id, setId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-md mx-auto w-full px-6 py-12"
    >
      <div className="glass p-8 rounded-3xl">
        <h2 className="text-3xl font-bold mb-2">Join Room</h2>
        <p className="text-foreground/50 dark:text-white/50 mb-8">Enter the credentials shared with you.</p>
        
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-xl">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-foreground/40 dark:text-white/40 mb-2">Room ID</label>
            <input 
              type="text" 
              value={id}
              onChange={(e) => setId(e.target.value.toUpperCase())}
              placeholder="ABCDEF"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-accent outline-none transition-all font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-foreground/40 dark:text-white/40 mb-2">Your Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Bob"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-accent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-foreground/40 dark:text-white/40 mb-2">Room Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-accent outline-none transition-all"
            />
          </div>

          <div className="pt-4 space-y-3">
            <button 
              disabled={!id || !username || isLoading}
              onClick={() => onJoin(id, username, password)}
              className="w-full py-4 bg-accent text-white dark:bg-white dark:text-black font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Join Secure Chat'}
            </button>
            <button 
              onClick={onBack}
              className="w-full py-4 text-foreground/50 dark:text-white/50 hover:text-foreground dark:hover:text-white transition-all text-sm font-medium"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SuccessView({ room, onEnter, isLoading }: { room: RoomInfo, onEnter: () => void, isLoading: boolean }) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const copy = (text: string, set: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    set(true);
    setTimeout(() => set(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-md mx-auto w-full px-6 py-12"
    >
      <div className="glass p-8 rounded-3xl text-center">
        <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="w-8 h-8 text-accent" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Room Created!</h2>
        <p className="text-foreground/50 dark:text-white/50 mb-8">Share these credentials with your team. They will not be shown again.</p>
        
        <div className="space-y-4 mb-8">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
            <div className="text-left">
              <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/30 dark:text-white/30 block">Room ID</span>
              <span className="text-xl font-mono font-bold">{room.id}</span>
            </div>
            <button onClick={() => copy(room.id, setCopiedId)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
              {copiedId ? <Check className="w-5 h-5 text-accent" /> : <Copy className="w-5 h-5 text-foreground/40 dark:text-white/40" />}
            </button>
          </div>
          
          {room.password && (
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
              <div className="text-left">
                <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/30 dark:text-white/30 block">Password</span>
                <span className="text-xl font-mono font-bold">{room.password}</span>
              </div>
              <button onClick={() => copy(room.password!, setCopiedPass)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                {copiedPass ? <Check className="w-5 h-5 text-accent" /> : <Copy className="w-5 h-5 text-foreground/40 dark:text-white/40" />}
              </button>
            </div>
          )}
        </div>

        <button 
          disabled={isLoading}
          onClick={onEnter}
          className="w-full py-4 bg-accent text-white dark:bg-white dark:text-black font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isLoading ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : (
            <>
              Enter Chat Room
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

function ChatView({ 
  room, 
  user, 
  messages, 
  members, 
  onSend, 
  onLeave, 
  onClose,
  isAdmin,
  isSidebarOpen,
  setIsSidebarOpen,
  scrollRef
}: { 
  room: RoomInfo, 
  user: User, 
  messages: Message[], 
  members: User[], 
  onSend: (c: string) => void, 
  onLeave: () => void,
  onClose: () => void,
  isAdmin: boolean,
  isSidebarOpen: boolean,
  setIsSidebarOpen: (v: boolean) => void,
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim().length > 500) return;
    onSend(input);
    setInput('');
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth >= 1024) && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={cn(
              "fixed lg:relative inset-y-0 left-0 w-72 glass border-r border-white/10 z-40 flex flex-col",
              !isSidebarOpen && "hidden lg:flex"
            )}
          >
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-foreground dark:text-white">
                <Users className="w-4 h-4 text-accent" />
                Members ({members.length}/5)
              </h3>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-foreground dark:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs">
                    {m.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{m.username}</p>
                      {members.indexOf(m) === 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-[8px] font-bold text-accent uppercase tracking-tighter">Admin</span>
                      )}
                    </div>
                    <p className="text-[10px] text-foreground/30 dark:text-white/30 font-mono truncate">{m.id}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-white/10 space-y-3">
              {isAdmin && (
                <button 
                  onClick={onClose}
                  className="w-full py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm font-bold hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Close Room
                </button>
              )}
              <button 
                onClick={onLeave}
                className="w-full py-3 glass rounded-xl text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Leave Chat
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 glass">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 hover:bg-white/5 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h2 className="font-bold text-sm truncate max-w-[150px] sm:max-w-xs text-foreground dark:text-white">{room.name}</h2>
              <p className="text-[10px] font-mono text-foreground/30 dark:text-white/30 uppercase tracking-widest">Room ID: {room.id}</p>
            </div>
          </div>
          
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <Users className="w-3 h-3 text-accent" />
              <span className="text-xs font-medium">{members.length} / 5 Users</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 border border-white/10">
              <Lock className="w-3 h-3 text-accent" />
              <span className="text-[10px] font-mono text-accent uppercase tracking-tighter">E2EE Active</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-6"
        >
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={cn(
                "flex flex-col",
                msg.type === 'system' ? "items-center" : (msg.username === user.username ? "items-end" : "items-start")
              )}
            >
              {msg.type === 'system' ? (
                <div className="px-4 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-foreground/30 dark:text-white/30 uppercase tracking-widest">
                  {msg.content}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-xs font-bold text-foreground/40 dark:text-white/40">{msg.username}</span>
                    <span className="text-[10px] text-foreground/20 dark:text-white/20 font-mono">{formatDate(msg.timestamp)}</span>
                  </div>
                  <div className={cn(
                    "max-w-[85%] sm:max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
                    msg.username === user.username 
                      ? "bg-accent text-white font-medium rounded-tr-none" 
                      : "glass rounded-tl-none"
                  )}>
                    {msg.content}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-6 border-t border-white/10 glass flex justify-center">
          <div className="max-w-4xl w-full flex items-end gap-3 bg-white/5 border border-white/10 rounded-2xl p-2 focus-within:border-accent/50 transition-all shadow-inner">
            <textarea 
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a secure message..."
              className="flex-1 bg-transparent border-none px-3 py-3 focus:outline-none transition-all resize-none min-h-[48px] max-h-[200px] text-sm"
              rows={1}
            />
            <div className="flex flex-col items-end gap-1 pb-1 pr-1">
              <span className={cn(
                "text-[9px] font-mono mb-1",
                input.length > 450 ? "text-red-500" : "text-foreground/20 dark:text-white/20"
              )}>
                {input.length}/500
              </span>
              <button 
                disabled={!input.trim() || input.length > 500}
                onClick={handleSend}
                className="p-3 bg-accent text-white rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-accent/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
