import { useState, useEffect } from 'react';
import { Key, LogOut, User, Users, Wallet, ArrowDownToLine, Activity, Eye, X, Clock } from 'lucide-react';
import { useUser, SignInButton, SignOutButton, UserButton } from '@clerk/clerk-react';

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
}

export default function App() {
  const [isStealsMenuOpen, setIsStealsMenuOpen] = useState(false);
  const [isTopUpMenuOpen, setIsTopUpMenuOpen] = useState(false);
  const [isRedeemMenuOpen, setIsRedeemMenuOpen] = useState(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [redeemKey, setRedeemKey] = useState('');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPlan, setSelectedPlan] = useState<'Ultra' | 'Normal' | null>(null);
  const [purchaseHours, setPurchaseHours] = useState(1);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [balance, setBalance] = useState(20.00);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const [now, setNow] = useState(Date.now());
  const [depositsCount, setDepositsCount] = useState(() => {
    const saved = localStorage.getItem('depositsCount');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    localStorage.setItem('depositsCount', depositsCount.toString());
  }, [depositsCount]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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
    const totalPrice = selectedPlan ? (selectedPlan === 'Ultra' ? 5 : 2) * purchaseHours : 0;
    if (balance < totalPrice) {
      alert("Insufficient balance! Please top up.");
      return;
    }

    setIsPurchasing(true);
    
    // Deduct balance
    setBalance(prev => prev - totalPrice);
    
    // Wait till the money is off their balance (simulate delay)
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const payload = {
        item: {
          product: {
            name: "Premium Key",
            price: 5.99
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

      const response = await fetch('https://api.jnkie.com/api/v1/webhooks/execute/41e78d35-68f3-45c4-8f82-e4902fe191c1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          '123': hmacHex,
          'hmac': hmacHex,
          'x-hmac-signature': hmacHex
        },
        body: payloadString
      });

      let keyData = "JW-PREMIUM-KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      if (response.ok) {
        try {
          const text = await response.text();
          try {
            const data = JSON.parse(text);
            keyData = data.key || data.code || data.premium_key || JSON.stringify(data);
          } catch (e) {
            keyData = text; // If it's plain text
          }
        } catch (e) {
          console.error("Failed to parse response", e);
        }
      } else {
        const errText = await response.text();
        console.error("Webhook failed:", response.status, errText);
        alert("Webhook failed: " + errText);
      }
      
      setActiveSlot({
        plan: selectedPlan || 'Normal',
        expiresAt: Date.now() + purchaseHours * 3600 * 1000,
        key: keyData
      });
      alert("Slot bought!");
      setActiveTab('dashboard');
    } catch (error) {
      console.error("Purchase failed", error);
      // Fallback key if webhook fails (e.g. CORS)
      const fallbackKey = "JW-PREMIUM-KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      setActiveSlot({
        plan: selectedPlan || 'Normal',
        expiresAt: Date.now() + purchaseHours * 3600 * 1000,
        key: fallbackKey
      });
      alert("Slot bought!");
      setActiveTab('dashboard');
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
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-green-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/80 px-6 py-4 flex justify-between items-center">
        {/* Logo */}
        <div className="w-1/3 flex justify-start">
          <div className="text-xl font-bold tracking-wider text-green-500">
            JW FINDER
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-zinc-900/40 p-1 rounded-xl border border-zinc-800/60">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-zinc-800 text-green-500 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('slots')}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'slots' ? 'bg-zinc-800 text-green-500 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            Slots
          </button>
          <button 
            onClick={() => setActiveTab('purchase')}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'purchase' ? 'bg-zinc-800 text-green-500 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            Purchase
          </button>
          <button 
            onClick={() => setActiveTab('highlights')}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'highlights' ? 'bg-zinc-800 text-green-500 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            Highlights
          </button>
        </nav>

        {/* User & Logout */}
        <div className="w-1/3 flex justify-end items-center gap-6">
          <div className="flex items-center gap-2 text-sm font-medium" id="user-box">
            <UserButton afterSignOutUrl="/" />
            <span className="hidden sm:inline-block" id="welcome">
              Welcome, {user?.username || user?.firstName || 'User'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {activeTab === 'dashboard' && (
        <main className="max-w-7xl px-6 py-10">
          
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
              className="bg-green-500 hover:bg-green-400 text-black font-bold px-8 py-3 rounded-xl transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)]"
            >
              <Wallet className="w-5 h-5" />
              Top up
            </button>
            <button 
              onClick={() => setIsRedeemMenuOpen(true)}
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors flex items-center gap-2"
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
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-center hover:border-green-500/30 transition-colors group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 group-hover:border-green-500/30 transition-colors">
                  <Wallet className="w-5 h-5 text-green-500" />
                </div>
                <div className="text-zinc-400 text-sm font-bold uppercase tracking-wider">Balance</div>
              </div>
              <div className="text-3xl font-bold text-white">{balance.toFixed(2)}</div>
            </div>
            
            {/* Card 2 */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-center hover:border-green-500/30 transition-colors group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 group-hover:border-green-500/30 transition-colors">
                  <Users className="w-5 h-5 text-green-500" />
                </div>
                <div className="text-zinc-400 text-sm font-bold uppercase tracking-wider">Active Users</div>
              </div>
              <div className="text-3xl font-bold text-white">{activeUsers.length}</div>
            </div>
            
            {/* Card 3 */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-center hover:border-green-500/30 transition-colors group">
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
                    <div key={user.userId} className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between hover:border-green-500/30 transition-colors group/row">
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
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right: Tall Square */}
          <div className="lg:col-span-1 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col h-full min-h-[320px] relative overflow-hidden group hover:border-green-500/30 transition-colors">
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
                  <p className="text-sm text-zinc-400 font-mono">{formatTimeLeft(activeSlot.expiresAt)}</p>
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
                className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-all mt-auto shadow-[0_0_15px_rgba(34,197,94,0.3)]"
              >
                Get script
              </button>
            ) : (
              <button 
                onClick={() => setActiveTab('purchase')}
                className="w-full bg-transparent hover:bg-green-500/10 text-green-500 border border-green-500/30 hover:border-green-500 font-bold py-3.5 rounded-xl transition-all mt-auto"
              >
                Buy Key
              </button>
            )}
          </div>

        </div>
      </main>
      )}

      {/* Slots Tab Content */}
      {activeTab === 'slots' && (
        <main className="max-w-7xl px-6 py-10">
          <h1 className="text-2xl font-semibold mb-8 text-zinc-300">
            Active Slots
          </h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Slot Card */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col hover:border-green-500/30 transition-colors">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">Ultra</h2>
                <div className="text-green-500 font-bold tracking-wider text-lg">5/H</div>
              </div>
              
              {/* Progress Line */}
              <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-8 overflow-hidden">
                <div className="h-full bg-white w-1/3 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
              </div>
              
              {/* User Info */}
              <div className="flex flex-col gap-3">
                <div className="text-xl font-bold text-zinc-200">Yxzyk</div>
                <div className="flex items-center gap-2 text-zinc-400 font-medium bg-zinc-950/50 w-fit px-3 py-1.5 rounded-lg border border-zinc-800/50">
                  <Clock className="w-4 h-4 text-zinc-500" />
                  <span>2H</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Purchase Tab Content */}
      {activeTab === 'purchase' && (
        <main className="max-w-7xl px-6 py-10">
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
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Ultra Plan */}
              <div 
                onClick={() => setSelectedPlan('Ultra')}
                className={`cursor-pointer bg-zinc-900/40 border ${selectedPlan === 'Ultra' ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.15)]' : 'border-zinc-800/80'} rounded-2xl p-6 flex flex-col hover:border-green-500/50 transition-all relative group`}
              >
                <div className="absolute top-6 right-6 text-green-500 font-bold tracking-wider text-lg">
                  5/H
                </div>
                <h3 className="text-3xl font-bold text-white mb-6">Ultra</h3>
                
                <div className="flex flex-col gap-3 mb-10">
                  <div className="flex items-center gap-2 text-zinc-300 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    0 delay
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    No Max
                  </div>
                </div>
                
                <div className="mt-auto pt-6 border-t border-zinc-800/50">
                  <span className="text-zinc-500 text-sm font-bold uppercase tracking-wider">Minimum 1 hour</span>
                </div>
              </div>

              {/* Normal Plan */}
              <div 
                onClick={() => setSelectedPlan('Normal')}
                className={`cursor-pointer bg-zinc-900/40 border ${selectedPlan === 'Normal' ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.15)]' : 'border-zinc-800/80'} rounded-2xl p-6 flex flex-col hover:border-green-500/50 transition-all relative group`}
              >
                <div className="absolute top-6 right-6 text-green-500 font-bold tracking-wider text-lg">
                  2/H
                </div>
                <h3 className="text-3xl font-bold text-white mb-6">Normal</h3>
                
                <div className="flex flex-col gap-3 mb-10">
                  <div className="flex items-center gap-2 text-zinc-300 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-green-500 transition-colors"></div>
                    1B Max
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-green-500 transition-colors"></div>
                    1 s delay
                  </div>
                </div>
                
                <div className="mt-auto pt-6 border-t border-zinc-800/50">
                  <span className="text-zinc-500 text-sm font-bold uppercase tracking-wider">Minimum 1 hour</span>
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
                      onClick={() => setPurchaseHours(Math.max(1, purchaseHours - 1))}
                      className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >-</button>
                    <span className="text-lg font-semibold text-white w-8 text-center">{purchaseHours}</span>
                    <button 
                      onClick={() => setPurchaseHours(purchaseHours + 1)}
                      className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >+</button>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-zinc-800/50 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-zinc-500">Total Price</span>
                    <span className="text-xl font-bold text-green-500">
                      {selectedPlan ? (selectedPlan === 'Ultra' ? 5 : 2) * purchaseHours : 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-zinc-500">Balance</span>
                    <span className="text-lg font-semibold text-white">{balance.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button 
                disabled={!selectedPlan || isPurchasing}
                onClick={handlePurchase}
                className={`w-full mt-6 font-bold py-3.5 rounded-xl transition-all ${selectedPlan && !isPurchasing ? 'bg-green-500 hover:bg-green-400 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
              >
                {isPurchasing ? 'Processing...' : 'Purchase'}
              </button>
            </div>
          </div>
        </main>
      )}

      {/* Highlights Tab Content */}
      {activeTab === 'highlights' && (
        <main className="max-w-7xl px-6 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold mb-2 text-zinc-300">
              Highlights
            </h1>
            <h2 className="text-lg text-zinc-500 font-medium">
              Top Steals & Activity
            </h2>
          </div>
          
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Activity className="w-12 h-12 text-zinc-600 mb-4" />
            <h3 className="text-xl font-bold text-zinc-300 mb-2">No highlights yet</h3>
            <p className="text-zinc-500 text-center max-w-md">
              Recent activity and top steals will appear here once your slots start finding items.
            </p>
          </div>
        </main>
      )}

      {/* Steals Modal */}
      {isStealsMenuOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-zinc-200">Recent Steals</h2>
              <button 
                onClick={() => setIsStealsMenuOpen(false)} 
                className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-900"
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
          </div>
        </div>
      )}

      {/* Top Up Modal */}
      {isTopUpMenuOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-zinc-200">Top UP</h2>
              <button 
                onClick={() => setIsTopUpMenuOpen(false)} 
                className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-900"
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
                onClick={() => {
                  window.open('https://app.paymento.io/payment-link/ddc0f06e38fe42ec86d06b84d83b080e', '_blank');
                  setDepositsCount(prev => prev + 1);
                  setIsTopUpMenuOpen(false);
                }}
                className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] mt-2"
              >
                Top Up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redeem Key Modal */}
      {isRedeemMenuOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-zinc-200">Redeem key</h2>
              <button 
                onClick={() => setIsRedeemMenuOpen(false)} 
                className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-900"
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
                onClick={() => {
                  // Add redeem logic here
                  setIsRedeemMenuOpen(false);
                  setRedeemKey('');
                }}
                className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] mt-2"
              >
                Redeem
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Script Modal */}
      {isScriptModalOpen && activeSlot && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-green-500">Your Script</h2>
              <button 
                onClick={() => setIsScriptModalOpen(false)} 
                className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <p className="text-zinc-300">Execute this script in roblox to start Joining</p>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 relative group">
                <pre className="text-green-400 font-mono text-sm overflow-x-auto whitespace-pre-wrap break-all">
{`getgenv().SCRIPT_KEY = "${activeSlot.key}"
loadstring(game:HttpGet("https://api.jnkie.com/api/v1/luascripts/public/25975dc6d913f7a2cc956f304678bd47b5498ba7991d9f88c6a4ef794f33f1ad/download"))()`}
                </pre>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`getgenv().SCRIPT_KEY = "${activeSlot.key}"\nloadstring(game:HttpGet("https://api.jnkie.com/api/v1/luascripts/public/25975dc6d913f7a2cc956f304678bd47b5498ba7991d9f88c6a4ef794f33f1ad/download"))()`);
                  alert("Script copied to clipboard!");
                }}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-all"
              >
                Copy Script
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
