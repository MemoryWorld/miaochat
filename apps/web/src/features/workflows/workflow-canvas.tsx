"use client";

import type {
  VisualWorkflow,
  VisualWorkflowNode,
  VisualWorkflowRunNodeState
} from "@agenthub/contracts";

import { cn } from "../../lib/cn";

type WorkflowCanvasProps = {
  workflow: VisualWorkflow;
};

const nodeWidth = 210;
const nodeHeight = 132;
const canvasPadding = 28;

export function WorkflowCanvas({ workflow }: WorkflowCanvasProps) {
  const nodeStatesById = new Map(
    (workflow.latestRun?.nodeStates ?? []).map((state) => [state.nodeId, state])
  );
  const nodes = workflow.definition.nodes.map((node) => ({
    ...node,
    position: node.position ?? { x: 0, y: 0 }
  }));
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeWidth), nodeWidth);
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeHeight), nodeHeight);
  const width = maxX + canvasPadding * 2;
  const height = maxY + canvasPadding * 2;

  return (
    <div className="overflow-auto rounded-[8px] border border-slate-200 bg-white">
      <div className="relative" style={{ height, minWidth: width, width }}>
        <svg
          aria-hidden="true"
          className="absolute inset-0"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
        >
          <defs>
            <marker
              id={`workflow-arrow-${workflow.id}`}
              markerHeight="8"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
            </marker>
          </defs>
          {workflow.definition.edges.map((edge) => {
            const from = nodes.find((node) => node.id === edge.from);
            const to = nodes.find((node) => node.id === edge.to);

            if (!from || !to) {
              return null;
            }

            const startX = canvasPadding + from.position.x + nodeWidth;
            const startY = canvasPadding + from.position.y + nodeHeight / 2;
            const endX = canvasPadding + to.position.x;
            const endY = canvasPadding + to.position.y + nodeHeight / 2;
            const controlOffset = Math.max(56, (endX - startX) / 2);
            const path = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
            const labelX = (startX + endX) / 2;
            const labelY = (startY + endY) / 2 - 10;

            return (
              <g key={edge.id}>
                <path
                  d={path}
                  fill="none"
                  markerEnd={`url(#workflow-arrow-${workflow.id})`}
                  stroke="#64748b"
                  strokeWidth="2"
                />
                {edge.label ? (
                  <text
                    className="fill-slate-500 text-[11px] font-semibold"
                    textAnchor="middle"
                    x={labelX}
                    y={labelY}
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {nodes.map((node) => (
          <CanvasNode
            key={node.id}
            node={node}
            state={nodeStatesById.get(node.id) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function CanvasNode({
  node,
  state
}: {
  node: VisualWorkflowNode & { position: { x: number; y: number } };
  state: VisualWorkflowRunNodeState | null;
}) {
  const status = state?.status ?? "waiting";

  return (
    <article
      className={cn(
        "absolute grid gap-2 rounded-[8px] border bg-white p-3 shadow-sm",
        status === "running" ? "border-sky-300 ring-2 ring-sky-100" : null,
        status === "succeeded" ? "border-emerald-300" : null,
        status === "failed" ? "border-red-300 ring-2 ring-red-100" : null,
        status === "waiting" ? "border-slate-200" : null
      )}
      style={{
        height: nodeHeight,
        left: canvasPadding + node.position.x,
        top: canvasPadding + node.position.y,
        width: nodeWidth
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <strong className="text-sm leading-5 text-slate-950">{node.label}</strong>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusClass(status))}>
          {formatNodeStatus(status)}
        </span>
      </div>
      <p className="m-0 text-xs font-semibold text-slate-600">{node.role}</p>
      <p className="m-0 line-clamp-2 text-xs leading-5 text-slate-500">
        输入：{node.inputSummary}
      </p>
      <p className="m-0 line-clamp-2 text-xs leading-5 text-slate-500">
        输出：{node.outputSummary}
      </p>
      <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-slate-300 bg-white" />
      <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-slate-300 bg-white" />
    </article>
  );
}

function statusClass(status: VisualWorkflowRunNodeState["status"]): string {
  switch (status) {
    case "failed":
      return "bg-red-100 text-red-700";
    case "running":
      return "bg-sky-100 text-sky-700";
    case "succeeded":
      return "bg-emerald-100 text-emerald-700";
    case "waiting":
      return "bg-slate-100 text-slate-600";
  }
}

function formatNodeStatus(status: VisualWorkflowRunNodeState["status"]): string {
  switch (status) {
    case "failed":
      return "失败";
    case "running":
      return "运行中";
    case "succeeded":
      return "完成";
    case "waiting":
      return "等待中";
  }
}
