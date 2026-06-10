import { redirect } from "next/navigation";

type ChannelPageProps = {
  params: Promise<{
    channelId: string;
  }>;
};

export default async function ChannelPage({ params }: ChannelPageProps) {
  const resolvedParams = await params;

  redirect(`/?conversationId=${encodeURIComponent(resolvedParams.channelId)}`);
}
