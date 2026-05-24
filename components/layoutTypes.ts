import type { Dispatch, RefObject, SetStateAction } from "react";

export type ChatMessage = { sender: "me" | "stranger"; text: string };

export type HomeLayoutProps = {
  myVideoRef: RefObject<HTMLVideoElement | null>;
  strangerVideoRef: RefObject<HTMLVideoElement | null>;
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  status: string;
  country: string;
  comment: string;
  strangerComment: string;
  message: string;
  messages: ChatMessage[];
  isSearching: boolean;
  isConnected: boolean;
  setCountry: Dispatch<SetStateAction<string>>;
  setComment: Dispatch<SetStateAction<string>>;
  setMessage: Dispatch<SetStateAction<string>>;
  sendMessage: () => void;
  handleStartAction: () => void;
  handleEndAction: () => void;
  handleReportAction: () => void;
};
