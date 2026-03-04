# SecureGC 🛡️

**SecureGC** is a professional, high-security ephemeral group chat application built with a **Zero-Knowledge Architecture**. It ensures that your conversations remain private, encrypted, and completely untraceable once the session ends.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18.x-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.x-38B2AC.svg)

## 🚀 Key Features

- **End-to-End Encryption (E2EE)**: Messages are encrypted in the browser using the industry-standard **AES-GCM 256-bit** algorithm via the native Web Crypto API.
- **Zero-Knowledge Architecture**: The relay server only handles encrypted payloads (ciphertext). It never has access to your plain-text messages or encryption keys.
- **Ephemeral & Stateless**: All data is stored in-memory. Once a room is closed by the admin, every trace of the conversation is wiped forever.
- **Secure Key Derivation**: Optional room passwords use **PBKDF2** with 100,000 iterations and unique salts to derive a Key Encryption Key (KEK) for secure master key sharing.
- **Real-Time Communication**: Seamless, low-latency messaging powered by WebSockets.
- **Modern UI/UX**: A sleek, dark-themed interface built with Tailwind CSS and smooth animations via Framer Motion.

## 🛠️ Technical Deep Dive

### 1. Key Generation
Upon room creation, a high-entropy 256-bit AES-GCM key is generated locally using `window.crypto.subtle`. This master key never leaves your device in plain text.

### 2. Password Derivation
If a password is set, we use **PBKDF2** with 100,000 iterations and a unique salt to derive a Key-Encryption-Key (KEK). The room's master key is then encrypted with this KEK before being sent to the relay server.

### 3. Blind Relay Architecture
The server acts as a simple WebSocket broadcaster. It receives encrypted payloads and broadcasts them to all members of the room. Since it lacks the keys, it has no capability to decrypt the content.

## 📦 Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/securegc.git
   cd securegc
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## 🛡️ Security Considerations

- **Browser-Based**: Security relies on the integrity of the browser and the Web Crypto API.
- **No Persistence**: This app is designed for "burn-after-reading" scenarios. Do not use it if you need message history.
- **Admin Control**: The room creator (Admin) has the sole authority to close the room and wipe the data for all participants.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Built with privacy in mind. SecureGC - It's the standard.*
