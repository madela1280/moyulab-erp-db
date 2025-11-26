const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");

const app = express();
const httpServer = createServer(app);

// 🔥 끊김 방지 핵심 옵션 추가
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingInterval: 25000,   // 기본 25000ms → 연장
  pingTimeout: 60000,    // 기본 20000ms → 대폭 증가
  maxHttpBufferSize: 1e8 // 안정성 확보
});

// 🔌 연결
io.on("connection", (socket) => {
  console.log("🔌 클라이언트 연결:", socket.id);

  socket.on("join", (room) => {
    socket.join(room);
    console.log(`📌 ${socket.id} → ${room} 참여`);
  });

  // 🔥 업데이트 브로드캐스트 (삭제 포함)
  socket.on("unified:update", () => {
    io.to("global").emit("unified:update");
  });

  socket.on("disconnect", () => {
    console.log("❌ 연결 해제:", socket.id);
  });
});

const PORT = process.env.PORT || 4001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO 서버 실행중 → ${PORT}`);
});



