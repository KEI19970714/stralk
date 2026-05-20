"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

type ChatMessage = { sender: "me" | "stranger"; text: string };

export default function Home() {
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const strangerVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localStreamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const localStreamRequestRef = useRef(0);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const connectionAttemptRef = useRef(0);
  const wantsSearchRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const desktopMessagesContainerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Idle");
  const [country, setCountry] = useState("Global");
  const [comment, setComment] = useState("");
  const [strangerComment, setStrangerComment] = useState("");
  const [message, setMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const commentRef = useRef(comment);
  const countryRef = useRef(country);

  useEffect(() => {
    commentRef.current = comment;
  }, [comment]);

  useEffect(() => {
    countryRef.current = country;
  }, [country]);

  const getSearchPayload = useCallback(() => {
    return {
      country: countryRef.current,
      comment: commentRef.current,
    };
  }, []);

  const attachLocalStream = useCallback((stream: MediaStream) => {
    if (myVideoRef.current && myVideoRef.current.srcObject !== stream) {
      myVideoRef.current.srcObject = stream;
    }
  }, []);

  const hasLiveTracks = useCallback((stream: MediaStream | null) => {
    return stream?.getTracks().some((track) => track.readyState === "live");
  }, []);

  const ensureLocalStream = useCallback(async () => {
    if (hasLiveTracks(localStreamRef.current)) {
      attachLocalStream(localStreamRef.current!);
      return localStreamRef.current!;
    }

    if (localStreamPromiseRef.current) {
      const stream = await localStreamPromiseRef.current;
      attachLocalStream(stream);
      return stream;
    }

    const requestId = localStreamRequestRef.current;

    localStreamPromiseRef.current = navigator.mediaDevices
      .getUserMedia({
        video: true,
        audio: true,
      })
      .then((stream) => {
        if (requestId !== localStreamRequestRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error("Local media request cancelled");
        }

        localStreamRef.current = stream;
        attachLocalStream(stream);
        return stream;
      })
      .finally(() => {
        localStreamPromiseRef.current = null;
      });

    return localStreamPromiseRef.current;
  }, [attachLocalStream, hasLiveTracks]);

  const cleanupConnection = useCallback(
    ({ stopLocalStream = false }: { stopLocalStream?: boolean } = {}) => {
      connectionAttemptRef.current += 1;
      pendingIceCandidatesRef.current = [];

      const pc = peerConnection.current;

      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;

        if (pc.signalingState !== "closed") {
          pc.getSenders().forEach((sender) => {
            if (sender.track) {
              pc.removeTrack(sender);
            }
          });

          pc.close();
        }

        peerConnection.current = null;
      }

      const remoteStream = strangerVideoRef.current
        ?.srcObject as MediaStream | null;

      remoteStream?.getTracks().forEach((track) => track.stop());

      if (stopLocalStream) {
        localStreamRequestRef.current += 1;
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        localStreamPromiseRef.current = null;

        if (myVideoRef.current) {
          myVideoRef.current.srcObject = null;
        }
      }

      if (strangerVideoRef.current) {
        strangerVideoRef.current.srcObject = null;
      }
    },
    [],
  );

  const flushIceCandidates = useCallback(async () => {
    const pc = peerConnection.current;

    if (!pc?.remoteDescription) {
      return;
    }

    const candidates = pendingIceCandidatesRef.current.splice(0);

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Failed to add queued ICE candidate:", error);
      }
    }
  }, []);

  const createPeerConnection = useCallback(
    (socket: Socket) => {
      const existingConnection = peerConnection.current;

      if (
        existingConnection &&
        existingConnection.signalingState !== "closed"
      ) {
        return existingConnection;
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peerConnection.current = pc;

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];

        if (strangerVideoRef.current) {
          strangerVideoRef.current.srcObject = remoteStream;
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);

        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed"
        ) {
          cleanupConnection();
          setStatus("Searching...");
          setMessages([]);
          setStrangerComment("");

          if (wantsSearchRef.current) {
            socket.emit("start searching", getSearchPayload());
          }
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            candidate: event.candidate,
          });
        }
      };

      return pc;
    },
    [cleanupConnection, getSearchPayload],
  );

  const startSearching = useCallback(async () => {
    const socket = socketRef.current;

    if (!socket) {
      return;
    }

    setStatus("Searching...");
    setMessages([]);
    setStrangerComment("");
    wantsSearchRef.current = true;
    cleanupConnection();

    try {
      await ensureLocalStream();

      if (!wantsSearchRef.current) {
        return;
      }

      socket.emit("start searching", getSearchPayload());
    } catch (error) {
      console.error("Camera error:", error);
      wantsSearchRef.current = false;
      setStatus("Idle");
    }
  }, [cleanupConnection, ensureLocalStream, getSearchPayload]);

  const nextPartner = useCallback(async () => {
    const socket = socketRef.current;

    if (!socket) {
      return;
    }

    setStatus("Searching...");
    setMessages([]);
    setStrangerComment("");
    wantsSearchRef.current = true;
    cleanupConnection();

    try {
      await ensureLocalStream();

      if (!wantsSearchRef.current) {
        return;
      }

      socket.emit("next", getSearchPayload());
    } catch (error) {
      console.error("Camera error:", error);
      wantsSearchRef.current = false;
      setStatus("Idle");
    }
  }, [cleanupConnection, ensureLocalStream, getSearchPayload]);

  const stopSearching = useCallback(() => {
    wantsSearchRef.current = false;
    setStatus("Idle");
    setMessages([]);
    setStrangerComment("");
    cleanupConnection({ stopLocalStream: true });
    socketRef.current?.emit("stop searching");
  }, [cleanupConnection]);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    const handleConnect = () => {
      console.log("Connected to server:", socket.id);
    };

    const handleMatched = async ({
      initiator,
      partnerComment,
    }: {
      initiator: boolean;
      partnerComment?: string;
    }) => {
      if (!wantsSearchRef.current) {
        socket.emit("stop searching");
        return;
      }

      const activeConnection = peerConnection.current;

      if (activeConnection && activeConnection.signalingState !== "closed") {
        return;
      }

      const attemptId = connectionAttemptRef.current;

      try {
        await ensureLocalStream();
      } catch (error) {
        console.error("Camera error:", error);
        setStatus("Idle");
        socket.emit("stop searching");
        return;
      }

      if (attemptId !== connectionAttemptRef.current) {
        return;
      }

      setStatus("Connected");

      const pc = createPeerConnection(socket);

      if (initiator && pc.signalingState === "stable") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { offer });
      }

      setStrangerComment(partnerComment?.trim() ?? "");
    };

    const handlePartnerDisconnected = () => {
      cleanupConnection();
      console.log("partner disconnected received!");

      if (!wantsSearchRef.current) {
        return;
      }

      setStatus("Searching...");
      setMessages([]);
      setStrangerComment("");
      socket.emit("start searching", getSearchPayload());
    };

    const handleChatMessage = (msg: string) => {
      setMessages((prev) => [
        ...prev,
        {
          sender: "stranger",
          text: msg,
        },
      ]);
    };

    const handleCommentUpdate = ({
      comment: incomingComment,
    }: {
      comment?: string;
    }) => {
      setStrangerComment(incomingComment?.trim() ?? "");
    };

    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      try {
        await ensureLocalStream();

        const pc = createPeerConnection(socket);

        if (pc.signalingState !== "stable") {
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushIceCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { answer });
      } catch (error) {
        console.error("Failed to handle offer:", error);
        cleanupConnection();
      }
    };

    const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
      const pc = peerConnection.current;

      if (!pc || pc.signalingState === "closed") {
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushIceCandidates();
      } catch (error) {
        console.error("Failed to handle answer:", error);
        cleanupConnection();
      }
    };

    const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
      const pc = peerConnection.current;

      if (!pc || !pc.remoteDescription) {
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Failed to add ICE candidate:", error);
      }
    };

    socket.on("connect", handleConnect);
    socket.on("matched", handleMatched);
    socket.on("partner disconnected", handlePartnerDisconnected);
    socket.on("chat message", handleChatMessage);
    socket.on("comment update", handleCommentUpdate);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("matched", handleMatched);
      socket.off("partner disconnected", handlePartnerDisconnected);
      socket.off("chat message", handleChatMessage);
      socket.off("comment update", handleCommentUpdate);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
      socket.disconnect();
      socketRef.current = null;
      wantsSearchRef.current = false;
      cleanupConnection({ stopLocalStream: true });
    };
  }, [
    cleanupConnection,
    createPeerConnection,
    ensureLocalStream,
    flushIceCandidates,
    getSearchPayload,
  ]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }

    if (desktopMessagesContainerRef.current) {
      desktopMessagesContainerRef.current.scrollTo({
        top: desktopMessagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const isSearching = status === "Searching...";
  const isConnected = status === "Connected";

  const sendMessage = () => {
    if (message.trim() === "") return;

    const userMessage: ChatMessage = {
      sender: "me",
      text: message,
    };

    setMessages((prev) => [...prev, userMessage]);
    socketRef.current?.emit("chat message", message);
    setMessage("");
  };

  useEffect(() => {
    socketRef.current?.emit("comment update", {
      comment,
    });
  }, [comment]);

  return (
    <main className="mobile-shell relative overflow-hidden bg-black text-white md:bg-white md:text-neutral-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#2f2f38_0%,#050505_42%,#000_100%)] md:hidden" />

      <section className="mobile-video-stack relative z-10 flex flex-col gap-1 p-1 pb-0 sm:mx-auto sm:max-w-md md:grid md:max-w-none md:grid-cols-2 md:gap-3 md:p-3">
        <div className="contents md:flex md:h-full md:min-h-0 md:min-w-0 md:flex-col md:gap-2">
          <div
            className={`video-panel relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl md:aspect-auto md:w-full md:flex-1 md:shadow-[0_18px_55px_rgba(15,23,42,0.18)] ${
              isConnected ? "video-panel-connected" : ""
            }`}
          >
            <video
              ref={strangerVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover transition-opacity duration-500"
            />

            <div className="absolute inset-x-5 top-5 flex items-center justify-between gap-3 md:hidden">
              <div
                className={`status-pill flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-black/45 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-md ${
                  isSearching ? "status-pill-searching" : ""
                } ${isConnected ? "status-pill-connected" : ""}`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    isSearching
                      ? "bg-violet-300"
                      : isConnected
                        ? "bg-emerald-400"
                        : "bg-white/45"
                  }`}
                />
                <span className="truncate">
                  {isConnected
                    ? "ランダムチャット中..."
                    : isSearching
                      ? "相手を探しています..."
                      : status}
                </span>
              </div>

              <button className="pressable rounded-2xl border border-white/10 bg-black/45 px-4 py-2 text-sm font-bold shadow-lg backdrop-blur-md">
                ! 通報
              </button>
            </div>

            {isSearching && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15 backdrop-blur-[1px]">
                <div className="searching-orb" />
              </div>
            )}

            <div className="absolute bottom-5 left-5 rounded-2xl border border-white/10 bg-black/35 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-md md:hidden">
              {strangerComment || "Stranger"}
            </div>

            <div className="absolute bottom-5 left-5 hidden rounded-2xl border border-white/10 bg-black/35 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-md md:flex">
              {strangerComment || "Stranger"}
            </div>
          </div>

          <div className="hidden shrink-0 grid-cols-4 gap-2 md:grid">
            <button
              disabled={isSearching}
              onClick={() => {
                if (isConnected) {
                  void nextPartner();
                } else {
                  void startSearching();
                }
              }}
              className={`pressable action-card flex h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border text-xs font-black shadow-sm transition hover:-translate-y-0.5 lg:h-18 ${
                isSearching
                  ? "border-emerald-200 bg-emerald-100 text-emerald-700 shadow-[0_0_24px_rgba(16,185,129,0.18)]"
                  : "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-400 active:bg-emerald-600"
              }`}
            >
              <span className="start-icon text-2xl leading-none">
                {isSearching ? "…" : "▶"}
              </span>
              <span>
                {isConnected ? "NEXT" : isSearching ? "WAIT" : "START"}
              </span>
            </button>

            <button
              onClick={() => {
                stopSearching();
              }}
              className="pressable action-card flex h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border border-orange-500 bg-orange-500 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-400 active:bg-orange-600 lg:h-18"
            >
              <span className="text-2xl leading-none">↪</span>
              <span>END</span>
            </button>

            <label className="pressable action-card relative flex h-16 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-blue-500 bg-blue-500 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-400 active:bg-blue-600 lg:h-18">
              <span className="text-2xl leading-none">◎</span>
              <span>COUNTRY</span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Country"
              >
                <option>Global</option>
                <option>Japan</option>
                <option>USA</option>
                <option>Korea</option>
                <option>Philippines</option>
              </select>
            </label>

            <button className="pressable action-card flex h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border border-red-500 bg-red-500 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-red-400 active:bg-red-600 lg:h-18">
              <span className="text-2xl leading-none">⚑</span>
              <span>REPORT</span>
            </button>
          </div>
        </div>

        <div className="contents md:flex md:h-full md:min-h-0 md:min-w-0 md:flex-col md:gap-2">
          <div
            className={`video-panel relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl md:aspect-auto md:w-full md:flex-1 md:shadow-[0_18px_55px_rgba(15,23,42,0.18)] ${
              isConnected ? "video-panel-connected" : ""
            }`}
          >
            <div className="relative h-full min-h-0 overflow-hidden rounded-2xl">
              <video
                ref={myVideoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover transition-opacity duration-500"
              />

              <div className="absolute left-5 top-5 max-w-[70%]">
                <input
                  type="text"
                  placeholder="Name or comment..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-base font-semibold text-white outline-none backdrop-blur-md transition focus:border-violet-300/40 focus:bg-black/55 placeholder:text-white/70"
                />
              </div>

              <div
                className={`status-pill absolute right-5 top-5 hidden max-w-[48%] items-center gap-2 rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md md:flex ${
                  isSearching ? "status-pill-searching" : ""
                } ${isConnected ? "status-pill-connected" : ""}`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isSearching
                      ? "bg-violet-300"
                      : isConnected
                        ? "bg-emerald-400"
                        : "bg-white/45"
                  }`}
                />
                <span className="truncate">
                  {isConnected
                    ? "Connected"
                    : isSearching
                      ? "Searching"
                      : status}
                </span>
              </div>
            </div>

            <div
              ref={messagesContainerRef}
              className="absolute bottom-5 left-5 right-5 max-h-[58%] space-y-1.5 overflow-y-auto pr-1 md:hidden"
            >
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${
                    msg.sender === "me" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`message-bubble max-w-[82%] rounded-2xl px-3.5 py-2 text-sm font-bold leading-snug shadow-lg backdrop-blur-md ${
                      msg.sender === "me"
                        ? "bg-emerald-500 text-white"
                        : "bg-white text-neutral-950"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            ref={desktopMessagesContainerRef}
            className="hidden h-[104px] shrink-0 space-y-1.5 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3 text-neutral-900 shadow-[0_10px_35px_rgba(15,23,42,0.08)] md:block"
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${
                  msg.sender === "me" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`message-bubble max-w-[82%] rounded-2xl px-3.5 py-2 text-sm font-bold leading-snug shadow-sm ${
                    msg.sender === "me"
                      ? "bg-emerald-500 text-white"
                      : "bg-white text-neutral-950 ring-1 ring-neutral-200"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden shrink-0 items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-1.5 pl-4 text-neutral-900 shadow-[0_10px_35px_rgba(15,23,42,0.08)] transition focus-within:border-blue-300 md:flex">
            <input
              type="text"
              placeholder="メッセージを入力..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-neutral-900 outline-none placeholder:text-neutral-400"
            />

            <button
              onClick={sendMessage}
              className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-500 bg-blue-500 text-xl text-white shadow-sm transition hover:bg-blue-400 active:bg-blue-600"
              aria-label="Send message"
            >
              ➤
            </button>
          </div>
        </div>
      </section>

      <section className="mobile-control-dock absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-neutral-950/80 p-4 shadow-[0_-18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:mx-auto sm:max-w-md sm:rounded-t-2xl md:hidden">
        <div className="grid grid-cols-4 gap-2 md:mx-auto md:max-w-3xl md:gap-3">
          <button
            disabled={isSearching}
            onClick={() => {
              if (isConnected) {
                void nextPartner();
              } else {
                void startSearching();
              }
            }}
            className={`pressable action-card start-card flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 text-xs font-black shadow-lg backdrop-blur-md transition md:h-20 ${
              isSearching
                ? "start-card-searching bg-violet-500/15 text-white/70"
                : "bg-violet-500/20 text-white"
            }`}
          >
            <span className="start-icon text-3xl leading-none">
              {isSearching ? "…" : "▶"}
            </span>
            <span>{isConnected ? "NEXT" : isSearching ? "WAIT" : "START"}</span>
          </button>

          <button
            onClick={() => {
              stopSearching();
            }}
            className="pressable action-card flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/70 text-xs font-black shadow-lg backdrop-blur-md md:h-20"
          >
            <span className="text-3xl leading-none">↪</span>
            <span>END</span>
          </button>

          <label className="pressable action-card relative flex h-24 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-xs font-black shadow-lg backdrop-blur-md md:h-20">
            <span className="text-3xl leading-none">◎</span>
            <span>COUNTRY</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Country"
            >
              <option>Global</option>
              <option>Japan</option>
              <option>USA</option>
              <option>Korea</option>
              <option>Philippines</option>
            </select>
          </label>

          <button className="pressable action-card flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 text-xs font-black shadow-lg backdrop-blur-md md:h-20">
            <span className="text-3xl leading-none">⚑</span>
            <span>REPORT</span>
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-2 pl-4 shadow-inner backdrop-blur-md transition focus-within:border-violet-300/40 focus-within:bg-white/15 md:mx-auto md:max-w-3xl">
          <input
            type="text"
            placeholder="メッセージを入力..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-white outline-none placeholder:text-white/40"
          />

          <button
            onClick={sendMessage}
            className="pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-violet-300/30 bg-violet-500/20 text-2xl text-white shadow-lg"
            aria-label="Send message"
          >
            ➤
          </button>
        </div>
      </section>
    </main>
  );
}
