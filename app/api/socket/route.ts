import { NextRequest } from "next/server";
import { Server as IOServer } from "socket.io";

let io: IOServer | null = null;

export const GET = (req: NextRequest) => {
  // @ts-ignore
  const server = (req as any).nextUrl?.server;

  // 이미 소켓 서버가 만들어져 있으면 재사용
  if (io) {
    return new Response("socket server running", { status: 200 });
  }

  // Next.js 내부 HTTP 서버에서 소켓 서버 시작
  // Render는 이 서버에 HTTPS → WSS 자동 적용함
  // @ts-ignore
  io = new IOServer(server, {
    path: "/socket",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 클라이언트 연결됨:", socket.id);

    socket.on("join", (room) => {
      socket.join(room);
    });

    socket.on("unified:update", (rows) => {
      socket.broadcast.emit("unified:refresh", rows);
    });

    socket.on("disconnect", () => {});
  });

  return new Response("socket server started", { status: 200 });
};
