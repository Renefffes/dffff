import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, addDoc, getDocs } from 'firebase/firestore';

interface User {
  id: string;
  username: string;
  balance: number;
}

interface LoginLog {
  id: string;
  uid: string;
  username: string;
  timestamp: number;
}

export default function AdminTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [balanceChange, setBalanceChange] = useState<{ [key: string]: string }>({});

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

    return () => {
      unsubscribeUsers();
      unsubscribeLogs();
    };
  }, []);

  const handleBalanceChange = async (userId: string, amount: number, type: 'add' | 'remove') => {
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

  return (
    <div className="p-6 space-y-8">
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Login Logs</h2>
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 max-h-64 overflow-y-auto">
          {loginLogs.map(log => (
            <div key={log.id} className="text-sm text-zinc-400 py-1 border-b border-zinc-800 last:border-0">
              {new Date(log.timestamp).toLocaleString()} - {log.username} ({log.uid})
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-4">Manage Members</h2>
        <div className="grid gap-4">
          {users.map(user => (
            <div key={user.id} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-white font-bold">{user.username}</div>
                <div className="text-zinc-500 text-sm">Balance: {user.balance.toFixed(2)}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={balanceChange[user.id] || ''}
                  onChange={(e) => setBalanceChange(prev => ({ ...prev, [user.id]: e.target.value }))}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-white w-20"
                  placeholder="Amount"
                />
                <button onClick={() => handleBalanceChange(user.id, parseFloat(balanceChange[user.id] || '0'), 'add')} className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-bold">+</button>
                <button onClick={() => handleBalanceChange(user.id, parseFloat(balanceChange[user.id] || '0'), 'remove')} className="bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-bold">-</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
