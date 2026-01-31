"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import type { AgentTile as AgentTileType, TileSize } from "@/features/canvas/state/store";
import { AgentTile } from "./AgentTile";

export type AgentTileNodeData = {
  tile: AgentTileType;
  canSend: boolean;
  onResize: (size: TileSize) => void;
  onNameChange: (name: string) => Promise<boolean>;
  onDraftChange: (value: string) => void;
  onSend: (message: string) => void;
  onAvatarShuffle: () => void;
  onNameShuffle: () => void;
  onInspect: () => void;
  onResizeEnd?: (size: TileSize) => void;
};

type AgentTileNodeType = Node<AgentTileNodeData>;

export const AgentTileNode = ({ data, selected }: NodeProps<AgentTileNodeType>) => {
  const {
    tile,
    canSend,
    onResize,
    onNameChange,
    onDraftChange,
    onSend,
    onAvatarShuffle,
    onNameShuffle,
    onInspect,
    onResizeEnd,
  } = data;

  return (
    <div className="h-full w-full">
      <AgentTile
        tile={tile}
        isSelected={selected}
        canSend={canSend}
        onInspect={onInspect}
        onNameChange={onNameChange}
        onDraftChange={onDraftChange}
        onSend={onSend}
        onAvatarShuffle={onAvatarShuffle}
        onNameShuffle={onNameShuffle}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
      />
    </div>
  );
};
