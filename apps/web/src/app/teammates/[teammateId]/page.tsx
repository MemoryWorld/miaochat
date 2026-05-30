import { TeammateActorPage } from "../../../features/teammates/teammate-actor-page";

export default async function TeammatePage({
  params,
  searchParams
}: {
  params: Promise<{ teammateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const tab = Array.isArray(resolvedSearchParams.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams.tab;

  return (
    <TeammateActorPage
      initialTab={tab}
      teammateId={resolvedParams.teammateId}
    />
  );
}
