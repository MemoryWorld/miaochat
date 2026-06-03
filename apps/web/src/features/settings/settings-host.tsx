"use client";

import Link from "next/link";

import type {
  BillingPlanSummary,
  CapabilityManagementEntry,
  WorkspaceMemberDirectoryEntry
} from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { AuthPanel } from "../auth/auth-panel";
import { useSurfaceData } from "../workspace-shell/use-surface-data";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";
import { ModelConnectionsPanel } from "./model-connections-panel";

const settingsSections = [
  { id: "profile", label: "个人资料" },
  { id: "workspace", label: "工作区" },
  { id: "members", label: "成员" },
  { id: "model-connections", label: "模型连接" },
  { id: "billing", label: "账单" },
  { id: "capabilities", label: "能力管理" }
] as const;

export type SettingsSectionId = (typeof settingsSections)[number]["id"];

type SettingsHostProps = {
  initialSection?: string;
  legacySetupMode?: boolean;
};

export function SettingsHost({
  initialSection = "profile",
  legacySetupMode = false
}: SettingsHostProps) {
  const {
    activeWorkspaceId,
    isLoading,
    refresh: refreshWorkspaces,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId);
  const memberDirectory = useSurfaceData<WorkspaceMemberDirectoryEntry[]>(
    isWorkspaceReady ? `/workspace-member-directory?workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const billingSummary = useSurfaceData<BillingPlanSummary | null>(
    isWorkspaceReady ? `/workspace-billing-summary?workspaceId=${activeWorkspaceId}` : null,
    null
  );
  const capabilities = useSurfaceData<CapabilityManagementEntry[]>(
    isWorkspaceReady ? `/workspace-capabilities?workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;

  const selectedSection = resolveSettingsSection(initialSection);
  function refreshWorkspacesAfterAuthChange(): void {
    void refreshWorkspaces();
  }

  return (
    <AppShell
      sidebar={
        <div className="grid gap-4">
          <div>
            <Badge className="mb-3" tone="primary">
              设置
            </Badge>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              设置与管理
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              管理账户、工作区、模型连接、成员、账单和能力开关。
            </p>
          </div>
          {legacySetupMode ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">
              `/setup` 已并入设置里的模型连接。后续请从这里添加或验证 API Key。
            </div>
          ) : null}
          <nav className="grid gap-2" aria-label="Settings sections">
            {settingsSections.map((section) => {
              const isActive = section.id === selectedSection;
              const href = `/settings?section=${section.id}`;

              return (
                <Link
                  key={section.id}
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold no-underline transition ${
                    isActive
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white/80 text-slate-700 hover:bg-white"
                  }`}
                  href={href}
                >
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </div>
      }
      workspaceSlot={
        <WorkspaceSwitcher
          activeWorkspaceId={activeWorkspaceId}
          isLoading={isLoading}
          onSelect={selectWorkspace}
          workspaces={workspaces}
        />
      }
    >
      {selectedSection === "profile" ? (
        <section className="grid gap-4">
          <div>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">个人资料</h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              登录身份、通知、语言和安全入口集中在这里。
            </p>
          </div>
          <AuthPanel
            onAuthenticated={refreshWorkspacesAfterAuthChange}
            onLoggedOut={refreshWorkspacesAfterAuthChange}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <ProfileInfo title="语言" value="简体中文" />
            <ProfileInfo title="时区" value="跟随浏览器" />
            <ProfileInfo title="主题" value="浅色工作区" />
            <ProfileInfo title="通知" value="重要事项提醒" />
            <ProfileInfo title="已连接账户" value="当前账号" />
            <ProfileInfo title="会话安全" value="登录后由服务端会话保护" />
          </div>
        </section>
      ) : null}

      {selectedSection === "workspace" ? (
        <section className="grid gap-4">
          <div>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">工作区设置</h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              查看当前协作空间，并确认设置页使用的工作区上下文。
            </p>
          </div>
          <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
            <div className="text-sm font-semibold text-slate-950">
              {activeWorkspace?.name ?? "当前工作区"}
            </div>
            <div className="truncate text-sm text-slate-600" title={activeWorkspaceId}>
              ID: {activeWorkspaceId}
            </div>
            <div className="text-sm text-slate-600">
              状态：{isLoading ? "正在同步" : "已同步"}
            </div>
          </div>
        </section>
      ) : null}

      {selectedSection === "members" ? (
        <section className="grid gap-4">
          <div>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">成员</h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              人类成员和 AI 同事都会出现在同一份成员目录里。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className={secondaryActionClassName} type="button">邀请成员</button>
            <button className={secondaryActionClassName} type="button">角色管理</button>
            <button className={secondaryActionClassName} type="button">停用计划</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {memberDirectory.data.map((member) => (
              <article
                key={member.id}
                className="rounded-[24px] border border-slate-200 bg-white/80 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-slate-950">{member.displayName}</strong>
                  <Badge tone="muted">
                    {member.actorType === "ai" ? "AI 同事" : "成员"}
                  </Badge>
                </div>
                <p className="mb-0 mt-2 text-sm leading-6 text-slate-600">
                  {member.summary ?? member.roleLabel}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    {renderMemberRole(member.role)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    {renderMemberStatus(member.status)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    {member.lastActiveAt ? `活跃于 ${new Date(member.lastActiveAt).toLocaleDateString("zh-CN")}` : "等待启用"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {selectedSection === "model-connections" ? (
        <section className="grid gap-4">
          <div>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">模型连接</h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              添加 DeepSeek API Key，让 AI 同事可以执行真实协作任务。
            </p>
          </div>
          {isWorkspaceReady ? (
            <ModelConnectionsPanel workspaceId={activeWorkspaceId} />
          ) : (
            <section className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-5 text-sm leading-7 text-slate-600">
              正在同步当前工作区，稍后即可添加模型连接。
            </section>
          )}
        </section>
      ) : null}

      {selectedSection === "billing" ? (
        <section className="grid gap-4">
          <div>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">账单</h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              当前先支持用户自带模型 Key，平台用量和付款方式保留管理入口。
            </p>
          </div>
          <BillingPanel summary={billingSummary.data} />
        </section>
      ) : null}

      {selectedSection === "capabilities" ? (
        <section className="grid gap-4">
          <div>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">能力管理</h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              管理 AI 同事可以使用的能力、权限范围和风险提示。
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {capabilities.data.map((capability) => (
              <article
                key={capability.id}
                className="rounded-[24px] border border-slate-200 bg-white/80 p-4 text-sm leading-7 text-slate-600"
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-slate-950">{capability.name}</strong>
                  <Badge tone={capability.enabled ? "primary" : "muted"}>
                    {capability.enabled ? "已启用" : "可安装"}
                  </Badge>
                </div>
                <p className="mb-0 mt-2">{capability.summary}</p>
                <div className="mt-3 grid gap-1 text-xs text-slate-500">
                  <span>版本：{capability.version}</span>
                  <span>权限：{capability.permissionScope}</span>
                  <span>风险：{capability.riskNote}</span>
                </div>
                <button className={`${secondaryActionClassName} mt-3`} type="button">
                  {capability.enabled ? "停用" : "安装"}
                </button>
              </article>
            ))}
            {capabilities.data.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/70 p-4 text-sm leading-7 text-slate-600">
                当前还没有可管理的能力。
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function resolveSettingsSection(input: string): SettingsSectionId {
  const aliases: Record<string, SettingsSectionId> = {
    credentials: "model-connections",
    marketplaces: "capabilities"
  };
  const normalized = aliases[input] ?? input;

  return settingsSections.some((section) => section.id === normalized)
    ? (normalized as SettingsSectionId)
    : "profile";
}

function ProfileInfo({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </div>
      <div className="mt-2 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function BillingPanel({ summary }: { summary: BillingPlanSummary | null }) {
  if (!summary) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-5 text-sm leading-7 text-slate-600">
        正在准备账单信息。
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <ProfileInfo title="当前方案" value={summary.currentPlan} />
      <ProfileInfo title="成员" value={`${summary.memberCount} 位成员`} />
      <ProfileInfo title="AI 同事" value={`${summary.aiTeammateCount} 位`} />
      <ProfileInfo title="本月额度" value={summary.monthlyQuota === 0 ? "使用自有 Key" : `${summary.monthlyQuota}`} />
      <ProfileInfo title="本月用量" value={`${summary.monthlyUsage}`} />
      <ProfileInfo title="付款方式" value={summary.paymentMethodStatus === "ready" ? "已配置" : "暂未配置"} />
      <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4 md:col-span-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          模型费用
        </div>
        <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">{summary.modelCostSummary}</p>
        <button className={`${secondaryActionClassName} mt-3`} type="button">升级方案</button>
      </div>
    </div>
  );
}

function renderMemberRole(role: WorkspaceMemberDirectoryEntry["role"]): string {
  switch (role) {
    case "owner":
      return "所有者";
    case "admin":
      return "管理员";
    case "agent":
      return "AI 同事";
    case "viewer":
      return "只读";
    case "member":
      return "成员";
  }
}

function renderMemberStatus(status: WorkspaceMemberDirectoryEntry["status"]): string {
  switch (status) {
    case "active":
      return "已启用";
    case "disabled":
      return "已停用";
    case "invited":
      return "待启用";
  }
}

const secondaryActionClassName =
  "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
