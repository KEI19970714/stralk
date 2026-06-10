import type { Dispatch, RefObject, SetStateAction } from "react";

export type ChatMessage = { sender: "me" | "stranger"; text: string };

export type ReportReason =
  | "Nudity / Sexual content"
  | "Harassment"
  | "Hate speech"
  | "Spam / Advertising"
  | "Other";

export type CountryOption =
  | "Global"
  | "Japan"
  | "United States"
  | "South Korea"
  | "China"
  | "Taiwan"
  | "Hong Kong"
  | "Philippines"
  | "Thailand"
  | "Vietnam"
  | "Indonesia"
  | "Malaysia"
  | "Singapore"
  | "India"
  | "United Kingdom"
  | "Germany"
  | "France"
  | "Spain"
  | "Italy"
  | "Brazil"
  | "Mexico"
  | "Saudi Arabia"
  | "Turkey";

export type HomeLayoutProps = {
  myVideoRef: RefObject<HTMLVideoElement | null>;
  strangerVideoRef: RefObject<HTMLVideoElement | null>;
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  status: string;
  country: string;
  comment: string;
  strangerCountry: string;
  strangerComment: string;
  message: string;
  messages: ChatMessage[];
  countryOptions: CountryOption[];
  reportReasons: ReportReason[];
  isReportOpen: boolean;
  isCountryOpen: boolean;
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
  handleCountryAction: () => void;
  handleCountrySelect: (country: CountryOption) => void;
  handleReportAction: () => void;
  handleReportReason: (reason: ReportReason) => void;
  handleReportClose: () => void;
};
