// socket-server.cjs
// 🚀 Render WebSocket 안정형 최종본

const { createServer } = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const httpServer = createServer(app);

// CORS 허용은 중요함 (Render 특성)
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 25000, // 25초마다 ping → 끊김 방지
  pingTimeout: 60000,  // 60초까지 응답 없어도 유지
});

// 로그
io.on("connection", (socket) => {
  console.log("🔌 클라이언트 연결:", socket.id);

  socket.on("join", (room) => {
    socket.join(room);
    console.log(`📌 ${socket.id} → ${room} 참여`);
  });

  // 통합 데이터 갱신
  socket.on("unified:update", () => {
    console.log("📡 update → broadcast");
    io.to("global").emit("unified:update");
  });

  socket.on("disconnect", () => {
    console.log(`❌ 연결 해제: ${socket.id}`);
  });
});

// Render 제공 PORT 사용
const PORT = process.env.PORT || 4001;

httpServer.listen(PORT, () => {
  console.log("🚀 Socket server running on PORT:", PORT);
});







