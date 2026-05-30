import { SettingsHost } from "../../features/settings/settings-host";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = (await searchParams) ?? {};
  const section = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;

  return <SettingsHost initialSection={section} />;
}
