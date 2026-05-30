import { ChannelShell } from "../../../features/channels/channel-shell";

type ChannelPageProps = {
  params: Promise<{
    channelId: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
};

export default async function ChannelPage({ params, searchParams }: ChannelPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  return (
    <ChannelShell
      channelId={resolvedParams.channelId}
      initialTab={resolvedSearchParams?.tab}
    />
  );
}
