import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { canReparentThread } from "../lib/model";

export function useThreadNesting(threads: readonly PluginSidebarThread[]) {
  const sdk = useSdk();
  const byId = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);
  const source = useRef<string | null>(null);
  const saving = useRef(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const end = useCallback(() => {
    source.current = null;
    setTargetId(null);
  }, []);

  const start = useCallback((event: DragEvent, threadId: string) => {
    if (saving.current) {
      event.preventDefault();
      return;
    }
    source.current = threadId;
    setError(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-bb-attention-thread", threadId);
    const row = event.currentTarget.closest("[data-thread-row]");
    if (row) event.dataTransfer.setDragImage(row, 12, row.getBoundingClientRect().height / 2);
  }, []);

  const over = useCallback((event: DragEvent, parentId: string) => {
    if (source.current === null) return;
    if (!canReparentThread(byId, source.current, parentId)) {
      setTargetId(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTargetId(parentId);
  }, [byId]);

  const leave = useCallback((event: DragEvent, parentId: string) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setTargetId((current) => current === parentId ? null : current);
  }, []);

  const drop = useCallback(async (event: DragEvent, parentId: string) => {
    const threadId = source.current;
    if (threadId === null) return;
    event.preventDefault();
    event.stopPropagation();
    end();
    if (saving.current || !canReparentThread(byId, threadId, parentId)) return;

    saving.current = true;
    try {
      await sdk.threads.update({ threadId, parentThreadId: parentId });
    } catch {
      setError("Не удалось вложить тред. Попробуйте ещё раз.");
    } finally {
      saving.current = false;
    }
  }, [byId, end, sdk]);

  const handlers = useMemo(() => ({ start, over, leave, drop, end }), [start, over, leave, drop, end]);
  return { handlers, targetId, error };
}

export type ThreadNestingHandlers = ReturnType<typeof useThreadNesting>["handlers"];
