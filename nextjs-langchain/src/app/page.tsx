import { ChatInterface } from "@/components/chat/chat-interface";

export default function Home() {
  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-black">
      <ChatInterface />
    </div>
  );
}
