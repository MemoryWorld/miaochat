import { useMemo, useState } from "react";

import { MobileShell } from "./src/shell/mobile-shell.js";
import { createMobileApiClient } from "./src/lib/mobile-api.js";

const defaultApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const api = useMemo(() => createMobileApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  return (
    <MobileShell
      api={api}
      apiBaseUrl={apiBaseUrl}
      onApiBaseUrlChange={setApiBaseUrl}
    />
  );
}
