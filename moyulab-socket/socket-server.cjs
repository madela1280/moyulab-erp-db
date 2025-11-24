// server/socket-server.js

const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");

const app = express();
const httpServer = createServer(app);

// --- Socket.IO 서버 생성 ---
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- 클라이언트 연결 로그 ---
io.on("connection", (socket) => {
  console.log("🔌 클라이언트 연결됨:", socket.id);

  // global 룸에 참여
  socket.on("join", (room) => {
    socket.join(room);
    console.log(`📌 ${socket.id} → ${room} 참여`);
  });

  // 통합 데이터 업데이트 브로드캐스트
  socket.on("update", (data) => {
    console.log("📡 update 수신 → 전체에게 전송");
    io.to("global").emit("update", data);
  });

  // 통합 Redis style broadcast
  socket.on("unified:update", (data) => {
    console.log("📡 unified:update 수신 → 전체에게 전송");
    io.to("global").emit("unified:update", data);
  });

  socket.on("disconnect", () => {
    console.log("❌ 연결 해제:", socket.id);
  });
});

// --- 서버 실행 ---
const PORT = process.env.PORT || 4001;  // ⬅⬅ Render 규칙 (필수)
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Socket.IO 서버 실행중 → http://0.0.0.0:${PORT}`);
});

