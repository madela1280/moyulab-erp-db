// 🔥 영구불변 소켓 클라이언트
const { io } = require("socket.io-client");

const SOCKET_URL = "wss://moyulab-socket.onrender.com";

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1500,
});

socket.on("connect", () => {
  socket.emit("join", "global");
});

// 🔥 default + named 둘 다 export
module.exports = socket;
module.exports.socket = socket;

