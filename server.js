const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});
let waitingUser = null;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("start searching", () => {
    if (waitingUser) {
      const roomId = `room-${waitingUser.id}-${socket.id}`;

      waitingUser.join(roomId);
      socket.join(roomId);

      waitingUser.emit("matched", { initiator: true });
      socket.emit("matched", { initiator: false });

      waitingUser.roomId = roomId;
      socket.roomId = roomId;

      console.log("Matched:", roomId);

      waitingUser = null;
    } else {
      waitingUser = socket;

      console.log("Waiting for partner...");
    }
  });

  socket.on("next", () => {
    if (waitingUser === socket) {
      waitingUser = null;
    }

    if (socket.roomId) {
      const roomId = socket.roomId;
      const room = io.sockets.adapter.rooms.get(roomId);

      if (room) {
        room.forEach((id) => {
          if (id !== socket.id) {
            const partnerSocket = io.sockets.sockets.get(id);

            if (partnerSocket) {
              partnerSocket.leave(roomId);
              partnerSocket.roomId = null;
              // 相手に通知するだけ。再検索はフロントからの start searching に任せる
              partnerSocket.emit("partner disconnected");
              console.log(
                "next pressed by:",
                socket.id,
                "roomId:",
                socket.roomId,
              ); // 追加
            }
          }
        });
      }

      socket.leave(roomId);
      socket.roomId = null;
    }

    // next押した本人も再検索
    if (waitingUser) {
      const newRoomId = `room-${waitingUser.id}-${socket.id}`;
      waitingUser.join(newRoomId);
      socket.join(newRoomId);
      waitingUser.emit("matched", { initiator: true });
      socket.emit("matched", { initiator: false });
      waitingUser.roomId = newRoomId;
      socket.roomId = newRoomId;
      waitingUser = null;
    } else {
      waitingUser = socket;
    }
  });

  socket.on("offer", ({ offer }) => {
    socket.to(socket.roomId).emit("offer", offer);
  });

  socket.on("answer", ({ answer }) => {
    socket.to(socket.roomId).emit("answer", answer);
  });

  socket.on("ice-candidate", ({ candidate }) => {
    socket.to(socket.roomId).emit("ice-candidate", candidate);
  });

  socket.on("chat message", (msg) => {
    console.log("Message:", msg);

    socket.to(socket.roomId).emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    if (waitingUser === socket) {
      waitingUser = null;
    }

    console.log("User disconnected:", socket.id);
  });

  socket.on("stop searching", () => {
    if (waitingUser === socket) {
      waitingUser = null;
    }

    // 追加：相手に通知
    if (socket.roomId) {
      const roomId = socket.roomId;
      const room = io.sockets.adapter.rooms.get(roomId);

      if (room) {
        room.forEach((id) => {
          if (id !== socket.id) {
            const partnerSocket = io.sockets.sockets.get(id);
            if (partnerSocket) {
              partnerSocket.leave(roomId);
              partnerSocket.roomId = null;
              partnerSocket.emit("partner disconnected");
            }
          }
        });
      }

      socket.leave(roomId);
      socket.roomId = null;
    }

    console.log("Stopped searching");
  });
});

httpServer.listen(3001, () => {
  console.log("Socket.IO server running on port 3001");
});
