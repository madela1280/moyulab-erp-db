// socket-server.cjs

const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");

// Render에서 필수: 포트를 환경변수로 받아야 함
const PORT = process.env.PORT || 4001;

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 클라이언트 연결
io.on("connection", (socket) => {
  console.log("🔌 클라이언트 연결:", socket.id);

  // global 룸 참여
  socket.join("global");
  console.log(`📌 ${socket.id} → global 참여`);

  // 업데이트 수신 → 전체 브로드캐스트
  socket.on("unified:update", () => {
    console.log("📡 update → 전체에게 전송");
    io.to("global").emit("unified:update");
  });

  // 연결 해제
  socket.on("disconnect", () => {
    console.log("❌ 연결 해제:", socket.id);
  });
});

// Render에서 반드시 이렇게 실행해야 포트 인식됨
httpServer.listen(PORT, () => {
  console.log(`🚀 Socket server running on PORT: ${PORT}`);
});






