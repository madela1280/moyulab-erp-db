// socket-server.cjs  (Render 전용 안정화 버전)

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();

// ⭐ Render health check 대응: 기본 라우팅
app.get("/", (req, res) => {
  res.send("Socket server running");
});

// HTTP 서버 생성
const httpServer = createServer(app);

// ⭐ Socket.IO 서버 설정
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],     // 🔥 websocket 전용 → 끊김 감소 핵심
  pingInterval: 10000,           // 생존신호(클라이언트와 동일)
  pingTimeout: 20000             // 🔥 Render 지연 대비 timeout 증가
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

// ⭐ Render가 부여하는 PORT 사용
const PORT = process.env.PORT || 10000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO 서버 실행중 (Render PORT=${PORT})`);
});




