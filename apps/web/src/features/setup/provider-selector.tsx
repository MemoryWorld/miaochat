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
    <div
      style={{
        display: "grid",
        gap: "0.875rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
      }}
    >
      {providers.map((provider) => {
        const selected = provider.id === selectedProvider;

        return (
          <button
            aria-pressed={selected}
            key={provider.id}
            onClick={() => onSelect(provider.id)}
            style={{
              background: selected ? "#0f172a" : "rgba(255, 255, 255, 0.82)",
              border: selected
                ? "1px solid rgba(15, 23, 42, 0.9)"
                : "1px solid rgba(15, 23, 42, 0.12)",
              borderRadius: "20px",
              color: selected ? "#f8fafc" : "#101828",
              cursor: "pointer",
              padding: "1rem",
              textAlign: "left"
            }}
            type="button"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.75rem"
              }}
            >
              <strong>{provider.name}</strong>
              <span
                style={{
                  color: selected ? "rgba(248, 250, 252, 0.72)" : "#667085",
                  fontSize: "0.85rem"
                }}
              >
                {selected ? "Selected" : "Available"}
              </span>
            </div>
            <p
              style={{
                color: selected ? "rgba(248, 250, 252, 0.82)" : "#475467",
                lineHeight: 1.5,
                margin: 0
              }}
            >
              {provider.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
