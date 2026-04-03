import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import AdminTab from './components/AdminTab';
import RedParticles from './components/RedParticles';
import { Key, LogOut, User, Users, Wallet, ArrowDownToLine, Activity, Eye, X, Clock, Settings, Music, Sparkles, Pause } from 'lucide-react';
import { useUser, SignInButton, SignOutButton, UserButton } from '@clerk/clerk-react';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, onSnapshot, query, getDocs } from 'firebase/firestore';
import { logActivity as logActivityLocal } from './localStorageService';

interface ActiveUser {
  username: string;
  displayName: string;
  userId: number;
  joinedAt: number;
  lastSeen: number;
}

interface ActiveSlot {
  plan: string;
  expiresAt: number;
  key: string;
  paused?: boolean;
  remainingTime?: number;
}

export default function App() {
  const [isStealsMenuOpen, setIsStealsMenuOpen] = useState(false);
  const [isTopUpMenuOpen, setIsTopUpMenuOpen] = useState(false);
  const [isRedeemMenuOpen, setIsRedeemMenuOpen] = useState(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [redeemKey, setRedeemKey] = useState('');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('isAdmin') === 'true');
  const [adminKey, setAdminKey] = useState('');
  const [adminBalance, setAdminBalance] = useState('');
  const [removeBalanceUserId, setRemoveBalanceUserId] = useState('');
  const [removeBalanceAmount, setRemoveBalanceAmount] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'Ultra' | 'Normal' | null>(null);
  const [purchaseHours, setPurchaseHours] = useState(1);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [activeSlots, setActiveSlots] = useState<any[]>([]);
  const [balance, setBalance] = useState(0.00);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const [globalUltraCount, setGlobalUltraCount] = useState(0);
  const [globalNormalCount, setGlobalNormalCount] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [isFirebaseLoaded, setIsFirebaseLoaded] = useState(false);
  const [botCount, setBotCount] = useState(0);
  const [showParticles, setShowParticles] = useState(() => localStorage.getItem('showParticles') !== 'false');
  const [playMusic, setPlayMusic] = useState(() => localStorage.getItem('playMusic') === 'true');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [depositsCount, setDepositsCount] = useState(() => {
    const saved = localStorage.getItem('depositsCount');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const { isLoaded, isSignedIn, user } = useUser();

  const logActivity = (action: string, details: any = {}) => {
    if (!user) return;
    logActivityLocal(user.id, action, details);
  };

  // Exposed for future game integrations
  const logGameResult = async (win: boolean, amount: number) => {
    await logActivity('game_result', { win, amount });
  };

  useEffect(() => {
    localStorage.setItem('showParticles', showParticles.toString());
  }, [showParticles]);

  useEffect(() => {
    localStorage.setItem('playMusic', playMusic.toString());
    if (audioRef.current) {
      if (playMusic) {
        audioRef.current.play().catch(e => console.log("Audio play failed:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [playMusic]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'global');
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setBotCount(data.botCount || 0);
        setIsPaused(data.isPaused || false);
      } else {
        setDoc(settingsRef, { botCount: 0, isPaused: false });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      const userDocRef = doc(db, 'users', user.id);
      
      const unsubscribe = onSnapshot(userDocRef, async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setBalance(data.balance);
          setActiveSlot(data.activeSlot || null);
          setDepositsCount(data.depositsCount || 0);
          setIsFirebaseLoaded(true);
        } else {
          // Initialize user
          const userData = {
            uid: user.id,
            username: user.username || user.firstName || 'User',
            balance: 0.00,
            activeSlot: null,
            depositsCount: 0,
            createdAt: Date.now(),
            lastLogin: Date.now(),
          };
          await setDoc(userDocRef, userData);
          logActivity('login', { username: user.username || user.firstName || 'User' });
          await addDoc(collection(db, 'loginLogs'), {
            uid: user.id,
            username: user.username || user.firstName || 'User',
            timestamp: Date.now()
          });
        }
      }, (error) => {
        console.error("Failed to load user data", error);
        setIsFirebaseLoaded(true);
      });

      return () => unsubscribe();
    }
  }, [isLoaded, isSignedIn, user]);

  // Sync user with API
  useEffect(() => {
    if (user) {
      const syncUser = async () => {
        try {
          await fetch('https://gfgfgf-production.up.railway.app/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              discordUserId: user.id,
              discordUsername: user.username || user.firstName || 'User',
            })
          });
        } catch (error) {
          console.error('Failed to sync user:', error);
        }
      };
      syncUser();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('https://gfgfgf-production.up.railway.app/users');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
    return [];
  };

  // Log button clicks
  useEffect(() => {
    if (!user) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('button');
      if (button) {
        logActivityLocal(user.id, 'button_click', {
          buttonText: button.innerText || button.getAttribute('aria-label') || 'unknown',
          buttonId: button.id || 'none'
        });
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [user]);

  useEffect(() => {
    localStorage.setItem('depositsCount', depositsCount.toString());
  }, [depositsCount]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeSlot && !activeSlot.paused && activeSlot.expiresAt <= Date.now() && user) {
      const userDocRef = doc(db, 'users', user.id);
      updateDoc(userDocRef, {
        activeSlot: null
      }).catch(e => console.error("Failed to expire slot", e));
    }
  }, [now, activeSlot, user]);

  useEffect(() => {
    const fetchActiveUsers = async () => {
      try {
        const response = await fetch('https://rob-production-5fa0.up.railway.app/active');
        if (response.ok) {
          const data = await response.json();
          setActiveUsers(data);
        }
      } catch (error) {
        console.error('Failed to fetch active users:', error);
      }
    };

    fetchActiveUsers();
    const interval = setInterval(fetchActiveUsers, 1000); // Poll every 1 second
    return () => clearInterval(interval);
  }, []);

  // Listen to all users to count active slots globally
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let ultra = 0;
      let normal = 0;
      const nowTime = Date.now();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.activeSlot && data.activeSlot.expiresAt > nowTime) {
          if (data.activeSlot.plan === 'Ultra') ultra++;
          if (data.activeSlot.plan === 'Normal') normal++;
        }
      });
      setGlobalUltraCount(ultra);
      setGlobalNormalCount(normal);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activeTab === 'slots') {
      const fetchSlots = async () => {
        try {
          const response = await fetch('https://gfgfgf-production.up.railway.app/users');
          if (response.ok) {
            const data = await response.json();
            const apiSlots = data.users || [];
            
            // Fetch users from firestore to check paused status
            const usersSnap = await getDocs(collection(db, 'users'));
            const usersData = usersSnap.docs.reduce((acc: any, doc) => {
              acc[doc.data().username] = doc.data().activeSlot?.paused || false;
              return acc;
            }, {});

            const mergedSlots = apiSlots.map((slot: any) => ({
              ...slot,
              paused: usersData[slot.username] || false
            }));

            setActiveSlots(mergedSlots);
          }
        } catch (error) {
          console.error('Failed to fetch active slots:', error);
        }
      };
      fetchSlots();
    }
  }, [activeTab]);

  const formatDuration = (joinedAtSeconds: number) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, nowSec - joinedAtSeconds);
    
    if (diff < 60) return `${diff} Sec${diff !== 1 ? 's' : ''}`;
    if (diff < 3600) return `${Math.floor(diff / 60)} Min${Math.floor(diff / 60) !== 1 ? 's' : ''}`;
    return `${Math.floor(diff / 3600)} Hour${Math.floor(diff / 3600) !== 1 ? 's' : ''}`;
  };

  const formatTimeLeft = (expiresAt: number) => {
    const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const handlePurchase = async () => {
    if (isPaused) {
      alert("Purchases are currently disabled because slots are paused.");
      return;
    }
    
    if (activeSlot) {
      alert("You already have an active slot. Please wait for it to expire before purchasing a new one.");
      return;
    }
    
    if (selectedPlan === 'Normal' && globalNormalCount >= 4) {
      alert("Normal slots are currently sold out! Only 4 people can have them at a time.");
      return;
    }

    const totalPrice = selectedPlan ? 2 * purchaseHours : 0;
    if (balance < totalPrice) {
      alert("Insufficient balance! Please top up.");
      return;
    }

    setIsPurchasing(true);
    
    try {
      const userDocRef = doc(db, 'users', user.id);
      
      // Deduct balance in Firestore
      await updateDoc(userDocRef, {
        balance: increment(-totalPrice)
      });
      
      // Wait till the money is off their balance (simulate delay)
      await new Promise(resolve => setTimeout(resolve, 1000));

      const payload = {
        item: {
          product: {
            name: `Normal Key`,
            price: 2.00
          },
          quantity: 1
        },
        user: {
          id: user?.id || "test_user_123",
          email: user?.primaryEmailAddress?.emailAddress || "test@example.com"
        }
      };

      const payloadString = JSON.stringify(payload);
      
      // Generate HMAC SHA256 using secret "123"
      const enc = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        enc.encode('123'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        enc.encode(payloadString)
      );
      const hmacHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // New Luarmor API integration via proxy
      const luarmorResponse = await fetch('/api/luarmor/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          "auth_expire": 3600
        })
      });

      const luarmorData = await luarmorResponse.json();
      
      let keyData = "KEY-ERROR";
      if (luarmorData.success) {
        keyData = luarmorData.user_key;
      } else {
        console.error("Luarmor API failed:", luarmorData);
        throw new Error("Failed to generate key from Luarmor");
      }
      
      await updateDoc(userDocRef, {
        activeSlot: {
          plan: 'Normal',
          expiresAt: Date.now() + purchaseHours * 3600 * 1000,
          key: keyData
        }
      });
      try {
        await addDoc(collection(db, 'purchaseLogs'), {
          uid: user.id,
          username: user.username || user.firstName || 'User',
          plan: 'Normal',
          amount: totalPrice,
          timestamp: Date.now(),
          refunded: false
        });
      } catch (e) {
        console.error("Failed to save purchase log (success path):", e);
      }
      logActivity('purchase', { item: 'Normal', amount: totalPrice });
      alert("Slot bought! Your key is: " + keyData);
      setActiveTab('dashboard');
    } catch (error) {
      console.error("Purchase failed", error);
      alert("Purchase failed: " + error);
    } finally {
      setIsPurchasing(false);
    }
  };

  if (!isLoaded) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex flex-col items-center justify-center p-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <h1 className="text-2xl font-bold mb-6 text-zinc-200">Please login with discord</h1>
          <SignInButton mode="modal">
            <button 
              id="login-btn"
              className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_0_15px_rgba(88,101,242,0.3)] flex items-center justify-center gap-2"
            >
              Login with Discord
            </button>
          </SignInButton>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-green-500/30 relative">
      <audio ref={audioRef} id="bg-music" loop src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" />
      {showParticles && <RedParticles />}
      {/* Header */}
      <header className="border-b border-zinc-800/80 px-6 py-4 flex justify-between items-center relative z-10">
        {/* Logo */}
        <div className="w-1/3 flex justify-start items-center gap-3">
          <div className="text-xl font-bold tracking-wider text-green-500">
            Syntax Notifier
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 px-2 py-1 rounded-lg flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">
              {botCount} Active Bots
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-zinc-900/40 p-1 rounded-xl border border-zinc-800/60">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 ${activeTab === 'dashboard' ? 'bg-zinc-800 text-green-500 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('slots')}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 ${activeTab === 'slots' ? 'bg-zinc-800 text-green-500 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            Slots
          </button>
          <button 
            onClick={() => setActiveTab('purchase')}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 ${activeTab === 'purchase' ? 'bg-zinc-800 text-green-500 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            Purchase
          </button>
          {isAdmin ? (
            <button 
              onClick={() => setActiveTab('admin')}
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 ${activeTab === 'admin' ? 'bg-zinc-800 text-red-500 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            >
              Admin
            </button>
          ) : (
            <input
              type="password"
              placeholder="Admin Key"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-white w-24"
              onChange={(e) => {
                if (e.target.value === 'AMOS202080') {
                  setIsAdmin(true);
                  localStorage.setItem('isAdmin', 'true');
                }
              }}
            />
          )}
        </nav>

        {/* User & Logout */}
        <div className="w-1/3 flex justify-end items-center gap-4">
          {/* Settings Menu */}
          <div className="relative" ref={settingsRef}>
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
            >
              <Settings className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {isSettingsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-48 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-2 z-50"
                >
                  <div className="flex flex-col gap-1">
                    <div 
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowParticles(prev => !prev);
                      }}
                      className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-zinc-900 transition-colors text-sm font-medium cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Sparkles className="w-4 h-4 text-green-500" />
                        Particles
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative ${showParticles ? 'bg-green-500' : 'bg-zinc-700'}`}>
                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showParticles ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </div>
                    <div 
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlayMusic(prev => !prev);
                      }}
                      className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-zinc-900 transition-colors text-sm font-medium cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Music className="w-4 h-4 text-green-500" />
                        Music
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative ${playMusic ? 'bg-green-500' : 'bg-zinc-700'}`}>
                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${playMusic ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium" id="user-box">
            <UserButton afterSignOutUrl="/" />
            <span className="hidden sm:inline-block" id="welcome">
              Welcome, {user?.username || user?.firstName || 'User'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' && (
          <motion.main 
            key="dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-7xl px-6 py-10 relative z-10"
          >
            {activeSlot?.paused && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-8 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6 flex items-center gap-4 text-yellow-500"
              >
                <Pause className="w-8 h-8" />
                <div>
                  <h3 className="text-xl font-bold">Slot is paused</h3>
                  <p className="text-yellow-500/80 text-sm">Your slot has been paused by an administrator. Your time will not decrease until it is unpaused.</p>
                </div>
              </motion.div>
            )}
          
          {/* Top Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2 text-zinc-300">
            Welcome, <span className="text-white">{user?.username || user?.firstName || 'User'}</span>
          </h1>
          <div className="text-5xl font-bold tracking-tight mb-8 flex items-baseline gap-3">
            {balance.toFixed(2)} <span className="text-xl font-medium text-zinc-500 tracking-normal uppercase">Balance</span>
          </div>
          <div className="flex flex-wrap gap-4">
            <button 
              onClick={() => setIsTopUpMenuOpen(true)}
              className="bg-green-500 hover:bg-green-400 text-black font-bold px-8 py-3 rounded-xl transition-all active:scale-95 flex items-center gap-2 shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)]"
            >
              <Wallet className="w-5 h-5" />
              Top up
            </button>
            <button 
              onClick={() => setIsRedeemMenuOpen(true)}
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-semibold px-8 py-3 rounded-xl transition-all active:scale-95 flex items-center gap-2"
            >
              <Key className="w-5 h-5 text-green-500" />
              Redeem Key
            </button>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
          
          {/* Left Column (Squares + Live Users) */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {/* 3 Squares */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Card 1 */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-center hover:border-green-500/30 transition-all active:scale-[0.98] group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 group-hover:border-green-500/30 transition-colors">
                  <Wallet className="w-5 h-5 text-green-500" />
                </div>
                <div className="text-zinc-400 text-sm font-bold uppercase tracking-wider">Balance</div>
              </div>
              <div className="text-3xl font-bold text-white">{balance.toFixed(2)}</div>
            </div>
            
            {/* Card 2 */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-center hover:border-green-500/30 transition-all active:scale-[0.98] group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 group-hover:border-green-500/30 transition-colors">
                  <Users className="w-5 h-5 text-green-500" />
                </div>
                <div className="text-zinc-400 text-sm font-bold uppercase tracking-wider">Active Users</div>
              </div>
              <div className="text-3xl font-bold text-white">{activeUsers.length}</div>
            </div>
            
            {/* Card 3 */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-center hover:border-green-500/30 transition-all active:scale-[0.98] group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 group-hover:border-green-500/30 transition-colors">
                  <ArrowDownToLine className="w-5 h-5 text-green-500" />
                </div>
                <div className="text-zinc-400 text-sm font-bold uppercase tracking-wider">Deposits</div>
              </div>
              <div className="text-3xl font-bold text-white">{depositsCount}</div>
            </div>
            </div>

            {/* Live Users Section */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col hover:border-green-500/30 transition-colors">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                  <Activity className="w-5 h-5 text-green-500" />
                </div>
                <div className="text-zinc-400 text-sm font-bold uppercase tracking-wider">
                  Live Users <span className="text-zinc-700 mx-2">|</span> <span className="text-white">{activeUsers.length}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {activeUsers.length === 0 ? (
                  <div className="text-zinc-500 text-center py-4">No active users found.</div>
                ) : (
                  activeUsers.map((user) => (
                    <motion.div 
                      key={user.userId} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between hover:border-green-500/30 transition-colors group/row"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                          <User className="w-5 h-5 text-zinc-500 group-hover/row:text-green-500 transition-colors" />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-white font-bold text-lg">{user.username}</span>
                          <span className="text-zinc-700">|</span>
                          <span className="text-zinc-400 font-medium">{formatDuration(user.joinedAt)}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right: Tall Square */}
          <div className="lg:col-span-1 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col h-full min-h-[320px] relative overflow-hidden group hover:border-green-500/30 transition-all active:scale-[0.98]">
            {/* Subtle green glow */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-green-500/5 rounded-full blur-3xl -mr-10 -mt-10 transition-opacity group-hover:bg-green-500/10 pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-8">
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">Active Slot</div>
              <div className={`px-3 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-bold tracking-wider ${activeSlot ? 'text-green-500' : 'text-zinc-500'}`}>
                {activeSlot ? `(${activeSlot.plan}) Active` : 'NONE'}
              </div>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-5 group-hover:border-green-500/20 transition-colors">
                <Key className={`w-6 h-6 transition-colors ${activeSlot ? 'text-green-500' : 'text-zinc-600 group-hover:text-green-500/50'}`} />
              </div>
              {activeSlot ? (
                <>
                  <h3 className="text-lg font-semibold text-zinc-200 mb-2">Time Left</h3>
                  {activeSlot.paused ? (
                    <p className="text-sm text-yellow-500 font-bold tracking-widest">PAUSED</p>
                  ) : (
                    <p className="text-sm text-zinc-400 font-mono">{formatTimeLeft(activeSlot.expiresAt)}</p>
                  )}
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-zinc-200 mb-2">No active key</h3>
                  <p className="text-sm text-zinc-500 max-w-[200px]">Purchase a key to unlock your slot and get started.</p>
                </>
              )}
            </div>
            
            {activeSlot ? (
              <button 
                onClick={() => setIsScriptModalOpen(true)}
                className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-all active:scale-95 mt-auto shadow-[0_0_15px_rgba(34,197,94,0.3)]"
              >
                Get script
              </button>
            ) : (
              <button 
                onClick={() => setActiveTab('purchase')}
                className="w-full bg-transparent hover:bg-green-500/10 text-green-500 border border-green-500/30 hover:border-green-500 font-bold py-3.5 rounded-xl transition-all active:scale-95 mt-auto"
              >
                Buy Key
              </button>
            )}
          </div>

        </div>
        </motion.main>
        )}

        {/* Slots Tab Content */}
        {activeTab === 'slots' && (
          <motion.main 
            key="slots"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-7xl px-6 py-10 relative z-10"
          >
          <h1 className="text-2xl font-semibold mb-8 text-zinc-300">
            Active Slots
          </h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeSlots.length === 0 ? (
              <div className="text-zinc-500 text-center py-4">No active slots found.</div>
            ) : (
              activeSlots.map((slot, index) => (
                <motion.div 
                  key={index} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col hover:border-green-500/30 transition-colors"
                >
                  <div className="mb-6">
                    <h2 className="text-3xl font-bold text-white mb-2">{slot.plan}</h2>
                    <div className="text-green-500 font-bold tracking-wider text-lg">
                      {slot.plan === 'Ultra' ? '3' : '2'}/H
                    </div>
                  </div>
                  
                  {/* Progress Line */}
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-8 overflow-hidden">
                    <div className="h-full bg-white w-1/3 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                  </div>
                  
                  {/* User Info */}
                  <div className="flex flex-col gap-3">
                    <div className="text-xl font-bold text-zinc-200">{slot.username}</div>
                    <div className="flex items-center gap-2 text-zinc-400 font-medium bg-zinc-950/50 w-fit px-3 py-1.5 rounded-lg border border-zinc-800/50">
                      <Clock className="w-4 h-4 text-zinc-500" />
                      <span>{slot.paused ? 'TIME PAUSED' : (slot.expiresAt ? formatTimeLeft(new Date(slot.expiresAt).getTime()) : 'N/A')}</span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.main>
        )}

        {/* Purchase Tab Content */}
        {activeTab === 'purchase' && (
          <motion.main 
            key="purchase"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-7xl px-6 py-10 relative z-10"
          >
          <div className="mb-8">
            <h1 className="text-2xl font-semibold mb-2 text-zinc-300">
              Buy A Plan
            </h1>
            <h2 className="text-lg text-zinc-500 font-medium">
              Available Plans
            </h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Plans */}
            <div className="lg:col-span-2 grid grid-cols-1 gap-6">
              {/* Normal Plan */}
              <div 
                onClick={() => {
                  if (isPaused) {
                    alert("Slots are currently paused. Purchases are disabled.");
                    return;
                  }
                  if (globalNormalCount < 3) setSelectedPlan('Normal');
                }}
                className={`cursor-pointer bg-zinc-900/40 border ${selectedPlan === 'Normal' ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.15)]' : 'border-zinc-800/80'} rounded-2xl p-6 flex flex-col hover:border-green-500/50 transition-all active:scale-[0.98] relative group ${globalNormalCount >= 3 || isPaused ? 'opacity-50 cursor-not-allowed active:scale-100' : ''}`}
              >
                <div className="absolute top-6 right-6 text-green-500 font-bold tracking-wider text-lg">
                  2/H
                </div>
                <h3 className="text-3xl font-bold text-white mb-6">Normal</h3>
                
                <div className="flex flex-col gap-3 mb-10">
                  <div className="flex items-center gap-2 text-zinc-300 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-green-500 transition-colors"></div>
                    No Max
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-green-500 transition-colors"></div>
                    No Delay
                  </div>
                </div>
                
                <div className="mt-auto pt-6 border-t border-zinc-800/50 flex justify-between items-center">
                  <span className="text-zinc-500 text-sm font-bold uppercase tracking-wider">Minimum 1 hour</span>
                  <span className={`text-sm font-bold ${globalNormalCount >= 4 ? 'text-red-500' : 'text-green-500'}`}>
                    {globalNormalCount >= 4 ? 'SOLD OUT' : `${4 - globalNormalCount} left`}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Checkout Panel */}
            <div className="lg:col-span-1 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col h-full min-h-[400px]">
              <h3 className="text-2xl font-bold text-white mb-6">Buy</h3>
              
              <div className="flex flex-col gap-6 flex-1">
                <div>
                  <div className="text-sm font-medium text-zinc-500 mb-1">Selected Plan</div>
                  <div className="text-lg font-semibold text-zinc-200">{selectedPlan || 'None'}</div>
                </div>

                <div>
                  <div className="text-sm font-medium text-zinc-500 mb-2">Hours</div>
                  <div className="flex items-center gap-3">
                    <button 
                      disabled
                      className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-600 cursor-not-allowed"
                    >-</button>
                    <span className="text-lg font-semibold text-white w-8 text-center">1</span>
                    <button 
                      disabled
                      className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-600 cursor-not-allowed"
                    >+</button>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-zinc-800/50 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-zinc-500">Total Price</span>
                    <span className="text-xl font-bold text-green-500">
                      {selectedPlan ? (selectedPlan === 'Ultra' ? 3 : 2) * purchaseHours : 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-zinc-500">Balance</span>
                    <span className="text-lg font-semibold text-white">{balance.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button 
                disabled={!selectedPlan || isPurchasing || isPaused}
                onClick={handlePurchase}
                className={`w-full mt-6 font-bold py-3.5 rounded-xl transition-all active:scale-95 ${selectedPlan && !isPurchasing && !isPaused ? 'bg-green-500 hover:bg-green-400 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed active:scale-100'}`}
              >
                {isPurchasing ? 'Processing...' : isPaused ? 'Purchases Disabled' : 'Purchase'}
              </button>
            </div>
          </div>
        </motion.main>
        )}

        {/* Admin Tab Content */}
        {activeTab === 'admin' && isAdmin && (
          <motion.div 
            key="admin"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10"
          >
            <AdminTab 
              activeSlotsCount={activeSlots.length}
              activeUsersCount={activeUsers.length}
              depositsCount={depositsCount}
              botCount={botCount}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Steals Modal */}
      <AnimatePresence>
        {isStealsMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl"
            >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-zinc-200">Recent Steals</h2>
              <button 
                onClick={() => setIsStealsMenuOpen(false)} 
                className="text-zinc-500 hover:text-white transition-all active:scale-95 p-1 rounded-md hover:bg-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center hover:border-green-500/30 transition-colors">
                <span className="text-white font-semibold">Dragon Canneloni</span>
                <span className="text-green-500 font-bold tracking-wider">2B/S</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>

      {/* Top Up Modal */}
      <AnimatePresence>
        {isTopUpMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-zinc-200">Top UP</h2>
              <button 
                onClick={() => setIsTopUpMenuOpen(false)} 
                className="text-zinc-500 hover:text-white transition-all active:scale-95 p-1 rounded-md hover:bg-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Amount</label>
                <input 
                  type="number" 
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  placeholder="Enter amount..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all"
                />
              </div>
              <button 
                disabled={true}
                onClick={() => {
                  // Top up disabled
                }}
                className={`w-full bg-zinc-800 text-zinc-500 cursor-not-allowed font-bold py-3.5 rounded-xl transition-all mt-2`}
              >
                Top Ups Disabled
              </button>
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>

      {/* Redeem Key Modal */}
      <AnimatePresence>
        {isRedeemMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-zinc-200">Redeem key</h2>
              <button 
                onClick={() => setIsRedeemMenuOpen(false)} 
                className="text-zinc-500 hover:text-white transition-all active:scale-95 p-1 rounded-md hover:bg-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">redeem ur key here</label>
                <input 
                  type="text" 
                  value={redeemKey}
                  onChange={(e) => setRedeemKey(e.target.value)}
                  placeholder="Enter key..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all"
                />
              </div>
              <button 
                onClick={async () => {
                  const keyRef = doc(db, 'keys', redeemKey);
                  const keyDoc = await getDoc(keyRef);
                  if (keyDoc.exists() && !keyDoc.data().redeemed) {
                    await updateDoc(keyRef, { redeemed: true });
                    await updateDoc(doc(db, 'users', user.id), { balance: increment(keyDoc.data().value) });
                    setBalance(prev => prev + keyDoc.data().value);
                    alert("Key redeemed!");
                    setIsRedeemMenuOpen(false);
                    setRedeemKey('');
                  } else {
                    alert("Invalid or already redeemed key!");
                  }
                  
                  setIsRedeemMenuOpen(false);
                  setRedeemKey('');
                }}
                className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-all active:scale-95 shadow-[0_0_15px_rgba(34,197,94,0.3)] mt-2"
              >
                Redeem
              </button>
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
      {/* Script Modal */}
      <AnimatePresence>
      {isScriptModalOpen && activeSlot && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-green-500">Your Script</h2>
              <button 
                onClick={() => setIsScriptModalOpen(false)} 
                className="text-zinc-500 hover:text-white transition-all active:scale-95 p-1 rounded-md hover:bg-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <p className="text-zinc-300">Execute this script in roblox to start Joining</p>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 relative group">
                <pre className="text-green-400 font-mono text-sm overflow-x-auto whitespace-pre-wrap break-all">
{`getgenv().SCRIPT_KEY = "${activeSlot.key}"
loadstring(game:HttpGet("https://api.luarmor.net/files/v4/loaders/99a6733c9b5a9995a37657d46ceacf8e.lua"))()`}
                </pre>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`getgenv().SCRIPT_KEY = "${activeSlot.key}"
loadstring(game:HttpGet("https://api.luarmor.net/files/v4/loaders/99a6733c9b5a9995a37657d46ceacf8e.lua"))()`);
                  alert("Script copied to clipboard!");
                }}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95"
              >
                Copy Script
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
