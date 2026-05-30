"use client";

import { useEffect, useState } from "react";

import { ChatExperience } from "../features/chat/chat-experience";

export function HomePageClient() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <div className="grid min-h-screen place-items-center px-6 py-10 text-sm text-slate-600">
        正在进入工作空间...
      </div>
    );
  }

  return <ChatExperience />;
}
