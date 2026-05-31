import type { Dispatch, RefObject, SetStateAction } from "react";

export type ChatMessage = { sender: "me" | "stranger"; text: string };

export type ReportReason =
  | "Nudity / Sexual content"
  | "Harassment"
  | "Hate speech"
  | "Spam / Advertising"
  | "Other";

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
  reportReasons: ReportReason[];
  isReportOpen: boolean;
  reportFeedback: string;
  banNotice: string;
  isSearching: boolean;
  isConnected: boolean;
  setCountry: Dispatch<SetStateAction<string>>;
  setComment: Dispatch<SetStateAction<string>>;
  setMessage: Dispatch<SetStateAction<string>>;
  sendMessage: () => void;
  handleStartAction: () => void;
  handleEndAction: () => void;
  handleReportAction: () => void;
  handleReportReason: (reason: ReportReason) => void;
  handleReportClose: () => void;
};
