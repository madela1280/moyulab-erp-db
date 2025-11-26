// socket-server.cjs  (Render 전용 안정화 풀버전)

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();

// Render health check
app.get("/", (req, res) => {
  res.send("Socket server running");
});

// HTTP 서버
const httpServer = createServer(app);

// Socket.IO 서버
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],   // 안정성 위해 복원
  pingInterval: 25000,                    // Render/Cloudflare 최적값
  pingTimeout: 60000                      // 지연 대비 확장
});

io.on("connection", (socket) => {
  console.log("🔌 클라이언트 연결:", socket.id);

  socket.on("join", (room) => {
    socket.join(room);
    console.log(`📌 ${socket.id} → ${room} 참여`);
  });

  socket.on("unified:update", () => {
    io.to("global").emit("unified:update");
  });

  socket.on("disconnect", () => {
    console.log("❌ 연결 해제:", socket.id);
  });
});

// Render 제공 PORT 사용
const PORT = process.env.PORT || 10000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO 서버 실행중 (Render PORT=${PORT})`);
});





