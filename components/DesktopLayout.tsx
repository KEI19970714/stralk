"use client";

import type { HomeLayoutProps } from "./layoutTypes";

export function DesktopLayout({
  myVideoRef,
  strangerVideoRef,
  messagesContainerRef,
  status,
  country,
  comment,
  strangerComment,
  message,
  messages,
  reportReasons,
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
}: HomeLayoutProps) {
  return (
    <main className="mobile-shell relative flex overflow-hidden bg-white text-neutral-950">
      {isReportOpen && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-neutral-950">REPORT</h2>
              <button
                type="button"
                onClick={handleReportClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-lg font-black text-neutral-700 transition hover:bg-neutral-100"
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
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left text-sm font-bold text-neutral-950 transition hover:border-red-300 hover:bg-red-50"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportFeedback && (
        <div className="pointer-events-none absolute left-1/2 top-5 z-[90] -translate-x-1/2 rounded-2xl bg-neutral-950 px-4 py-2 text-sm font-bold text-white shadow-xl">
          {reportFeedback}
        </div>
      )}

      <section className="mobile-video-stack relative z-0 grid min-h-0 flex-1 grid-cols-2 gap-3 p-3">
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
          <div
            className={`video-panel relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-neutral-900 shadow-[0_18px_55px_rgba(15,23,42,0.18)] ${
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

            <div className="absolute bottom-5 left-5 flex rounded-2xl border border-white/10 bg-black/35 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-md">
              {strangerComment || "Stranger"}
            </div>
          </div>

          <div className="relative z-50 grid shrink-0 grid-cols-4 gap-2">
            <button
              disabled={isSearching}
              onClick={handleStartAction}
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
              onClick={handleEndAction}
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
                onChange={(e) => {
                  setCountry(e.target.value);
                }}
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

            <button
              type="button"
              onClick={handleReportAction}
              className="pressable action-card flex h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border border-red-500 bg-red-500 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-red-400 active:bg-red-600 lg:h-18"
            >
              <span className="text-2xl leading-none">⚑</span>
              <span>REPORT</span>
            </button>
          </div>
        </div>

        <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
          <div
            className={`video-panel relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-neutral-900 shadow-[0_18px_55px_rgba(15,23,42,0.18)] ${
              isConnected ? "video-panel-connected" : ""
            }`}
          >
            <div className="relative h-full min-h-0 overflow-hidden rounded-2xl">
              <video
                ref={myVideoRef}
                autoPlay
                muted
                playsInline
                className="pointer-events-none h-full w-full object-cover transition-opacity duration-500"
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
                className={`status-pill absolute right-5 top-5 flex max-w-[48%] items-center gap-2 rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md ${
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
          </div>

          <div
            ref={messagesContainerRef}
            className="relative z-50 h-[104px] shrink-0 space-y-1.5 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3 text-neutral-900 shadow-[0_10px_35px_rgba(15,23,42,0.08)]"
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

          <div className="relative z-50 flex shrink-0 items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-1.5 pl-4 text-neutral-900 shadow-[0_10px_35px_rgba(15,23,42,0.08)] transition focus-within:border-blue-300">
            <input
              type="text"
              placeholder="Type a message..."
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
    </main>
  );
}
