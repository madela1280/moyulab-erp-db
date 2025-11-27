// 안정형 Socket.IO 서버 (Render 전용)
const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: { origin: "*" },
  transports: ["websocket"],
  pingInterval: 25000,
  pingTimeout: 60000,
});

io.on("connection", (socket) => {
  socket.join("global");
  console.log("🔌 연결:", socket.id);

  socket.on("unified:update", () => {
    io.to("global").emit("unified:update");
  });

  socket.on("disconnect", () => {
    console.log("❌ 해제:", socket.id);
  });
});

httpServer.listen(process.env.PORT || 4001, () => {
  console.log("🚀 Socket server OK");
});





