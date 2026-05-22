import { cn } from "../../lib/cn";

import type { ProviderCatalogEntry, SetupProvider } from "./provider-catalog";

type ProviderSelectorProps = {
  providers: ProviderCatalogEntry[];
  selectedProvider: SetupProvider;
  onSelect: (provider: SetupProvider) => void;
};

export function ProviderSelector({
  onSelect,
  providers,
  selectedProvider
}: ProviderSelectorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {providers.map((provider) => {
        const selected = provider.id === selectedProvider;

        return (
          <button
            aria-pressed={selected}
            key={provider.id}
            onClick={() => onSelect(provider.id)}
            className={cn(
              "rounded-3xl border p-4 text-left transition-colors",
              selected
                ? "border-slate-900 bg-slate-950 text-slate-50"
                : "border-slate-200 bg-white/85 text-slate-950 hover:bg-white"
            )}
            type="button"
          >
            <div className="mb-3 flex justify-between gap-3">
              <strong>{provider.name}</strong>
              <span
                className={cn(
                  "text-xs font-medium",
                  selected ? "text-slate-300" : "text-slate-500"
                )}
              >
                {selected ? "Selected" : "Available"}
              </span>
            </div>
            <p className={cn("m-0 text-sm leading-6", selected ? "text-slate-200" : "text-slate-600")}>
              {provider.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
