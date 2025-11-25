const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require("express");

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
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

httpServer.listen(4001, "0.0.0.0", () => {
  console.log(`🚀 Socket.IO 서버 실행중 → 4001`);
});

