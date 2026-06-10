import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function createIcon(paths: React.ReactNode, displayName: string) {
  function Icon({ size = 20, ...props }: IconProps) {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        viewBox="0 0 24 24"
        width={size}
        {...props}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const ChatBubbleIcon = createIcon(
  <path d="M21 12c0 4.1-4 7.4-9 7.4-1.1 0-2.2-.16-3.2-.46L4 21l1.3-3.5C3.9 16.1 3 14.2 3 12c0-4.1 4-7.4 9-7.4s9 3.3 9 7.4Z" />,
  "ChatBubbleIcon"
);

export const PeopleIcon = createIcon(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c.6-3 2.9-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
    <path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.7M17.8 14.6c1.5.7 2.5 2 2.9 3.9" />
  </>,
  "PeopleIcon"
);

export const FlowIcon = createIcon(
  <>
    <rect height="5" rx="1.4" width="6" x="3" y="4" />
    <rect height="5" rx="1.4" width="6" x="15" y="15" />
    <path d="M9 6.5h5a3 3 0 0 1 3 3V15" />
  </>,
  "FlowIcon"
);

export const InboxIcon = createIcon(
  <>
    <path d="M4 13h4l1.5 2.5h5L16 13h4" />
    <path d="M5.5 5h13L21 13v4.6a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 17.6V13l2.5-8Z" />
  </>,
  "InboxIcon"
);

export const GearIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.2 13.6a7.7 7.7 0 0 0 0-3.2l1.8-1.4-2-3.4-2.1.86a7.7 7.7 0 0 0-2.76-1.6L13.8 3h-3.96l-.34 2.26a7.7 7.7 0 0 0-2.76 1.6L4.6 6 2.6 9.4l1.8 1.4a7.7 7.7 0 0 0 0 3.2L2.6 15.4l2 3.4 2.14-.86a7.7 7.7 0 0 0 2.76 1.6l.34 2.26h3.96l.34-2.26a7.7 7.7 0 0 0 2.76-1.6l2.1.86 2-3.4-1.8-1.4Z" />
  </>,
  "GearIcon"
);

export const PlusIcon = createIcon(
  <path d="M12 5v14M5 12h14" />,
  "PlusIcon"
);

export const SearchIcon = createIcon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </>,
  "SearchIcon"
);

export const PaperclipIcon = createIcon(
  <path d="m20.5 11.5-8.2 8.2a5.4 5.4 0 0 1-7.6-7.6l8.6-8.6a3.6 3.6 0 0 1 5 5l-8.5 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />,
  "PaperclipIcon"
);

export const ArrowUpIcon = createIcon(
  <path d="M12 19V5m-6 6 6-6 6 6" />,
  "ArrowUpIcon"
);

export const PinIcon = createIcon(
  <path d="m15 4 5 5-4.2 1.2a2 2 0 0 0-1.3 1.1L13 15l-4-4 3.7-1.5a2 2 0 0 0 1.1-1.3L15 4ZM11 13l-6 6" />,
  "PinIcon"
);

export const ArchiveIcon = createIcon(
  <>
    <rect height="4.5" rx="1" width="18" x="3" y="4" />
    <path d="M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M10 12.5h4" />
  </>,
  "ArchiveIcon"
);

export const TrashIcon = createIcon(
  <path d="M4 7h16M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12M10 11v6M14 11v6" />,
  "TrashIcon"
);

export const ChevronRightIcon = createIcon(
  <path d="m9 5 7 7-7 7" />,
  "ChevronRightIcon"
);

export const SidebarIcon = createIcon(
  <>
    <rect height="16" rx="2.5" width="18" x="3" y="4" />
    <path d="M15 4v16" />
  </>,
  "SidebarIcon"
);

export const GlobeIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.2 3.7 5.1 3.7 8.5s-1.3 6.3-3.7 8.5c-2.4-2.2-3.7-5.1-3.7-8.5s1.3-6.3 3.7-8.5Z" />
  </>,
  "GlobeIcon"
);

export const SparkleIcon = createIcon(
  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM18.5 15.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z" />,
  "SparkleIcon"
);
