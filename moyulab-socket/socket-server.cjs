// socket-server.cjs (Render 전용 안정화 최종 버전)

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();

/* ------------------------------------
   🔥 Render Health Check
   - Render Dashboard → Health Check Path: /healthz 입력
   - 반드시 200 OK 응답 제공해야 재시작 루프 중단됨
------------------------------------ */
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

// ------------------- HTTP 서버 -------------------
const httpServer = createServer(app);

// ------------------- Socket.IO 서버 -------------------
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],  // 안정성 극대화
  pingInterval: 25000,
  pingTimeout: 60000,
});

io.on("connection", (socket) => {
  console.log("🔌 클라이언트 연결:", socket.id);

  // global 룸 참여
  socket.on("join", (room) => {
    socket.join(room);
    console.log(`📌 ${socket.id} → ${room} 참여`);
  });

  // 통합 데이터 업데이트
  socket.on("unified:update", () => {
    io.to("global").emit("unified:update");
  });

  socket.on("disconnect", () => {
    console.log("❌ 연결 해제:", socket.id);
  });
});

// ------------------- Render PORT -------------------
const PORT = process.env.PORT || 4001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO 서버 실행중 (Render PORT=${PORT})`);
});






