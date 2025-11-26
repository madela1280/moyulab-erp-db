// 🔥 영구불변 소켓 클라이언트
// 모든 ERP 화면은 여기서 만든 socket 하나만 사용한다.

const { io } = require("socket.io-client");

// Render에서는 https:// 로 접속해야 WebSocket 업그레이드가 정상 작동함
const SOCKET_URL = "https://moyulab-socket.onrender.com";

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1500,
});

socket.on("connect", () => {
  socket.emit("join", "global");
});

module.exports = socket;

