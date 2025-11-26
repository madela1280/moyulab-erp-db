// socket-server.cjs  (Render 전용 WSS 모드)

// ⚠️ 절대 포트번호 기반 리슨 금지(F.5)
// Render는 포트번호를 지정하면 안 되고,
// Render가 자동으로 환경 변수 PORT를 부여함.

const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");

const app = express();
const httpServer = createServer(app);

// ⭐ Render는 origin: "*", credentials 제거 권장
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  }
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

// ⭐ Render가 부여하는 PORT 사용 (포트번호 직접 금지)
const PORT = process.env.PORT || 10000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO 서버 실행중 (Render PORT=${PORT})`);
});



