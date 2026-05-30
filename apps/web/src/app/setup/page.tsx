import { SettingsHost } from "../../features/settings/settings-host";

export default function SetupPage() {
  return <SettingsHost initialSection="model-connections" legacySetupMode />;
}
