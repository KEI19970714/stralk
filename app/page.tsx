"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export default function Home() {
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const strangerVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Idle");
  const [country, setCountry] = useState("Global");
  const [comment, setComment] = useState("");
  const [strangerComment, setStrangerComment] = useState("");
  const [message, setMessage] = useState("");
  const socketRef = useRef<any>(null);
  const [messages, setMessages] = useState<
    { sender: "me" | "stranger"; text: string }[]
  >([]);
  const cleanupConnection = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (strangerVideoRef.current) {
      strangerVideoRef.current.srcObject = null;
    }
  };
  useEffect(() => {
    socketRef.current = io("http://localhost:3001");

    socketRef.current.on("connect", () => {
      console.log("Connected to server:", socketRef.current.id);
    });
    socketRef.current.on("matched", async ({ initiator }) => {
      setStatus("Connected");

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
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          cleanupConnection();
          setStatus("Searching...");
          setMessages([]);
          setStrangerComment("");
          socketRef.current.emit("start searching");
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit("ice-candidate", {
            candidate: event.candidate,
          });
        }
      };

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit("offer", { offer });
      }

      const strangerComments = [
        "music lover",
        "learning english",
        "can't sleep",
        "from korea",
        "looking for friends",
        "anime fan",
      ];

      const randomComment =
        strangerComments[Math.floor(Math.random() * strangerComments.length)];

      setStrangerComment(randomComment);
    });
    socketRef.current.on("partner disconnected", () => {
      cleanupConnection();
      console.log("partner disconnected received!"); // ← 追加
      setStatus("Searching...");

      setMessages([]);

      setStrangerComment("");

      socketRef.current.emit("start searching");
    });
    socketRef.current.on("chat message", (msg: string) => {
      setMessages((prev) => [
        ...prev,
        {
          sender: "stranger",
          text: msg,
        },
      ]);
    });

    socketRef.current.on("offer", async (offer) => {
      const pc = peerConnection.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit("answer", { answer });
    });

    socketRef.current.on("answer", async (answer) => {
      const pc = peerConnection.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socketRef.current.on("ice-candidate", async (candidate) => {
      const pc = peerConnection.current;
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error(err);
      }
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);
  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        localStreamRef.current = stream;

        if (myVideoRef.current) {
          myVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Camera error:", error);
      }
    }

    setupCamera();
  }, []);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  return (
    <main className="h-screen bg-black text-white flex flex-col md:flex-row p-2 md:p-4 gap-2 md:gap-4">
      {/* 右側 */}
      <div className="w-full md:w-[40%] flex flex-col gap-2 md:gap-4">
        {/* You */}
        <div className="relative h-[60vh] bg-gray-700 rounded-2xl overflow-hidden">
          {/* comment */}
          <div className="absolute top-3 left-3 z-10">
            <div className="relative">
              <input
                type="text"
                placeholder="Name or comment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="bg-white text-black px-4 py-2 rounded-2xl outline-none shadow-lg"
              />

              {/* しっぽ */}
              <div className="absolute -bottom-2 left-6 w-4 h-4 bg-white rotate-45"></div>
            </div>
          </div>

          <video
            ref={myVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>

        {/* STATUS */}
        <div className="bg-gray-800 rounded-xl py-3 text-center font-bold">
          {status}
        </div>

        {/* CHAT */}
        <div className="bg-gray-900 rounded-2xl p-3 md:p-4 h-40 md:h-64 flex flex-col">
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto mb-3"
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex mb-2 ${
                  msg.sender === "me" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.sender === "me" ? (
                  <p>{msg.text}</p>
                ) : (
                  <div className="bg-gray-700 px-4 py-2 rounded-2xl max-w-xs">
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-1 bg-gray-800 rounded-xl p-3 text-white"
            />

            <button
              onClick={() => {
                if (message.trim() === "") return;

                // 自分のメッセージ
                const userMessage = {
                  sender: "me",
                  text: message,
                };

                setMessages([...messages, userMessage]);

                socketRef.current.emit("chat message", message);

                setMessage("");
              }}
              className="bg-blue-500 px-6 rounded-xl font-bold"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      {/* 左側 */}
      <div className="flex-1 flex flex-col gap-2 md:gap-4">
        {/* Stranger */}
        <div className="relative flex-1 bg-gray-800 rounded-2xl overflow-hidden">
          {/* stranger comment */}
          <div className="absolute top-3 left-3 z-10">
            <div className="relative">
              <div className="bg-white text-black px-4 py-2 rounded-2xl shadow-lg text-sm">
                {strangerComment || "Stranger"}
              </div>

              {/* しっぽ */}
              <div className="absolute -bottom-2 left-6 w-4 h-4 bg-white rotate-45"></div>
            </div>
          </div>

          <video
            ref={strangerVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        </div>
        {/* ボタン */}
        <div className="flex gap-4">
          <button
            disabled={status === "Searching..."}
            onClick={() => {
              setMessages([]);

              setStrangerComment("");

              if (status === "Connected") {
                setStatus("Searching...");

                cleanupConnection();

                socketRef.current.emit("next");
              } else {
                setStatus("Searching...");

                socketRef.current.emit("start searching");
              }
            }}
            className={`flex-1 py-4 rounded-xl font-bold ${status === "Searching..." ? "bg-gray-500" : "bg-green-500"}`}
          >
            {status === "Connected" ? "Next" : "Start"}
          </button>

          <button
            onClick={() => {
              setStatus("Idle");

              setMessages([]);

              setStrangerComment("");

              cleanupConnection();

              socketRef.current.emit("stop searching");
            }}
            className="flex-1 bg-red-500 py-4 rounded-xl font-bold"
          >
            End
          </button>

          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="bg-blue-500 px-4 rounded-xl font-bold"
          >
            <option>Global</option>
            <option>Japan</option>
            <option>USA</option>
            <option>Korea</option>
            <option>Philippines</option>
          </select>

          <button className="bg-yellow-400 text-black px-4 rounded-xl font-bold">
            Report
          </button>
        </div>
      </div>
    </main>
  );
}
