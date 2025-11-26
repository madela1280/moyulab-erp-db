// 🔥 영구불변 소켓 클라이언트
// 모든 ERP 화면은 여기서 만든 socket 하나만 사용한다.

const { io } = require("socket.io-client");

// 서버 소켓 주소 - 바꾸지 말 것
const SOCKET_URL = process.env.SOCKET_URL || "wss://moulab.kr:4001";

// 단 하나의 socket 인스턴스 (절대 여러 번 만들지 않음)
const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1500,
});

// 글로벌 룸 참여
socket.on("connect", () => {
  socket.emit("join", "global");
});

// 모듈에서 socket 하나만 export
module.exports = socket;
