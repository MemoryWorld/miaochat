import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type ApprovalCardProps = {
  description: string;
  isBusy?: boolean;
  onApprove: () => void;
  onReject: () => void;
  status?: "approved" | "pending" | "rejected" | "revision_requested";
  title: string;
};

export function ApprovalCard({
  description,
  isBusy = false,
  onApprove,
  onReject,
  status = "pending",
  title
}: ApprovalCardProps): ReactElement {
  const isPending = status === "pending";

  return (
    <View accessibilityLabel={`Approval request ${title}`} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        <Text style={[styles.status, statusStyles[status]]}>{renderStatus(status)}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={!isPending || isBusy}
          onPress={onApprove}
          style={({ pressed }) => [
            styles.primaryButton,
            (!isPending || isBusy) && styles.disabledButton,
            pressed && styles.pressedButton
          ]}
        >
          <Text style={styles.primaryButtonText}>批准</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!isPending || isBusy}
          onPress={onReject}
          style={({ pressed }) => [
            styles.secondaryButton,
            (!isPending || isBusy) && styles.disabledButton,
            pressed && styles.pressedButton
          ]}
        >
          <Text style={styles.secondaryButtonText}>驳回</Text>
        </Pressable>
      </View>
    </View>
  );
}

function renderStatus(status: NonNullable<ApprovalCardProps["status"]>): string {
  switch (status) {
    case "approved":
      return "已批准";
    case "pending":
      return "待审批";
    case "rejected":
      return "已驳回";
    case "revision_requested":
      return "需修改";
  }
}

const statusStyles = StyleSheet.create({
  approved: {
    backgroundColor: "#dcfce7",
    color: "#166534"
  },
  pending: {
    backgroundColor: "#fef3c7",
    color: "#92400e"
  },
  rejected: {
    backgroundColor: "#fee2e2",
    color: "#991b1b"
  },
  revision_requested: {
    backgroundColor: "#e0f2fe",
    color: "#075985"
  }
});

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 10
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ef",
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
    padding: 14
  },
  description: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4
  },
  disabledButton: {
    opacity: 0.45
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1
  },
  pressedButton: {
    opacity: 0.78
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 10,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700"
  },
  status: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  title: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800"
  }
});
