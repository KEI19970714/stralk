/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { Server } = require("socket.io");

const certPath = path.join(__dirname, "certificates", "cert.pem");
const keyPath = path.join(__dirname, "certificates", "key.pem");
const banDataPath = path.join(__dirname, "ban-data.json");
const envLocalPath = path.join(__dirname, ".env.local");
const hasHttpsCertificates = fs.existsSync(certPath) && fs.existsSync(keyPath);

function loadEnvLocal() {
  if (!fs.existsSync(envLocalPath)) {
    return;
  }

  try {
    for (const line of fs.readFileSync(envLocalPath, "utf8").split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine.slice(separatorIndex + 1).trim();

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.error("Failed to load .env.local:", error);
  }
}

loadEnvLocal();

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
const reportsByTarget = new Map();
const bans = new Map();
const REPORT_WINDOW_MS = 10 * 60 * 1000;
const REPORT_THRESHOLD = 3;
const BAN_DURATION_MS = 10 * 60 * 1000;
const IPINFO_TOKEN = process.env.IPINFO_TOKEN?.trim();
const DEFAULT_COUNTRY = "GLOBAL";
const GLOBAL_COUNTRY = "Global";
const COUNTRY_CODE_NAMES = {
  BR: "Brazil",
  CN: "China",
  DE: "Germany",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  HK: "Hong Kong",
  ID: "Indonesia",
  IN: "India",
  IT: "Italy",
  JP: "Japan",
  KR: "South Korea",
  MX: "Mexico",
  MY: "Malaysia",
  PH: "Philippines",
  SA: "Saudi Arabia",
  SG: "Singapore",
  TH: "Thailand",
  TR: "Turkey",
  TW: "Taiwan",
  US: "United States",
  VN: "Vietnam",
};

function normalizeCountry(value, fallback = GLOBAL_COUNTRY) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const country = value.trim();
  const upperCountry = country.toUpperCase();

  if (upperCountry === DEFAULT_COUNTRY || upperCountry === "GLOBAL") {
    return GLOBAL_COUNTRY;
  }

  return COUNTRY_CODE_NAMES[upperCountry] || country;
}

function normalizeCriteria(payload = {}) {
  const targetCountry =
    typeof payload.targetCountry === "string"
      ? normalizeCountry(payload.targetCountry)
      : typeof payload.country === "string" && payload.country.trim()
        ? normalizeCountry(payload.country)
        : GLOBAL_COUNTRY;

  return {
    myCountry:
      typeof payload.myCountry === "string" && payload.myCountry.trim()
        ? normalizeCountry(payload.myCountry)
        : GLOBAL_COUNTRY,
    targetCountry,
    country: targetCountry,
    comment:
      typeof payload.comment === "string" && payload.comment.trim()
        ? payload.comment.trim()
        : "",
  };
}

function getQueueKey(criteria) {
  return `targetCountry:${criteria.targetCountry}`;
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

function getClientIp(socket) {
  const forwardedFor = socket.handshake.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0];
  const ip = rawIp?.trim() || socket.handshake.address || "";

  return ip.replace(/^::ffff:/, "");
}

async function fetchMyCountry(socket) {
  if (!IPINFO_TOKEN) {
    return DEFAULT_COUNTRY;
  }

  const clientIp = getClientIp(socket);

  if (!clientIp) {
    return DEFAULT_COUNTRY;
  }

  try {
    const response = await fetch(
      `https://api.ipinfo.io/lite/${encodeURIComponent(
        clientIp,
      )}?token=${encodeURIComponent(IPINFO_TOKEN)}`,
    );

    if (!response.ok) {
      return DEFAULT_COUNTRY;
    }

    const data = await response.json();
    const countryCode =
      typeof data?.country_code === "string"
        ? data.country_code.trim().toUpperCase()
        : "";

    return countryCode || DEFAULT_COUNTRY;
  } catch (error) {
    console.error("Country detection failed:", error);
    return DEFAULT_COUNTRY;
  }
}

async function assignMyCountry(socket) {
  console.log(`Client IP: ${getClientIp(socket) || "unknown"}`);

  const myCountry = await fetchMyCountry(socket);

  console.log(`Country detected: ${myCountry}`);

  socket.data.myCountry = myCountry;
  socket.emit("my-country", { myCountry });
}

function saveBans() {
  const now = Date.now();
  const activeBans = {};

  for (const [socketId, bannedUntil] of bans) {
    if (bannedUntil > now) {
      activeBans[socketId] = bannedUntil;
    } else {
      bans.delete(socketId);
    }
  }

  try {
    fs.writeFileSync(banDataPath, JSON.stringify(activeBans, null, 2));
  } catch (error) {
    console.error("Failed to save ban data:", error);
  }
}

function loadBans() {
  if (!fs.existsSync(banDataPath)) {
    return;
  }

  try {
    const rawBanData = fs.readFileSync(banDataPath, "utf8");
    const parsedBanData = JSON.parse(rawBanData);

    if (!parsedBanData || typeof parsedBanData !== "object") {
      return;
    }

    const now = Date.now();
    let removedExpiredBan = false;

    for (const [socketId, bannedUntil] of Object.entries(parsedBanData)) {
      if (typeof bannedUntil !== "number" || !Number.isFinite(bannedUntil)) {
        continue;
      }

      if (bannedUntil > now) {
        bans.set(socketId, bannedUntil);
      } else {
        removedExpiredBan = true;
      }
    }

    if (removedExpiredBan) {
      saveBans();
    }
  } catch (error) {
    console.error("Failed to load ban data:", error);
  }
}

function getActiveBanUntil(socketId) {
  const bannedUntil = bans.get(socketId);

  if (!bannedUntil) {
    return null;
  }

  if (bannedUntil <= Date.now()) {
    bans.delete(socketId);
    saveBans();
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
  console.log("Matched criteria:", {
    first: {
      myCountry: socketA.data.criteria?.myCountry,
      targetCountry: socketA.data.criteria?.targetCountry,
    },
    second: {
      myCountry: socketB.data.criteria?.myCountry,
      targetCountry: socketB.data.criteria?.targetCountry,
    },
  });

  return true;
}

function isGlobalCountry(country) {
  return normalizeCountry(country) === GLOBAL_COUNTRY;
}

function getQueuedEntries() {
  const entries = [];

  for (const key of [...queues.keys()]) {
    entries.push(...compactQueue(key));
  }

  return entries;
}

function findPartnerEntry(first, entries) {
  const preferred = [];
  const fallback = [];
  const firstTargetCountry = normalizeCountry(first.criteria?.targetCountry);

  for (const entry of entries) {
    if (entry.socketId === first.socketId || !isMatchable(entry)) {
      continue;
    }

    if (
      isGlobalCountry(firstTargetCountry) ||
      normalizeCountry(entry.criteria?.myCountry) === firstTargetCountry
    ) {
      preferred.push(entry);
      continue;
    }

    fallback.push(entry);
  }

  return preferred[0] || fallback[0] || null;
}

function tryMatch() {
  let matched = true;

  while (matched) {
    matched = false;
    const entries = getQueuedEntries();

    for (const first of entries) {
      if (!isMatchable(first)) {
        continue;
      }

      const second = findPartnerEntry(first, entries);

      if (!second) {
        continue;
      }

      const firstSocket = getSocket(first.socketId);
      const secondSocket = getSocket(second.socketId);

      if (firstSocket) {
        removeFromQueue(firstSocket);
      }

      if (secondSocket) {
        removeFromQueue(secondSocket);
      }

      if (!matchSockets(firstSocket, secondSocket)) {
        if (firstSocket && firstSocket.connected && !firstSocket.data.roomId) {
          enqueue(firstSocket, first.criteria);
        }

        if (secondSocket && secondSocket.connected && !secondSocket.data.roomId) {
          enqueue(secondSocket, second.criteria);
        }
      }

      matched = true;
      break;
    }
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

  console.log("Waiting for partner:", socket.id, key, {
    myCountry: criteria.myCountry,
    targetCountry: criteria.targetCountry,
  });

  tryMatch();
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
  saveBans();
  removeFromQueue(socket);
  cleanupRoom(socket);
  notifyBan(socket, bannedUntil);

  console.log(
    ["BAN", `User: ${socket.id}`, `Until: ${new Date(bannedUntil).toISOString()}`].join(
      "\n",
    ),
  );
}

function recordReport(reportedSocketId, reporterSocketId) {
  const now = Date.now();
  const targetReports = reportsByTarget.get(reportedSocketId) || new Map();

  for (const [reporterId, reportedAt] of targetReports) {
    if (now - reportedAt > REPORT_WINDOW_MS) {
      targetReports.delete(reporterId);
    }
  }

  targetReports.set(reporterSocketId, now);
  reportsByTarget.set(reportedSocketId, targetReports);

  return targetReports.size;
}

loadBans();

io.on("connection", (socket) => {
  socket.data.roomId = null;
  socket.data.queueKey = null;
  socket.data.searching = false;
  socket.data.criteria = normalizeCriteria();
  socket.data.myCountry = DEFAULT_COUNTRY;
  socket.emit("my-country", { myCountry: socket.data.myCountry });
  void assignMyCountry(socket);

  console.log("User connected:", socket.id);

  socket.on("start searching", (payload = {}) => {
    if (isBanned(socket)) {
      return;
    }

    const criteria = normalizeCriteria(payload);

    socket.data.criteria = criteria;
    console.log("Search criteria:", criteria);
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
    console.log("Next criteria:", criteria);
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

    if (!reportedSocketId || reportedSocketId === socket.id) {
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

    const reportCount = recordReport(reportedSocketId, socket.id);
    const reportedSocket = getSocket(reportedSocketId);

    if (
      reportCount >= REPORT_THRESHOLD &&
      reportedSocket &&
      !getActiveBanUntil(reportedSocket.id)
    ) {
      banSocket(reportedSocket);
      reportsByTarget.delete(reportedSocketId);
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
