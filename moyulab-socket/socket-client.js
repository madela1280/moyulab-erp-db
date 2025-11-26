// 🔥 영구불변 소켓 클라이언트
// 모든 ERP 화면은 여기서 만든 socket 하나만 사용한다.

const { io } = require("socket.io-client");

// 👉 실제 동작하는 소켓 서버 주소는 오직 이것뿐
const SOCKET_URL = "wss://moyulab-socket.onrender.com";

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1500,
});

socket.on("connect", () => {
  socket.emit("join", "global");
  console.log("🔌 connected to socket server");
});

module.exports = socket;



