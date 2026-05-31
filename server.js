/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { Server } = require("socket.io");

const certPath = path.join(__dirname, "certificates", "cert.pem");
const keyPath = path.join(__dirname, "certificates", "key.pem");
const hasHttpsCertificates = fs.existsSync(certPath) && fs.existsSync(keyPath);

const httpServer = hasHttpsCertificates
  ? https.createServer({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    })
  : http.createServer();

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const queues = new Map();
const queuedSocketIds = new Set();
const reports = new Map();
const bans = new Map();
const REPORT_WINDOW_MS = 10 * 60 * 1000;
const REPORT_THRESHOLD = 3;
const BAN_DURATION_MS = 10 * 60 * 1000;

function normalizeCriteria(payload = {}) {
  return {
    country:
      typeof payload.country === "string" && payload.country.trim()
        ? payload.country.trim()
        : "Global",
    comment:
      typeof payload.comment === "string" && payload.comment.trim()
        ? payload.comment.trim()
        : "",
  };
}

function getQueueKey(criteria) {
  return `country:${criteria.country}`;
}

function getQueue(key) {
  if (!queues.has(key)) {
    queues.set(key, []);
  }

  return queues.get(key);
}

function getSocket(id) {
  return io.sockets.sockets.get(id);
}

function getActiveBanUntil(socketId) {
  const bannedUntil = bans.get(socketId);

  if (!bannedUntil) {
    return null;
  }

  if (bannedUntil <= Date.now()) {
    bans.delete(socketId);
    return null;
  }

  return bannedUntil;
}

function notifyBan(socket, bannedUntil) {
  socket.emit("ban-notice", {
    until: new Date(bannedUntil).toISOString(),
  });
}

function isBanned(socket) {
  const bannedUntil = getActiveBanUntil(socket.id);

  if (!bannedUntil) {
    return false;
  }

  removeFromQueue(socket);
  cleanupRoom(socket);
  notifyBan(socket, bannedUntil);
  return true;
}

function isMatchable(entry) {
  const socket = getSocket(entry.socketId);

  return (
    socket &&
    socket.connected &&
    queuedSocketIds.has(socket.id) &&
    !socket.data.roomId
  );
}

function compactQueue(key) {
  const queue = getQueue(key);
  const compacted = [];

  for (const entry of queue) {
    if (isMatchable(entry)) {
      compacted.push(entry);
    } else {
      queuedSocketIds.delete(entry.socketId);
    }
  }

  queues.set(key, compacted);

  return compacted;
}

function removeFromQueue(socket) {
  const key = socket.data.queueKey;

  queuedSocketIds.delete(socket.id);
  socket.data.searching = false;
  socket.data.queueKey = null;

  if (!key || !queues.has(key)) {
    return;
  }

  const queue = queues.get(key).filter((entry) => entry.socketId !== socket.id);

  if (queue.length > 0) {
    queues.set(key, queue);
  } else {
    queues.delete(key);
  }
}

function createRoomId(socketA, socketB) {
  return `room-${socketA.id}-${socketB.id}-${Date.now()}`;
}

function markMatched(socket, roomId) {
  queuedSocketIds.delete(socket.id);
  socket.data.searching = false;
  socket.data.queueKey = null;
  socket.data.roomId = roomId;
  socket.roomId = roomId;
  socket.join(roomId);
}

function matchSockets(socketA, socketB) {
  if (!socketA || !socketB || socketA.id === socketB.id) {
    return false;
  }

  if (socketA.data.roomId || socketB.data.roomId) {
    return false;
  }

  const roomId = createRoomId(socketA, socketB);

  markMatched(socketA, roomId);
  markMatched(socketB, roomId);

  socketA.emit("matched", {
    initiator: true,
    partnerComment: socketB.data.criteria?.comment ?? "",
  });
  socketB.emit("matched", {
    initiator: false,
    partnerComment: socketA.data.criteria?.comment ?? "",
  });

  console.log("Matched:", roomId);

  return true;
}

function tryMatch(key) {
  const queue = compactQueue(key);

  while (queue.length > 1) {
    const first = queue.shift();
    queuedSocketIds.delete(first.socketId);

    const secondIndex = queue.findIndex(
      (entry) => entry.socketId !== first.socketId,
    );

    if (secondIndex === -1) {
      queue.unshift(first);
      queuedSocketIds.add(first.socketId);
      break;
    }

    const [second] = queue.splice(secondIndex, 1);
    queuedSocketIds.delete(second.socketId);

    const firstSocket = getSocket(first.socketId);
    const secondSocket = getSocket(second.socketId);

    if (!matchSockets(firstSocket, secondSocket)) {
      if (firstSocket && firstSocket.connected && !firstSocket.data.roomId) {
        enqueue(firstSocket, first.criteria);
      }

      if (secondSocket && secondSocket.connected && !secondSocket.data.roomId) {
        enqueue(secondSocket, second.criteria);
      }
    }
  }

  if (queue.length > 0) {
    queues.set(key, queue);
  } else {
    queues.delete(key);
  }
}

function enqueue(socket, criteria = normalizeCriteria()) {
  if (
    !socket.connected ||
    getActiveBanUntil(socket.id) ||
    socket.data.roomId ||
    queuedSocketIds.has(socket.id)
  ) {
    return;
  }

  const key = getQueueKey(criteria);
  const queue = getQueue(key);

  queuedSocketIds.add(socket.id);
  socket.data.searching = true;
  socket.data.queueKey = key;
  socket.data.criteria = criteria;

  queue.push({
    socketId: socket.id,
    criteria,
    queuedAt: Date.now(),
  });

  console.log("Waiting for partner:", socket.id, key);

  tryMatch(key);
}

function cleanupRoom(socket, { notifyPartner = true } = {}) {
  const roomId = socket.data.roomId || socket.roomId;

  if (!roomId) {
    return;
  }

  const room = io.sockets.adapter.rooms.get(roomId);
  const partnerIds = room ? [...room].filter((id) => id !== socket.id) : [];

  socket.leave(roomId);
  socket.data.roomId = null;
  socket.roomId = null;

  for (const partnerId of partnerIds) {
    const partnerSocket = getSocket(partnerId);

    if (!partnerSocket) {
      continue;
    }

    partnerSocket.leave(roomId);
    partnerSocket.data.roomId = null;
    partnerSocket.roomId = null;

    if (notifyPartner) {
      partnerSocket.emit("partner disconnected");
    }
  }
}

function banSocket(socket) {
  const bannedUntil = Date.now() + BAN_DURATION_MS;

  bans.set(socket.id, bannedUntil);
  removeFromQueue(socket);
  cleanupRoom(socket);
  notifyBan(socket, bannedUntil);

  console.log(
    ["BAN", `User: ${socket.id}`, `Until: ${new Date(bannedUntil).toISOString()}`].join(
      "\n",
    ),
  );
}

function recordReport(reportedSocketId) {
  const now = Date.now();
  const recentReports = (reports.get(reportedSocketId) || []).filter(
    (reportedAt) => now - reportedAt <= REPORT_WINDOW_MS,
  );

  recentReports.push(now);
  reports.set(reportedSocketId, recentReports);

  return recentReports.length;
}

io.on("connection", (socket) => {
  socket.data.roomId = null;
  socket.data.queueKey = null;
  socket.data.searching = false;
  socket.data.criteria = normalizeCriteria();

  console.log("User connected:", socket.id);

  socket.on("start searching", (payload = {}) => {
    if (isBanned(socket)) {
      return;
    }

    const criteria = normalizeCriteria(payload);

    socket.data.criteria = criteria;
    enqueue(socket, criteria);
  });

  socket.on("next", (payload = {}) => {
    if (isBanned(socket)) {
      return;
    }

    const hasPayload =
      payload && typeof payload === "object" && Object.keys(payload).length > 0;
    const criteria = hasPayload
      ? normalizeCriteria(payload)
      : socket.data.criteria || normalizeCriteria();

    removeFromQueue(socket);
    cleanupRoom(socket);
    enqueue(socket, criteria);
  });

  socket.on("offer", ({ offer }) => {
    if (!socket.data.roomId) {
      return;
    }

    socket.to(socket.data.roomId).emit("offer", offer);
  });

  socket.on("answer", ({ answer }) => {
    if (!socket.data.roomId) {
      return;
    }

    socket.to(socket.data.roomId).emit("answer", answer);
  });

  socket.on("ice-candidate", ({ candidate }) => {
    if (!socket.data.roomId) {
      return;
    }

    socket.to(socket.data.roomId).emit("ice-candidate", candidate);
  });

  socket.on("chat message", (msg) => {
    if (!socket.data.roomId) {
      return;
    }

    console.log("Message:", msg);

    socket.to(socket.data.roomId).emit("chat message", msg);
  });

  socket.on("report-user", ({ reason } = {}) => {
    const roomId = socket.data.roomId;

    if (!roomId) {
      return;
    }

    const room = io.sockets.adapter.rooms.get(roomId);
    const reportedSocketId = room
      ? [...room].find((socketId) => socketId !== socket.id)
      : null;

    if (!reportedSocketId) {
      return;
    }

    console.log(
      [
        "REPORT",
        `Reporter: ${socket.id}`,
        `Reported: ${reportedSocketId}`,
        `Reason: ${typeof reason === "string" ? reason : ""}`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n"),
    );

    const reportCount = recordReport(reportedSocketId);
    const reportedSocket = getSocket(reportedSocketId);

    if (
      reportCount >= REPORT_THRESHOLD &&
      reportedSocket &&
      !getActiveBanUntil(reportedSocket.id)
    ) {
      banSocket(reportedSocket);
    }
  });

  socket.on("comment update", ({ comment }) => {
    const normalizedComment = typeof comment === "string" ? comment.trim() : "";

    socket.data.criteria = socket.data.criteria || normalizeCriteria();
    socket.data.criteria.comment = normalizedComment;

    if (!socket.data.roomId) {
      return;
    }

    socket.to(socket.data.roomId).emit("comment update", {
      comment: normalizedComment,
    });
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket);
    cleanupRoom(socket);

    console.log("User disconnected:", socket.id);
  });

  socket.on("stop searching", () => {
    removeFromQueue(socket);
    cleanupRoom(socket);

    console.log("Stopped searching:", socket.id);
  });
});

httpServer.listen(3001, () => {
  console.log(
    `Socket.IO server running on ${hasHttpsCertificates ? "https" : "http"} port 3001`,
  );
});
