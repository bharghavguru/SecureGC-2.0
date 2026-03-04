export type View = 'home' | 'create' | 'join' | 'success' | 'chat' | 'about';

export interface User {
  id: string;
  username: string;
}

export interface Message {
  id: string;
  userId: string;
  username: string;
  content: string; // Decrypted content
  timestamp: number;
  type: 'chat' | 'system';
}

export interface RoomInfo {
  id: string;
  name: string;
  password?: string;
  encryptedKey?: string;
}
