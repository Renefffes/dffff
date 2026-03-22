import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, addDoc, writeBatch, deleteField, deleteDoc } from 'firebase/firestore';
import { Search, Pause, Play, RefreshCw, History, Users, Undo2 } from 'lucide-react';

interface ActiveSlot {
  plan: string;
  expiresAt: number;
  key: string;
  paused?: boolean;
  remainingTime?: number;
}

interface User {
  id: string;
  username: string;
  balance: number;
  activeSlot?: ActiveSlot | null;
}

interface LoginLog {
  id: string;
  uid: string;
  username: string;
  timestamp: number;
}

interface PurchaseLog {
  id: string;
  uid: string;
  username: string;
  plan: string;
  amount: number;
  timestamp: number;
  refunded: boolean;
}

interface AdminTabProps {
  activeSlotsCount: number;
  activeUsersCount: number;
  depositsCount: number;
  botCount: number;
}

export default function AdminTab({ activeSlotsCount, activeUsersCount, depositsCount, botCount }: AdminTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [purchaseLogs, setPurchaseLogs] = useState<PurchaseLog[]>([]);
  const [balanceChange, setBalanceChange] = useState<{ [key: string]: string }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [localBotCount, setLocalBotCount] = useState(botCount.toString());
  const [activeSubTab, setActiveSubTab] = useState<'members' | 'logs'>('members');

  useEffect(() => {
    setLocalBotCount(botCount.toString());
  }, [botCount]);

  useEffect(() => {
    const usersQuery = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
    });

    const logsQuery = query(collection(db, 'loginLogs'), orderBy('timestamp', 'desc'));
    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoginLog));
      setLoginLogs(logsData);
    });

    const purchaseLogsQuery = query(collection(db, 'purchaseLogs'), orderBy('timestamp', 'desc'));
    const unsubscribePurchaseLogs = onSnapshot(purchaseLogsQuery, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseLog));
      setPurchaseLogs(logsData);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeLogs();
      unsubscribePurchaseLogs();
    };
  }, []);

  const handleRefund = async (log: PurchaseLog) => {
    if (!window.confirm(`Are you sure you want to refund $${log.amount.toFixed(2)} to ${log.username}?`)) return;
    
    try {
      const userDocRef = doc(db, 'users', log.uid);
      const logDocRef = doc(db, 'purchaseLogs', log.id);

      // 1. Refund balance
      await updateDoc(userDocRef, {
        balance: increment(log.amount)
      });

      // 2. Mark log as refunded or delete it
      await updateDoc(logDocRef, {
        refunded: true
      });

      // 3. Log the refund
      await addDoc(collection(db, 'transactions'), {
        uid: log.uid,
        amount: log.amount,
        type: 'refund',
        timestamp: Date.now()
      });

      alert(`Successfully refunded $${log.amount.toFixed(2)} to ${log.username}`);
    } catch (error) {
      console.error("Refund failed", error);
      alert("Refund failed. Check console for details.");
    }
  };

  const handleBalanceChange = async (userId: string, amount: number, type: 'add' | 'remove') => {
    if (isNaN(amount) || amount <= 0) return;
    const userDocRef = doc(db, 'users', userId);
    const finalAmount = type === 'add' ? amount : -amount;
    await updateDoc(userDocRef, {
      balance: increment(finalAmount)
    });
    await addDoc(collection(db, 'transactions'), {
      uid: userId,
      amount: finalAmount,
      type,
      timestamp: Date.now()
    });
    setBalanceChange(prev => ({ ...prev, [userId]: '' }));
  };

  const handleGlobalPause = async () => {
    if (!window.confirm("Are you sure you want to pause all active slots?")) return;
    const batch = writeBatch(db);
    const now = Date.now();
    let count = 0;
    
    // Update global settings
    batch.update(doc(db, 'settings', 'global'), { isPaused: true });

    users.forEach(user => {
      if (user.activeSlot && user.activeSlot.expiresAt > now && !user.activeSlot.paused) {
        const userRef = doc(db, 'users', user.id);
        const remainingTime = user.activeSlot.expiresAt - now;
        batch.update(userRef, {
          'activeSlot.paused': true,
          'activeSlot.remainingTime': remainingTime
        });
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
      alert(`Paused ${count} active slots!`);
    } else {
      alert("No active slots to pause.");
    }
  };

  const generateHMAC = async (payload: string, secret: string) => {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      enc.encode(payload)
    );
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const handleGlobalComp = async () => {
    if (!window.confirm("Are you sure you want to generate new keys for all paused slots? This will also call the key webhook for each user.")) return;
    
    let count = 0;
    const pausedUsers = users.filter(user => user.activeSlot && user.activeSlot.paused);
    
    if (pausedUsers.length === 0) {
      alert("No paused slots found.");
      return;
    }

    const batch = writeBatch(db);

    for (const user of pausedUsers) {
      if (!user.activeSlot) continue;

      try {
        const payload = {
          item: {
            product: {
              name: `${user.activeSlot.plan} Key (Comp)`,
              price: 0
            },
            quantity: 1
          },
          user: {
            id: user.id,
            email: `${user.username.toLowerCase()}@comp.jw` // Fallback email
          }
        };

        const payloadString = JSON.stringify(payload);
        const hmacHex = await generateHMAC(payloadString, '123');

        const response = await fetch('https://api.jnkie.com/api/v1/webhooks/execute/41e78d35-68f3-45c4-8f82-e4902fe191c1', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            '123': hmacHex
          },
          body: payloadString
        });

        let keyData = "JW-COMP-KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        if (response.ok) {
          try {
            const text = await response.text();
            try {
              const data = JSON.parse(text);
              keyData = data.key || data.code || data.premium_key || JSON.stringify(data);
            } catch (e) {
              keyData = text;
            }
          } catch (e) {
            console.error("Failed to parse response for user", user.id, e);
          }
        }

        const userRef = doc(db, 'users', user.id);
        batch.update(userRef, {
          'activeSlot.key': keyData
        });
        count++;
      } catch (error) {
        console.error("Failed to generate comp key for user", user.id, error);
      }
    }

    if (count > 0) {
      await batch.commit();
      alert(`Generated new keys and called webhooks for ${count} paused slots!`);
    } else {
      alert("Failed to generate any keys.");
    }
  };

  const handleUserComp = async (user: User) => {
    if (!user.activeSlot) {
      alert("User does not have an active slot to comp.");
      return;
    }
    if (!window.confirm(`Are you sure you want to generate a new key and call the webhook for ${user.username}?`)) return;

    try {
      const payload = {
        item: {
          product: {
            name: `${user.activeSlot.plan} Key (Comp)`,
            price: 0
          },
          quantity: 1
        },
        user: {
          id: user.id,
          email: `${user.username.toLowerCase()}@comp.jw`
        }
      };

      const payloadString = JSON.stringify(payload);
      const hmacHex = await generateHMAC(payloadString, '123');

      const response = await fetch('https://api.jnkie.com/api/v1/webhooks/execute/41e78d35-68f3-45c4-8f82-e4902fe191c1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          '123': hmacHex
        },
        body: payloadString
      });

      let keyData = "JW-COMP-KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      if (response.ok) {
        try {
          const text = await response.text();
          try {
            const data = JSON.parse(text);
            keyData = data.key || data.code || data.premium_key || JSON.stringify(data);
          } catch (e) {
            keyData = text;
          }
        } catch (e) {
          console.error("Failed to parse response for user", user.id, e);
        }
      }

      await updateDoc(doc(db, 'users', user.id), {
        'activeSlot.key': keyData
      });

      alert(`Successfully generated new key for ${user.username}`);
    } catch (error) {
      console.error("Comp failed", error);
      alert("Comp failed. Check console.");
    }
  };

  const handleGlobalUnpause = async () => {
    if (!window.confirm("Are you sure you want to unpause all slots?")) return;
    const batch = writeBatch(db);
    const now = Date.now();
    let count = 0;

    // Update global settings
    batch.update(doc(db, 'settings', 'global'), { isPaused: false });

    users.forEach(user => {
      if (user.activeSlot && user.activeSlot.paused) {
        const userRef = doc(db, 'users', user.id);
        const newExpiresAt = now + (user.activeSlot.remainingTime || 0);
        batch.update(userRef, {
          'activeSlot.paused': false,
          'activeSlot.expiresAt': newExpiresAt,
          'activeSlot.remainingTime': deleteField()
        });
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
      alert(`Unpaused ${count} slots!`);
    } else {
      alert("No paused slots to unpause.");
    }
  };

  const toggleUserPause = async (user: User) => {
    if (!user.activeSlot) return;
    const userRef = doc(db, 'users', user.id);
    const now = Date.now();
    
    if (user.activeSlot.paused) {
      const newExpiresAt = now + (user.activeSlot.remainingTime || 0);
      await updateDoc(userRef, {
        'activeSlot.paused': false,
        'activeSlot.expiresAt': newExpiresAt,
        'activeSlot.remainingTime': deleteField()
      });
    } else {
      const remainingTime = user.activeSlot.expiresAt - now;
      await updateDoc(userRef, {
        'activeSlot.paused': true,
        'activeSlot.remainingTime': remainingTime
      });
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
    user.id.includes(searchQuery)
  );

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-zinc-800 pb-4">
        <h1 className="text-2xl font-bold text-white tracking-wider">JW Admin <span className="text-zinc-600 font-light">|</span></h1>
      </div>

      {/* Metrics Squares */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
          <div className="text-zinc-400 text-sm font-bold uppercase tracking-wider mb-2">Current Slots</div>
          <div className="text-4xl font-bold text-white">{activeSlotsCount}</div>
        </div>
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
          <div className="text-zinc-400 text-sm font-bold uppercase tracking-wider mb-2">Current Online users</div>
          <div className="text-4xl font-bold text-white">{activeUsersCount}</div>
        </div>
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
          <div className="text-zinc-400 text-sm font-bold uppercase tracking-wider mb-2">Current Total Deposits</div>
          <div className="text-4xl font-bold text-white">{depositsCount}</div>
        </div>
      </div>

      {/* Global Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button 
          onClick={handleGlobalPause}
          className="bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-500 font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Pause className="w-5 h-5" />
          Pause
        </button>
        <button 
          onClick={handleGlobalComp}
          className="bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-500 font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-5 h-5" />
          Comp
        </button>
        <button 
          onClick={handleGlobalUnpause}
          className="bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-500 font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Play className="w-5 h-5" />
          Unpause
        </button>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-xl font-bold text-white mb-4">Bot Settings</h2>
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-4">
              <input 
                type="number" 
                value={localBotCount}
                onChange={(e) => setLocalBotCount(e.target.value)}
                onBlur={async (e) => {
                  const newCount = parseInt(e.target.value);
                  if (!isNaN(newCount)) {
                    await updateDoc(doc(db, 'settings', 'global'), { botCount: newCount });
                  }
                }}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white w-full focus:outline-none focus:border-green-500/50"
                placeholder="Active Bot Count"
              />
              <div className="text-zinc-500 text-sm whitespace-nowrap font-medium">Active Bots</div>
            </div>
            <p className="text-zinc-500 text-xs mt-3">This number is displayed in the header next to the logo.</p>
          </div>
        </section>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex gap-2 border-b border-zinc-800">
        <button 
          onClick={() => setActiveSubTab('members')}
          className={`px-6 py-3 font-bold text-sm tracking-wider uppercase transition-all border-b-2 ${activeSubTab === 'members' ? 'text-green-500 border-green-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Members
          </div>
        </button>
        <button 
          onClick={() => setActiveSubTab('logs')}
          className={`px-6 py-3 font-bold text-sm tracking-wider uppercase transition-all border-b-2 ${activeSubTab === 'logs' ? 'text-green-500 border-green-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Purchase Logs
          </div>
        </button>
      </div>

      {activeSubTab === 'members' ? (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Manage Members</h2>
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input 
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500/50"
              />
            </div>
          </div>
          
          <div className="grid gap-4">
            {filteredUsers.map(user => {
              const userLogs = loginLogs.filter(log => log.uid === user.id).slice(0, 3);
              
              return (
                <div key={user.id} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row gap-4 justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="text-white font-bold text-lg">{user.username}</div>
                      <div className="text-zinc-600 text-xs font-mono">{user.id}</div>
                    </div>
                    <div className="text-zinc-400 text-sm mb-3">Balance: <span className="text-green-500 font-bold">${user.balance.toFixed(2)}</span></div>
                    
                    {/* Logs Preview */}
                    {userLogs.length > 0 && (
                      <div className="text-xs text-zinc-500 bg-zinc-950/50 rounded-lg p-2 border border-zinc-800/50">
                        <div className="font-semibold mb-1 text-zinc-400">Recent Logins:</div>
                        {userLogs.map(log => (
                          <div key={log.id}>{new Date(log.timestamp).toLocaleString()}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-3 justify-center items-end">
                    {/* Slot Controls */}
                    {user.activeSlot && (
                      <div className="flex items-center gap-2">
                        <div className={`text-xs font-bold px-2 py-1 rounded-md border ${user.activeSlot.paused ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' : 'bg-green-500/10 text-green-500 border-green-500/30'}`}>
                          {user.activeSlot.paused ? 'PAUSED' : 'ACTIVE'}
                        </div>
                        <button 
                          onClick={() => toggleUserPause(user)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded-lg transition-colors"
                          title={user.activeSlot.paused ? "Unpause" : "Pause"}
                        >
                          {user.activeSlot.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => handleUserComp(user)}
                          className="bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-500 p-2 rounded-lg transition-colors"
                          title="Comp User"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Balance Controls */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={balanceChange[user.id] || ''}
                        onChange={(e) => setBalanceChange(prev => ({ ...prev, [user.id]: e.target.value }))}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white w-24 focus:outline-none focus:border-green-500/50"
                        placeholder="Amount"
                      />
                      <button 
                        onClick={() => handleBalanceChange(user.id, parseFloat(balanceChange[user.id] || '0'), 'add')} 
                        className="bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-500 transition-all active:scale-95 px-3 py-2 rounded-lg text-sm font-bold"
                      >
                        +
                      </button>
                      <button 
                        onClick={() => handleBalanceChange(user.id, parseFloat(balanceChange[user.id] || '0'), 'remove')} 
                        className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 transition-all active:scale-95 px-3 py-2 rounded-lg text-sm font-bold"
                      >
                        -
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="text-center text-zinc-500 py-8">No users found.</div>
            )}
          </div>
        </section>
      ) : (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Purchase History</h2>
            <div className="text-zinc-500 text-sm">{purchaseLogs.length} Total Purchases</div>
          </div>
          
          <div className="grid gap-4">
            {purchaseLogs.map(log => (
              <div key={log.id} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="text-white font-bold">{log.username}</div>
                    <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter ${log.plan === 'Ultra' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                      {log.plan}
                    </div>
                    {log.refunded && (
                      <div className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter bg-red-500/20 text-red-400 border border-red-500/30">
                        Refunded
                      </div>
                    )}
                  </div>
                  <div className="text-zinc-500 text-xs">
                    {new Date(log.timestamp).toLocaleString()} • <span className="text-green-500 font-bold">${log.amount.toFixed(2)}</span>
                  </div>
                </div>
                
                {!log.refunded && (
                  <button 
                    onClick={() => handleRefund(log)}
                    className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
                  >
                    <Undo2 className="w-4 h-4" />
                    Refund
                  </button>
                )}
              </div>
            ))}
            {purchaseLogs.length === 0 && (
              <div className="text-center text-zinc-500 py-8">No purchase history found.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
