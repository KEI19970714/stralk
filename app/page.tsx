"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopLayout } from "@/components/DesktopLayout";
import { MobileLayout } from "@/components/MobileLayout";
import type {
  ChatMessage,
  HomeLayoutProps,
  ReportReason,
} from "@/components/layoutTypes";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL?.trim();
const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME?.trim();
const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim();

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  ...(TURN_URL
    ? [
        {
          urls: TURN_URL,
          ...(TURN_USERNAME && TURN_CREDENTIAL
            ? { username: TURN_USERNAME, credential: TURN_CREDENTIAL }
            : {}),
        },
      ]
    : []),
];

const REPORT_REASONS: ReportReason[] = [
  "Nudity / Sexual content",
  "Harassment",
  "Hate speech",
  "Spam / Advertising",
  "Other",
];

export default function Home() {
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const strangerVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localStreamPromiseRef = useRef<Promise<MediaStream | null> | null>(
    null,
  );
  const localStreamRequestRef = useRef(0);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const connectionAttemptRef = useRef(0);
  const wantsSearchRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState("Idle");
  const [country, setCountry] = useState("Global");
  const [comment, setComment] = useState("");
  const [strangerComment, setStrangerComment] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportFeedback, setReportFeedback] = useState("");
  const commentRef = useRef(comment);
  const countryRef = useRef(country);
  const reportFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    commentRef.current = comment;
  }, [comment]);

  useEffect(() => {
    countryRef.current = country;
  }, [country]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateLayout = () => {
      setIsDesktop(mediaQuery.matches);
    };

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);

    return () => {
      mediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);

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

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    if (
      strangerVideoRef.current &&
      strangerVideoRef.current.srcObject !== stream
    ) {
      strangerVideoRef.current.srcObject = stream;
    }
  }, []);

  const hasLiveTracks = useCallback((stream: MediaStream | null) => {
    return stream?.getTracks().some((track) => track.readyState === "live");
  }, []);

  const ensureLocalStream =
    useCallback(async (): Promise<MediaStream | null> => {
      if (hasLiveTracks(localStreamRef.current)) {
        attachLocalStream(localStreamRef.current!);
        return localStreamRef.current!;
      }

      if (localStreamPromiseRef.current) {
        const stream = await localStreamPromiseRef.current;
        if (stream) {
          attachLocalStream(stream);
        }
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
            return null;
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

      remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;

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
        iceServers: ICE_SERVERS,
      });

      peerConnection.current = pc;

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];

        remoteStreamRef.current = remoteStream;
        attachRemoteStream(remoteStream);
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
    [attachRemoteStream, cleanupConnection, getSearchPayload],
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
      const stream = await ensureLocalStream();

      if (!stream) {
        return;
      }

      if (!wantsSearchRef.current) {
        return;
      }

      socket.emit("start searching", getSearchPayload());
    } catch (error) {
      console.error("Camera error:", error);
      wantsSearchRef.current = false;
      setStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
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
      const stream = await ensureLocalStream();

      if (!stream) {
        return;
      }

      if (!wantsSearchRef.current) {
        return;
      }

      socket.emit("next", getSearchPayload());
    } catch (error) {
      console.error("Camera error:", error);
      wantsSearchRef.current = false;
      setStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
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
        const stream = await ensureLocalStream();

        if (!stream) {
          return;
        }
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
        const stream = await ensureLocalStream();

        if (!stream) {
          return;
        }

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
  }, [messages]);

  useEffect(() => {
    if (localStreamRef.current) {
      attachLocalStream(localStreamRef.current);
    }

    if (remoteStreamRef.current) {
      attachRemoteStream(remoteStreamRef.current);
    }
  }, [attachLocalStream, attachRemoteStream, isDesktop]);

  const isSearching = status === "Searching...";
  const isConnected = status === "Connected";

  const sendMessage = useCallback(() => {
    if (message.trim() === "") return;

    const userMessage: ChatMessage = {
      sender: "me",
      text: message,
    };

    setMessages((prev) => [...prev, userMessage]);
    socketRef.current?.emit("chat message", message);
    setMessage("");
  }, [message]);

  const handleStartAction = useCallback(() => {
    if (isConnected) {
      void nextPartner();
    } else {
      void startSearching();
    }
  }, [isConnected, nextPartner, startSearching]);

  const handleEndAction = useCallback(() => {
    stopSearching();
  }, [stopSearching]);

  const handleReportAction = useCallback(() => {
    setIsReportOpen(true);
  }, []);

  const handleReportClose = useCallback(() => {
    setIsReportOpen(false);
  }, []);

  const handleReportReason = useCallback((reason: ReportReason) => {
    socketRef.current?.emit("report-user", {
      reason,
    });

    setIsReportOpen(false);
    setReportFeedback("Report submitted");

    if (reportFeedbackTimerRef.current) {
      clearTimeout(reportFeedbackTimerRef.current);
    }

    reportFeedbackTimerRef.current = setTimeout(() => {
      setReportFeedback("");
      reportFeedbackTimerRef.current = null;
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (reportFeedbackTimerRef.current) {
        clearTimeout(reportFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    socketRef.current?.emit("comment update", {
      comment,
    });
  }, [comment]);

  const layoutProps: HomeLayoutProps = {
    myVideoRef,
    strangerVideoRef,
    messagesContainerRef,
    status,
    country,
    comment,
    strangerComment,
    message,
    messages,
    reportReasons: REPORT_REASONS,
    isReportOpen,
    reportFeedback,
    isSearching,
    isConnected,
    setCountry,
    setComment,
    setMessage,
    sendMessage,
    handleStartAction,
    handleEndAction,
    handleReportAction,
    handleReportReason,
    handleReportClose,
  };

  if (isDesktop === null) {
    return null;
  }

  return isDesktop ? (
    <DesktopLayout {...layoutProps} />
  ) : (
    <MobileLayout {...layoutProps} />
  );
}
