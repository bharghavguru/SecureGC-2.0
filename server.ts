import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { v4 as uuidv4 } from "uuid";

interface Room {
  id: string;
  name: string;
  passwordHash?: string;
  encryptedKey: string; // The master key encrypted with the room password
  adminId: string;
  members: Map<string, { username: string; ws: WebSocket }>;
  createdAt: number;
}

const rooms = new Map<string, Room>();

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/rooms", (req, res) => {
    const { name, passwordHash, encryptedKey, adminUsername } = req.body;
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const room: Room = {
      id: roomId,
      name,
      passwordHash,
      encryptedKey,
      adminId: "", // Will be set on first WS connection
      members: new Map(),
      createdAt: Date.now(),
    };
    
    rooms.set(roomId, room);
    res.json({ roomId });
  });

  app.get("/api/rooms/:id", (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room) return res.status(404).json({ error: "Room not found" });
    
    res.json({
      id: room.id,
      name: room.name,
      hasPassword: !!room.passwordHash,
      encryptedKey: room.encryptedKey,
    });
  });

  // WebSocket Logic
  wss.on("connection", (ws) => {
    let currentRoomId: string | null = null;
    let userId = uuidv4();

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "join": {
          const { roomId, username, passwordHash } = message;
          const room = rooms.get(roomId);

          if (!room) {
            ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
            return;
          }

          if (room.members.size >= 5) {
            ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
            return;
          }

          if (room.passwordHash && room.passwordHash !== passwordHash) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid password" }));
            return;
          }

          currentRoomId = roomId;
          if (!room.adminId) room.adminId = userId;

          room.members.set(userId, { username, ws });

          // Send assigned ID back to the user
          ws.send(JSON.stringify({
            type: "init",
            userId,
            isAdmin: room.adminId === userId
          }));

          // Notify others
          const joinNotification = JSON.stringify({
            type: "user_joined",
            userId,
            username,
            timestamp: Date.now(),
            members: Array.from(room.members.entries()).map(([id, m]) => ({ id, username: m.username })),
            adminId: room.adminId
          });

          room.members.forEach((member) => {
            member.ws.send(joinNotification);
          });
          break;
        }

        case "chat": {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const chatPayload = JSON.stringify({
            type: "chat",
            userId,
            username: room.members.get(userId)?.username,
            content: message.content, // This is ciphertext
            timestamp: Date.now(),
          });

          room.members.forEach((member) => {
            member.ws.send(chatPayload);
          });
          break;
        }

        case "close_room": {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (!room || room.adminId !== userId) return;

          const closeNotification = JSON.stringify({ 
            type: "room_closed",
            adminUsername: room.members.get(userId)?.username || "Admin"
          });
          
          room.members.forEach((member) => {
            member.ws.send(closeNotification);
          });
          
          // Delete the room from memory
          rooms.delete(currentRoomId);
          break;
        }
      }
    });

    ws.on("close", () => {
      if (currentRoomId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          const leavingUser = room.members.get(userId);
          const wasAdmin = room.adminId === userId;
          
          room.members.delete(userId);
          
          if (room.members.size === 0) {
            rooms.delete(currentRoomId);
          } else {
            let newAdminId = room.adminId;
            let adminSuccession = false;

            if (wasAdmin) {
              // Assign new admin: the first one in the remaining members map
              const nextMemberId = room.members.keys().next().value;
              if (nextMemberId) {
                room.adminId = nextMemberId;
                newAdminId = nextMemberId;
                adminSuccession = true;
              }
            }

            const leaveNotification = JSON.stringify({
              type: "user_left",
              userId,
              username: leavingUser?.username || "Unknown User",
              wasAdmin,
              newAdminId,
              adminSuccession,
              timestamp: Date.now(),
              members: Array.from(room.members.entries()).map(([id, m]) => ({ id, username: m.username }))
            });

            room.members.forEach((member) => {
              member.ws.send(leaveNotification);
            });
          }
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
