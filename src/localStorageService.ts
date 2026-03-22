const STORAGE_KEY = 'jwFinderData';

export interface UserData {
  username: string;
  balance: number;
  activeSlot: {
    plan: string;
    expiresAt: number;
    key: string;
  } | null;
  depositsCount: number;
  createdAt: number;
  lastLogin: number;
  activity: { action: string; details: any; timestamp: number }[];
}

export const loadUserData = (userId: string): UserData | null => {
  const data = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
  return data ? JSON.parse(data) : null;
};

export const saveUserData = (userId: string, data: UserData) => {
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(data));
};

export const logActivity = (userId: string, action: string, details: any) => {
  const data = loadUserData(userId);
  if (data) {
    data.activity.push({ action, details, timestamp: Date.now() });
    saveUserData(userId, data);
  }
};
