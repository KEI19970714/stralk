"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCountryCode, getCountryFlag } from "./countryFlags";
import type { HomeLayoutProps } from "./layoutTypes";

export function MobileLayout({
  myVideoRef,
  strangerVideoRef,
  messagesContainerRef,
  status,
  country,
  comment,
  strangerCountry,
  strangerComment,
  message,
  messages,
  countryOptions,
  reportReasons,
  isReportOpen,
  isCountryOpen,
  reportFeedback,
  banNotice,
  isSearching,
  isConnected,
  setCountry,
  setComment,
  setMessage,
  sendMessage,
  handleStartAction,
  handleEndAction,
  handleCountryAction,
  handleCountrySelect,
  handleReportAction,
  handleReportReason,
  handleReportClose,
}: HomeLayoutProps) {
  const [isChatDimmed, setIsChatDimmed] = useState(false);

  const chatDimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetChatDimTimer = useCallback(() => {
    setIsChatDimmed(false);
    if (chatDimTimerRef.current) {
      clearTimeout(chatDimTimerRef.current);
    }
    chatDimTimerRef.current = setTimeout(() => {
      setIsChatDimmed(true);
    }, 5000);
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    resetChatDimTimer();
  }, [messages.length, resetChatDimTimer]);

  return (
    <main className="mobile-shell relative flex overflow-hidden bg-white text-white">
      {isReportOpen && (
        <div className="absolute inset-0 z-[80] flex items-end bg-black/45 p-2">
          <div className="w-full rounded-2xl border border-neutral-200 bg-white p-3 text-neutral-950 shadow-2xl sm:mx-auto sm:max-w-md">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black">REPORT</h2>
              <button
                type="button"
                onClick={handleReportClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-lg font-black text-neutral-700"
                aria-label="Close report menu"
              >
                ×
              </button>
            </div>

            <div className="grid gap-2">
              {reportReasons.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => handleReportReason(reason)}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-3 text-left text-sm font-bold text-neutral-950"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportFeedback && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[90] -translate-x-1/2 rounded-2xl bg-neutral-950 px-4 py-2 text-sm font-bold text-white shadow-xl">
          {reportFeedback}
        </div>
      )}

      {banNotice && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[90] w-[calc(100%-16px)] max-w-md -translate-x-1/2 rounded-2xl bg-red-600 px-4 py-2 text-center text-sm font-bold text-white shadow-xl">
          {banNotice}
        </div>
      )}

      <section className="mobile-video-stack relative z-0 flex min-h-0 flex-1 flex-col gap-1 p-1 pb-0 sm:mx-auto sm:max-w-md">
        <div
          className={`video-panel relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl ${
            isConnected ? "video-panel-connected" : ""
          }`}
        >
          <video
            ref={strangerVideoRef}
            autoPlay
            playsInline
            className="pointer-events-none h-full w-full object-cover transition-opacity duration-500"
          />

          {isSearching && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15 backdrop-blur-[1px]">
              <div className="searching-orb" />
            </div>
          )}

          <div className="pointer-events-none absolute bottom-5 left-5 rounded-2xl border border-white/10 bg-black/35 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-md">
            {getCountryCode(strangerCountry)} |{" "}
            {strangerComment || "Stranger"}
          </div>
        </div>

        <div
          className={`video-panel relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl ${
            isConnected ? "video-panel-connected" : ""
          }`}
        >
          <div className="relative h-full min-h-0 overflow-hidden rounded-2xl">
            <video
              ref={myVideoRef}
              autoPlay
              muted
              playsInline
              className="local-video-mirror pointer-events-none h-full w-full object-cover transition-opacity duration-500"
            />

            <div className="absolute left-5 top-5 max-w-[70%]">
              <input
                type="text"
                placeholder="Name or comment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-base font-semibold text-white outline-none backdrop-blur-md transition placeholder:text-white/70 focus:border-violet-300/40 focus:bg-black/55"
              />
            </div>

            <div
              className={`status-pill pointer-events-none absolute right-3 top-3 flex max-w-[52%] items-center gap-1.5 rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur-md ${
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
                {isConnected ? "Connected" : isSearching ? "Searching" : status}
              </span>
            </div>
          </div>

          <div
            ref={messagesContainerRef}
            className="pointer-events-none absolute bottom-5 left-5 right-5 max-h-[58%] space-y-1.5 overflow-y-auto pr-1 transition-opacity duration-500"
            style={{ opacity: isChatDimmed ? 0.3 : 1 }}
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
      </section>

      <section className="mobile-control-dock pointer-events-auto relative z-10 w-full shrink-0 border-t border-neutral-200 bg-white px-2 pt-1.5 shadow-[0_-14px_42px_rgba(15,23,42,0.12)] sm:mx-auto sm:max-w-md sm:rounded-t-2xl">
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            aria-label="Start"
            disabled={isSearching}
            onClick={handleStartAction}
            className={`relative flex h-14 touch-manipulation items-center justify-center rounded-xl text-xs font-black ${
              isSearching
                ? "bg-emerald-300 text-emerald-900"
                : "bg-emerald-500 text-white"
            }`}
          >
            <span>
              {isConnected ? "NEXT" : isSearching ? "WAIT" : "START"}
            </span>
          </button>

          <button
            type="button"
            aria-label="End"
            onClick={handleEndAction}
            className="relative flex h-14 touch-manipulation items-center justify-center rounded-xl bg-orange-500 text-xs font-black text-white"
          >
            <span>END</span>
          </button>

          <div className="relative z-[99999]">
            {isCountryOpen && (
              <div className="absolute bottom-16 left-1/2 z-[80] max-h-72 w-56 -translate-x-1/2 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 text-neutral-950 shadow-2xl">
                {countryOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleCountrySelect(option)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-black ${
                      country === option ? "bg-blue-500 text-white" : ""
                    }`}
                  >
                    <span className="text-base leading-none" aria-hidden="true">
                      {getCountryFlag(option)}
                    </span>
                    <span>{option}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              aria-label="Country"
              onClick={handleCountryAction}
              className="pressable action-card pointer-events-auto flex h-14 w-full touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl border border-blue-500 bg-blue-500 text-[10px] font-black text-white shadow-lg"
            >
              {country === "Global" ? (
                <span>Global</span>
              ) : (
                <span className="text-xl leading-none" aria-hidden="true">
                  {getCountryFlag(country)}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            aria-label="Report"
            onClick={handleReportAction}
            className="relative flex h-14 touch-manipulation items-center justify-center rounded-xl bg-red-500 text-xs font-black text-white"
          >
            <span>REPORT</span>
          </button>
        </div>

        <div className="mt-1 flex h-10 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white p-1 pl-3 text-neutral-900 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition focus-within:border-blue-300">
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onFocus={resetChatDimTimer}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400"
          />

          <button
            onClick={sendMessage}
            className="pressable relative z-[60] flex h-8 w-8 touch-manipulation shrink-0 items-center justify-center rounded-full border border-blue-500 bg-blue-500 text-base text-white shadow-lg"
            aria-label="Send message"
          >
            ➤
          </button>
        </div>
      </section>
    </main>
  );
}
