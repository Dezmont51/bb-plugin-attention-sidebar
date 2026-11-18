import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { canReparentThread } from "../lib/model";

const DRAG_DISTANCE = 6;

function suppressDragClick() {
  const guard = new AbortController();
  const options = { capture: true, signal: guard.signal };
  window.addEventListener("click", (event) => {
    if (event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
    guard.abort();
  }, options);
  window.addEventListener("pointerdown", () => guard.abort(), options);
  window.setTimeout(() => guard.abort(), 300);
}

export function useThreadNesting(threads: readonly PluginSidebarThread[]) {
  const sdk = useSdk();
  const byId = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);
  const threadsById = useRef(byId);
  const gesture = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    threadsById.current = byId;
  }, [byId]);

  useEffect(() => () => gesture.current?.abort(), []);

  const reparent = useCallback(async (threadId: string, parentThreadId: string) => {
    saving.current = true;
    try {
      await sdk.threads.update({ threadId, parentThreadId });
    } catch {
      setError("Не удалось вложить тред. Попробуйте ещё раз.");
    } finally {
      saving.current = false;
    }
  }, [sdk]);

  const start = useCallback((event: ReactPointerEvent<HTMLElement>, threadId: string) => {
    if (
      event.defaultPrevented || event.button !== 0 || event.pointerType !== "mouse" ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      saving.current || gesture.current
    ) return;

    const list = event.currentTarget.closest("[data-attention-thread-list]");
    if (list === null) return;

    const { pointerId, clientX, clientY } = event;
    const drag = new AbortController();
    gesture.current = drag;
    const options = { signal: drag.signal };
    let moved = false;

    const resolveParent = (target: EventTarget | null) => {
      if (!(target instanceof Element) || !list.contains(target)) return null;
      const candidate = target.closest<HTMLElement>("[data-thread-row]")?.dataset.threadRow;
      return candidate && canReparentThread(threadsById.current, threadId, candidate)
        ? candidate
        : null;
    };

    const end = () => {
      drag.abort();
      gesture.current = null;
      setTargetId(null);
      if (moved) suppressDragClick();
    };

    window.addEventListener("pointermove", (move) => {
      if (move.pointerId !== pointerId) return;
      if (!moved && Math.hypot(move.clientX - clientX, move.clientY - clientY) < DRAG_DISTANCE) {
        return;
      }
      if (!moved) setError(null);
      moved = true;
      setTargetId(resolveParent(move.target));
    }, options);
    window.addEventListener("pointerup", (up) => {
      if (up.pointerId !== pointerId) return;
      const parentId = moved ? resolveParent(up.target) : null;
      end();
      if (parentId !== null) void reparent(threadId, parentId);
    }, options);
    window.addEventListener("pointercancel", (cancel) => {
      if (cancel.pointerId === pointerId) end();
    }, options);
    window.addEventListener("keydown", (key) => {
      // BB also dispatches Escape when it takes over a drag into the main pane.
      if (key.key === "Escape") end();
    }, options);
    window.addEventListener("blur", end, options);
  }, [reparent]);

  return { start, targetId, error };
}

export type StartThreadNesting = ReturnType<typeof useThreadNesting>["start"];
